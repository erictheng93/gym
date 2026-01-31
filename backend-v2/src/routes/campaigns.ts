import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, campaigns, branches, employees, CAMPAIGN_TYPE } from '../db/index.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createCampaignSchema = z.object({
  name: z.string().min(1, '活動名稱必填'),
  description: z.string().optional(),
  campaignType: z.enum(['PROMOTION', 'REFERRAL', 'SEASONAL', 'MEMBERSHIP', 'EVENT', 'OTHER']).optional(),
  startDate: z.string(),
  endDate: z.string(),
  targetAudience: z.string().optional(),
  budget: z.string().or(z.number()).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED', 'FREE_TRIAL', 'GIFT']).optional(),
  discountValue: z.string().or(z.number()).optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  terms: z.string().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

// List campaigns
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const activeOnly = c.req.query('activeOnly') === 'true';
  const campaignType = c.req.query('campaignType');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [eq(campaigns.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(campaigns.branchId, branchId));
  }

  if (activeOnly) {
    const today = new Date().toISOString().split('T')[0];
    conditions.push(eq(campaigns.isActive, true));
    conditions.push(lte(campaigns.startDate, today));
    conditions.push(gte(campaigns.endDate, today));
  }

  if (campaignType && CAMPAIGN_TYPE.includes(campaignType as typeof CAMPAIGN_TYPE[number])) {
    conditions.push(eq(campaigns.campaignType, campaignType as typeof CAMPAIGN_TYPE[number]));
  }

  const result = await db
    .select({
      campaign: campaigns,
      branch: {
        id: branches.id,
        name: branches.name,
      },
      createdBy: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(campaigns)
    .leftJoin(branches, eq(campaigns.branchId, branches.id))
    .leftJoin(employees, eq(campaigns.createdById, employees.id))
    .where(and(...conditions))
    .orderBy(desc(campaigns.startDate))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaigns)
    .where(and(...conditions));

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.campaign,
      branch: r.branch,
      createdBy: r.createdBy,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single campaign
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      campaign: campaigns,
      branch: {
        id: branches.id,
        name: branches.name,
      },
      createdBy: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(campaigns)
    .leftJoin(branches, eq(campaigns.branchId, branches.id))
    .leftJoin(employees, eq(campaigns.createdById, employees.id))
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '活動不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.campaign,
      branch: result.branch,
      createdBy: result.createdBy,
    },
  });
});

// Create campaign
app.post('/', requireRole('admin', 'manager'), zValidator('json', createCampaignSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  // Validate dates
  if (new Date(data.startDate) > new Date(data.endDate)) {
    return c.json({ success: false, error: '開始日期不能晚於結束日期' }, 400);
  }

  // Validate branch if provided
  if (data.branchId) {
    const [branch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
      .limit(1);

    if (!branch) {
      return c.json({ success: false, error: '無效的分店' }, 400);
    }
  }

  const [newCampaign] = await db.insert(campaigns).values({
    ...data,
    budget: data.budget ? String(data.budget) : null,
    discountValue: data.discountValue ? String(data.discountValue) : null,
    tenantId,
    createdById: user.employeeId,
  }).returning();

  return c.json({
    success: true,
    data: newCampaign,
  }, 201);
});

// Update campaign
app.patch('/:id', requireRole('admin', 'manager'), zValidator('json', updateCampaignSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '活動不存在' }, 404);
  }

  const updateData: Record<string, unknown> = {
    ...data,
    dateUpdated: new Date(),
  };

  if (data.budget !== undefined) {
    updateData.budget = data.budget ? String(data.budget) : null;
  }

  if (data.discountValue !== undefined) {
    updateData.discountValue = data.discountValue ? String(data.discountValue) : null;
  }

  const [updated] = await db.update(campaigns).set(updateData).where(eq(campaigns.id, id)).returning();

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete campaign
app.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [existing] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '活動不存在' }, 404);
  }

  await db.delete(campaigns).where(eq(campaigns.id, id));

  return c.json({ success: true, message: '活動已刪除' });
});

// Active campaigns
app.get('/active/list', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const today = new Date().toISOString().split('T')[0];

  const conditions = [
    eq(campaigns.tenantId, tenantId),
    eq(campaigns.isActive, true),
    lte(campaigns.startDate, today),
    gte(campaigns.endDate, today),
  ];

  if (branchId) {
    conditions.push(eq(campaigns.branchId, branchId));
  }

  const result = await db
    .select()
    .from(campaigns)
    .where(and(...conditions))
    .orderBy(campaigns.endDate);

  return c.json({
    success: true,
    data: result,
  });
});

export default app;
