import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, coupons, couponUsages, branches, campaigns, contracts } from '../db/index.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const couponFieldsSchema = z.object({
  code: z.string().min(1, '優惠碼必填').max(20),
  name: z.string().min(1, '名稱必填'),
  description: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.string().or(z.number()),
  minPurchase: z.string().or(z.number()).optional(),
  maxDiscount: z.string().or(z.number()).optional(),
  validFrom: z.string(),
  validUntil: z.string(),
  usageLimit: z.number().int().optional(),
  usageLimitPerMember: z.number().int(),
  campaignId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.boolean(),
  applicablePlans: z.array(z.string().uuid()).optional(),
});

const createCouponSchema = couponFieldsSchema.extend({
  usageLimitPerMember: couponFieldsSchema.shape.usageLimitPerMember.optional().default(1),
  isActive: couponFieldsSchema.shape.isActive.optional().default(true),
});

// Built from the default-free field schema: in zod v4 .partial() still applies
// .default()s, so a PATCH would otherwise reset every unsent defaulted field.
const updateCouponSchema = couponFieldsSchema.partial().omit({ code: true });

const validateCouponSchema = z.preprocess(
  // The admin-web composable sends `amount`; accept it as an alias
  (body) => {
    if (body && typeof body === 'object' && !('purchaseAmount' in body) && 'amount' in body) {
      return { ...body, purchaseAmount: (body as { amount: unknown }).amount };
    }
    return body;
  },
  z.object({
    code: z.string().min(1, '優惠碼必填'),
    memberId: z.string().uuid().optional(),
    purchaseAmount: z.coerce.number().finite().nonnegative(),
  }),
);

const useCouponSchema = z.object({
  memberId: z.string().uuid(),
  contractId: z.string().uuid(),
});

type CouponDiscountFields = {
  discountType: string;
  discountValue: string;
  maxDiscount: string | null;
};

/** Server-side discount for an amount: percentage capped by maxDiscount, never above the amount. */
export function computeCouponDiscount(coupon: CouponDiscountFields, amount: number): number {
  let discount = coupon.discountType === 'PERCENTAGE'
    ? amount * (Number(coupon.discountValue) / 100)
    : Number(coupon.discountValue);
  if (coupon.maxDiscount !== null && discount > Number(coupon.maxDiscount)) {
    discount = Number(coupon.maxDiscount);
  }
  return Math.max(0, Math.min(Math.round(discount), amount));
}

const COUNT_SELECT = { count: sql<number>`count(*)` };

const COUPON_SELECT = {
  id: coupons.id,
  status: coupons.status,
  createdAt: coupons.createdAt,
  updatedAt: coupons.updatedAt,
  tenantId: coupons.tenantId,
  branchId: coupons.branchId,
  campaignId: coupons.campaignId,
  code: coupons.code,
  name: coupons.name,
  description: coupons.description,
  discountType: coupons.discountType,
  discountValue: coupons.discountValue,
  minPurchase: coupons.minPurchase,
  maxDiscount: coupons.maxDiscount,
  validFrom: coupons.validFrom,
  validUntil: coupons.validUntil,
  usageLimit: coupons.usageLimit,
  usageLimitPerMember: coupons.usageLimitPerMember,
  isActive: coupons.isActive,
  applicablePlans: coupons.applicablePlans,
};

const COUPON_RETURNING = COUPON_SELECT;

const COUPON_LIST_SELECT = {
  coupon: COUPON_SELECT,
  branch: {
    id: branches.id,
    name: branches.name,
  },
  campaign: {
    id: campaigns.id,
    name: campaigns.name,
  },
  usageCount: sql<number>`(
    SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = ${coupons.id}
  )`,
};

const COUPON_BY_ID_SELECT = {
  coupon: COUPON_SELECT,
  branch: {
    id: branches.id,
    name: branches.name,
  },
};

const COUPON_USAGE_STATS_SELECT = {
  totalUsage: sql<number>`count(*)`,
  totalDiscount: sql<string>`sum(discount_amount)`,
};

const COUPON_DELETE_RETURNING = { id: coupons.id };

const COUPON_ID_SELECT = { id: coupons.id };

const CONTRACT_FOR_COUPON_SELECT = {
  memberId: contracts.memberId,
  planId: contracts.planId,
  branchId: contracts.branchId,
  totalAmount: contracts.totalAmount,
};

