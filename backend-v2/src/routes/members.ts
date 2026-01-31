import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, members, contracts, branches } from '../db/index.js';
import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createMemberSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元'),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  branchId: z.string().uuid(),
  memberStatus: z.enum(['ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED']).optional(),
  joinDate: z.string().optional(),
  salesPersonId: z.string().uuid().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  birthday: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

const updateMemberSchema = createMemberSchema.partial();

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED']).optional(),
  sortBy: z.enum(['fullName', 'memberCode', 'joinDate', 'dateCreated']).default('dateCreated'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

app.get('/', zValidator('query', querySchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const { page, limit, search, branchId, status, sortBy, sortOrder } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit, totalPages: 0 } });
  }

  let baseCondition = sql`${members.branchId} = ANY(${branchIds})`;

  if (branchId) {
    baseCondition = and(baseCondition, eq(members.branchId, branchId))!;
  }

  if (status) {
    baseCondition = and(baseCondition, eq(members.memberStatus, status))!;
  }

  if (search) {
    baseCondition = and(
      baseCondition,
      or(
        ilike(members.fullName, `%${search}%`),
        ilike(members.memberCode, `%${search}%`),
        ilike(members.phone, `%${search}%`),
        ilike(members.email, `%${search}%`)
      )
    )!;
  }

  const sortColumn = {
    fullName: members.fullName,
    memberCode: members.memberCode,
    joinDate: members.joinDate,
    dateCreated: members.dateCreated,
  }[sortBy];

  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(baseCondition);

  const total = Number(countResult?.count || 0);

  const result = await db
    .select()
    .from(members)
    .where(baseCondition)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: result,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, id))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, member.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此會員' }, 403);
  }

  const memberContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.memberId, id))
    .orderBy(desc(contracts.dateCreated));

  return c.json({
    success: true,
    data: {
      ...member,
      contracts: memberContracts,
    },
  });
});

app.post('/', zValidator('json', createMemberSchema), async (c) => {
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

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .innerJoin(branches, eq(members.branchId, branches.id))
    .where(eq(branches.tenantId, tenantId));

  const memberCount = Number(countResult?.count || 0);

  const memberCode = `M${String(memberCount + 1).padStart(6, '0')}`;

  const [newMember] = await db.insert(members).values({
    ...data,
    memberCode,
    joinDate: data.joinDate || new Date().toISOString().split('T')[0],
    tenantId,
  }).returning();

  return c.json({ success: true, data: newMember }, 201);
});

app.patch('/:id', zValidator('json', updateMemberSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, id))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, member.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限修改此會員' }, 403);
  }

  if (data.branchId) {
    const [newBranch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
      .limit(1);

    if (!newBranch) {
      return c.json({ success: false, error: '無效的分店' }, 400);
    }
  }

  const [updatedMember] = await db
    .update(members)
    .set({
      ...data,
      dateUpdated: new Date(),
    })
    .where(eq(members.id, id))
    .returning();

  return c.json({ success: true, data: updatedMember });
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, id))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, member.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限刪除此會員' }, 403);
  }

  await db
    .update(members)
    .set({ status: 'archived', dateUpdated: new Date() })
    .where(eq(members.id, id));

  return c.json({ success: true, message: '會員已封存' });
});

export default app;
