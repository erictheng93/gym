import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, leads, branches, employees, members } from '../db/index.js';
import { eq, and, sql, desc, ilike, or, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const leadFieldsSchema = z.object({
  fullName: z.string().min(1, '姓名必填'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  source: z.enum(['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'AD', 'OTHER']).optional(),
  sourceDetail: z.string().optional(),
  branchId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'NEGOTIATION', 'CONVERTED', 'LOST']),
  notes: z.string().optional(),
  interests: z.array(z.string()).optional(),
  expectedBudget: z.string().or(z.number()).optional(),
});

const createLeadSchema = leadFieldsSchema.extend({
  status: leadFieldsSchema.shape.status.optional().default('NEW'),
});

// Default-free: in zod v4 .partial() still applies .default()s, which would
// reset the pipeline status to NEW on every PATCH that does not send it.
const updateLeadSchema = leadFieldsSchema.partial();

const COUNT_SELECT = { count: sql<number>`count(*)` };

const LEAD_SELECT = {
  id: leads.id,
  status: leads.status,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
  fullName: leads.fullName,
  phone: leads.phone,
  email: leads.email,
  source: leads.source,
  sourceDetail: leads.sourceDetail,
  branchId: leads.branchId,
  assignedToId: leads.assignedToId,
  leadStatus: leads.leadStatus,
  notes: leads.notes,
  interests: leads.interests,
  expectedBudget: leads.expectedBudget,
  convertedMemberId: leads.convertedMemberId,
  convertedAt: leads.convertedAt,
};

const LEAD_RETURNING = LEAD_SELECT;

const LEAD_LIST_SELECT = {
  lead: LEAD_SELECT,
  branch: {
    id: branches.id,
    name: branches.name,
  },
  assignedTo: {
    id: employees.id,
    fullName: employees.fullName,
  },
};

const LEAD_BY_ID_SELECT = {
  lead: LEAD_SELECT,
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
};

const LAST_MEMBER_CODE_SELECT = { memberCode: members.memberCode };

const NEW_MEMBER_RETURNING = {
  id: members.id,
  fullName: members.fullName,
  phone: members.phone,
  email: members.email,
  memberCode: members.memberCode,
  branchId: members.branchId,
  status: members.status,
  joinDate: members.joinDate,
  notes: members.notes,
};

const LEAD_DELETE_RETURNING = { id: leads.id };

const LEAD_STATS_SELECT = {
  status: leads.status,
  count: sql<number>`count(*)`,
};

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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  const conditions = [];

  if (branchId) {
    if (!branchIds.includes(branchId.toLowerCase())) {
      return c.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      });
    }
    conditions.push(eq(leads.branchId, branchId));
  } else {
    conditions.push(
      branchIds.length === 1 ? eq(leads.branchId, branchIds[0]) : inArray(leads.branchId, branchIds)
    );
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

  const [result, [countResult]] = await Promise.all([
    db
      .select(LEAD_LIST_SELECT)
      .from(leads)
      .innerJoin(branches, eq(leads.branchId, branches.id))
      .leftJoin(employees, eq(leads.assignedToId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select(COUNT_SELECT)
      .from(leads)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult?.count || 0);

  const data = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i]!;
    data[i] = {
      ...r.lead,
      branch: r.branch,
      assignedTo: r.assignedTo,
    };
  }

  return c.json({
    success: true,
    data,
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

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  const branchCondition = branchIds.length === 1 ? eq(leads.branchId, branchIds[0]) : inArray(leads.branchId, branchIds);

  const [result] = await db
    .select(LEAD_BY_ID_SELECT)
    .from(leads)
    .leftJoin(branches, eq(leads.branchId, branches.id))
    .leftJoin(employees, eq(leads.assignedToId, employees.id))
    .leftJoin(members, eq(leads.convertedMemberId, members.id))
    .where(and(eq(leads.id, id), branchCondition))
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
  const branchIds = await getTenantBranchIds(tenantId);

  if (!branchIds.includes(data.branchId.toLowerCase())) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [newLead] = await db.insert(leads).values({
    ...data,
    expectedBudget: data.expectedBudget ? String(data.expectedBudget) : null,
  }).returning(LEAD_RETURNING);

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

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.expectedBudget !== undefined) {
    updateData.expectedBudget = data.expectedBudget ? String(data.expectedBudget) : null;
  }

  const branchCondition = branchIds.length === 1 ? eq(leads.branchId, branchIds[0]) : inArray(leads.branchId, branchIds);

  const [updated] = await db
    .update(leads)
    .set(updateData)
    .where(and(eq(leads.id, id), branchCondition))
    .returning(LEAD_RETURNING);

  if (!updated) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// Convert lead to member
app.post('/:id/convert', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  const branchCondition = branchIds.length === 1 ? eq(leads.branchId, branchIds[0]) : inArray(leads.branchId, branchIds);

  const [[lead], [lastMember]] = await Promise.all([
    db
      .select(LEAD_SELECT)
      .from(leads)
      .where(and(eq(leads.id, id), branchCondition))
      .limit(1),
    db
      .select(LAST_MEMBER_CODE_SELECT)
      .from(members)
      .orderBy(desc(members.createdAt))
      .limit(1),
  ]);

  if (!lead) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  if (lead.leadStatus === 'CONVERTED') {
    return c.json({ success: false, error: '此潛在客戶已轉換' }, 400);
  }

  const lastNum = lastMember?.memberCode ? parseInt(lastMember.memberCode.slice(1)) : 0;
  const memberCode = `M${String(lastNum + 1).padStart(6, '0')}`;

  // Ensure phone is provided for member creation
  if (!lead.phone) {
    return c.json({ success: false, error: '需要電話號碼才能轉換為會員' }, 400);
  }

  // Create member from lead
  const [newMember] = await db.insert(members).values({
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    memberCode,
    branchId: lead.branchId,
    tenantId,
    status: 'ACTIVE',
    notes: lead.source ? `來源: ${lead.source}` : undefined,
    joinDate: new Date().toISOString().slice(0, 10),
  }).returning(NEW_MEMBER_RETURNING);

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
      lead: { ...lead, leadStatus: 'CONVERTED', convertedMemberId: newMember.id },
      member: newMember,
    },
    message: '潛在客戶已成功轉換為會員',
  });
});

// Delete lead
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  const branchCondition = branchIds.length === 1 ? eq(leads.branchId, branchIds[0]) : inArray(leads.branchId, branchIds);

  const [deleted] = await db
    .delete(leads)
    .where(and(eq(leads.id, id), branchCondition))
    .returning(LEAD_DELETE_RETURNING);

  if (!deleted) {
    return c.json({ success: false, error: '潛在客戶不存在' }, 404);
  }

  return c.json({ success: true, message: '潛在客戶已刪除' });
});

// Lead stats
app.get('/stats/summary', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: {
        total: 0,
        byStatus: {},
        conversionRate: '0.0',
      },
    });
  }

  const targetBranchIds = branchId ? branchIds.filter(id => id === branchId) : branchIds;
  if (targetBranchIds.length === 0) {
    return c.json({
      success: true,
      data: {
        total: 0,
        byStatus: {},
        conversionRate: '0.0',
      },
    });
  }

  const branchCondition = targetBranchIds.length === 1 ? eq(leads.branchId, targetBranchIds[0]) : inArray(leads.branchId, targetBranchIds);

  const stats = await db
    .select(LEAD_STATS_SELECT)
    .from(leads)
    .where(branchCondition)
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
