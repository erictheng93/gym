import { Hono } from 'hono';
import {
  db,
  employees,
  branches,
  jobTitles,
  coachMemberAssignments,
  classSessions,
} from '../db/index.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH PROFILE ROUTES
// =============================================================================
// Get current coach profile and stats

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// GET /api/coach/me - Get Current Coach Profile with Stats
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;

  // Get full employee info
  const [employee] = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      email: employees.email,
      phone: employees.phone,
      branchId: employees.branchId,
      jobTitleId: employees.jobTitleId,
      status: employees.status,
      tenantId: employees.tenantId,
    })
    .from(employees)
    .where(eq(employees.id, coach.id))
    .limit(1);

  if (!employee) {
    return c.json({
      success: false,
      error: '找不到教練資料',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Get job title
  const [jobTitle] = await db
    .select({
      id: jobTitles.id,
      name: jobTitles.name,
      code: jobTitles.code,
    })
    .from(jobTitles)
    .where(eq(jobTitles.id, employee.jobTitleId))
    .limit(1);

  // Get branch info
  const [branch] = await db
    .select({
      id: branches.id,
      name: branches.name,
    })
    .from(branches)
    .where(eq(branches.id, employee.branchId))
    .limit(1);

  // Get student count (assigned members)
  const [studentCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(coachMemberAssignments)
    .where(
      and(
        eq(coachMemberAssignments.coachId, coach.id),
        sql`${coachMemberAssignments.unassignedAt} IS NULL`
      )
    );

  // Get today's class count
  const today = new Date().toISOString().split('T')[0];
  const [todayClassCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.instructorId, coach.id),
        eq(classSessions.sessionDate, today),
        eq(classSessions.sessionStatus, 'SCHEDULED')
      )
    );

  // Get this week's class count
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  const [weekClassCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.instructorId, coach.id),
        gte(classSessions.sessionDate, mondayStr),
        lte(classSessions.sessionDate, sundayStr)
      )
    );

  return c.json({
    success: true,
    data: {
      id: employee.id,
      employee_code: employee.employeeCode,
      full_name: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      branch_id: employee.branchId,
      branch_name: branch?.name,
      job_title: jobTitle?.name,
      job_title_code: jobTitle?.code,
      status: employee.status,
      stats: {
        student_count: Number(studentCountResult?.count || 0),
        today_class_count: Number(todayClassCountResult?.count || 0),
        week_class_count: Number(weekClassCountResult?.count || 0),
      },
    },
  });
});

export default app;
