import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, payments, contracts, members, branches } from '../db/index.js';
import { eq, and, sql, desc, sum, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

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

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
  }

  let conditions = [inArray(payments.branchId, branchIds)];

  if (branchId) {
    conditions.push(eq(payments.branchId, branchId));
  }

  if (memberId) {
    conditions.push(eq(payments.memberId, memberId));
  }

  if (contractId) {
    conditions.push(eq(payments.contractId, contractId));
  }

  const whereCondition = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payments)
    .where(whereCondition);

  const total = Number(countResult?.count || 0);

  const result = await db
    .select({
      payment: payments,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
      contract: {
        id: contracts.id,
        contractNo: contracts.contractNo,
      },
    })
    .from(payments)
    .leftJoin(members, eq(payments.memberId, members.id))
    .leftJoin(contracts, eq(payments.contractId, contracts.id))
    .where(whereCondition)
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.payment,
      member: r.member,
      contract: r.contract,
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: { totalIncome: 0, totalRefund: 0, netIncome: 0, paymentCount: 0 },
    });
  }

  let conditions = [inArray(payments.branchId, branchIds)];

  if (branchId) {
    conditions.push(eq(payments.branchId, branchId));
  }

  if (startDate) {
    conditions.push(sql`${payments.paymentDate} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${payments.paymentDate} <= ${endDate}`);
  }

  const whereCondition = and(...conditions);

  const [incomeResult] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(and(whereCondition, eq(payments.paymentType, 'INCOME')));

  const [refundResult] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(and(whereCondition, eq(payments.paymentType, 'REFUND')));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payments)
    .where(whereCondition);

  const totalIncome = Number(incomeResult?.total || 0);
  const totalRefund = Number(refundResult?.total || 0);

  return c.json({
    success: true,
    data: {
      totalIncome,
      totalRefund,
      netIncome: totalIncome - totalRefund,
      paymentCount: Number(countResult?.count || 0),
    },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [payment] = await db
    .select({
      payment: payments,
      member: members,
      contract: contracts,
    })
    .from(payments)
    .leftJoin(members, eq(payments.memberId, members.id))
    .leftJoin(contracts, eq(payments.contractId, contracts.id))
    .where(eq(payments.id, id))
    .limit(1);

  if (!payment) {
    return c.json({ success: false, error: '付款紀錄不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, payment.payment.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
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

  const [newPayment] = await db.insert(payments).values({
    ...data,
    amount: String(data.amount),
    paymentDate: new Date(),
    receivedBy: user.employeeId,
    tenantId,
  }).returning();

  if (data.contractId) {
    const existingPayments = await db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .where(
        and(
          eq(payments.contractId, data.contractId),
          eq(payments.paymentType, 'INCOME'),
          eq(payments.status, 'active')
        )
      );

    const totalPaid = Number(existingPayments[0]?.total || 0);

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, data.contractId))
      .limit(1);

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
