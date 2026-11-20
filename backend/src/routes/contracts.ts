import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contracts, contractLogs, members, membershipPlans, payments, CONTRACT_STATUS } from '../db/index.js';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { generateExcel, generateCsv, contractsColumns, translateStatus } from '../services/export.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const CONTRACT_RETURNING = {
  id: contracts.id,
  contractNo: contracts.contractNo,
  memberId: contracts.memberId,
  planId: contracts.planId,
  branchId: contracts.branchId,
  salesPersonId: contracts.salesPersonId,
  status: contracts.status,
  signDate: contracts.signDate,
  startDate: contracts.startDate,
  originalEndDate: contracts.originalEndDate,
  endDate: contracts.endDate,
  remainingCounts: contracts.remainingCounts,
  totalAmount: contracts.totalAmount,
  paidAmount: contracts.paidAmount,
  paymentStatus: contracts.paymentStatus,
  digitalSignature: contracts.digitalSignature,
  contractPdf: contracts.contractPdf,
  termsAccepted: contracts.termsAccepted,
  notes: contracts.notes,
  createdBy: contracts.createdBy,
  createdAt: contracts.createdAt,
  updatedAt: contracts.updatedAt,
  tenantId: contracts.tenantId,
};

const CONTRACT_SELECT = CONTRACT_RETURNING;

const COUNT_SELECT = {
  count: sql<number>`count(*)`,
};

const CONTRACT_LIST_JOIN_SELECT = {
  contract: CONTRACT_SELECT,
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
};

const CONTRACT_EXPORT_JOIN_SELECT = {
  contract: CONTRACT_SELECT,
  member: {
    id: members.id,
    fullName: members.fullName,
    memberCode: members.memberCode,
  },
  plan: {
    id: membershipPlans.id,
    name: membershipPlans.name,
  },
};

const CONTRACT_DETAIL_JOIN_SELECT = {
  contract: CONTRACT_SELECT,
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
};

const CONTRACT_LOGS_SELECT = {
  id: contractLogs.id,
  contractId: contractLogs.contractId,
  logType: contractLogs.logType,
  startDate: contractLogs.startDate,
  endDate: contractLogs.endDate,
  daysAffected: contractLogs.daysAffected,
  reason: contractLogs.reason,
  dateCreated: contractLogs.dateCreated,
};

const CONTRACT_PAYMENTS_SELECT = {
  id: payments.id,
  contractId: payments.contractId,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  paymentDate: payments.paymentDate,
  type: payments.type,
  receiptNo: payments.receiptNo,
  createdAt: payments.createdAt,
};

const MEMBER_ID_SELECT = {
  id: members.id,
};

const PLAN_CONTRACT_SELECT = {
  id: membershipPlans.id,
  planType: membershipPlans.planType,
  durationMonths: membershipPlans.durationMonths,
  classCounts: membershipPlans.classCounts,
};

const CONTRACT_BRANCH_CHECK_SELECT = {
  id: contracts.id,
  branchId: contracts.branchId,
};

const CONTRACT_STATUS_CHECK_SELECT = {
  id: contracts.id,
  branchId: contracts.branchId,
  status: contracts.status,
  memberId: contracts.memberId,
};

