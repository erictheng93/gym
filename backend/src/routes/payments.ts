import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, payments, contracts, members } from '../db/index.js';
import { eq, and, or, ilike, sql, desc, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { recalculateContractPayment } from '../services/contract-payment.js';
import { generateExcel, generateCsv, paymentsColumns, translatePaymentMethod, translatePaymentType } from '../services/export.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const PAYMENT_RETURNING = {
  id: payments.id,
  contractId: payments.contractId,
  memberId: payments.memberId,
  branchId: payments.branchId,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  paymentDate: payments.paymentDate,
  type: payments.type,
  status: payments.status,
  receiptNo: payments.receiptNo,
  notes: payments.notes,
  createdBy: payments.createdBy,
  createdAt: payments.createdAt,
  tenantId: payments.tenantId,
};

const PAYMENT_SELECT = PAYMENT_RETURNING;

const COUNT_SELECT = { count: sql<number>`count(*)` };

const MEMBER_ID_SELECT = { id: members.id };

const CONTRACT_TOTAL_AMOUNT_SELECT = {
  id: contracts.id,
  totalAmount: contracts.totalAmount,
};

const PAYMENT_LIST_JOIN_SELECT = {
  payment: PAYMENT_SELECT,
  member: {
    id: members.id,
    fullName: members.fullName,
    memberCode: members.memberCode,
  },
  contract: {
    id: contracts.id,
    contractNo: contracts.contractNo,
  },
};

const PAYMENT_SUMMARY_SELECT = {
  totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'INCOME' THEN ${payments.amount} ELSE 0 END), 0)`,
  totalRefund: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'REFUND' THEN ${payments.amount} ELSE 0 END), 0)`,
  count: sql<number>`count(*)`,
};

const PAYMENT_EXPORT_SELECT = {
  payment: {
    receiptNo: payments.receiptNo,
    amount: payments.amount,
    paymentMethod: payments.paymentMethod,
    paymentDate: payments.paymentDate,
    type: payments.type,
  },
  member: {
    fullName: members.fullName,
    memberCode: members.memberCode,
  },
};

