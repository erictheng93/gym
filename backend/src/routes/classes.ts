import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, classes, classSchedules, classSessions, branches, employees } from '../db/index.js';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createClassSchema = z.object({
  name: z.string().min(1, '請輸入課程名稱'),
  description: z.string().optional().nullable(),
  durationMinutes: z.coerce.number().min(15).max(240).default(60),
  maxCapacity: z.coerce.number().min(1).max(100).default(20),
  instructorId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid(),
  category: z.enum(['YOGA', 'CARDIO', 'STRENGTH', 'DANCE', 'SPINNING', 'PILATES', 'BOXING', 'SWIMMING', 'OTHER']).optional(),
  difficultyLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  imageUrl: z.string().url().optional().nullable(),
  requiresCount: z.boolean().default(true),
  countDeduction: z.coerce.number().min(1).default(1),
});

const updateClassSchema = createClassSchema.partial();

const createScheduleSchema = z.object({
  classId: z.string().uuid(),
  branchId: z.string().uuid(),
  instructorId: z.string().uuid().optional().nullable(),
  dayOfWeek: z.coerce.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, '時間格式錯誤'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, '時間格式錯誤'),
  room: z.string().optional().nullable(),
  maxCapacity: z.coerce.number().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
});

const CLASS_RETURNING = {
  id: classes.id,
  status: classes.status,
  createdAt: classes.createdAt,
  updatedAt: classes.updatedAt,
  name: classes.name,
  description: classes.description,
  durationMinutes: classes.durationMinutes,
  maxCapacity: classes.maxCapacity,
  instructorId: classes.instructorId,
  branchId: classes.branchId,
  category: classes.category,
  difficultyLevel: classes.difficultyLevel,
  imageUrl: classes.imageUrl,
  isActive: classes.isActive,
  requiresCount: classes.requiresCount,
  countDeduction: classes.countDeduction,
};

const CLASS_SESSION_SELECT = {
  id: classSessions.id,
  status: classSessions.status,
  createdAt: classSessions.createdAt,
  updatedAt: classSessions.updatedAt,
  scheduleId: classSessions.scheduleId,
  classId: classSessions.classId,
  branchId: classSessions.branchId,
  instructorId: classSessions.instructorId,
  sessionDate: classSessions.sessionDate,
  startTime: classSessions.startTime,
  endTime: classSessions.endTime,
  room: classSessions.room,
  maxCapacity: classSessions.maxCapacity,
  currentCount: classSessions.currentCount,
  waitlistCount: classSessions.waitlistCount,
  sessionStatus: classSessions.sessionStatus,
  cancelledReason: classSessions.cancelledReason,
  cancelledAt: classSessions.cancelledAt,
  cancelledBy: classSessions.cancelledBy,
};

const CLASS_WITH_RELATIONS_SELECT = {
  class: CLASS_RETURNING,
  instructor: {
    id: employees.id,
    fullName: employees.fullName,
  },
  branch: {
    id: branches.id,
    name: branches.name,
  },
};

const CLASS_SCHEDULE_LIST_SELECT = {
  id: classSchedules.id,
  dayOfWeek: classSchedules.dayOfWeek,
  startTime: classSchedules.startTime,
  endTime: classSchedules.endTime,
  room: classSchedules.room,
  maxCapacity: classSchedules.maxCapacity,
  isRecurring: classSchedules.isRecurring,
  status: classSchedules.status,
};

const CLASS_BRANCH_ID_SELECT = {
  id: classes.id,
  branchId: classes.branchId,
};

