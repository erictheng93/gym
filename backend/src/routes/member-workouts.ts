import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, workoutLogs } from '../db/index.js';
import { eq, and, desc, gte, lte, count, avg, sum } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER WORKOUTS ROUTES
// =============================================================================
// Workout logging for member-app
// Endpoints: GET /, POST /, GET /:id, PUT /:id, DELETE /:id, GET /stats

const app = new Hono<{ Variables: MemberVariables }>();

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const exerciseSchema = z.object({
  name: z.string().min(1, '請輸入運動名稱'),
  category: z.enum(['STRENGTH', 'CARDIO', 'FLEXIBILITY', 'BALANCE', 'OTHER']).optional(),
  sets: z.number().min(1).optional(),
  reps: z.number().min(1).optional(),
  weight: z.number().min(0).optional(), // kg
  duration: z.number().min(1).optional(), // minutes
  distance: z.number().min(0).optional(), // km
  notes: z.string().optional(),
});

const createWorkoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD'),
  duration: z.number().min(1).max(600).optional(),
  calories: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  exercises: z.array(exerciseSchema).default([]),
});

const updateWorkoutSchema = createWorkoutSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/member/workouts - List workouts
// -----------------------------------------------------------------------------

app.get(
  '/',
  zValidator('query', listQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit, startDate, endDate } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(workoutLogs.memberId, memberInfo.id)];

    if (startDate) {
      conditions.push(gte(workoutLogs.date, startDate));
    }

    if (endDate) {
      conditions.push(lte(workoutLogs.date, endDate));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count(workoutLogs.id) })
      .from(workoutLogs)
      .where(and(...conditions));

    // Get workouts
    const workouts = await db
      .select()
      .from(workoutLogs)
      .where(and(...conditions))
      .orderBy(desc(workoutLogs.date))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        workouts: workouts.map(w => ({
          id: w.id,
          date: w.date,
          duration: w.duration,
          calories: w.calories,
          exercises: w.exercises,
          notes: w.notes,
          createdAt: w.createdAt,
        })),
        pagination: {
          total: Number(total),
          page,
          limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/workouts - Create workout
// -----------------------------------------------------------------------------

app.post(
  '/',
  zValidator('json', createWorkoutSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const data = c.req.valid('json');

    const [workout] = await db.insert(workoutLogs).values({
      memberId: memberInfo.id,
      date: data.date,
      duration: data.duration,
      calories: data.calories,
      exercises: data.exercises,
      notes: data.notes,
    }).returning();

    return c.json({
      success: true,
      message: '運動紀錄已建立',
      data: {
        workout: {
          id: workout.id,
          date: workout.date,
          duration: workout.duration,
          calories: workout.calories,
          exercises: workout.exercises,
          notes: workout.notes,
          createdAt: workout.createdAt,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/workouts/:id - Get workout by ID
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const workoutId = c.req.param('id');

  const [workout] = await db
    .select()
    .from(workoutLogs)
    .where(and(
      eq(workoutLogs.id, workoutId),
      eq(workoutLogs.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!workout) {
    return c.json({
      success: false,
      error: '運動紀錄不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      workout: {
        id: workout.id,
        date: workout.date,
        duration: workout.duration,
        calories: workout.calories,
        exercises: workout.exercises,
        notes: workout.notes,
        createdAt: workout.createdAt,
      },
    },
  });
});

// -----------------------------------------------------------------------------
// PUT /api/member/workouts/:id - Update workout
// -----------------------------------------------------------------------------

app.put(
  '/:id',
  zValidator('json', updateWorkoutSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const workoutId = c.req.param('id');
    const updates = c.req.valid('json');

    // Verify ownership
    const [existing] = await db
      .select({ id: workoutLogs.id })
      .from(workoutLogs)
      .where(and(
        eq(workoutLogs.id, workoutId),
        eq(workoutLogs.memberId, memberInfo.id),
      ))
      .limit(1);

    if (!existing) {
      return c.json({
        success: false,
        error: '運動紀錄不存在',
        code: 'NOT_FOUND',
      }, 404);
    }

    const [workout] = await db
      .update(workoutLogs)
      .set(updates)
      .where(eq(workoutLogs.id, workoutId))
      .returning();

    return c.json({
      success: true,
      message: '運動紀錄已更新',
      data: {
        workout: {
          id: workout.id,
          date: workout.date,
          duration: workout.duration,
          calories: workout.calories,
          exercises: workout.exercises,
          notes: workout.notes,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/workouts/:id - Delete workout
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const workoutId = c.req.param('id');

  // Verify ownership
  const [existing] = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(and(
      eq(workoutLogs.id, workoutId),
      eq(workoutLogs.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!existing) {
    return c.json({
      success: false,
      error: '運動紀錄不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  await db.delete(workoutLogs).where(eq(workoutLogs.id, workoutId));

  return c.json({
    success: true,
    message: '運動紀錄已刪除',
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/workouts/stats/summary - Get workout statistics
// -----------------------------------------------------------------------------

app.get('/stats/summary', async (c) => {
  const memberInfo = c.get('member')!;
  const period = c.req.query('period') || '30'; // days

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));
  const startDateStr = startDate.toISOString().split('T')[0];

  // Get stats for period
  const [stats] = await db
    .select({
      totalWorkouts: count(workoutLogs.id),
      totalDuration: sum(workoutLogs.duration),
      totalCalories: sum(workoutLogs.calories),
      avgDuration: avg(workoutLogs.duration),
    })
    .from(workoutLogs)
    .where(and(
      eq(workoutLogs.memberId, memberInfo.id),
      gte(workoutLogs.date, startDateStr),
    ));

  // Calculate streak
  const recentWorkouts = await db
    .select({ date: workoutLogs.date })
    .from(workoutLogs)
    .where(eq(workoutLogs.memberId, memberInfo.id))
    .orderBy(desc(workoutLogs.date))
    .limit(60);

  let currentStreak = 0;
  let maxStreak = 0;
  let streak = 0;
  let prevDate: Date | null = null;

  for (const w of recentWorkouts) {
    const date = new Date(w.date);
    if (!prevDate) {
      streak = 1;
    } else {
      const diffDays = Math.floor((prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak++;
      } else {
        if (currentStreak === 0) currentStreak = streak;
        maxStreak = Math.max(maxStreak, streak);
        streak = 1;
      }
    }
    prevDate = date;
  }
  maxStreak = Math.max(maxStreak, streak);
  if (currentStreak === 0) currentStreak = streak;

  return c.json({
    success: true,
    data: {
      period: parseInt(period),
      totalWorkouts: Number(stats?.totalWorkouts || 0),
      totalDuration: Number(stats?.totalDuration || 0),
      totalCalories: Number(stats?.totalCalories || 0),
      averageDuration: stats?.avgDuration ? Math.round(Number(stats.avgDuration)) : null,
      currentStreak,
      maxStreak,
    },
  });
});

export default app;
