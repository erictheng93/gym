import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, checkIns, members, contracts, branches, membershipPlans } from '../db/index.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember, rateLimiter } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER CHECK-IN ROUTES
// =============================================================================
// QR code check-in for member-app
// Endpoints: /qr (POST), /history (GET), /today (GET)

const app = new Hono<{ Variables: MemberVariables }>();

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const qrCheckInSchema = z.object({
  // QR payload format: { m: memberCode, t: timestamp_ms, c: contractId (optional) }
  qrPayload: z.object({
    m: z.string().min(1, '會員代碼不可為空'),
    t: z.number().positive('時間戳記不可為空'),
    c: z.string().uuid().optional(),
  }),
  branchId: z.string().uuid('請提供有效的分店 ID'),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// -----------------------------------------------------------------------------
// POST /api/member/check-in/qr - QR Code Check-in
// -----------------------------------------------------------------------------

app.post(
  '/qr',
  rateLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100 : 10,
    keyGenerator: (c) => {
      const member = c.get('member');
      return `checkin:qr:${member?.id || 'unknown'}`;
    },
    message: '入場請求過於頻繁，請稍後再試',
  }),
  zValidator('json', qrCheckInSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { qrPayload, branchId } = c.req.valid('json');

    // Validate QR timestamp (must be within 30 seconds)
    const qrAge = Date.now() - qrPayload.t;
    if (qrAge > 30 * 1000 || qrAge < 0) {
      return c.json({
        success: false,
        error: 'QR Code 已過期，請重新產生',
        code: 'QR_EXPIRED',
      }, 400);
    }

    // Validate member code matches
    if (qrPayload.m !== memberInfo.memberCode) {
      return c.json({
        success: false,
        error: 'QR Code 無效',
        code: 'INVALID_QR',
      }, 400);
    }

    // Verify member status
    const [member] = await db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        fullName: members.fullName,
        status: members.status,
        branchId: members.branchId,
      })
      .from(members)
      .where(eq(members.id, memberInfo.id))
      .limit(1);

    if (!member || member.status !== 'ACTIVE') {
      return c.json({
        success: false,
        error: '會員狀態無效',
        code: 'MEMBER_INACTIVE',
        memberStatus: member?.status,
      }, 403);
    }

    // Verify branch exists
    const [branch] = await db
      .select({
        id: branches.id,
        name: branches.name,
        tenantId: branches.tenantId,
      })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);

    if (!branch) {
      return c.json({
        success: false,
        error: '分店不存在',
        code: 'BRANCH_NOT_FOUND',
      }, 404);
    }

    // Get active contract
    const today = new Date().toISOString().split('T')[0];
    const contractConditions = [
      eq(contracts.memberId, member.id),
      eq(contracts.status, 'ACTIVE'),
      lte(contracts.startDate, today),
      gte(contracts.endDate, today),
    ];

    // If specific contract provided in QR, use it
    if (qrPayload.c) {
      contractConditions.push(eq(contracts.id, qrPayload.c));
    }

    const [contractResult] = await db
      .select({
        contract: contracts,
        plan: membershipPlans,
      })
      .from(contracts)
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(and(...contractConditions))
      .orderBy(desc(contracts.endDate))
      .limit(1);

    const activeContract = contractResult?.contract;
    const activePlan = contractResult?.plan;

    if (!activeContract) {
      return c.json({
        success: false,
        error: '無有效合約',
        code: 'NO_ACTIVE_CONTRACT',
      }, 400);
    }

    // For COUNT_BASED contracts, check remaining counts
    if (activePlan?.planType === 'COUNT_BASED') {
      const remainingCounts = activeContract.remainingCounts ?? 0;
      if (remainingCounts <= 0) {
        return c.json({
          success: false,
          error: '剩餘次數不足',
          code: 'NO_REMAINING_COUNTS',
          contract: {
            id: activeContract.id,
            contractNo: activeContract.contractNo,
            remainingCounts: 0,
          },
        }, 400);
      }
    }

    // Check if already checked in today at this branch
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [existingCheckIn] = await db
      .select({
        id: checkIns.id,
        checkInTime: checkIns.checkInTime,
      })
      .from(checkIns)
      .where(and(
        eq(checkIns.memberId, member.id),
        eq(checkIns.branchId, branchId),
        gte(checkIns.checkInTime, todayStart),
        lte(checkIns.checkInTime, todayEnd),
      ))
      .limit(1);

    if (existingCheckIn) {
      return c.json({
        success: true,
        data: {
          alreadyCheckedIn: true,
          message: '今日已入場',
          checkIn: {
            id: existingCheckIn.id,
            checkInTime: existingCheckIn.checkInTime,
          },
          member: {
            id: member.id,
            memberCode: member.memberCode,
            fullName: member.fullName,
          },
          branch: {
            id: branch.id,
            name: branch.name,
          },
        },
      });
    }

    // Create check-in
    const [newCheckIn] = await db.insert(checkIns).values({
      memberId: member.id,
      branchId,
      contractId: activeContract.id,
      checkInType: 'ENTRY',
      checkInMethod: 'QR_CODE',
      checkInTime: new Date(),
    }).returning();

    // Deduct session for COUNT_BASED contracts
    let newRemainingCounts: number | null = null;
    if (activePlan?.planType === 'COUNT_BASED') {
      const remainingCounts = activeContract.remainingCounts ?? 0;
      newRemainingCounts = remainingCounts - 1;

      await db.update(contracts).set({
        remainingCounts: newRemainingCounts,
        updatedAt: new Date(),
      }).where(eq(contracts.id, activeContract.id));
    }

    return c.json({
      success: true,
      data: {
        alreadyCheckedIn: false,
        message: '入場成功',
        checkIn: {
          id: newCheckIn.id,
          checkInTime: newCheckIn.checkInTime,
        },
        member: {
          id: member.id,
          memberCode: member.memberCode,
          fullName: member.fullName,
        },
        branch: {
          id: branch.id,
          name: branch.name,
        },
        contract: {
          id: activeContract.id,
          contractNo: activeContract.contractNo,
          planType: activePlan?.planType,
          remainingCounts: newRemainingCounts,
          endDate: activeContract.endDate,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/check-in/qr-data - Generate QR data for check-in
// -----------------------------------------------------------------------------

app.get('/qr-data', async (c) => {
  const memberInfo = c.get('member')!;
  const contractId = c.req.query('contractId');

  // Generate QR payload
  const qrPayload = {
    m: memberInfo.memberCode,
    t: Date.now(),
    c: contractId || undefined,
  };

  return c.json({
    success: true,
    data: {
      payload: qrPayload,
      // JSON string for QR code generation
      qrString: JSON.stringify(qrPayload),
      // Valid for 30 seconds
      expiresAt: new Date(Date.now() + 30 * 1000).toISOString(),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/check-in/history - Get check-in history
// -----------------------------------------------------------------------------

app.get(
  '/history',
  zValidator('query', historyQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit, startDate, endDate } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(checkIns.memberId, memberInfo.id)];

    if (startDate) {
      conditions.push(gte(checkIns.checkInTime, new Date(startDate)));
    }

    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(checkIns.checkInTime, endDateTime));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(checkIns)
      .where(and(...conditions));

    // Get check-ins with branch info
    const checkInList = await db
      .select({
        id: checkIns.id,
        checkInTime: checkIns.checkInTime,
        checkInType: checkIns.checkInType,
        checkInMethod: checkIns.checkInMethod,
        branchId: checkIns.branchId,
        branchName: branches.name,
        contractId: checkIns.contractId,
      })
      .from(checkIns)
      .leftJoin(branches, eq(checkIns.branchId, branches.id))
      .where(and(...conditions))
      .orderBy(desc(checkIns.checkInTime))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        checkIns: checkInList.map(ci => ({
          id: ci.id,
          checkInTime: ci.checkInTime,
          checkInType: ci.checkInType,
          checkInMethod: ci.checkInMethod,
          branch: {
            id: ci.branchId,
            name: ci.branchName,
          },
          contractId: ci.contractId,
        })),
        pagination: {
          total: Number(total),
          page,
          limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/check-in/today - Get today's check-in status
// -----------------------------------------------------------------------------

app.get('/today', async (c) => {
  const memberInfo = c.get('member')!;
  const branchId = c.req.query('branchId');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [
    eq(checkIns.memberId, memberInfo.id),
    gte(checkIns.checkInTime, todayStart),
  ];

  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

  const todayCheckIns = await db
    .select({
      id: checkIns.id,
      checkInTime: checkIns.checkInTime,
      checkInType: checkIns.checkInType,
      branchId: checkIns.branchId,
      branchName: branches.name,
    })
    .from(checkIns)
    .leftJoin(branches, eq(checkIns.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(desc(checkIns.checkInTime));

  return c.json({
    success: true,
    data: {
      hasCheckedInToday: todayCheckIns.length > 0,
      checkIns: todayCheckIns.map(ci => ({
        id: ci.id,
        checkInTime: ci.checkInTime,
        checkInType: ci.checkInType,
        branch: {
          id: ci.branchId,
          name: ci.branchName,
        },
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/check-in/stats - Get check-in statistics
// -----------------------------------------------------------------------------

app.get('/stats', async (c) => {
  const memberInfo = c.get('member')!;

  // This month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Count this month
  const [monthStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkIns)
    .where(and(
      eq(checkIns.memberId, memberInfo.id),
      gte(checkIns.checkInTime, monthStart),
    ));

  // Count last 30 days
  const [thirtyDayStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkIns)
    .where(and(
      eq(checkIns.memberId, memberInfo.id),
      gte(checkIns.checkInTime, thirtyDaysAgo),
    ));

  // Total count
  const [totalStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkIns)
    .where(eq(checkIns.memberId, memberInfo.id));

  // Most visited branch
  const branchStats = await db
    .select({
      branchId: checkIns.branchId,
      branchName: branches.name,
      count: sql<number>`count(*)`,
    })
    .from(checkIns)
    .leftJoin(branches, eq(checkIns.branchId, branches.id))
    .where(eq(checkIns.memberId, memberInfo.id))
    .groupBy(checkIns.branchId, branches.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return c.json({
    success: true,
    data: {
      thisMonth: Number(monthStats?.count || 0),
      last30Days: Number(thirtyDayStats?.count || 0),
      total: Number(totalStats?.count || 0),
      mostVisitedBranch: branchStats[0] ? {
        id: branchStats[0].branchId,
        name: branchStats[0].branchName,
        visits: Number(branchStats[0].count),
      } : null,
    },
  });
});

export default app;