const CONTRACT_PAUSE_CHECK_SELECT = {
  id: contracts.id,
  branchId: contracts.branchId,
  status: contracts.status,
  endDate: contracts.endDate,
};

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
  const status = c.req.query('status');
  const sortOrder = c.req.query('sortOrder') || 'desc';

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit }, pagination: { total: 0, page, limit, totalPages: 0 } });
  }

  const branchCondition = branchIds.length === 1
    ? eq(contracts.branchId, branchIds[0])
    : inArray(contracts.branchId, branchIds);

  // Build where conditions
  const conditions = [branchCondition];
  if (status) {
    // Case-insensitive status comparison using index-friendly uppercase normalization
    conditions.push(eq(contracts.status, status.toUpperCase() as typeof CONTRACT_STATUS[number]));
  }

  // Determine sort order
  const orderFn = sortOrder === 'asc' ? asc(contracts.createdAt) : desc(contracts.createdAt);

  // Concurrently execute count and paginated query
  const [[countResult], result] = await Promise.all([
    db
      .select(COUNT_SELECT)
      .from(contracts)
      .where(and(...conditions)),
    db
      .select(CONTRACT_LIST_JOIN_SELECT)
      .from(contracts)
      .leftJoin(members, eq(contracts.memberId, members.id))
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(and(...conditions))
      .orderBy(orderFn)
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

// -----------------------------------------------------------------------------
// GET /api/contracts/export - Export Contracts List
// -----------------------------------------------------------------------------

app.get('/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { status, format = 'csv' } = c.req.query();

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    const result = generateCsv(contractsColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="contracts.csv"`,
      },
    });
  }

  const branchCondition = branchIds.length === 1
    ? eq(contracts.branchId, branchIds[0])
    : inArray(contracts.branchId, branchIds);

  const conditions = [branchCondition];
  if (status) {
    // Case-insensitive status comparison using index-friendly uppercase normalization
    conditions.push(eq(contracts.status, status.toUpperCase() as typeof CONTRACT_STATUS[number]));
  }

  const result = await db
    .select(CONTRACT_EXPORT_JOIN_SELECT)
    .from(contracts)
    .leftJoin(members, eq(contracts.memberId, members.id))
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(and(...conditions))
    .orderBy(desc(contracts.createdAt));

  const exportData = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i]!;
    exportData[i] = {
      contractNo: r.contract.contractNo || '',
      memberName: r.member?.fullName || '',
      memberCode: r.member?.memberCode || '',
      planName: r.plan?.name || '',
      status: translateStatus(r.contract.status),
      startDate: r.contract.startDate || '',
      endDate: r.contract.endDate || '',
      totalAmount: parseFloat(r.contract.totalAmount || '0'),
      paymentStatus: translateStatus(r.contract.paymentStatus),
    };
  }

  const filename = `合約列表_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'xlsx' || format === 'excel') {
    const exportResult = await generateExcel(contractsColumns, exportData, '合約列表');
    if (!exportResult.success || !exportResult.buffer) {
      return c.json({ success: false, error: exportResult.error || '匯出失敗' }, 500);
    }
    return new Response(exportResult.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const csvResult = generateCsv(contractsColumns, exportData);
  if (!csvResult.success || !csvResult.buffer) {
    return c.json({ success: false, error: csvResult.error || '匯出失敗' }, 500);
  }
  return new Response(csvResult.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[contract], branchIds, logs, contractPayments] = await Promise.all([
    db
      .select(CONTRACT_DETAIL_JOIN_SELECT)
      .from(contracts)
      .leftJoin(members, eq(contracts.memberId, members.id))
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(eq(contracts.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_LOGS_SELECT)
      .from(contractLogs)
      .where(eq(contractLogs.contractId, id))
      .orderBy(desc(contractLogs.dateCreated)),
    db
      .select(CONTRACT_PAYMENTS_SELECT)
      .from(payments)
      .where(eq(payments.contractId, id))
      .orderBy(desc(payments.createdAt)),
  ]);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (!branchIds.includes(contract.contract.branchId!)) {
    return c.json({ success: false, error: '無權限存取此合約' }, 403);
  }

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
  // User context available for future audit logging: c.get('user')
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [[member], [plan], [countResult]] = await Promise.all([
    db
      .select(MEMBER_ID_SELECT)
      .from(members)
      .where(eq(members.id, data.memberId))
      .limit(1),
    db
      .select(PLAN_CONTRACT_SELECT)
      .from(membershipPlans)
      .where(eq(membershipPlans.id, data.planId))
      .limit(1),
    db
      .select(COUNT_SELECT)
      .from(contracts)
      .where(inArray(contracts.branchId, branchIds)),
  ]);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  if (!plan) {
    return c.json({ success: false, error: '會籍方案不存在' }, 404);
  }

  const contractCount = Number(countResult?.count || 0);
  const contractNo = `C${new Date().getFullYear()}${String(contractCount + 1).padStart(6, '0')}`;

  let endDate = data.endDate;
  let remainingCounts = null;

  if (plan.planType === 'TIME_BASED' && plan.durationMonths) {
    const start = new Date(data.startDate);
    start.setMonth(start.getMonth() + plan.durationMonths);
    endDate = start.toISOString().slice(0, 10);
  } else if (plan.planType === 'COUNT_BASED' && plan.classCounts) {
    remainingCounts = plan.classCounts;
  }

  // Default endDate to 1 year from start if not provided (for count-based plans)
  if (!endDate) {
    const start = new Date(data.startDate);
    start.setFullYear(start.getFullYear() + 1);
    endDate = start.toISOString().slice(0, 10);
  }

  const [newContract] = await db.insert(contracts).values({
    contractNo,
    memberId: data.memberId,
    planId: data.planId,
    signDate: new Date().toISOString().slice(0, 10),
    startDate: data.startDate,
    endDate,
    originalEndDate: endDate,
    status: 'DRAFT',
    remainingCounts,
    totalAmount: String(data.totalAmount),
    paymentStatus: 'UNPAID',
    salesPersonId: data.salesPersonId,
    branchId: data.branchId,
    notes: data.notes,
    tenantId,
  }).returning(CONTRACT_RETURNING);

  return c.json({ success: true, data: newContract }, 201);
});

const updateContractSchema = z.object({
  notes: z.string().optional().nullable(),
  salesPersonId: z.string().uuid().optional().nullable(),
});

app.patch('/:id', zValidator('json', updateContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [branchIds, [contract]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_BRANCH_CHECK_SELECT)
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1),
  ]);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (!contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  const [updatedContract] = await db
    .update(contracts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, id))
    .returning(CONTRACT_RETURNING);

  return c.json({ success: true, data: updatedContract });
});

app.post('/:id/activate', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [branchIds, [contract]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_STATUS_CHECK_SELECT)
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1),
  ]);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (!contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.status !== 'DRAFT') {
    return c.json({ success: false, error: '只有草稿狀態的合約可以啟用' }, 400);
  }

  const [[updatedContract]] = await Promise.all([
    db
      .update(contracts)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING),
    db
      .update(members)
      .set({
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(members.id, contract.memberId)),
  ]);

  return c.json({ success: true, data: updatedContract });
});

