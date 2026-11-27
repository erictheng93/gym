import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contracts, contractLogs, members, membershipPlans, payments, branches, employees, CONTRACT_STATUS, PAYMENT_METHOD } from '../db/index.js';
import { eq, and, or, desc, asc, sql, inArray, ilike } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { generateExcel, generateCsv, contractsColumns, translateStatus } from '../services/export.js';
import { recalculateContractPayment, toCents } from '../services/contract-payment.js';
import type { DbTransaction } from '../services/contract-payment.js';
import { fileService } from '../services/files.js';

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
  transferredFromContractId: contracts.transferredFromContractId,
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
  digitalSignature: contracts.digitalSignature,
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

type PlanTerm = { planType: string; durationMonths: number | null; classCounts: number | null };

/**
 * End date and class counts of a new contract on this plan, starting startDate.
 * Shared by create and renew so both compute terms identically: TIME_BASED ends
 * durationMonths later; COUNT_BASED gets classCounts and, without an explicit end
 * date, one year of validity.
 */
function computeContractTerm(plan: PlanTerm, startDate: string, requestedEndDate?: string) {
  let endDate = requestedEndDate;
  let remainingCounts: number | null = null;

  if (plan.planType === 'TIME_BASED' && plan.durationMonths) {
    const start = new Date(startDate);
    start.setMonth(start.getMonth() + plan.durationMonths);
    endDate = start.toISOString().slice(0, 10);
  } else if (plan.planType === 'COUNT_BASED' && plan.classCounts) {
    remainingCounts = plan.classCounts;
  }

  // Default endDate to 1 year from start if not provided (for count-based plans)
  if (!endDate) {
    const start = new Date(startDate);
    start.setFullYear(start.getFullYear() + 1);
    endDate = start.toISOString().slice(0, 10);
  }

  return { endDate, remainingCounts };
}

/** Contract number from the tenant's current contract count (same scheme as POST /) */
function formatContractNo(contractCount: number) {
  return `C${new Date().getFullYear()}${String(contractCount + 1).padStart(6, '0')}`;
}

async function nextContractNo(tx: DbTransaction, branchIds: string[]) {
  const [countResult] = await tx
    .select(COUNT_SELECT)
    .from(contracts)
    .where(branchIds.length === 1 ? eq(contracts.branchId, branchIds[0]) : inArray(contracts.branchId, branchIds));
  return formatContractNo(Number(countResult?.count || 0));
}

