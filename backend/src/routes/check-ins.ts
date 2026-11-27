import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, checkIns, members, contracts, branches, employees, membershipPlans } from '../db/index.js';
import { eq, and, sql, desc, gte, lte, gt, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import {
  verifyCheckInQrToken,
  reserveCheckInQrJti,
  releaseCheckInQrJti,
} from '../services/checkin-qr.js';
import type { CheckInQrPayload } from '../services/checkin-qr.js';

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

const CHECK_IN_MEMBER_SELECT = {
  id: members.id,
  memberCode: members.memberCode,
  fullName: members.fullName,
  phone: members.phone,
  email: members.email,
  status: members.status,
};

const CHECK_IN_ACTIVE_CONTRACT_SELECT = {
  contract: {
    id: contracts.id,
    contractNo: contracts.contractNo,
    remainingCounts: contracts.remainingCounts,
  },
  plan: {
    name: membershipPlans.name,
    planType: membershipPlans.planType,
  },
};

const CHECK_IN_EXISTING_SELECT = {
  id: checkIns.id,
  memberId: checkIns.memberId,
  branchId: checkIns.branchId,
  contractId: checkIns.contractId,
  checkInType: checkIns.checkInType,
  checkInTime: checkIns.checkInTime,
  notes: checkIns.notes,
};

const COUNT_SELECT = {
  count: sql<number>`count(*)`,
};

app.use('*', requireAuth);
app.use('*', requireTenant);

// Either a manual entry (memberId + branchId) or a scanned member QR (qrToken, signed by the
// backend: services/checkin-qr.ts). With a token the member comes from the token, never the body.
const createCheckInSchema = z.object({
  memberId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  qrToken: z.string().min(1).max(1024).optional(),
  contractId: z.string().uuid().optional(),
  checkInType: z.enum(['ENTRY', 'CLASS', 'FACILITY']).optional().default('ENTRY'),
  checkInMethod: z.enum(['QR_CODE', 'MANUAL', 'CARD']).optional().default('MANUAL'),
  notes: z.string().optional(),
}).refine((d) => d.qrToken || (d.memberId && d.branchId), {
  message: 'memberId 與 branchId 為必填',
});

type CreateCheckInBody = z.infer<typeof createCheckInSchema>;
type CheckInContext = Context<{ Variables: AuthVariables & TenantVariables }>;

const QR_ERRORS = {
  INVALID_QR: 'QR Code 無效',
  QR_EXPIRED: 'QR Code 已過期，請會員重新產生入場碼',
} as const;

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
      : (tenantBranchIds.length === 1 ? eq(checkIns.branchId, tenantBranchIds[0]) : inArray(checkIns.branchId, tenantBranchIds));

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
        .select(COUNT_SELECT)
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
  const body = c.req.valid('json');

  if (!body.qrToken) return processCheckIn(c, body);

  const verified = verifyCheckInQrToken(body.qrToken);
  if (!verified.ok) {
    return c.json({ success: false, error: QR_ERRORS[verified.code], code: verified.code }, 400);
  }
  const qr = verified.payload;
  if (qr.tid !== tenantId) {
    return c.json({ success: false, error: '此 QR Code 不屬於本館', code: 'QR_WRONG_TENANT' }, 400);
  }
  // One scan per token. Reserved before the async work so two simultaneous scans cannot both pass.
  if (!reserveCheckInQrJti(qr)) {
    return c.json({ success: false, error: 'QR Code 已使用，請會員重新產生入場碼', code: 'QR_REPLAY' }, 409);
  }
  try {
    const response = await processCheckIn(c, body, qr);
    // Not recorded (no contract, wrong branch, ...): the member may retry with the same code
    if (!response.ok) releaseCheckInQrJti(qr);
    return response;
  } catch (error) {
    releaseCheckInQrJti(qr);
    throw error;
  }
});

