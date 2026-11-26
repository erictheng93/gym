import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contracts, contractLogs, members, membershipPlans, payments, branches, employees, CONTRACT_STATUS, PAYMENT_METHOD } from '../db/index.js';
import { eq, and, or, desc, asc, sql, inArray, ilike } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { generateExcel, generateCsv, contractsColumns, translateStatus } from '../services/export.js';
import { recalculateContractPayment, toCents } from '../services/contract-payment.js';
import type { DbTransaction } from '../services/contract-payment.js';

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
    durationMonths: membershipPlans.durationMonths,
    classCounts: membershipPlans.classCounts,
    allowPause: membershipPlans.allowPause,
    allowTransfer: membershipPlans.allowTransfer,
  },
  branch: {
    id: branches.id,
    name: branches.name,
  },
  salesPerson: {
    id: employees.id,
    fullName: employees.fullName,
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
  originalMemberId: contractLogs.originalMemberId,
  targetMemberId: contractLogs.targetMemberId,
  dateCreated: contractLogs.dateCreated,
  createdByName: employees.fullName,
};

const CONTRACT_PAYMENTS_SELECT = {
  id: payments.id,
  contractId: payments.contractId,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  paymentDate: payments.paymentDate,
  type: payments.type,
  status: payments.status,
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

const UUID_SCHEMA = z.string().uuid();

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

// YYYY-MM-DD strings compare correctly as plain strings
const pauseContractSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().optional(),
}).refine((d) => d.endDate > d.startDate, {
  message: '暫停結束日必須晚於開始日',
  path: ['endDate'],
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;
  const status = c.req.query('status');
  const sortOrder = c.req.query('sortOrder') || 'desc';
  const memberId = c.req.query('memberId');
  const branchId = c.req.query('branchId');
  const search = c.req.query('search')?.trim();

  // Malformed ids would make Postgres throw (uuid cast); reject them up front
  for (const [name, value] of [['memberId', memberId], ['branchId', branchId]] as const) {
    if (value && !UUID_SCHEMA.safeParse(value).success) {
      return c.json({ success: false, error: `${name} 格式錯誤` }, 400);
    }
  }

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit }, pagination: { total: 0, page, limit, totalPages: 0 } });
  }

  const branchCondition = branchIds.length === 1
    ? eq(contracts.branchId, branchIds[0])
    : inArray(contracts.branchId, branchIds);

  // Build where conditions (every filter narrows within the tenant's branches)
  const conditions: SQL[] = [branchCondition];
  if (status) {
    // Case-insensitive status comparison using index-friendly uppercase normalization
    // ponytail: upper+lower covers legacy lowercase rows without lower() defeating the index
    conditions.push(inArray(contracts.status, [status.toUpperCase(), status.toLowerCase()] as typeof CONTRACT_STATUS[number][]));
  }
  if (memberId) conditions.push(eq(contracts.memberId, memberId));
  if (branchId) conditions.push(eq(contracts.branchId, branchId));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(contracts.contractNo, pattern),
      ilike(members.fullName, pattern),
      ilike(members.memberCode, pattern),
    )!);
  }

  // Determine sort order
  const orderFn = sortOrder === 'asc' ? asc(contracts.createdAt) : desc(contracts.createdAt);

  // Concurrently execute count and paginated query (count joins members so `search` applies)
  const [[countResult], result] = await Promise.all([
    db
      .select(COUNT_SELECT)
      .from(contracts)
      .leftJoin(members, eq(contracts.memberId, members.id))
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
    // ponytail: upper+lower covers legacy lowercase rows without lower() defeating the index
    conditions.push(inArray(contracts.status, [status.toUpperCase(), status.toLowerCase()] as typeof CONTRACT_STATUS[number][]));
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
      .leftJoin(branches, eq(contracts.branchId, branches.id))
      .leftJoin(employees, eq(contracts.salesPersonId, employees.id))
      .where(eq(contracts.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_LOGS_SELECT)
      .from(contractLogs)
      .leftJoin(employees, eq(contractLogs.createdByEmployee, employees.id))
      .where(eq(contractLogs.contractId, id))
      .orderBy(desc(contractLogs.dateCreated)),
    db
      .select(CONTRACT_PAYMENTS_SELECT)
      .from(payments)
      .where(eq(payments.contractId, id))
      .orderBy(desc(payments.createdAt)),
  ]);

  if (!contract || !branchIds.includes(contract.contract.branchId!)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
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
      .where(and(eq(members.id, data.memberId), eq(members.tenantId, tenantId)))
      .limit(1),
    db
      .select(PLAN_CONTRACT_SELECT)
      .from(membershipPlans)
      .where(and(eq(membershipPlans.id, data.planId), eq(membershipPlans.tenantId, tenantId)))
      .limit(1),
    db
      .select(COUNT_SELECT)
      .from(contracts)
      .where(branchIds.length === 1 ? eq(contracts.branchId, branchIds[0]) : inArray(contracts.branchId, branchIds)),
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

  if (!contract || !contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
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

  if (!contract || !contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
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

  if (!contract || !contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (contract.status !== 'ACTIVE') {
    return c.json({ success: false, error: '只有有效狀態的合約可以暫停' }, 400);
  }

  // Date-only strings parse as UTC midnight; stay in UTC so the server TZ can't shift days.
  // The schema guarantees endDate > startDate, so daysAffected >= 1.
  const daysAffected = Math.round(
    (Date.parse(data.endDate) - Date.parse(data.startDate)) / (1000 * 60 * 60 * 24)
  );

  let newEndDate = contract.endDate;
  if (contract.endDate) {
    const currentEnd = new Date(contract.endDate);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + daysAffected);
    newEndDate = currentEnd.toISOString().slice(0, 10);
  }

  // One transaction, and only an ACTIVE contract moves: a concurrent second pause
  // finds no row and can't extend endDate twice or leave an orphan log.
  const updatedContract = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contracts)
      .set({
        status: 'PAUSED',
        endDate: newEndDate,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.id, id), eq(contracts.status, 'ACTIVE')))
      .returning(CONTRACT_RETURNING);

    if (!updated) return null;

    await tx.insert(contractLogs).values({
      contractId: id,
      logType: 'PAUSE',
      startDate: data.startDate,
      endDate: data.endDate,
      daysAffected,
      reason: data.reason,
      createdByEmployee: c.get('user')?.employeeId ?? null,
      branchId: contract.branchId,
      tenantId,
    });

    return updated;
  });

  if (!updatedContract) {
    return c.json({ success: false, error: '合約狀態已變更，請重新整理後再試' }, 409);
  }

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

  if (!contract || !contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  if (contract.status !== 'PAUSED') {
    return c.json({ success: false, error: '只有暫停狀態的合約可以恢復' }, 400);
  }

  const todayDateStr = new Date().toISOString().slice(0, 10);

  // One transaction, and only a PAUSED contract moves: a concurrent second resume
  // finds no row and cannot write a second RESUME log.
  const updatedContract = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contracts)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.status, 'PAUSED')))
      .returning(CONTRACT_RETURNING);

    if (!updated) return null;

    await tx.insert(contractLogs).values({
      contractId: id,
      logType: 'RESUME',
      startDate: todayDateStr,
      endDate: todayDateStr,
      daysAffected: 0,
      createdByEmployee: c.get('user')?.employeeId ?? null,
      branchId: contract.branchId,
      tenantId,
    });

    await tx
      .update(members)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(members.id, contract.memberId));

    return updated;
  });

  if (!updatedContract) {
    return c.json({ success: false, error: '合約狀態已變更，請重新整理後再試' }, 409);
  }

  return c.json({ success: true, data: updatedContract });
});

