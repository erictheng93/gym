import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, memberGoals } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER GOALS ROUTES
// =============================================================================
// Goal tracking for member-app
// Endpoints: GET /, POST /, GET /:id, PUT /:id, DELETE /:id

const app = new Hono<{ Variables: MemberVariables }>();

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const targetValueSchema = z.object({
  value: z.number(),
  unit: z.string().optional(),
});

const createGoalSchema = z.object({
  goalType: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'BODY_SHAPE', 'HEALTH', 'OTHER']),
  targetValue: targetValueSchema,
  currentValue: targetValueSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD'),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional(),
});

const updateGoalSchema = z.object({
  targetValue: targetValueSchema.optional(),
  currentValue: targetValueSchema.optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'ABANDONED']).optional(),
  notes: z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'ABANDONED', 'all']).default('all'),
});

// -----------------------------------------------------------------------------
// GET /api/member/goals - List goals
// -----------------------------------------------------------------------------

app.get(
  '/',
  zValidator('query', listQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit, status } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(memberGoals.memberId, memberInfo.id)];

    if (status !== 'all') {
      conditions.push(eq(memberGoals.status, status));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count(memberGoals.id) })
      .from(memberGoals)
      .where(and(...conditions));

    // Get goals
    const goals = await db
      .select()
      .from(memberGoals)
      .where(and(...conditions))
      .orderBy(desc(memberGoals.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        goals: goals.map(g => ({
          id: g.id,
          goalType: g.goalType,
          targetValue: g.targetValue,
          currentValue: g.currentValue,
          startDate: g.startDate,
          targetDate: g.targetDate,
          status: g.status,
          notes: g.notes,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
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
// POST /api/member/goals - Create goal
// -----------------------------------------------------------------------------

app.post(
  '/',
  zValidator('json', createGoalSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const data = c.req.valid('json');

    const [goal] = await db.insert(memberGoals).values({
      memberId: memberInfo.id,
      goalType: data.goalType,
      targetValue: data.targetValue,
      currentValue: data.currentValue,
      startDate: data.startDate,
      targetDate: data.targetDate,
      notes: data.notes,
      status: 'IN_PROGRESS',
    }).returning();

    return c.json({
      success: true,
      message: '目標已建立',
      data: {
        goal: {
          id: goal.id,
          goalType: goal.goalType,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          startDate: goal.startDate,
          targetDate: goal.targetDate,
          status: goal.status,
          notes: goal.notes,
          createdAt: goal.createdAt,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/goals/:id - Get goal by ID
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const goalId = c.req.param('id');

  const [goal] = await db
    .select()
    .from(memberGoals)
    .where(and(
      eq(memberGoals.id, goalId),
      eq(memberGoals.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!goal) {
    return c.json({
      success: false,
      error: '目標不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      goal: {
        id: goal.id,
        goalType: goal.goalType,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        startDate: goal.startDate,
        targetDate: goal.targetDate,
        status: goal.status,
        notes: goal.notes,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
      },
    },
  });
});

// -----------------------------------------------------------------------------
// PUT /api/member/goals/:id - Update goal
// -----------------------------------------------------------------------------

app.put(
  '/:id',
  zValidator('json', updateGoalSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const goalId = c.req.param('id');
    const updates = c.req.valid('json');

    // Verify ownership
    const [existing] = await db
      .select({ id: memberGoals.id })
      .from(memberGoals)
      .where(and(
        eq(memberGoals.id, goalId),
        eq(memberGoals.memberId, memberInfo.id),
      ))
      .limit(1);

    if (!existing) {
      return c.json({
        success: false,
        error: '目標不存在',
        code: 'NOT_FOUND',
      }, 404);
    }

    const [goal] = await db
      .update(memberGoals)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(memberGoals.id, goalId))
      .returning();

    return c.json({
      success: true,
      message: '目標已更新',
      data: {
        goal: {
          id: goal.id,
          goalType: goal.goalType,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          startDate: goal.startDate,
          targetDate: goal.targetDate,
          status: goal.status,
          notes: goal.notes,
          updatedAt: goal.updatedAt,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/goals/:id - Delete goal
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const goalId = c.req.param('id');

  // Verify ownership
  const [existing] = await db
    .select({ id: memberGoals.id })
    .from(memberGoals)
    .where(and(
      eq(memberGoals.id, goalId),
      eq(memberGoals.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!existing) {
    return c.json({
      success: false,
      error: '目標不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  await db.delete(memberGoals).where(eq(memberGoals.id, goalId));

  return c.json({
    success: true,
    message: '目標已刪除',
  });
});

export default app;
