import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contracts, contractLogs, members, membershipPlans, branches, payments } from '../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createContractSchema = z.object({
  memberId: z.string().uuid(),
  planId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string().optional(),
  totalAmount: z.coerce.number().min(0),
  branchId: z.string().uuid(),
  salesPersonId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const pauseContractSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contracts)
    .where(sql`${contracts.branchId} = ANY(${branchIds})`);

  const total = Number(countResult?.count || 0);

  const result = await db
    .select({
      contract: contracts,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
      plan: {
        id: membershipPlans.id,
        name: membershipPlans.name,
        planType: membershipPlans.planType,
      },
    })
    .from(contracts)
    .leftJoin(members, eq(contracts.memberId, members.id))
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(sql`${contracts.branchId} = ANY(${branchIds})`)
    .orderBy(desc(contracts.dateCreated))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: result,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [contract] = await db
    .select({
      contract: contracts,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
        phone: members.phone,
        email: members.email,
      },
      plan: {
        id: membershipPlans.id,
        name: membershipPlans.name,
        planType: membershipPlans.planType,
        price: membershipPlans.price,
      },
    })
    .from(contracts)
    .leftJoin(members, eq(contracts.memberId, members.id))
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, contract.contract.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此合約' }, 403);
  }

  const logs = await db
    .select()
    .from(contractLogs)
    .where(eq(contractLogs.contractId, id))
    .orderBy(desc(contractLogs.dateCreated));

  const contractPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.contractId, id))
    .orderBy(desc(payments.dateCreated));

  return c.json({
    success: true,
    data: {
      ...contract,
      logs,
      payments: contractPayments,
    },
  });
});

app.post('/', zValidator('json', createContractSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, data.memberId))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  const [plan] = await db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.id, data.planId))
    .limit(1);

  if (!plan) {
    return c.json({ success: false, error: '會籍方案不存在' }, 404);
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contracts)
    .innerJoin(branches, eq(contracts.branchId, branches.id))
    .where(eq(branches.tenantId, tenantId));

  const contractCount = Number(countResult?.count || 0);
  const contractNo = `C${new Date().getFullYear()}${String(contractCount + 1).padStart(6, '0')}`;

  let endDate = data.endDate;
  let remainingCounts = null;

  if (plan.planType === 'TIME_BASED' && plan.durationMonths) {
    const start = new Date(data.startDate);
    start.setMonth(start.getMonth() + plan.durationMonths);
    endDate = start.toISOString().split('T')[0];
  } else if (plan.planType === 'COUNT_BASED' && plan.classCounts) {
    remainingCounts = plan.classCounts;
  }

  const [newContract] = await db.insert(contracts).values({
    contractNo,
    memberId: data.memberId,
    planId: data.planId,
    signDate: new Date().toISOString().split('T')[0],
    startDate: data.startDate,
    endDate,
    originalEndDate: endDate,
    contractStatus: 'DRAFT',
    remainingCounts,
    totalAmount: String(data.totalAmount),
    paymentStatus: 'UNPAID',
    salesPersonId: data.salesPersonId,
    branchId: data.branchId,
    notes: data.notes,
    tenantId,
  }).returning();

  return c.json({ success: true, data: newContract }, 201);
});

app.post('/:id/activate', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, contract.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.contractStatus !== 'DRAFT') {
    return c.json({ success: false, error: '只有草稿狀態的合約可以啟用' }, 400);
  }

  const [updatedContract] = await db
    .update(contracts)
    .set({ contractStatus: 'ACTIVE', dateUpdated: new Date() })
    .where(eq(contracts.id, id))
    .returning();

  await db.update(members).set({
    memberStatus: 'ACTIVE',
    dateUpdated: new Date(),
  }).where(eq(members.id, contract.memberId));

  return c.json({ success: true, data: updatedContract });
});

app.post('/:id/pause', zValidator('json', pauseContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, contract.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.contractStatus !== 'ACTIVE') {
    return c.json({ success: false, error: '只有有效狀態的合約可以暫停' }, 400);
  }

  const pauseStart = new Date(data.startDate);
  const pauseEnd = new Date(data.endDate);
  const daysAffected = Math.ceil((pauseEnd.getTime() - pauseStart.getTime()) / (1000 * 60 * 60 * 24));

  let newEndDate = contract.endDate;
  if (contract.endDate) {
    const currentEnd = new Date(contract.endDate);
    currentEnd.setDate(currentEnd.getDate() + daysAffected);
    newEndDate = currentEnd.toISOString().split('T')[0];
  }

  await db.insert(contractLogs).values({
    contractId: id,
    logType: 'PAUSE',
    startDate: data.startDate,
    endDate: data.endDate,
    daysAffected,
    reason: data.reason,
    branchId: contract.branchId,
  });

  const [updatedContract] = await db
    .update(contracts)
    .set({
      contractStatus: 'PAUSED',
      endDate: newEndDate,
      dateUpdated: new Date(),
    })
    .where(eq(contracts.id, id))
    .returning();

  await db.update(members).set({
    memberStatus: 'PAUSED',
    dateUpdated: new Date(),
  }).where(eq(members.id, contract.memberId));

  return c.json({ success: true, data: updatedContract });
});

app.post('/:id/resume', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, contract.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.contractStatus !== 'PAUSED') {
    return c.json({ success: false, error: '只有暫停狀態的合約可以恢復' }, 400);
  }

  await db.insert(contractLogs).values({
    contractId: id,
    logType: 'RESUME',
    branchId: contract.branchId,
  });

  const [updatedContract] = await db
    .update(contracts)
    .set({ contractStatus: 'ACTIVE', dateUpdated: new Date() })
    .where(eq(contracts.id, id))
    .returning();

  await db.update(members).set({
    memberStatus: 'ACTIVE',
    dateUpdated: new Date(),
  }).where(eq(members.id, contract.memberId));

  return c.json({ success: true, data: updatedContract });
});

export default app;
