import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, payments, contracts, membershipPlans } from '../db/index.js';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER PAYMENTS ROUTES
// =============================================================================
// Payment history for member-app (read-only)
// Endpoints: GET /
//
// Returns only the authenticated member's payments inside their own tenant.
// Staff-internal fields (createdBy, receiptNo, notes, branchId, tenantId) are
// never exposed. FAILED and PENDING rows are included so the member can see
// why a charge did not go through; `summary` counts COMPLETED rows only.

const app = new Hono<{ Variables: MemberVariables }>();

app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const memberInfo = c.get('member')!;
  const { page, limit } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const scope = and(
    eq(payments.memberId, memberInfo.id),
    eq(payments.tenantId, memberInfo.tenantId),
  );

  const [[{ total }], [sums], rows] = await Promise.all([
    db.select({ total: count(payments.id) }).from(payments).where(scope),
    db
      .select({
        paid: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'INCOME' THEN ${payments.amount} END), 0)`,
        refunded: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'REFUND' THEN ${payments.amount} END), 0)`,
      })
      .from(payments)
      .where(and(scope, eq(payments.status, 'COMPLETED'))),
    db
      .select({
        id: payments.id,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        paymentDate: payments.paymentDate,
        type: payments.type,
        status: payments.status,
        contractId: payments.contractId,
        contractNo: contracts.contractNo,
        planName: membershipPlans.name,
      })
      .from(payments)
      .leftJoin(contracts, eq(payments.contractId, contracts.id))
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(scope)
      .orderBy(desc(payments.paymentDate), desc(payments.id))
      .limit(limit)
      .offset(offset),
  ]);

  return c.json({
    success: true,
    data: {
      payments: rows.map((p) => ({ ...p, amount: Number(p.amount) })),
      summary: {
        totalPaid: Number(sums?.paid ?? 0),
        totalRefunded: Number(sums?.refunded ?? 0),
      },
      pagination: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    },
  });
});

export default app;
