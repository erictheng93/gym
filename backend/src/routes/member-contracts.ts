import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contracts, membershipPlans } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER CONTRACTS ROUTES
// =============================================================================
// Read-only list of the member's own contracts for member-app.
// Endpoints: GET /
//
// There is deliberately NO member self-service pause/resume here: pausing a
// contract changes its end date and is a staff-only flow (see routes/contracts.ts).
// Staff-internal fields (notes, signatures, createdBy, branch/tenant ids) are not exposed.

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
    eq(contracts.memberId, memberInfo.id),
    eq(contracts.tenantId, memberInfo.tenantId),
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count(contracts.id) }).from(contracts).where(scope),
    db
      .select({
        id: contracts.id,
        contractNo: contracts.contractNo,
        status: contracts.status,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        remainingCounts: contracts.remainingCounts,
        totalAmount: contracts.totalAmount,
        paidAmount: contracts.paidAmount,
        paymentStatus: contracts.paymentStatus,
        planName: membershipPlans.name,
        planType: membershipPlans.planType,
      })
      .from(contracts)
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(scope)
      .orderBy(desc(contracts.startDate), desc(contracts.id))
      .limit(limit)
      .offset(offset),
  ]);

  return c.json({
    success: true,
    data: {
      contracts: rows.map((r) => ({
        ...r,
        totalAmount: Number(r.totalAmount),
        paidAmount: Number(r.paidAmount),
      })),
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
