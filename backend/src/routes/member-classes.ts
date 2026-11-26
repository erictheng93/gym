import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, classes, classSessions, branches, employees } from '../db/index.js';
import { eq, and, gte, lte, inArray, asc } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

// =============================================================================
// MEMBER CLASSES ROUTES
// =============================================================================
// Class session browsing for member-app (read only).
// Endpoints: GET /sessions, GET /sessions/:id
//
// Scoped to the branches of the tenant in the member token. Only member-facing
// fields are exposed (no cancelledBy, instructor contact details, ...).

const app = new Hono<{ Variables: MemberVariables }>();

app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

const SESSION_SELECT = {
  id: classSessions.id,
  sessionDate: classSessions.sessionDate,
  startTime: classSessions.startTime,
  endTime: classSessions.endTime,
  room: classSessions.room,
  maxCapacity: classSessions.maxCapacity,
  currentCount: classSessions.currentCount,
  waitlistCount: classSessions.waitlistCount,
  sessionStatus: classSessions.sessionStatus,
  cancelledReason: classSessions.cancelledReason,
  class: {
    id: classes.id,
    name: classes.name,
    description: classes.description,
    category: classes.category,
    difficultyLevel: classes.difficultyLevel,
    durationMinutes: classes.durationMinutes,
    imageUrl: classes.imageUrl,
  },
  instructor: {
    id: employees.id,
    fullName: employees.fullName,
  },
  branch: {
    id: branches.id,
    name: branches.name,
  },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD');

const listQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sessionsQuery() {
  return db
    .select(SESSION_SELECT)
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(employees, eq(classSessions.instructorId, employees.id))
    .leftJoin(branches, eq(classSessions.branchId, branches.id));
}

type SessionRow = Awaited<ReturnType<typeof sessionsQuery>>[number];

function formatSession(row: SessionRow) {
  return {
    ...row,
    currentCount: row.currentCount ?? 0,
    waitlistCount: row.waitlistCount ?? 0,
    instructor: row.instructor?.id ? row.instructor : null,
    branch: row.branch?.id ? row.branch : null,
  };
}

// -----------------------------------------------------------------------------
// GET /api/member/classes/sessions - Upcoming scheduled sessions
// -----------------------------------------------------------------------------

app.get('/sessions', zValidator('query', listQuerySchema), async (c) => {
  const memberInfo = c.get('member')!;
  const { branchId, limit } = c.req.valid('query');
  const today = new Date().toISOString().slice(0, 10);
  const startDate = c.req.valid('query').startDate ?? today;
  const endDate = c.req.valid('query').endDate ?? addDays(startDate, 13);

  const tenantBranchIds = await getTenantBranchIds(memberInfo.tenantId);
  const branchIds = branchId ? tenantBranchIds.filter((id) => id === branchId) : tenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({ success: true, data: { sessions: [] } });
  }

  const rows = await sessionsQuery()
    .where(and(
      inArray(classSessions.branchId, branchIds),
      eq(classSessions.sessionStatus, 'SCHEDULED'),
      gte(classSessions.sessionDate, startDate < today ? today : startDate),
      lte(classSessions.sessionDate, endDate),
    ))
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime))
    .limit(limit);

  return c.json({ success: true, data: { sessions: rows.map(formatSession) } });
});

// -----------------------------------------------------------------------------
// GET /api/member/classes/sessions/:id - Session detail
// -----------------------------------------------------------------------------

app.get('/sessions/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const id = c.req.param('id');

  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ success: false, error: '課程場次不存在', code: 'NOT_FOUND' }, 404);
  }

  const tenantBranchIds = await getTenantBranchIds(memberInfo.tenantId);
  const [row] = tenantBranchIds.length
    ? await sessionsQuery()
      .where(and(eq(classSessions.id, id), inArray(classSessions.branchId, tenantBranchIds)))
      .limit(1)
    : [];

  if (!row) {
    return c.json({ success: false, error: '課程場次不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, data: { session: formatSession(row) } });
});

export default app;