// -----------------------------------------------------------------------------
// POST /api/contracts/:id/cancel - Terminate a contract, optionally refunding money
// -----------------------------------------------------------------------------
// DRAFT / ACTIVE / PAUSED -> CANCELLED. In ONE transaction:
//   1. lock the contract row (SELECT ... FOR UPDATE) BEFORE inserting the refund -
//      the same lock order as POST /api/payments. The payment insert's FK check
//      takes FOR KEY SHARE on the contract; locking only afterwards can deadlock;
//   2. validate the state, and that the refund does not exceed the money still held
//      (COMPLETED INCOME minus COMPLETED REFUND);
//   3. set status CANCELLED and write the CANCEL contract log;
//   4. if a refund is given, insert it exactly like POST /api/payments does for
//      paymentType REFUND: `amount` is POSITIVE, `type` = 'REFUND',
//      `status` = 'COMPLETED' (the money has been paid back);
//   5. recalculateContractPayment. It sums COMPLETED INCOME only, so a refund does
//      not lower paidAmount; refunds are reported separately (/payments/summary).
// Any failure rolls everything back: no refund without the cancellation, and no
// cancellation log without the status change. The member's own status is not
// touched (they may hold other contracts).

const CANCELLABLE_STATUSES: ReadonlyArray<typeof CONTRACT_STATUS[number]> = ['DRAFT', 'ACTIVE', 'PAUSED'];

const cancelContractSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  refund: z.object({
    amount: z.coerce.number().positive().max(99_999_999.99),
    paymentMethod: z.enum(PAYMENT_METHOD),
  }).optional().nullable(),
});

const CONTRACT_LOCK_SELECT = {
  id: contracts.id,
  branchId: contracts.branchId,
  memberId: contracts.memberId,
  status: contracts.status,
  endDate: contracts.endDate,
};

const PAYMENT_TYPE_TOTALS_SELECT = {
  income: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'INCOME' THEN ${payments.amount} ELSE 0 END), 0)`,
  refund: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'REFUND' THEN ${payments.amount} ELSE 0 END), 0)`,
};

const REFUND_PAYMENT_RETURNING = {
  id: payments.id,
  contractId: payments.contractId,
  memberId: payments.memberId,
  branchId: payments.branchId,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  paymentDate: payments.paymentDate,
  type: payments.type,
  status: payments.status,
  notes: payments.notes,
  createdAt: payments.createdAt,
};

type TxFailure = { ok: false; status: 400 | 404; error: string };

