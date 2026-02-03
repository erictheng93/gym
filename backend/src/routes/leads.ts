import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, leads, branches, employees, members } from '../db/index.js';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createLeadSchema = z.object({
  fullName: z.string().min(1, '姓名必填'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  source: z.enum(['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'AD', 'OTHER']).optional(),
  sourceDetail: z.string().optional(),
  branchId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'NEGOTIATION', 'CONVERTED', 'LOST']).optional().default('NEW'),
  notes: z.string().optional(),
  interests: z.array(z.string()).optional(),
  expectedBudget: z.string().or(z.number()).optional(),
});

const updateLeadSchema = createLeadSchema.partial();

// List leads
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const status = c.req.query('status');
  const assignedToId = c.req.query('assignedToId');
  const search = c.req.query('search');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [eq(branches.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(leads.branchId, branchId));
  }

  if (status) {
    conditions.push(eq(leads.status, status));
  }

  if (assignedToId) {
    conditions.push(eq(leads.assignedToId, assignedToId));
  }

  if (search) {
    conditions.push(
      or(
        ilike(leads.fullName, `%${search}%`),
        ilike(leads.phone, `%${search}%`),
        ilike(leads.email, `%${search}%`)
      )!
    );
  }

  const result = await db
    .select({
      lead: leads,
      branch: {
        id: branches.id,
        name: branches.name,
      },
      assignedTo: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .leftJoin(employees, eq(leads.assignedToId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .where(and(...conditions));

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.lead,
      branch: r.branch,
      assignedTo: r.assignedTo,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single lead
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      lead: leads,
      branch: {
        id: branches.id,
        name: branches.name,
      },
      assignedTo: {
        id: employees.id,
        fullName: employees.fullName,
      },
      convertedMember: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
    })
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .leftJoin(employees, eq(leads.assignedToId, employees.id))
    .leftJoin(members, eq(leads.convertedMemberId, members.id))
    .where(and(eq(leads.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.lead,
      branch: result.branch,
      assignedTo: result.assignedTo,
      convertedMember: result.convertedMember,
    },
  });
});

// Create lead
app.post('/', zValidator('json', createLeadSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Verify branch
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [newLead] = await db.insert(leads).values({
    ...data,
    expectedBudget: data.expectedBudget ? String(data.expectedBudget) : null,
  }).returning();

  return c.json({
    success: true,
    data: newLead,
  }, 201);
});

// Update lead
app.patch('/:id', zValidator('json', updateLeadSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .where(and(eq(leads.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.expectedBudget !== undefined) {
    updateData.expectedBudget = data.expectedBudget ? String(data.expectedBudget) : null;
  }

  const [updated] = await db.update(leads).set(updateData).where(eq(leads.id, id)).returning();

  return c.json({
    success: true,
    data: updated,
  });
});

// Convert lead to member
app.post('/:id/convert', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [lead] = await db
    .select({ lead: leads, branch: branches })
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .where(and(eq(leads.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  if (lead.lead.leadStatus === 'CONVERTED') {
    return c.json({ success: false, error: '此潛在客戶已轉換' }, 400);
  }

  // Generate member code
  const [lastMember] = await db
    .select({ memberCode: members.memberCode })
    .from(members)
    .orderBy(desc(members.createdAt))
    .limit(1);

  const lastNum = lastMember?.memberCode ? parseInt(lastMember.memberCode.slice(1)) : 0;
  const memberCode = `M${String(lastNum + 1).padStart(6, '0')}`;

  // Ensure phone is provided for member creation
  if (!lead.lead.phone) {
    return c.json({ success: false, error: '需要電話號碼才能轉換為會員' }, 400);
  }

  // Create member from lead
  const [newMember] = await db.insert(members).values({
    fullName: lead.lead.fullName,
    phone: lead.lead.phone,
    email: lead.lead.email,
    memberCode,
    branchId: lead.lead.branchId,
    status: 'ACTIVE',
    joinDate: new Date().toISOString().split('T')[0],
    notes: lead.lead.source ? `來源: ${lead.lead.source}` : undefined,
  }).returning();

  // Update lead status
  await db.update(leads).set({
    leadStatus: 'CONVERTED',
    convertedMemberId: newMember.id,
    convertedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(leads.id, id));

  return c.json({
    success: true,
    data: {
      lead: { ...lead.lead, leadStatus: 'CONVERTED', convertedMemberId: newMember.id },
      member: newMember,
    },
    message: '潛在客戶已成功轉換為會員',
  });
});

// Delete lead
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [existing] = await db
    .select()
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .where(and(eq(leads.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  await db.delete(leads).where(eq(leads.id, id));

  return c.json({ success: true, message: '潛在客戶已刪除' });
});

// Lead stats
app.get('/stats/summary', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const conditions = [eq(branches.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(leads.branchId, branchId));
  }

  const stats = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .innerJoin(branches, eq(leads.branchId, branches.id))
    .where(and(...conditions))
    .groupBy(leads.status);

  const statusCounts: Record<string, number> = {};
  let total = 0;

  for (const stat of stats) {
    const count = Number(stat.count);
    statusCounts[stat.status ?? 'unknown'] = count;
    total += count;
  }

  return c.json({
    success: true,
    data: {
      total,
      byStatus: statusCounts,
      conversionRate: total > 0 ? ((statusCounts['CONVERTED'] || 0) / total * 100).toFixed(1) : '0.0',
    },
  });
});

export default app;