// List coupons
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const activeOnly = c.req.query('activeOnly') === 'true';
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [eq(coupons.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(coupons.branchId, branchId));
  }

  if (activeOnly) {
    const today = new Date().toISOString().slice(0, 10);
    conditions.push(eq(coupons.isActive, true));
    conditions.push(lte(coupons.validFrom, today));
    conditions.push(gte(coupons.validUntil, today));
  }

  const [result, [countResult]] = await Promise.all([
    db
      .select(COUPON_LIST_SELECT)
      .from(coupons)
      .leftJoin(branches, eq(coupons.branchId, branches.id))
      .leftJoin(campaigns, eq(coupons.campaignId, campaigns.id))
      .where(and(...conditions))
      .orderBy(desc(coupons.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select(COUNT_SELECT)
      .from(coupons)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.coupon,
      branch: r.branch,
      campaign: r.campaign,
      usageCount: Number(r.usageCount),
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Validate coupon code
app.post('/validate', zValidator('json', validateCouponSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const { code, memberId, purchaseAmount } = c.req.valid('json');

  const today = new Date().toISOString().slice(0, 10);

  const [coupon] = await db
    .select(COUPON_SELECT)
    .from(coupons)
    .where(
      and(
        eq(coupons.code, code.toUpperCase()),
        eq(coupons.tenantId, tenantId),
        eq(coupons.isActive, true),
        lte(coupons.validFrom, today),
        gte(coupons.validUntil, today)
      )
    )
    .limit(1);

  if (!coupon) {
    return c.json({ success: false, error: '無效的優惠碼或已過期' }, 400);
  }

  // Check min purchase
  if (coupon.minPurchase && purchaseAmount < Number(coupon.minPurchase)) {
    return c.json({
      success: false,
      error: `消費金額需滿 ${coupon.minPurchase} 元`,
    }, 400);
  }

  // Check usage limits concurrently if applicable
  const needUsageLimit = !!coupon.usageLimit;
  const needMemberLimit = Boolean(memberId && coupon.usageLimitPerMember);

  if (needUsageLimit || needMemberLimit) {
    const [usageCountResult, memberUsageCountResult] = await Promise.all([
      needUsageLimit
        ? db
            .select(COUNT_SELECT)
            .from(couponUsages)
            .where(eq(couponUsages.couponId, coupon.id))
        : Promise.resolve(null),
      needMemberLimit
        ? db
            .select(COUNT_SELECT)
            .from(couponUsages)
            .where(
              and(
                eq(couponUsages.couponId, coupon.id),
                eq(couponUsages.memberId, memberId!)
              )
            )
        : Promise.resolve(null),
    ]);

    if (usageCountResult && Number(usageCountResult[0]?.count || 0) >= coupon.usageLimit!) {
      return c.json({ success: false, error: '優惠碼已達使用上限' }, 400);
    }

    if (memberUsageCountResult && Number(memberUsageCountResult[0]?.count || 0) >= coupon.usageLimitPerMember!) {
      return c.json({ success: false, error: '您已達此優惠碼使用次數上限' }, 400);
    }
  }

  const discountAmount = computeCouponDiscount(coupon, purchaseAmount);

  return c.json({
    success: true,
    data: {
      coupon,
      discountAmount,
      finalAmount: purchaseAmount - discountAmount,
    },
  });
});

const COUPON_USAGE_RETURNING = {
  id: couponUsages.id,
  createdAt: couponUsages.createdAt,
  couponId: couponUsages.couponId,
  memberId: couponUsages.memberId,
  contractId: couponUsages.contractId,
  discountAmount: couponUsages.discountAmount,
  usedAt: couponUsages.usedAt,
};

// Create coupon
app.post('/', requireRole('admin', 'manager'), zValidator('json', createCouponSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Check for duplicate code
  const [existing] = await db
    .select(COUPON_ID_SELECT)
    .from(coupons)
    .where(and(eq(coupons.code, data.code.toUpperCase()), eq(coupons.tenantId, tenantId)))
    .limit(1);

  if (existing) {
    return c.json({ success: false, error: '優惠碼已存在' }, 400);
  }

  // Validate dates
  if (new Date(data.validFrom) > new Date(data.validUntil)) {
    return c.json({ success: false, error: '開始日期不能晚於結束日期' }, 400);
  }

  const [newCoupon] = await db.insert(coupons).values({
    ...data,
    code: data.code.toUpperCase(),
    discountValue: String(data.discountValue),
    minPurchase: data.minPurchase ? String(data.minPurchase) : null,
    maxDiscount: data.maxDiscount ? String(data.maxDiscount) : null,
    tenantId,
  }).returning(COUPON_RETURNING);

  return c.json({
    success: true,
    data: newCoupon,
  }, 201);
});

// Record coupon usage
// The discount is computed here from the coupon and the contract amount; any
// client-sent discountAmount is ignored (stripped by the schema).
app.post('/:id/use', zValidator('json', useCouponSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const { memberId, contractId } = c.req.valid('json');

  type UseResult =
    | { ok: true; usage: typeof couponUsages.$inferSelect; originalAmount: number }
    | { ok: false; status: 400 | 404 | 409; error: string };

  const result = await db.transaction(async (tx): Promise<UseResult> => {
    // Row lock serialises concurrent redemptions of the same coupon, so the
    // usage-limit counts below cannot be raced past.
    const [coupon] = await tx
      .select(COUPON_SELECT)
      .from(coupons)
      .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
      .limit(1)
      .for('update');

    if (!coupon) {
      return { ok: false, status: 404, error: '優惠碼不存在' };
    }

    const today = new Date().toISOString().slice(0, 10);
    if (!coupon.isActive || coupon.validFrom > today || coupon.validUntil < today) {
      return { ok: false, status: 400, error: '無效的優惠碼或已過期' };
    }

    const [contract] = await tx
      .select(CONTRACT_FOR_COUPON_SELECT)
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, tenantId)))
      .limit(1);

    // Another tenant's contract, or one that is not this member's, looks the same as a missing one
    if (!contract || contract.memberId !== memberId) {
      return { ok: false, status: 404, error: '合約不存在' };
    }

    if (coupon.branchId && contract.branchId !== coupon.branchId) {
      return { ok: false, status: 400, error: '此優惠碼不適用於該分店' };
    }

    const applicablePlans = Array.isArray(coupon.applicablePlans) ? coupon.applicablePlans as string[] : [];
    if (applicablePlans.length > 0 && !applicablePlans.includes(contract.planId)) {
      return { ok: false, status: 400, error: '此優惠碼不適用於該方案' };
    }

    const amount = Number(contract.totalAmount);
    if (coupon.minPurchase !== null && amount < Number(coupon.minPurchase)) {
      return { ok: false, status: 400, error: `消費金額需滿 ${coupon.minPurchase} 元` };
    }

    const [[total], [perMember], [perContract]] = await Promise.all([
      tx.select(COUNT_SELECT).from(couponUsages).where(eq(couponUsages.couponId, id)),
      tx.select(COUNT_SELECT).from(couponUsages)
        .where(and(eq(couponUsages.couponId, id), eq(couponUsages.memberId, memberId))),
      tx.select(COUNT_SELECT).from(couponUsages)
        .where(and(eq(couponUsages.couponId, id), eq(couponUsages.contractId, contractId))),
    ]);

    if (Number(perContract?.count || 0) > 0) {
      return { ok: false, status: 409, error: '此合約已使用過此優惠碼' };
    }
    if (coupon.usageLimit !== null && Number(total?.count || 0) >= coupon.usageLimit) {
      return { ok: false, status: 400, error: '優惠碼已達使用上限' };
    }
    if (coupon.usageLimitPerMember !== null && Number(perMember?.count || 0) >= coupon.usageLimitPerMember) {
      return { ok: false, status: 400, error: '該會員已達此優惠碼使用次數上限' };
    }

    const discountAmount = computeCouponDiscount(coupon, amount);

    const [usage] = await tx.insert(couponUsages).values({
      couponId: id,
      memberId,
      contractId,
      discountAmount: String(discountAmount),
      usedAt: new Date(),
    }).returning(COUPON_USAGE_RETURNING);

    return { ok: true, usage, originalAmount: amount };
  });

  if (!result.ok) {
    return c.json({ success: false, error: result.error }, result.status);
  }

  const discountAmount = Number(result.usage.discountAmount);
  return c.json({
    success: true,
    data: {
      ...result.usage,
      originalAmount: result.originalAmount,
      finalAmount: result.originalAmount - discountAmount,
    },
  });
});

// Get single coupon
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[result], [usageStats]] = await Promise.all([
    db
      .select(COUPON_BY_ID_SELECT)
      .from(coupons)
      .leftJoin(branches, eq(coupons.branchId, branches.id))
      .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
      .limit(1),

    // Get usage stats
    db
      .select(COUPON_USAGE_STATS_SELECT)
      .from(couponUsages)
      .where(eq(couponUsages.couponId, id)),
  ]);

  if (!result) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.coupon,
      branch: result.branch,
      stats: {
        totalUsage: Number(usageStats?.totalUsage || 0),
        totalDiscount: Number(usageStats?.totalDiscount || 0),
      },
    },
  });
});

// Update coupon
app.patch('/:id', requireRole('admin', 'manager'), zValidator('json', updateCouponSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.discountValue !== undefined) {
    updateData.discountValue = String(data.discountValue);
  }
  if (data.minPurchase !== undefined) {
    updateData.minPurchase = data.minPurchase ? String(data.minPurchase) : null;
  }
  if (data.maxDiscount !== undefined) {
    updateData.maxDiscount = data.maxDiscount ? String(data.maxDiscount) : null;
  }

  const [updated] = await db
    .update(coupons)
    .set(updateData)
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .returning(COUPON_RETURNING);

  if (!updated) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete coupon
app.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [deleted] = await db
    .delete(coupons)
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .returning(COUPON_DELETE_RETURNING);

  if (!deleted) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  return c.json({ success: true, message: '優惠碼已刪除' });
});

export default app;
