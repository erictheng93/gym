import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, classes, classSchedules, classSessions, branches, employees } from '../db/index.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

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

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  let condition = sql`${classes.branchId} = ANY(${branchIds}) AND ${classes.status} = 'active'`;

  if (branchId) {
    condition = and(condition, eq(classes.branchId, branchId))!;
  }

  const result = await db
    .select({
      class: classes,
      instructor: {
        id: employees.id,
        fullName: employees.fullName,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(classes)
    .leftJoin(employees, eq(classes.instructorId, employees.id))
    .leftJoin(branches, eq(classes.branchId, branches.id))
    .where(condition)
    .orderBy(classes.name);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.class,
      instructor: r.instructor,
      branch: r.branch,
    })),
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [classItem] = await db
    .select({
      class: classes,
      instructor: {
        id: employees.id,
        fullName: employees.fullName,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(classes)
    .leftJoin(employees, eq(classes.instructorId, employees.id))
    .leftJoin(branches, eq(classes.branchId, branches.id))
    .where(eq(classes.id, id))
    .limit(1);

  if (!classItem) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, classItem.class.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此課程' }, 403);
  }

  const schedules = await db
    .select()
    .from(classSchedules)
    .where(eq(classSchedules.classId, id))
    .orderBy(classSchedules.dayOfWeek, classSchedules.startTime);

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

app.post('/', zValidator('json', createClassSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [newClass] = await db.insert(classes).values(data).returning();

  return c.json({ success: true, data: newClass }, 201);
});

app.patch('/:id', zValidator('json', updateClassSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [classItem] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, id))
    .limit(1);

  if (!classItem) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, classItem.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限修改此課程' }, 403);
  }

  const [updatedClass] = await db
    .update(classes)
    .set({
      ...data,
      dateUpdated: new Date(),
    })
    .where(eq(classes.id, id))
    .returning();

  return c.json({ success: true, data: updatedClass });
});

app.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const startDate = c.req.query('startDate') || new Date().toISOString().split('T')[0];
  const endDate = c.req.query('endDate') || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  })();

  const [classItem] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, id))
    .limit(1);

  if (!classItem) {
    return c.json({ success: false, error: '課程不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, classItem.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此課程' }, 403);
  }

  const sessions = await db
    .select({
      session: classSessions,
      instructor: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(classSessions)
    .leftJoin(employees, eq(classSessions.instructorId, employees.id))
    .where(
      and(
        eq(classSessions.classId, id),
        gte(classSessions.sessionDate, startDate),
        lte(classSessions.sessionDate, endDate)
      )
    )
    .orderBy(classSessions.sessionDate, classSessions.startTime);

  return c.json({
    success: true,
    data: sessions.map(s => ({
      ...s.session,
      instructor: s.instructor,
    })),
  });
});

app.post('/schedules', zValidator('json', createScheduleSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [classItem] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, data.classId))
    .limit(1);

  if (!classItem || classItem.branchId !== data.branchId) {
    return c.json({ success: false, error: '無效的課程' }, 400);
  }

  const [newSchedule] = await db.insert(classSchedules).values(data).returning();

  return c.json({ success: true, data: newSchedule }, 201);
});

export default app;