const CLASS_SESSION_WITH_INSTRUCTOR_SELECT = {
  session: CLASS_SESSION_SELECT,
  instructor: {
    id: employees.id,
    fullName: employees.fullName,
  },
};

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  if (branchId && !branchIds.includes(branchId)) {
    return c.json({ success: true, data: [] });
  }

  const branchCondition = branchId
    ? eq(classes.branchId, branchId)
    : (branchIds.length === 1 ? eq(classes.branchId, branchIds[0]) : inArray(classes.branchId, branchIds));

  const condition = and(branchCondition, eq(classes.status, 'active'));

  const result = await db
    .select(CLASS_WITH_RELATIONS_SELECT)
    .from(classes)
    .leftJoin(employees, eq(classes.instructorId, employees.id))
    .leftJoin(branches, eq(classes.branchId, branches.id))
    .where(condition)
    .orderBy(classes.name);

  const data = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    data[i] = {
      ...r.class,
      instructor: r.instructor,
      branch: r.branch,
    };
  }

  return c.json({
    success: true,
    data,
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[classItem], branchIds, schedules] = await Promise.all([
    db
      .select(CLASS_WITH_RELATIONS_SELECT)
      .from(classes)
      .leftJoin(employees, eq(classes.instructorId, employees.id))
      .leftJoin(branches, eq(classes.branchId, branches.id))
      .where(eq(classes.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(CLASS_SCHEDULE_LIST_SELECT)
      .from(classSchedules)
      .where(eq(classSchedules.classId, id))
      .orderBy(classSchedules.dayOfWeek, classSchedules.startTime),
  ]);

  if (!classItem || !branchIds.includes(classItem.class.branchId)) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...classItem.class,
      instructor: classItem.instructor,
      branch: classItem.branch,
      schedules,
    },
  });
});

const CLASS_SCHEDULE_RETURNING = {
  id: classSchedules.id,
  status: classSchedules.status,
  createdAt: classSchedules.createdAt,
  updatedAt: classSchedules.updatedAt,
  classId: classSchedules.classId,
  branchId: classSchedules.branchId,
  instructorId: classSchedules.instructorId,
  dayOfWeek: classSchedules.dayOfWeek,
  startTime: classSchedules.startTime,
  endTime: classSchedules.endTime,
  room: classSchedules.room,
  maxCapacity: classSchedules.maxCapacity,
  isRecurring: classSchedules.isRecurring,
  validFrom: classSchedules.validFrom,
  validUntil: classSchedules.validUntil,
};

app.post('/', zValidator('json', createClassSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [newClass] = await db.insert(classes).values(data).returning(CLASS_RETURNING);

  return c.json({ success: true, data: newClass }, 201);
});

app.patch('/:id', zValidator('json', updateClassSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  if (data.branchId && !branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const branchCondition = branchIds.length === 1 ? eq(classes.branchId, branchIds[0]) : inArray(classes.branchId, branchIds);
  const [updatedClass] = await db
    .update(classes)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(classes.id, id), branchCondition))
    .returning(CLASS_RETURNING);

  if (!updatedClass) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  return c.json({ success: true, data: updatedClass });
});

app.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const now = new Date();
  const startDate = c.req.query('startDate') || now.toISOString().slice(0, 10);
  const endDate = c.req.query('endDate') || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [[classItem], branchIds, sessions] = await Promise.all([
    db
      .select(CLASS_BRANCH_ID_SELECT)
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(CLASS_SESSION_WITH_INSTRUCTOR_SELECT)
      .from(classSessions)
      .leftJoin(employees, eq(classSessions.instructorId, employees.id))
      .where(
        and(
          eq(classSessions.classId, id),
          gte(classSessions.sessionDate, startDate),
          lte(classSessions.sessionDate, endDate)
        )
      )
      .orderBy(classSessions.sessionDate, classSessions.startTime),
  ]);

  if (!classItem || !branchIds.includes(classItem.branchId)) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  const data = new Array(sessions.length);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    data[i] = {
      ...s.session,
      instructor: s.instructor,
    };
  }

  return c.json({
    success: true,
    data,
  });
});

app.post('/schedules', zValidator('json', createScheduleSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [tenantBranchIds, [classItem]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CLASS_BRANCH_ID_SELECT)
      .from(classes)
      .where(eq(classes.id, data.classId))
      .limit(1),
  ]);

  if (!tenantBranchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  if (!classItem || classItem.branchId !== data.branchId) {
    return c.json({ success: false, error: '無效的課程' }, 400);
  }

  const [newSchedule] = await db.insert(classSchedules).values(data).returning(CLASS_SCHEDULE_RETURNING);

  return c.json({ success: true, data: newSchedule }, 201);
});

export default app;
