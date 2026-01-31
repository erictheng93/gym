import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, checkIns, members, contracts, branches, employees, membershipPlans } from '../db/index.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createCheckInSchema = z.object({
  memberId: z.string().uuid(),
  branchId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  checkInType: z.enum(['ENTRY', 'CLASS', 'FACILITY']).optional().default('ENTRY'),
  notes: z.string().optional(),
});

// List check-ins
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const memberId = c.req.query('memberId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const offset = (page - 1) * limit;

  const conditions = [eq(branches.tenantId, tenantId)];

  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

  if (memberId) {
    conditions.push(eq(checkIns.memberId, memberId));
  }

  if (startDate) {
    conditions.push(gte(checkIns.checkInTime, new Date(startDate)));
  }

  if (endDate) {
    conditions.push(lte(checkIns.checkInTime, new Date(endDate)));
  }

  const result = await db
    .select({
      checkIn: checkIns,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
      processedBy: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(checkIns)
    .innerJoin(members, eq(checkIns.memberId, members.id))
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .leftJoin(employees, eq(checkIns.processedById, employees.id))
    .where(and(...conditions))
    .orderBy(desc(checkIns.checkInTime))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkIns)
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(and(...conditions));

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.checkIn,
      member: r.member,
      branch: r.branch,
      processedBy: r.processedBy,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create check-in (entry)
app.post('/', zValidator('json', createCheckInSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  // Verify branch belongs to tenant
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  // Verify member exists
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, data.memberId))
    .limit(1);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  // Check for active contract with plan info
  const today = new Date().toISOString().split('T')[0];
  const [activeContractResult] = await db
    .select({
      contract: contracts,
      plan: membershipPlans,
    })
    .from(contracts)
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(
      and(
        eq(contracts.memberId, data.memberId),
        eq(contracts.status, 'ACTIVE'),
        lte(contracts.startDate, today),
        gte(contracts.endDate, today)
      )
    )
    .limit(1);

  const activeContract = activeContractResult?.contract;
  const activePlan = activeContractResult?.plan;

  if (!activeContract && !data.contractId) {
    return c.json({
      success: false,
      error: '會員無有效合約',
      data: { member, hasActiveContract: false },
    }, 400);
  }

  // Check if already checked in today at this branch
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [existingCheckIn] = await db
    .select()
    .from(checkIns)
    .where(
      and(
        eq(checkIns.memberId, data.memberId),
        eq(checkIns.branchId, data.branchId),
        gte(checkIns.checkInTime, todayStart),
        lte(checkIns.checkInTime, todayEnd)
      )
    )
    .limit(1);

  if (existingCheckIn) {
    return c.json({
      success: true,
      message: '會員今日已入場',
      data: {
        ...existingCheckIn,
        member,
        alreadyCheckedIn: true,
      },
    });
  }

  // Create check-in
  const [newCheckIn] = await db.insert(checkIns).values({
    memberId: data.memberId,
    branchId: data.branchId,
    contractId: data.contractId || activeContract?.id,
    checkInType: data.checkInType,
    checkInTime: new Date(),
    processedById: user.employeeId,
    notes: data.notes,
  }).returning();

  // Deduct session for COUNT_BASED contracts
  if (activePlan?.planType === 'COUNT_BASED' && activeContract) {
    const remainingCounts = activeContract.remainingCounts ?? 0;
    if (remainingCounts > 0) {
      await db.update(contracts).set({
        remainingCounts: remainingCounts - 1,
        updatedAt: new Date(),
      }).where(eq(contracts.id, activeContract.id));
    }
  }

  return c.json({
    success: true,
    message: '入場成功',
    data: {
      ...newCheckIn,
      member,
    },
  }, 201);
});

// Get check-in by ID
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      checkIn: checkIns,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
      contract: {
        id: contracts.id,
        contractNo: contracts.contractNo,
        contractStatus: contracts.status,
      },
    })
    .from(checkIns)
    .innerJoin(members, eq(checkIns.memberId, members.id))
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .leftJoin(contracts, eq(checkIns.contractId, contracts.id))
    .where(and(eq(checkIns.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '記錄不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.checkIn,
      member: result.member,
      branch: result.branch,
      contract: result.contract,
    },
  });
});

// Today's check-in stats
app.get('/stats/today', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [
    eq(branches.tenantId, tenantId),
    gte(checkIns.checkInTime, todayStart),
  ];

  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      uniqueMembers: sql<number>`count(distinct ${checkIns.memberId})`,
    })
    .from(checkIns)
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(and(...conditions));

  // Hourly breakdown
  const hourlyStats = await db
    .select({
      hour: sql<number>`extract(hour from ${checkIns.checkInTime})`,
      count: sql<number>`count(*)`,
    })
    .from(checkIns)
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(and(...conditions))
    .groupBy(sql`extract(hour from ${checkIns.checkInTime})`)
    .orderBy(sql`extract(hour from ${checkIns.checkInTime})`);

  return c.json({
    success: true,
    data: {
      total: Number(stats?.total || 0),
      uniqueMembers: Number(stats?.uniqueMembers || 0),
      hourlyBreakdown: hourlyStats.map(h => ({
        hour: Number(h.hour),
        count: Number(h.count),
      })),
    },
  });
});

export default app;