/** Locks a tenant's contract row FOR UPDATE; null when it is not this tenant's */
async function lockContract(tx: DbTransaction, id: string, tenantId: string, branchIds: string[]) {
  const [contract] = await tx
    .select(CONTRACT_LOCK_SELECT)
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .limit(1)
    .for('update');
  return contract && branchIds.includes(contract.branchId) ? contract : null;
}

app.post('/:id/cancel', zValidator('json', cancelContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const employeeId = c.get('user')?.employeeId ?? null;
  const data = c.req.valid('json');

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);
  const reason = data.reason || '合約終止';
  const today = new Date().toISOString().slice(0, 10);

  const outcome = await db.transaction(async (tx) => {
    const contract = await lockContract(tx, id, tenantId, branchIds);
    if (!contract) {
      return { ok: false, status: 404, error: '合約不存在' } satisfies TxFailure;
    }

    if (!CANCELLABLE_STATUSES.includes(contract.status)) {
      return { ok: false, status: 400, error: '只有草稿、有效或暫停中的合約可以終止' } satisfies TxFailure;
    }

    if (data.refund) {
      const [totals] = await tx
        .select(PAYMENT_TYPE_TOTALS_SELECT)
        .from(payments)
        .where(and(
          eq(payments.contractId, id),
          eq(payments.tenantId, tenantId),
          eq(payments.status, 'COMPLETED'),
        ));
      const refundableCents = toCents(totals?.income) - toCents(totals?.refund);
      if (toCents(data.refund.amount) > refundableCents) {
        const refundable = (Math.max(refundableCents, 0) / 100).toFixed(2);
        return { ok: false, status: 400, error: `退款金額不可超過已收金額（可退 NT$ ${refundable}）` } satisfies TxFailure;
      }
    }

    const [updated] = await tx
      .update(contracts)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING);

    await tx.insert(contractLogs).values({
      contractId: id,
      logType: 'CANCEL',
      startDate: today,
      endDate: today,
      daysAffected: 0,
      reason,
      createdByEmployee: employeeId,
      branchId: contract.branchId,
      tenantId,
    });

    let refund = null;
    if (data.refund) {
      [refund] = await tx.insert(payments).values({
        contractId: id,
        memberId: contract.memberId,
        branchId: contract.branchId,
        amount: data.refund.amount.toFixed(2),
        paymentMethod: data.refund.paymentMethod,
        type: 'REFUND',
        status: 'COMPLETED',
        notes: `合約終止退款：${reason}`.slice(0, 255),
        createdBy: employeeId,
        tenantId,
      }).returning(REFUND_PAYMENT_RETURNING);

      await recalculateContractPayment(tx, id, tenantId);
    }

    return { ok: true as const, contract: updated!, refund: refund ?? null };
  });

  if (!outcome.ok) {
    return c.json({ success: false, error: outcome.error }, outcome.status);
  }

  return c.json({ success: true, data: { contract: outcome.contract, refund: outcome.refund } });
});

// -----------------------------------------------------------------------------
// POST /api/contracts/:id/extend - Manually extend the end date by N days
// -----------------------------------------------------------------------------
// PRD FR-CON-003: 延期 (Extension) = 手動展延, end_date += 指定天數. ACTIVE or
// PAUSED only; originalEndDate is kept. The EXTEND log records old -> new end date.

const EXTENDABLE_STATUSES: ReadonlyArray<typeof CONTRACT_STATUS[number]> = ['ACTIVE', 'PAUSED'];

const extendContractSchema = z.object({
  days: z.number().int().min(1).max(3650),
  reason: z.string().trim().max(200).optional(),
});

app.post('/:id/extend', zValidator('json', extendContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);

  const outcome = await db.transaction(async (tx) => {
    const contract = await lockContract(tx, id, tenantId, branchIds);
    if (!contract) {
      return { ok: false, status: 404, error: '合約不存在' } satisfies TxFailure;
    }
    if (!EXTENDABLE_STATUSES.includes(contract.status)) {
      return { ok: false, status: 400, error: '只有有效或暫停中的合約可以延期' } satisfies TxFailure;
    }

    // Date-only strings parse as UTC midnight; stay in UTC so the server TZ can't shift days.
    const newEnd = new Date(`${contract.endDate}T00:00:00Z`);
    newEnd.setUTCDate(newEnd.getUTCDate() + data.days);
    const newEndDate = newEnd.toISOString().slice(0, 10);

    const [updated] = await tx
      .update(contracts)
      .set({ endDate: newEndDate, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING);

    await tx.insert(contractLogs).values({
      contractId: id,
      logType: 'EXTEND',
      startDate: contract.endDate,
      endDate: newEndDate,
      daysAffected: data.days,
      reason: data.reason || `延期 ${data.days} 天`,
      createdByEmployee: c.get('user')?.employeeId ?? null,
      branchId: contract.branchId,
      tenantId,
    });

    return { ok: true as const, contract: updated! };
  });

  if (!outcome.ok) {
    return c.json({ success: false, error: outcome.error }, outcome.status);
  }

  return c.json({ success: true, data: outcome.contract });
});

export default app;