/** YYYY-MM-DD plus n days, in UTC (date-only strings parse as UTC midnight) */
function addUtcDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (end-exclusive), both YYYY-MM-DD, in UTC */
function utcDaysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / (1000 * 60 * 60 * 24));
}

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

  // Short-lived link to the signature PNG; null when unsigned or R2 is not configured
  const signatureUrl = contract.contract.digitalSignature
    ? await fileService.getSignedUrl(contract.contract.digitalSignature, 600, tenantId)
    : null;

  return c.json({
    success: true,
    data: {
      ...contract,
      signatureUrl,
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

  const contractNo = formatContractNo(Number(countResult?.count || 0));
  const { endDate, remainingCounts } = computeContractTerm(plan, data.startDate, data.endDate);

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

  // PRD FR-CON-004 / product decision 5: a contract takes effect only once the member has signed
  if (!contract.digitalSignature) {
    return c.json({ success: false, error: '請先完成會員簽名再啟用合約' }, 400);
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

// Product decision 4 (early resume): pausing extends endDate by the PLANNED pause
// length; resuming trims that back to the days actually paused, so
//   endDate = endDate before the pause + actual paused days.
// Derived from the latest PAUSE log (its startDate and planned daysAffected), so
// any EXTEND made during the pause is kept and repeated pauses accumulate:
//   newEnd = currentEnd - planned + actual,  actual = clamp(today - pauseStart, 0, planned)
// Days are end-exclusive UTC days, as in POST /:id/pause. Resuming on/after the
// planned end gives the full planned extension. Pause logs without dates (legacy)
// leave endDate as it is.
const PAUSE_LOG_SELECT = {
  startDate: contractLogs.startDate,
  endDate: contractLogs.endDate,
  daysAffected: contractLogs.daysAffected,
};

app.post('/:id/resume', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);
  const today = new Date().toISOString().slice(0, 10);

  // One transaction behind the row lock: a concurrent second resume waits, then
  // finds the contract ACTIVE and writes nothing.
  const outcome = await db.transaction(async (tx) => {
    const contract = await lockContract(tx, id, tenantId, branchIds);
    if (!contract) {
      return { ok: false, status: 404, error: '合約不存在' } satisfies TxFailure;
    }
    if (contract.status !== 'PAUSED') {
      return { ok: false, status: 400, error: '只有暫停狀態的合約可以恢復' } satisfies TxFailure;
    }

    const [pauseLog] = await tx
      .select(PAUSE_LOG_SELECT)
      .from(contractLogs)
      .where(and(eq(contractLogs.contractId, id), eq(contractLogs.logType, 'PAUSE')))
      .orderBy(desc(contractLogs.dateCreated))
      .limit(1);

    let newEndDate = contract.endDate;
    let actualDays = 0;
    let reason = '恢復合約';
    if (pauseLog?.startDate && pauseLog.endDate) {
      const plannedDays = pauseLog.daysAffected ?? utcDaysBetween(pauseLog.startDate, pauseLog.endDate);
      actualDays = Math.min(Math.max(utcDaysBetween(pauseLog.startDate, today), 0), plannedDays);
      newEndDate = addUtcDays(contract.endDate, actualDays - plannedDays);
      reason = actualDays < plannedDays
        ? `提前恢復：實際暫停 ${actualDays} 天（原預計 ${plannedDays} 天），到期日 ${contract.endDate} → ${newEndDate}`
        : `恢復合約：暫停 ${actualDays} 天`;
    }

    const [updated] = await tx
      .update(contracts)
      .set({ status: 'ACTIVE', endDate: newEndDate, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING);

    await tx.insert(contractLogs).values({
      contractId: id,
      logType: 'RESUME',
      startDate: today,
      endDate: today,
      daysAffected: actualDays,
      reason,
      createdByEmployee: c.get('user')?.employeeId ?? null,
      branchId: contract.branchId,
      tenantId,
    });

    await tx
      .update(members)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(members.id, contract.memberId));

    return { ok: true as const, contract: updated! };
  });

  if (!outcome.ok) {
    return c.json({ success: false, error: outcome.error }, outcome.status);
  }

  return c.json({ success: true, data: outcome.contract });
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
  contractNo: contracts.contractNo,
  branchId: contracts.branchId,
  memberId: contracts.memberId,
  planId: contracts.planId,
  salesPersonId: contracts.salesPersonId,
  status: contracts.status,
  endDate: contracts.endDate,
  remainingCounts: contracts.remainingCounts,
  digitalSignature: contracts.digitalSignature,
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

type TxFailure = { ok: false; status: 400 | 404 | 409; error: string };

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

// -----------------------------------------------------------------------------
// POST /api/contracts/:id/transfer - Transfer an ACTIVE contract to another member
// -----------------------------------------------------------------------------
// Product decision 2 / PRD FR-CON-003 (轉讓: end_date 不變). Manager and above.
// In ONE transaction, contract row locked first (same lock order as cancel):
//   1. ACTIVE only, plan.allowTransfer, not past its end date;
//   2. recipient in this tenant, not the same member, not BANNED / SUSPENDED;
//   3. original -> TRANSFERRED;
//   4. recipient gets a new ACTIVE contract: same plan and branch, starts today,
//      same end date, remaining classes carried over, total 0,
//      transferred_from_contract_id = original;
//   5. a TRANSFER log on both contracts (original/target member ids);
//   6. the optional fee is a COMPLETED INCOME payment on the NEW contract, then
//      recalculateContractPayment (the new contract owes 0, so it reads PAID);
//   7. the recipient member becomes ACTIVE (as on activation). The original
//      member's status is left alone, as on cancel (they may hold other contracts).
// Any failure rolls all of it back.

const MANAGER_ROLES = ['super_admin', 'admin', 'manager'] as const;
const INELIGIBLE_RECIPIENT_STATUSES: ReadonlyArray<string> = ['BANNED', 'SUSPENDED'];

const transferContractSchema = z.object({
  toMemberId: z.string().uuid(),
  fee: z.coerce.number().positive().max(99_999_999.99).optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHOD).optional(),
  reason: z.string().trim().max(200).optional(),
}).refine((d) => !d.fee || !!d.paymentMethod, {
  message: '請選擇手續費付款方式',
  path: ['paymentMethod'],
});

const TRANSFER_PLAN_SELECT = {
  id: membershipPlans.id,
  allowTransfer: membershipPlans.allowTransfer,
};

const TRANSFER_MEMBER_SELECT = {
  id: members.id,
  status: members.status,
};

app.post('/:id/transfer', requireRole(...MANAGER_ROLES), zValidator('json', transferContractSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const employeeId = c.get('user')?.employeeId ?? null;
  const data = c.req.valid('json');

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);
  const today = new Date().toISOString().slice(0, 10);

  const outcome = await db.transaction(async (tx) => {
    const original = await lockContract(tx, id, tenantId, branchIds);
    if (!original) {
      return { ok: false, status: 404, error: '合約不存在' } satisfies TxFailure;
    }
    if (original.status !== 'ACTIVE') {
      return { ok: false, status: 400, error: '只有有效狀態的合約可以轉讓' } satisfies TxFailure;
    }
    if (original.endDate < today) {
      return { ok: false, status: 400, error: '合約已過到期日，無法轉讓' } satisfies TxFailure;
    }

    const [[plan], [recipient]] = await Promise.all([
      tx
        .select(TRANSFER_PLAN_SELECT)
        .from(membershipPlans)
        .where(and(eq(membershipPlans.id, original.planId), eq(membershipPlans.tenantId, tenantId)))
        .limit(1),
      tx
        .select(TRANSFER_MEMBER_SELECT)
        .from(members)
        .where(and(eq(members.id, data.toMemberId), eq(members.tenantId, tenantId)))
        .limit(1),
    ]);

    if (!plan?.allowTransfer) {
      return { ok: false, status: 400, error: '此方案不允許轉讓' } satisfies TxFailure;
    }
    if (!recipient) {
      return { ok: false, status: 404, error: '受讓會員不存在' } satisfies TxFailure;
    }
    if (recipient.id === original.memberId) {
      return { ok: false, status: 400, error: '不可轉讓給原會員' } satisfies TxFailure;
    }
    if (INELIGIBLE_RECIPIENT_STATUSES.includes(recipient.status)) {
      return { ok: false, status: 400, error: '受讓會員狀態不允許受讓合約' } satisfies TxFailure;
    }

    const reason = data.reason || '合約轉讓';

    const [transferred] = await tx
      .update(contracts)
      .set({ status: 'TRANSFERRED', updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning(CONTRACT_RETURNING);

    const contractNo = await nextContractNo(tx, branchIds);
    const [created] = await tx.insert(contracts).values({
      contractNo,
      memberId: recipient.id,
      planId: original.planId,
      branchId: original.branchId,
      status: 'ACTIVE',
      signDate: today,
      startDate: today,
      endDate: original.endDate,
      originalEndDate: original.endDate,
      remainingCounts: original.remainingCounts,
      totalAmount: '0',
      paymentStatus: 'UNPAID',
      transferredFromContractId: original.id,
      notes: `由合約 ${original.contractNo} 轉讓`,
      createdBy: employeeId,
      tenantId,
    }).returning(CONTRACT_RETURNING);

    const transferLog = {
      logType: 'TRANSFER' as const,
      startDate: today,
      endDate: original.endDate,
      daysAffected: 0,
      reason,
      originalMemberId: original.memberId,
      targetMemberId: recipient.id,
      createdByEmployee: employeeId,
      branchId: original.branchId,
      tenantId,
    };
    await tx.insert(contractLogs).values([
      { ...transferLog, contractId: original.id },
      { ...transferLog, contractId: created!.id },
    ]);

    let fee = null;
    if (data.fee) {
      [fee] = await tx.insert(payments).values({
        contractId: created!.id,
        memberId: recipient.id,
        branchId: original.branchId,
        amount: data.fee.toFixed(2),
        paymentMethod: data.paymentMethod!,
        type: 'INCOME',
        status: 'COMPLETED',
        notes: `合約轉讓手續費（${original.contractNo}）`,
        createdBy: employeeId,
        tenantId,
      }).returning(REFUND_PAYMENT_RETURNING);
    }

    const summary = await recalculateContractPayment(tx, created!.id, tenantId);

    await tx
      .update(members)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(members.id, recipient.id));

    return {
      ok: true as const,
      original: transferred!,
      contract: summary ? { ...created!, paidAmount: summary.paidAmount, paymentStatus: summary.paymentStatus } : created!,
      fee: fee ?? null,
    };
  });

  if (!outcome.ok) {
    return c.json({ success: false, error: outcome.error }, outcome.status);
  }

  return c.json({
    success: true,
    data: { original: outcome.original, contract: outcome.contract, fee: outcome.fee },
  }, 201);
});

// -----------------------------------------------------------------------------
// POST /api/contracts/:id/renew - Create the renewal as a new DRAFT contract
// -----------------------------------------------------------------------------
// Product decision 3: same member and plan at the plan's CURRENT price; starts the
// day after the old end date, or today when the old contract has already ended;
// end date / class counts computed exactly like POST /. Discounts go through the
// normal coupon flow on the draft. The old contract is not changed; the RENEWAL
// log goes on the new contract. Locking the old contract serializes renewals, and
// an existing renewal draft for the same start date is reported (409 + its id)
// instead of creating a second one on a double click.

const RENEWABLE_STATUSES: ReadonlyArray<typeof CONTRACT_STATUS[number]> = ['ACTIVE', 'EXPIRED'];

const RENEW_PLAN_SELECT = {
  ...PLAN_CONTRACT_SELECT,
  price: membershipPlans.price,
  isActive: membershipPlans.isActive,
};

type RenewFailure = TxFailure & { existingId?: string };

app.post('/:id/renew', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const employeeId = c.get('user')?.employeeId ?? null;

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);
  const today = new Date().toISOString().slice(0, 10);

  const outcome = await db.transaction(async (tx) => {
    const old = await lockContract(tx, id, tenantId, branchIds);
    if (!old) {
      return { ok: false, status: 404, error: '合約不存在' } satisfies RenewFailure;
    }
    if (!RENEWABLE_STATUSES.includes(old.status)) {
      return { ok: false, status: 400, error: '只有有效或已到期的合約可以續約' } satisfies RenewFailure;
    }

    const [plan] = await tx
      .select(RENEW_PLAN_SELECT)
      .from(membershipPlans)
      .where(and(eq(membershipPlans.id, old.planId), eq(membershipPlans.tenantId, tenantId)))
      .limit(1);
    if (!plan || !plan.isActive) {
      return { ok: false, status: 400, error: '此方案已停用，請改以新增合約選擇其他方案' } satisfies RenewFailure;
    }

    const expired = old.status === 'EXPIRED' || old.endDate < today;
    const startDate = expired ? today : addUtcDays(old.endDate, 1);

    const [existingDraft] = await tx
      .select(CONTRACT_BRANCH_CHECK_SELECT)
      .from(contracts)
      .where(and(
        eq(contracts.memberId, old.memberId),
        eq(contracts.planId, old.planId),
        eq(contracts.tenantId, tenantId),
        eq(contracts.status, 'DRAFT'),
        eq(contracts.startDate, startDate),
      ))
      .limit(1);
    if (existingDraft) {
      return { ok: false, status: 409, error: '已有相同起始日的續約草稿', existingId: existingDraft.id } satisfies RenewFailure;
    }

    const { endDate, remainingCounts } = computeContractTerm(plan, startDate);
    const contractNo = await nextContractNo(tx, branchIds);

    const [created] = await tx.insert(contracts).values({
      contractNo,
      memberId: old.memberId,
      planId: old.planId,
      branchId: old.branchId,
      salesPersonId: old.salesPersonId,
      signDate: today,
      startDate,
      endDate,
      originalEndDate: endDate,
      status: 'DRAFT',
      remainingCounts,
      totalAmount: plan.price,
      paymentStatus: 'UNPAID',
      notes: `續約自合約 ${old.contractNo}`,
      createdBy: employeeId,
      tenantId,
    }).returning(CONTRACT_RETURNING);

    await tx.insert(contractLogs).values({
      contractId: created!.id,
      logType: 'RENEWAL',
      startDate,
      endDate,
      daysAffected: 0,
      reason: `續約自合約 ${old.contractNo}`,
      originalMemberId: old.memberId,
      createdByEmployee: employeeId,
      branchId: old.branchId,
      tenantId,
    });

    return { ok: true as const, contract: created! };
  });

  if (!outcome.ok) {
    return c.json({
      success: false,
      error: outcome.error,
      ...(outcome.existingId ? { data: { id: outcome.existingId } } : {}),
    }, outcome.status);
  }

  return c.json({ success: true, data: outcome.contract }, 201);
});

// -----------------------------------------------------------------------------
// POST /api/contracts/:id/signature - Store the member's signature
// -----------------------------------------------------------------------------
// Product decision 5 / PRD FR-CON-004: the canvas PNG goes to R2 through the
// shared file service (tenant-scoped key and files row) and
// contracts.digital_signature points at the files row. Activation requires it.
// A DRAFT may be re-signed; an ACTIVE / PAUSED contract may only be signed when it
// has no signature yet (e.g. a transferred one), never overwritten.

const SIGNATURE_MAX_BYTES = 512 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIGNATURE_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

const signatureSchema = z.object({
  // base64 is 4/3 of the bytes; cap the string before decoding it
  image: z.string().max(Math.ceil(SIGNATURE_MAX_BYTES / 3) * 4 + 32),
});

app.post('/:id/signature', zValidator('json', signatureSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const user = c.get('user');
  const { image } = c.req.valid('json');

  if (!UUID_SCHEMA.safeParse(id).success) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const match = SIGNATURE_DATA_URL.exec(image);
  const png = match ? Buffer.from(match[1]!, 'base64') : null;
  if (!png || png.length === 0 || png.length > SIGNATURE_MAX_BYTES || !png.subarray(0, 8).equals(PNG_MAGIC)) {
    return c.json({ success: false, error: '簽名必須是 512KB 以內的 PNG 圖檔' }, 400);
  }

  const branchIds = await getTenantBranchIds(tenantId);

  // Tenant check before uploading anything
  const [existing] = await db
    .select(CONTRACT_BRANCH_CHECK_SELECT)
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .limit(1);
  if (!existing || !branchIds.includes(existing.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const uploaded = await fileService.upload(
    { name: `signature-${id}.png`, type: 'image/png', size: png.length, data: new Uint8Array(png).buffer },
    { folder: 'contract-signatures', tenantId, uploadedBy: user?.id },
  );
  if (!uploaded) {
    return c.json({ success: false, error: '簽名上傳失敗：檔案儲存服務未設定或暫時無法使用' }, 503);
  }

  let outcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const contract = await lockContract(tx, id, tenantId, branchIds);
      if (!contract) {
        return { ok: false, status: 404, error: '合約不存在' } satisfies TxFailure;
      }
      const canSign = contract.status === 'DRAFT'
        || ((contract.status === 'ACTIVE' || contract.status === 'PAUSED') && !contract.digitalSignature);
      if (!canSign) {
        return { ok: false, status: 400, error: '此合約已簽名或狀態不允許簽名' } satisfies TxFailure;
      }

      const [updated] = await tx
        .update(contracts)
        .set({ digitalSignature: uploaded.id, termsAccepted: true, updatedAt: new Date() })
        .where(eq(contracts.id, id))
        .returning(CONTRACT_RETURNING);
      return { ok: true as const, contract: updated! };
    });
  } catch (error) {
    await fileService.delete(uploaded.id, tenantId);
    throw error;
  }

  if (!outcome.ok) {
    // Nothing points at the upload; don't leave it behind
    await fileService.delete(uploaded.id, tenantId);
    return c.json({ success: false, error: outcome.error }, outcome.status);
  }

  return c.json({ success: true, data: outcome.contract });
});

export default app;