app.post('/:id/pause', zValidator('json', pauseContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  // User context available for future audit logging: c.get('user')
  const data = c.req.valid('json');

  const [branchIds, [contract]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_PAUSE_CHECK_SELECT)
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1),
  ]);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (!contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.status !== 'ACTIVE') {
    return c.json({ success: false, error: '只有有效狀態的合約可以暫停' }, 400);
  }

  const pauseStart = new Date(data.startDate);
  const pauseEnd = new Date(data.endDate);
  const daysAffected = Math.ceil((pauseEnd.getTime() - pauseStart.getTime()) / (1000 * 60 * 60 * 24));

  let newEndDate = contract.endDate;
  if (contract.endDate) {
    const currentEnd = new Date(contract.endDate);
    currentEnd.setDate(currentEnd.getDate() + daysAffected);
    newEndDate = currentEnd.toISOString().slice(0, 10);
  }

  const [, [updatedContract]] = await Promise.all([
    db.insert(contractLogs).values({
      contractId: id,
      logType: 'PAUSE',
      startDate: data.startDate,
      endDate: data.endDate,
      daysAffected: daysAffected,
      reason: data.reason,
      tenantId: tenantId,
    }),
    db
      .update(contracts)
      .set({
        status: 'PAUSED',
        endDate: newEndDate,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING),
  ]);

  // Member status stays ACTIVE - the contract is paused, not the member
  // They can still have other active contracts

  return c.json({ success: true, data: updatedContract });
});

app.post('/:id/resume', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [branchIds, [contract]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_STATUS_CHECK_SELECT)
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1),
  ]);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (!contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '無權限操作此合約' }, 403);
  }

  if (contract.status !== 'PAUSED') {
    return c.json({ success: false, error: '只有暫停狀態的合約可以恢復' }, 400);
  }

  const todayDateStr = new Date().toISOString().slice(0, 10);

  const [, [updatedContract]] = await Promise.all([
    db.insert(contractLogs).values({
      contractId: id,
      logType: 'RESUME',
      startDate: todayDateStr,
      endDate: todayDateStr,
      daysAffected: 0,
      tenantId: tenantId,
    }),
    db
      .update(contracts)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING),
    db.update(members).set({
      status: 'ACTIVE',
      updatedAt: new Date(),
    }).where(eq(members.id, contract.memberId)),
  ]);

  return c.json({ success: true, data: updatedContract });
});

export default app;
