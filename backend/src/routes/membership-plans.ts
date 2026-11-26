import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, membershipPlans, branches, PLAN_TYPE } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const planFieldsSchema = z.object({
  name: z.string().min(1, '方案名稱必填'),
  code: z.string().min(1, '方案代碼必填').max(20),
  planType: z.enum(['TIME_BASED', 'COUNT_BASED']),
  durationMonths: z.number().int().min(1).optional(),
  classCounts: z.number().int().min(1).optional(),
  price: z.string().or(z.number()),
  description: z.string().optional(),
  allowTransfer: z.boolean(),
  allowPause: z.boolean(),
  isActive: z.boolean(),
  branchId: z.string().uuid().optional(),
});

const createPlanSchema = planFieldsSchema.extend({
  allowTransfer: planFieldsSchema.shape.allowTransfer.optional().default(false),
  allowPause: planFieldsSchema.shape.allowPause.optional().default(false),
  isActive: planFieldsSchema.shape.isActive.optional().default(true),
});

// Default-free: in zod v4 .partial() still applies .default()s, which would
// reset allowTransfer/allowPause and re-activate retired plans on every PATCH.
const updatePlanSchema = planFieldsSchema.partial();

const MEMBERSHIP_PLAN_SELECT = {
  id: membershipPlans.id,
  name: membershipPlans.name,
  code: membershipPlans.code,
  planType: membershipPlans.planType,
  description: membershipPlans.description,
  durationMonths: membershipPlans.durationMonths,
  classCounts: membershipPlans.classCounts,
  price: membershipPlans.price,
  allowPause: membershipPlans.allowPause,
  maxPauseDays: membershipPlans.maxPauseDays,
  allowTransfer: membershipPlans.allowTransfer,
  isActive: membershipPlans.isActive,
  sort: membershipPlans.sort,
  createdAt: membershipPlans.createdAt,
  updatedAt: membershipPlans.updatedAt,
  tenantId: membershipPlans.tenantId,
  branchId: membershipPlans.branchId,
};

const MEMBERSHIP_PLAN_RETURNING = MEMBERSHIP_PLAN_SELECT;

const MEMBERSHIP_PLAN_JOIN_SELECT = {
  plan: MEMBERSHIP_PLAN_SELECT,
  branch: {
    id: branches.id,
    name: branches.name,
  },
};

const MEMBERSHIP_PLAN_ID_RETURNING = {
  id: membershipPlans.id,
};

// List membership plans
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const planType = c.req.query('planType');
  const activeOnly = c.req.query('activeOnly') === 'true';

  const conditions = [eq(membershipPlans.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(membershipPlans.branchId, branchId));
  }

  if (planType && PLAN_TYPE.includes(planType as typeof PLAN_TYPE[number])) {
    conditions.push(eq(membershipPlans.planType, planType as typeof PLAN_TYPE[number]));
  }

  if (activeOnly) {
    conditions.push(eq(membershipPlans.isActive, true));
  }

  const result = await db
    .select(MEMBERSHIP_PLAN_JOIN_SELECT)
    .from(membershipPlans)
    .leftJoin(branches, eq(membershipPlans.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(membershipPlans.name);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.plan,
      branch: r.branch,
    })),
  });
});

// Get single plan
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select(MEMBERSHIP_PLAN_JOIN_SELECT)
    .from(membershipPlans)
    .leftJoin(branches, eq(membershipPlans.branchId, branches.id))
    .where(and(eq(membershipPlans.id, id), eq(membershipPlans.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '方案不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.plan,
      branch: result.branch,
    },
  });
});

// Create membership plan
app.post('/', requireRole('admin', 'manager'), zValidator('json', createPlanSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Validate branch if provided
  if (data.branchId) {
    const branchIds = await getTenantBranchIds(tenantId);
    if (!branchIds.includes(data.branchId)) {
      return c.json({ success: false, error: '無效的分店' }, 400);
    }
  }

  // Validate plan type requirements
  if (data.planType === 'TIME_BASED' && !data.durationMonths) {
    return c.json({ success: false, error: '時間制方案需要設定月數' }, 400);
  }

  if (data.planType === 'COUNT_BASED' && !data.classCounts) {
    return c.json({ success: false, error: '計次制方案需要設定堂數' }, 400);
  }

  const [newPlan] = await db.insert(membershipPlans).values({
    ...data,
    price: String(data.price),
    tenantId,
  }).returning(MEMBERSHIP_PLAN_RETURNING);

  return c.json({
    success: true,
    data: newPlan,
  }, 201);
});

// Update membership plan
app.patch('/:id', requireRole('admin', 'manager'), zValidator('json', updatePlanSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Validate branch if updated
  if (data.branchId) {
    const branchIds = await getTenantBranchIds(tenantId);
    if (!branchIds.includes(data.branchId)) {
      return c.json({ success: false, error: '無效的分店' }, 400);
    }
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.price !== undefined) {
    updateData.price = String(data.price);
  }

  const [updated] = await db
    .update(membershipPlans)
    .set(updateData)
    .where(and(eq(membershipPlans.id, id), eq(membershipPlans.tenantId, tenantId)))
    .returning(MEMBERSHIP_PLAN_RETURNING);

  if (!updated) {
    return c.json({ success: false, error: '方案不存在' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete membership plan
app.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  // Soft delete atomically
  const [deleted] = await db
    .update(membershipPlans)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(membershipPlans.id, id), eq(membershipPlans.tenantId, tenantId)))
    .returning(MEMBERSHIP_PLAN_ID_RETURNING);

  if (!deleted) {
    return c.json({ success: false, error: '方案不存在' }, 404);
  }

  return c.json({ success: true, message: '方案已停用' });
});

export default app;