const PAYMENT_DETAIL_SELECT = {
  payment: PAYMENT_SELECT,
  member: {
    id: members.id,
    fullName: members.fullName,
    memberCode: members.memberCode,
    phone: members.phone,
    email: members.email,
  },
  contract: {
    id: contracts.id,
    contractNo: contracts.contractNo,
    status: contracts.status,
    startDate: contracts.startDate,
    endDate: contracts.endDate,
    totalAmount: contracts.totalAmount,
    remainingCounts: contracts.remainingCounts,
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string) => ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
const PAYMENT_TYPES = ['INCOME', 'REFUND'] as const;
const PAYMENT_RECORD_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;

/**
 * paymentDate filter for YYYY-MM-DD bounds. Both ends are inclusive calendar days:
 * paymentDate is a timestamp, so `<= endDate` alone would drop everything after
 * midnight on the end day (a "today" range would always be empty).
 * Returns null when a bound is not a YYYY-MM-DD date.
 */
function paymentDateRange(startDate?: string, endDate?: string): SQL[] | null {
  const conditions: SQL[] = [];
  if (startDate) {
    if (!isIsoDate(startDate)) return null;
    conditions.push(sql`${payments.paymentDate} >= ${startDate}::date`);
  }
  if (endDate) {
    if (!isIsoDate(endDate)) return null;
    conditions.push(sql`${payments.paymentDate} < ${endDate}::date + 1`);
  }
  return conditions;
}

/**
 * A back-dated payment is stored at noon Taiwan time (04:00 UTC), which falls on
 * the same calendar day in UTC and in Asia/Taipei, so day filters agree either way.
 * No date means now; a noon that has not come yet (recording today) is capped at now.
 */
function paymentTimestamp(paymentDate?: string | null): Date {
  const now = new Date();
  if (!paymentDate) return now;
  const stored = new Date(`${paymentDate}T12:00:00+08:00`);
  return stored > now ? now : stored;
}

const INVALID_DATE_ERROR = '日期格式必須為 YYYY-MM-DD';

app.use('*', requireAuth);
app.use('*', requireTenant);

const createPaymentSchema = z.object({
  contractId: z.string().uuid().optional().nullable(),
  memberId: z.string().uuid(),
  amount: z.coerce.number().min(0),
  paymentMethod: z.enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'LINE_PAY', 'OTHER']),
  paymentType: z.enum(['INCOME', 'REFUND']).default('INCOME'),
  branchId: z.string().uuid(),
  // Day the money was received (YYYY-MM-DD); defaults to now. Not in the future
  // (a day counts as started once it has begun in the earliest timezone, UTC+14).
  paymentDate: z.iso.date().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((d) => !d.paymentDate || new Date(`${d.paymentDate}T00:00:00+14:00`) <= new Date(), {
  message: '付款日期不能是未來日期',
  path: ['paymentDate'],
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const memberId = c.req.query('memberId');
  const contractId = c.req.query('contractId');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const search = c.req.query('search')?.trim();
  const dateRange = paymentDateRange(c.req.query('startDate'), c.req.query('endDate'));
  if (!dateRange) {
    return c.json({ success: false, error: INVALID_DATE_ERROR }, 400);
  }
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
  }

  let conditions: SQL[] = [];

  if (branchId) {
    if (!branchIds.includes(branchId.toLowerCase())) {
      return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
    }
    conditions.push(eq(payments.branchId, branchId));
  } else {
    conditions.push(
      branchIds.length === 1 ? eq(payments.branchId, branchIds[0]) : inArray(payments.branchId, branchIds)
    );
  }

  if (memberId) {
    conditions.push(eq(payments.memberId, memberId));
  }

  if (contractId) {
    conditions.push(eq(payments.contractId, contractId));
  }

  if (type && (PAYMENT_TYPES as readonly string[]).includes(type)) {
    conditions.push(eq(payments.type, type as typeof PAYMENT_TYPES[number]));
  }

  if (status && (PAYMENT_RECORD_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(payments.status, status as typeof PAYMENT_RECORD_STATUSES[number]));
  }

  conditions.push(...dateRange);

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(members.fullName, pattern),
      ilike(members.memberCode, pattern),
      ilike(contracts.contractNo, pattern),
    )!);
  }

  const whereCondition = and(...conditions);

  const [[countResult], result] = await Promise.all([
    db
      .select(COUNT_SELECT)
      .from(payments)
      .leftJoin(members, eq(payments.memberId, members.id))
      .leftJoin(contracts, eq(payments.contractId, contracts.id))
      .where(whereCondition),
    db
      .select(PAYMENT_LIST_JOIN_SELECT)
      .from(payments)
      .leftJoin(members, eq(payments.memberId, members.id))
      .leftJoin(contracts, eq(payments.contractId, contracts.id))
      .where(whereCondition)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(countResult?.count || 0);

  const data = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i]!;
    data[i] = {
      ...r.payment,
      member: r.member,
      contract: r.contract,
    };
  }

  return c.json({
    success: true,
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const dateRange = paymentDateRange(c.req.query('startDate'), c.req.query('endDate'));
  if (!dateRange) {
    return c.json({ success: false, error: INVALID_DATE_ERROR }, 400);
  }

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: { totalIncome: 0, totalRefund: 0, netIncome: 0, paymentCount: 0 },
    });
  }

  let conditions: SQL[] = [];

  if (branchId) {
    if (!branchIds.includes(branchId.toLowerCase())) {
      return c.json({
        success: true,
        data: { totalIncome: 0, totalRefund: 0, netIncome: 0, paymentCount: 0 },
      });
    }
    conditions.push(eq(payments.branchId, branchId));
  } else {
    conditions.push(
      branchIds.length === 1 ? eq(payments.branchId, branchIds[0]) : inArray(payments.branchId, branchIds)
    );
  }

  conditions.push(...dateRange);

  // Revenue: only payments that were actually received (not open/failed gateway checkouts)
  conditions.push(eq(payments.status, 'COMPLETED'));

  const whereCondition = and(...conditions);

  const [summaryResult] = await db
    .select(PAYMENT_SUMMARY_SELECT)
    .from(payments)
    .where(whereCondition);

  const totalIncome = Number(summaryResult?.totalIncome || 0);
  const totalRefund = Number(summaryResult?.totalRefund || 0);

  return c.json({
    success: true,
    data: {
      totalIncome,
      totalRefund,
      netIncome: totalIncome - totalRefund,
      paymentCount: Number(summaryResult?.count || 0),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/payments/export - Export Payments List
// -----------------------------------------------------------------------------

app.get('/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { branchId, startDate, endDate, format = 'csv' } = c.req.query();
  const dateRange = paymentDateRange(startDate, endDate);
  if (!dateRange) {
    return c.json({ success: false, error: INVALID_DATE_ERROR }, 400);
  }

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId.toLowerCase()))) {
    const result = generateCsv(paymentsColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payments.csv"`,
      },
    });
  }

  let conditions: SQL[] = [];

  if (branchId) {
    conditions.push(eq(payments.branchId, branchId));
  } else {
    conditions.push(
      branchIds.length === 1 ? eq(payments.branchId, branchIds[0]) : inArray(payments.branchId, branchIds)
    );
  }

  conditions.push(...dateRange);

  // Export is a record of money received: leave out open/failed gateway checkouts
  conditions.push(eq(payments.status, 'COMPLETED'));

  const result = await db
    .select(PAYMENT_EXPORT_SELECT)
    .from(payments)
    .leftJoin(members, eq(payments.memberId, members.id))
    .where(and(...conditions))
    .orderBy(desc(payments.createdAt));

  const exportData = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i]!;
    exportData[i] = {
      receiptNo: r.payment.receiptNo || '',
      memberName: r.member?.fullName || '',
      memberCode: r.member?.memberCode || '',
      amount: parseFloat(r.payment.amount || '0'),
      paymentMethod: translatePaymentMethod(r.payment.paymentMethod),
      paymentDate: r.payment.paymentDate?.toISOString().slice(0, 10) || '',
      type: translatePaymentType(r.payment.type),
    };
  }

  const filename = `付款記錄_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'xlsx' || format === 'excel') {
    const exportResult = await generateExcel(paymentsColumns, exportData, '付款記錄');
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

  const csvResult = generateCsv(paymentsColumns, exportData);
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

  const [payment] = await db
    .select(PAYMENT_DETAIL_SELECT)
    .from(payments)
    .leftJoin(members, eq(payments.memberId, members.id))
    .leftJoin(contracts, eq(payments.contractId, contracts.id))
    .where(eq(payments.id, id))
    .limit(1);

  if (!payment) {
    return c.json({ success: false, error: '付款紀錄不存在' }, 404);
  }

  const branchIds = await getTenantBranchIds(tenantId);
  if (!payment.payment.branchId || !branchIds.includes(payment.payment.branchId)) {
    return c.json({ success: false, error: '無權限存取此付款紀錄' }, 403);
  }

  return c.json({
    success: true,
    data: {
      ...payment.payment,
      member: payment.member,
      contract: payment.contract,
    },
  });
});

app.post('/', zValidator('json', createPaymentSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (!branchIds.includes(data.branchId.toLowerCase())) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [member] = await db
    .select(MEMBER_ID_SELECT)
    .from(members)
    .where(and(eq(members.id, data.memberId), eq(members.tenantId, tenantId)))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  // contractId is required in schema
  if (!data.contractId) {
    return c.json({ success: false, error: '必須指定合約' }, 400);
  }
  const contractId = data.contractId;

  const contractCondition = and(eq(contracts.id, data.contractId), eq(contracts.tenantId, tenantId));

  // Lock the contract row FOR UPDATE before inserting the payment. The insert's
  // foreign-key check takes FOR KEY SHARE on the contract; locking it only
  // afterwards (in recalculateContractPayment) lets two concurrent payments
  // each hold KEY SHARE and wait for the other's FOR UPDATE -> deadlock.
  const newPayment = await db.transaction(async (tx) => {
    const [contract] = await tx
      .select(CONTRACT_TOTAL_AMOUNT_SELECT)
      .from(contracts)
      .where(and(contractCondition, eq(contracts.memberId, data.memberId)))
      .limit(1)
      .for('update');

    if (!contract) return null;

    const [inserted] = await tx.insert(payments).values({
      contractId,
      memberId: data.memberId,
      branchId: data.branchId,
      amount: String(data.amount),
      paymentMethod: data.paymentMethod,
      paymentDate: paymentTimestamp(data.paymentDate),
      type: data.paymentType,
      status: 'COMPLETED', // staff record money already received
      notes: data.notes,
      createdBy: user.employeeId,
      tenantId,
    }).returning(PAYMENT_RETURNING);

    await recalculateContractPayment(tx, contractId, tenantId);

    return inserted;
  });

  if (!newPayment) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  return c.json({ success: true, data: newPayment }, 201);
});

export default app;
