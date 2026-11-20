import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, checkIns, members, contracts, branches, employees, membershipPlans } from '../db/index.js';
import { eq, and, sql, desc, gte, lte, gt, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const CHECK_IN_RETURNING = {
  id: checkIns.id,
  status: checkIns.status,
  dateCreated: checkIns.dateCreated,
  dateUpdated: checkIns.dateUpdated,
  memberId: checkIns.memberId,
  branchId: checkIns.branchId,
  contractId: checkIns.contractId,
  checkInTime: checkIns.checkInTime,
  checkInType: checkIns.checkInType,
  checkInMethod: checkIns.checkInMethod,
  processedById: checkIns.processedById,
  locationIp: checkIns.locationIp,
  locationDevice: checkIns.locationDevice,
  notes: checkIns.notes,
};

const CHECK_IN_LIST_SELECT = {
  checkIn: {
    id: checkIns.id,
    memberId: checkIns.memberId,
    branchId: checkIns.branchId,
    contractId: checkIns.contractId,
    checkInTime: checkIns.checkInTime,
    checkInType: checkIns.checkInType,
    checkInMethod: checkIns.checkInMethod,
    processedById: checkIns.processedById,
    notes: checkIns.notes,
  },
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
};

const CHECK_IN_DETAIL_SELECT = {
  checkIn: CHECK_IN_RETURNING,
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
};

const CHECK_IN_TODAY_STATS_SELECT = {
  total: sql<number>`count(*)`,
  uniqueMembers: sql<number>`count(distinct ${checkIns.memberId})`,
};

const CHECK_IN_HOURLY_STATS_SELECT = {
  hour: sql<number>`extract(hour from ${checkIns.checkInTime})`,
  count: sql<number>`count(*)`,
};

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

  try {
    const tenantBranchIds = await getTenantBranchIds(tenantId);
    if (tenantBranchIds.length === 0) {
      return c.json({
        success: true,
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      });
    }

    if (branchId && !tenantBranchIds.includes(branchId)) {
      return c.json({
        success: true,
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      });
    }

    const branchCondition = branchId
      ? eq(checkIns.branchId, branchId)
      : inArray(checkIns.branchId, tenantBranchIds);

    const conditions = [branchCondition];

    if (memberId) {
      conditions.push(eq(checkIns.memberId, memberId));
    }

    if (startDate) {
      conditions.push(gte(checkIns.checkInTime, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(checkIns.checkInTime, new Date(endDate)));
    }

    const whereCondition = and(...conditions);

    const [result, [countResult]] = await Promise.all([
      db
        .select(CHECK_IN_LIST_SELECT)
        .from(checkIns)
        .innerJoin(members, eq(checkIns.memberId, members.id))
        .innerJoin(branches, eq(checkIns.branchId, branches.id))
        .leftJoin(employees, eq(checkIns.processedById, employees.id))
        .where(whereCondition)
        .orderBy(desc(checkIns.checkInTime))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(checkIns)
        .where(whereCondition),
    ]);

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
  } catch (error) {
    console.error('[check-ins GET /] Error:', error);
    return c.json({ success: false, error: '查詢入場紀錄失敗', details: String(error) }, 500);
  }
});

// Create check-in (entry)
app.post('/', zValidator('json', createCheckInSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  // Calculate today bounds
  const today = new Date().toISOString().split('T')[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Concurrently verify tenant branch, member exists, check active contract, and check if already checked in
  const [tenantBranchIds, [member], [activeContractResult], [existingCheckIn]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        fullName: members.fullName,
        phone: members.phone,
        email: members.email,
        status: members.status,
      })
      .from(members)
      .where(eq(members.id, data.memberId))
      .limit(1),
    db
      .select({
        contract: {
          id: contracts.id,
          remainingCounts: contracts.remainingCounts,
        },
        plan: {
          planType: membershipPlans.planType,
        },
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
      .limit(1),
    db
      .select({
        id: checkIns.id,
        memberId: checkIns.memberId,
        branchId: checkIns.branchId,
        contractId: checkIns.contractId,
        checkInType: checkIns.checkInType,
        checkInTime: checkIns.checkInTime,
        notes: checkIns.notes,
      })
      .from(checkIns)
      .where(
        and(
          eq(checkIns.memberId, data.memberId),
          eq(checkIns.branchId, data.branchId),
          gte(checkIns.checkInTime, todayStart),
          lte(checkIns.checkInTime, todayEnd)
        )
      )
      .limit(1),
  ]);

  if (!tenantBranchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  const activeContract = activeContractResult?.contract;
  const activePlan = activeContractResult?.plan;

  if (!activeContract && !data.contractId) {
    return c.json({
      success: false,
      error: '會員無有效合約',
      data: { member, hasActiveContract: false },
    }, 400);
  }

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

  // Concurrently create check-in and deduct session for COUNT_BASED contracts
  const [[newCheckIn]] = await Promise.all([
    db.insert(checkIns).values({
      memberId: data.memberId,
      branchId: data.branchId,
      contractId: data.contractId || activeContract?.id,
      checkInType: data.checkInType,
      checkInTime: new Date(),
      processedById: user.employeeId,
      notes: data.notes,
    }).returning(CHECK_IN_RETURNING),
    activePlan?.planType === 'COUNT_BASED' && activeContract
      ? db
          .update(contracts)
          .set({
            remainingCounts: sql`GREATEST(0, ${contracts.remainingCounts} - 1)`,
            updatedAt: new Date(),
          })
          .where(and(eq(contracts.id, activeContract.id), gt(contracts.remainingCounts, 0)))
      : Promise.resolve(null),
  ]);

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
    .select(CHECK_IN_DETAIL_SELECT)
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

  const tenantBranchIds = await getTenantBranchIds(tenantId);
  if (tenantBranchIds.length === 0) {
    return c.json({
      success: true,
      data: {
        total: 0,
        uniqueMembers: 0,
        hourlyBreakdown: [],
      },
    });
  }

  if (branchId && !tenantBranchIds.includes(branchId)) {
    return c.json({
      success: true,
      data: {
        total: 0,
        uniqueMembers: 0,
        hourlyBreakdown: [],
      },
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const branchCondition = branchId
    ? eq(checkIns.branchId, branchId)
    : inArray(checkIns.branchId, tenantBranchIds);

  const whereCondition = and(
    branchCondition,
    gte(checkIns.checkInTime, todayStart)
  );

  const [[stats], hourlyStats] = await Promise.all([
    db
      .select(CHECK_IN_TODAY_STATS_SELECT)
      .from(checkIns)
      .where(whereCondition),

    // Hourly breakdown
    db
      .select(CHECK_IN_HOURLY_STATS_SELECT)
      .from(checkIns)
      .where(whereCondition)
      .groupBy(sql`extract(hour from ${checkIns.checkInTime})`)
      .orderBy(sql`extract(hour from ${checkIns.checkInTime})`),
  ]);

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
