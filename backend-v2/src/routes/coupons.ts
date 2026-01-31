import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, coupons, couponUsages, branches, campaigns } from '../db/index.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createCouponSchema = z.object({
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
  usageLimitPerMember: z.number().int().optional().default(1),
  campaignId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  applicablePlans: z.array(z.string().uuid()).optional(),
});

const updateCouponSchema = createCouponSchema.partial().omit({ code: true });

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
    const today = new Date().toISOString().split('T')[0];
    conditions.push(eq(coupons.isActive, true));
    conditions.push(lte(coupons.validFrom, today));
    conditions.push(gte(coupons.validUntil, today));
  }

  const result = await db
    .select({
      coupon: coupons,
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
    })
    .from(coupons)
    .leftJoin(branches, eq(coupons.branchId, branches.id))
    .leftJoin(campaigns, eq(coupons.campaignId, campaigns.id))
    .where(and(...conditions))
    .orderBy(desc(coupons.dateCreated))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(coupons)
    .where(and(...conditions));

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
app.post('/validate', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { code, memberId, purchaseAmount } = await c.req.json();

  const today = new Date().toISOString().split('T')[0];

  const [coupon] = await db
    .select()
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

  // Check usage limit
  if (coupon.usageLimit) {
    const [usageCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(couponUsages)
      .where(eq(couponUsages.couponId, coupon.id));

    if (Number(usageCount?.count || 0) >= coupon.usageLimit) {
      return c.json({ success: false, error: '優惠碼已達使用上限' }, 400);
    }
  }

  // Check per-member limit
  if (memberId && coupon.usageLimitPerMember) {
    const [memberUsageCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(couponUsages)
      .where(
        and(
          eq(couponUsages.couponId, coupon.id),
          eq(couponUsages.memberId, memberId)
        )
      );

    if (Number(memberUsageCount?.count || 0) >= coupon.usageLimitPerMember) {
      return c.json({ success: false, error: '您已達此優惠碼使用次數上限' }, 400);
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    discountAmount = purchaseAmount * (Number(coupon.discountValue) / 100);
    if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
      discountAmount = Number(coupon.maxDiscount);
    }
  } else {
    discountAmount = Number(coupon.discountValue);
  }

  return c.json({
    success: true,
    data: {
      coupon,
      discountAmount: Math.round(discountAmount),
      finalAmount: Math.max(0, purchaseAmount - discountAmount),
    },
  });
});

// Create coupon
app.post('/', requireRole('admin', 'manager'), zValidator('json', createCouponSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Check for duplicate code
  const [existing] = await db
    .select()
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
  }).returning();

  return c.json({
    success: true,
    data: newCoupon,
  }, 201);
});

// Record coupon usage
app.post('/:id/use', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const { memberId, contractId, discountAmount } = await c.req.json();

  const [coupon] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .limit(1);

  if (!coupon) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  const [usage] = await db.insert(couponUsages).values({
    couponId: id,
    memberId,
    contractId,
    discountAmount: String(discountAmount),
    usedAt: new Date(),
  }).returning();

  return c.json({
    success: true,
    data: usage,
  });
});

// Get single coupon
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      coupon: coupons,
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(coupons)
    .leftJoin(branches, eq(coupons.branchId, branches.id))
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  // Get usage stats
  const [usageStats] = await db
    .select({
      totalUsage: sql<number>`count(*)`,
      totalDiscount: sql<string>`sum(discount_amount)`,
    })
    .from(couponUsages)
    .where(eq(couponUsages.couponId, id));

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

  const [existing] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  const updateData: Record<string, unknown> = {
    ...data,
    dateUpdated: new Date(),
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

  const [updated] = await db.update(coupons).set(updateData).where(eq(coupons.id, id)).returning();

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete coupon
app.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [existing] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '優惠碼不存在' }, 404);
  }

  await db.delete(coupons).where(eq(coupons.id, id));

  return c.json({ success: true, message: '優惠碼已刪除' });
});

export default app;