async function processCheckIn(c: CheckInContext, body: CreateCheckInBody, qr?: CheckInQrPayload): Promise<Response> {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;

  let memberId = body.memberId!;
  let branchId = body.branchId;
  if (qr) {
    memberId = qr.mid;
    if (!branchId) {
      const [own] = await db
        .select({ branchId: members.branchId })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.tenantId, tenantId)))
        .limit(1);
      if (!own) return c.json({ success: false, error: '會員不存在' }, 404);
      branchId = own.branchId;
    }
  }
  const data = {
    ...body,
    memberId,
    branchId: branchId!,
    checkInMethod: qr ? ('QR_CODE' as const) : body.checkInMethod,
  };

  // Calculate today bounds
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Concurrently verify tenant branch, member exists, check active contract, and check if already checked in
  const [tenantBranchIds, [member], [activeContractResult], [existingCheckIn]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CHECK_IN_MEMBER_SELECT)
      .from(members)
      .where(and(eq(members.id, data.memberId), eq(members.tenantId, tenantId)))
      .limit(1),
    db
      .select(CHECK_IN_ACTIVE_CONTRACT_SELECT)
      .from(contracts)
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(
        and(
          eq(contracts.memberId, data.memberId),
          eq(contracts.tenantId, tenantId),
          eq(contracts.status, 'ACTIVE'),
          lte(contracts.startDate, today),
          gte(contracts.endDate, today),
          // An explicit contract must itself be ACTIVE and in date
          data.contractId ? eq(contracts.id, data.contractId) : undefined,
        )
      )
      .orderBy(desc(contracts.endDate))
      .limit(1),
    db
      .select(CHECK_IN_EXISTING_SELECT)
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

  if (!activeContract) {
    if (data.contractId) {
      const [ownContract] = await db
        .select({ id: contracts.id })
        .from(contracts)
        .where(and(
          eq(contracts.id, data.contractId),
          eq(contracts.memberId, data.memberId),
          eq(contracts.tenantId, tenantId),
        ))
        .limit(1);
      if (!ownContract) {
        return c.json({ success: false, error: '合約不存在' }, 404);
      }
    }
    return c.json({
      success: false,
      error: '會員無有效合約',
      data: { member, hasActiveContract: false },
    }, 400);
  }

  // The contract the entry was (or would be) recorded against, so the front desk can tell the
  // member what is left without a second lookup
  const contractSummary = (remainingCounts: number | null) => ({
    id: activeContract.id,
    contractNo: activeContract.contractNo,
    planName: activePlan?.name ?? null,
    planType: activePlan?.planType ?? null,
    remainingCounts,
    countDeducted: false,
  });

  if (existingCheckIn) {
    return c.json({
      success: true,
      message: '會員今日已入場',
      data: {
        ...existingCheckIn,
        member,
        contract: contractSummary(activeContract.remainingCounts),
        alreadyCheckedIn: true,
      },
    });
  }

  // Same rule as the member QR check-in: a class package with no sessions left does not admit
  if (activePlan?.planType === 'COUNT_BASED' && (activeContract.remainingCounts ?? 0) <= 0) {
    return c.json({
      success: false,
      error: '剩餘次數不足',
      data: { member, hasActiveContract: true, remainingCounts: 0 },
    }, 400);
  }

  const { entry: newCheckIn, contract } = await db.transaction(async (tx) => {
    const [entry] = await tx.insert(checkIns).values({
      memberId: data.memberId,
      branchId: data.branchId,
      contractId: activeContract.id,
      checkInType: data.checkInType,
      checkInMethod: data.checkInMethod,
      checkInTime: new Date(),
      processedById: user.employeeId,
      notes: data.notes,
    }).returning(CHECK_IN_RETURNING);
    if (activePlan?.planType === 'COUNT_BASED') {
      const [deducted] = await tx.update(contracts)
        .set({
          remainingCounts: sql`GREATEST(0, ${contracts.remainingCounts} - 1)`,
          updatedAt: new Date(),
        })
        .where(and(eq(contracts.id, activeContract.id), gt(contracts.remainingCounts, 0)))
        .returning({ remainingCounts: contracts.remainingCounts });
      return {
        entry,
        contract: deducted
          ? { ...contractSummary(deducted.remainingCounts), countDeducted: true }
          : contractSummary(activeContract.remainingCounts),
      };
    }
    return { entry, contract: contractSummary(activeContract.remainingCounts) };
  });

  return c.json({
    success: true,
    message: '入場成功',
    data: {
      ...newCheckIn,
      member,
      contract,
    },
  }, 201);
}

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
    : (tenantBranchIds.length === 1 ? eq(checkIns.branchId, tenantBranchIds[0]) : inArray(checkIns.branchId, tenantBranchIds));

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
