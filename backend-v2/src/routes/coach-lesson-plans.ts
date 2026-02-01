import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, lessonPlans, classSessions } from '../db/index.js';
import { eq, and, desc, sql, like, or, isNull } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH LESSON PLANS ROUTES
// =============================================================================
// CRUD operations for lesson plans and templates

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const exerciseSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  sets: z.number().optional(),
  reps: z.string().optional(), // Can be "10-12" format
  weight: z.string().optional(),
  duration: z.string().optional(),
  rest: z.string().optional(),
  notes: z.string().optional(),
  material_id: z.string().optional(),
});

const createPlanSchema = z.object({
  title: z.string().min(1, '請輸入標題'),
  objectives: z.array(z.string()).optional().default([]),
  warmup_exercises: z.array(exerciseSchema).optional().default([]),
  main_exercises: z.array(exerciseSchema).optional().default([]),
  cooldown_exercises: z.array(exerciseSchema).optional().default([]),
  notes: z.string().optional(),
  is_template: z.boolean().optional().default(false),
  template_category: z.string().optional(),
  difficulty: z.string().optional(),
  duration_minutes: z.number().optional(),
  session_id: z.string().uuid().optional(),
});

const updatePlanSchema = createPlanSchema.partial();

const copyPlanSchema = z.object({
  title: z.string().optional(),
  session_id: z.string().uuid().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/coach/lesson-plans - List Lesson Plans
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;
  const {
    is_template,
    category,
    difficulty,
    search,
    limit = '20',
    offset = '0',
  } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Build conditions
  const conditions = [eq(lessonPlans.coachId, coach.id)];

  if (is_template !== undefined) {
    conditions.push(eq(lessonPlans.isTemplate, is_template === 'true'));
  }

  if (category) {
    conditions.push(eq(lessonPlans.templateCategory, category));
  }

  if (difficulty) {
    conditions.push(eq(lessonPlans.difficulty, difficulty));
  }

  if (search) {
    conditions.push(
      or(
        like(lessonPlans.title, `%${search}%`),
        like(lessonPlans.notes, `%${search}%`)
      )!
    );
  }

  // Get plans
  const plansData = await db
    .select()
    .from(lessonPlans)
    .where(and(...conditions))
    .orderBy(desc(lessonPlans.createdAt))
    .limit(limitNum)
    .offset(offsetNum);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(lessonPlans)
    .where(and(...conditions));

  return c.json({
    success: true,
    data: plansData.map(p => ({
      id: p.id,
      title: p.title,
      objectives: p.objectives,
      warmup_exercises: p.warmupExercises,
      main_exercises: p.mainExercises,
      cooldown_exercises: p.cooldownExercises,
      notes: p.notes,
      is_template: p.isTemplate,
      template_category: p.templateCategory,
      difficulty: p.difficulty,
      duration_minutes: p.durationMinutes,
      session_id: p.sessionId,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })),
    meta: {
      total: Number(countResult?.count || 0),
      limit: limitNum,
      offset: offsetNum,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/lesson-plans/templates - List Templates
// -----------------------------------------------------------------------------

app.get('/templates', async (c) => {
  const coach = c.get('coach')!;
  const { category, difficulty, limit = '50', offset = '0' } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Build conditions - templates can be coach's own or shared (tenantId-based)
  const conditions = [
    eq(lessonPlans.isTemplate, true),
    or(
      eq(lessonPlans.coachId, coach.id),
      and(
        eq(lessonPlans.tenantId, coach.tenantId),
        isNull(lessonPlans.coachId) // System templates
      )
    )!,
  ];

  if (category) {
    conditions.push(eq(lessonPlans.templateCategory, category));
  }

  if (difficulty) {
    conditions.push(eq(lessonPlans.difficulty, difficulty));
  }

  // Get templates
  const templatesData = await db
    .select()
    .from(lessonPlans)
    .where(and(...conditions))
    .orderBy(lessonPlans.templateCategory, lessonPlans.title)
    .limit(limitNum)
    .offset(offsetNum);

  // Get unique categories
  const categoriesResult = await db
    .selectDistinct({ category: lessonPlans.templateCategory })
    .from(lessonPlans)
    .where(
      and(
        eq(lessonPlans.isTemplate, true),
        or(
          eq(lessonPlans.coachId, coach.id),
          eq(lessonPlans.tenantId, coach.tenantId)
        )!
      )
    );

  const categories = categoriesResult
    .map(r => r.category)
    .filter((c): c is string => c !== null);

  return c.json({
    success: true,
    data: templatesData.map(p => ({
      id: p.id,
      title: p.title,
      objectives: p.objectives,
      warmup_exercises: p.warmupExercises,
      main_exercises: p.mainExercises,
      cooldown_exercises: p.cooldownExercises,
      notes: p.notes,
      is_template: p.isTemplate,
      template_category: p.templateCategory,
      difficulty: p.difficulty,
      duration_minutes: p.durationMinutes,
      is_own: p.coachId === coach.id,
      created_at: p.createdAt,
    })),
    categories,
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/lesson-plans/:id - Get Lesson Plan Details
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Get plan (own or shared template)
  const [plan] = await db
    .select()
    .from(lessonPlans)
    .where(
      and(
        eq(lessonPlans.id, id),
        or(
          eq(lessonPlans.coachId, coach.id),
          and(
            eq(lessonPlans.isTemplate, true),
            eq(lessonPlans.tenantId, coach.tenantId)
          )
        )!
      )
    )
    .limit(1);

  if (!plan) {
    return c.json({
      success: false,
      error: '找不到教案',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Get linked session if any
  let sessionInfo = null;
  if (plan.sessionId) {
    const [session] = await db
      .select({
        id: classSessions.id,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        sessionStatus: classSessions.sessionStatus,
      })
      .from(classSessions)
      .where(eq(classSessions.id, plan.sessionId))
      .limit(1);

    if (session) {
      sessionInfo = {
        id: session.id,
        date: session.sessionDate,
        start_time: session.startTime,
        status: session.sessionStatus,
      };
    }
  }

  return c.json({
    success: true,
    data: {
      id: plan.id,
      title: plan.title,
      objectives: plan.objectives,
      warmup_exercises: plan.warmupExercises,
      main_exercises: plan.mainExercises,
      cooldown_exercises: plan.cooldownExercises,
      notes: plan.notes,
      is_template: plan.isTemplate,
      template_category: plan.templateCategory,
      difficulty: plan.difficulty,
      duration_minutes: plan.durationMinutes,
      session_id: plan.sessionId,
      session: sessionInfo,
      is_own: plan.coachId === coach.id,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/coach/lesson-plans - Create Lesson Plan
// -----------------------------------------------------------------------------

app.post(
  '/',
  zValidator('json', createPlanSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const data = c.req.valid('json');

    // If linking to session, verify ownership
    if (data.session_id) {
      const [session] = await db
        .select({ instructorId: classSessions.instructorId })
        .from(classSessions)
        .where(eq(classSessions.id, data.session_id))
        .limit(1);

      if (!session || session.instructorId !== coach.id) {
        return c.json({
          success: false,
          error: '無權連結此課程',
          code: 'FORBIDDEN',
        }, 403);
      }
    }

    // Create plan
    const [plan] = await db
      .insert(lessonPlans)
      .values({
        coachId: coach.id,
        title: data.title,
        objectives: data.objectives,
        warmupExercises: data.warmup_exercises,
        mainExercises: data.main_exercises,
        cooldownExercises: data.cooldown_exercises,
        notes: data.notes,
        isTemplate: data.is_template,
        templateCategory: data.template_category,
        difficulty: data.difficulty,
        durationMinutes: data.duration_minutes,
        sessionId: data.session_id,
        tenantId: coach.tenantId || null,
      })
      .returning();

    return c.json({
      success: true,
      message: '教案已建立',
      data: {
        id: plan.id,
        title: plan.title,
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// PATCH /api/coach/lesson-plans/:id - Update Lesson Plan
// -----------------------------------------------------------------------------

app.patch(
  '/:id',
  zValidator('json', updatePlanSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const data = c.req.valid('json');

    // Verify ownership
    const [existingPlan] = await db
      .select()
      .from(lessonPlans)
      .where(
        and(
          eq(lessonPlans.id, id),
          eq(lessonPlans.coachId, coach.id)
        )
      )
      .limit(1);

    if (!existingPlan) {
      return c.json({
        success: false,
        error: '找不到教案或無權修改',
        code: 'NOT_FOUND',
      }, 404);
    }

    // If linking to session, verify ownership
    if (data.session_id) {
      const [session] = await db
        .select({ instructorId: classSessions.instructorId })
        .from(classSessions)
        .where(eq(classSessions.id, data.session_id))
        .limit(1);

      if (!session || session.instructorId !== coach.id) {
        return c.json({
          success: false,
          error: '無權連結此課程',
          code: 'FORBIDDEN',
        }, 403);
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.objectives !== undefined) updateData.objectives = data.objectives;
    if (data.warmup_exercises !== undefined) updateData.warmupExercises = data.warmup_exercises;
    if (data.main_exercises !== undefined) updateData.mainExercises = data.main_exercises;
    if (data.cooldown_exercises !== undefined) updateData.cooldownExercises = data.cooldown_exercises;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.is_template !== undefined) updateData.isTemplate = data.is_template;
    if (data.template_category !== undefined) updateData.templateCategory = data.template_category;
    if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
    if (data.duration_minutes !== undefined) updateData.durationMinutes = data.duration_minutes;
    if (data.session_id !== undefined) updateData.sessionId = data.session_id;

    // Update plan
    await db
      .update(lessonPlans)
      .set(updateData)
      .where(eq(lessonPlans.id, id));

    return c.json({
      success: true,
      message: '教案已更新',
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/coach/lesson-plans/:id - Delete Lesson Plan
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Verify ownership
  const [existingPlan] = await db
    .select()
    .from(lessonPlans)
    .where(
      and(
        eq(lessonPlans.id, id),
        eq(lessonPlans.coachId, coach.id)
      )
    )
    .limit(1);

  if (!existingPlan) {
    return c.json({
      success: false,
      error: '找不到教案或無權刪除',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Delete plan
  await db
    .delete(lessonPlans)
    .where(eq(lessonPlans.id, id));

  return c.json({
    success: true,
    message: '教案已刪除',
  });
});

// -----------------------------------------------------------------------------
// POST /api/coach/lesson-plans/:id/copy - Copy Lesson Plan
// -----------------------------------------------------------------------------

app.post(
  '/:id/copy',
  zValidator('json', copyPlanSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const { title, session_id } = c.req.valid('json');

    // Get source plan (own or shared template)
    const [sourcePlan] = await db
      .select()
      .from(lessonPlans)
      .where(
        and(
          eq(lessonPlans.id, id),
          or(
            eq(lessonPlans.coachId, coach.id),
            and(
              eq(lessonPlans.isTemplate, true),
              eq(lessonPlans.tenantId, coach.tenantId)
            )
          )!
        )
      )
      .limit(1);

    if (!sourcePlan) {
      return c.json({
        success: false,
        error: '找不到教案',
        code: 'NOT_FOUND',
      }, 404);
    }

    // If linking to session, verify ownership
    if (session_id) {
      const [session] = await db
        .select({ instructorId: classSessions.instructorId })
        .from(classSessions)
        .where(eq(classSessions.id, session_id))
        .limit(1);

      if (!session || session.instructorId !== coach.id) {
        return c.json({
          success: false,
          error: '無權連結此課程',
          code: 'FORBIDDEN',
        }, 403);
      }
    }

    // Create copy
    const [newPlan] = await db
      .insert(lessonPlans)
      .values({
        coachId: coach.id,
        title: title || `${sourcePlan.title} (副本)`,
        objectives: sourcePlan.objectives,
        warmupExercises: sourcePlan.warmupExercises,
        mainExercises: sourcePlan.mainExercises,
        cooldownExercises: sourcePlan.cooldownExercises,
        notes: sourcePlan.notes,
        isTemplate: false, // Copies are not templates by default
        templateCategory: null,
        difficulty: sourcePlan.difficulty,
        durationMinutes: sourcePlan.durationMinutes,
        sessionId: session_id || null,
        tenantId: coach.tenantId || null,
      })
      .returning();

    return c.json({
      success: true,
      message: '教案已複製',
      data: {
        id: newPlan.id,
        title: newPlan.title,
      },
    }, 201);
  }
);

export default app;
