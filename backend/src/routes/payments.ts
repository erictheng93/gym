import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, payments, contracts, members } from '../db/index.js';
import { eq, and, sql, desc, sum, inArray, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
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

const PAYMENT_TOTAL_AMOUNT_SELECT = { total: sum(payments.amount) };

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

app.use('*', requireAuth);
app.use('*', requireTenant);

const createPaymentSchema = z.object({
  contractId: z.string().uuid().optional().nullable(),
  memberId: z.string().uuid(),
  amount: z.coerce.number().min(0),
  paymentMethod: z.enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'LINE_PAY', 'OTHER']),
  paymentType: z.enum(['INCOME', 'REFUND']).default('INCOME'),
  branchId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const memberId = c.req.query('memberId');
  const contractId = c.req.query('contractId');
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

  const whereCondition = and(...conditions);

  const [[countResult], result] = await Promise.all([
    db
      .select(COUNT_SELECT)
      .from(payments)
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
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

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

  if (startDate) {
    conditions.push(sql`${payments.paymentDate} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${payments.paymentDate} <= ${endDate}`);
  }

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

  if (startDate) {
    conditions.push(gte(payments.paymentDate, new Date(startDate)));
  }

  if (endDate) {
    conditions.push(lte(payments.paymentDate, new Date(endDate)));
  }

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
  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [member] = await db
    .select(MEMBER_ID_SELECT)
    .from(members)
    .where(eq(members.id, data.memberId))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  // contractId is required in schema
  if (!data.contractId) {
    return c.json({ success: false, error: '必須指定合約' }, 400);
  }

  const [newPayment] = await db.insert(payments).values({
    contractId: data.contractId,
    memberId: data.memberId,
    branchId: data.branchId,
    amount: String(data.amount),
    paymentMethod: data.paymentMethod,
    paymentDate: new Date(),
    type: data.paymentType,
    notes: data.notes,
    createdBy: user.employeeId,
    tenantId,
  }).returning(PAYMENT_RETURNING);

  if (data.contractId) {
    const [existingPayments, [contract]] = await Promise.all([
      db
        .select(PAYMENT_TOTAL_AMOUNT_SELECT)
        .from(payments)
        .where(
          and(
            eq(payments.contractId, data.contractId),
            eq(payments.type, 'INCOME')
          )
        ),
      db
        .select(CONTRACT_TOTAL_AMOUNT_SELECT)
        .from(contracts)
        .where(eq(contracts.id, data.contractId))
        .limit(1),
    ]);

    const totalPaid = Number(existingPayments[0]?.total || 0);

    if (contract) {
      const totalAmount = Number(contract.totalAmount || 0);
      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';

      if (totalPaid >= totalAmount) {
        paymentStatus = 'PAID';
      } else if (totalPaid > 0) {
        paymentStatus = 'PARTIAL';
      }

      await db.update(contracts).set({
        paymentStatus,
        updatedAt: new Date(),
      }).where(eq(contracts.id, data.contractId));
    }
  }

  return c.json({ success: true, data: newPayment }, 201);
});

export default app;
