import { Hono } from 'hono';
import { db, members, contracts, payments, checkIns, branches, classSessions } from '../db/index.js';
import { eq, and, sql, gte, count, sum, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

// Main dashboard overview
app.get('/overview', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const monthStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEndDate = new Date(today.getFullYear(), today.getMonth(), 0);
  lastMonthEndDate.setHours(23, 59, 59, 999);

  // Get branch IDs for tenant
  const allTenantBranchIds = await getTenantBranchIds(tenantId);
  const branchIds = branchId ? allTenantBranchIds.filter(id => id === branchId) : allTenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: {
        members: { total: 0, active: 0, newThisMonth: 0 },
        contracts: { active: 0, expiringSoon: 0 },
        revenue: { thisMonth: 0, lastMonth: 0, growth: 0 },
        checkIns: { today: 0, thisMonth: 0 },
      },
    });
  }

  // Precalculate date boundaries
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  // Concurrently fetch all overview metrics in 4 consolidated single-table queries
  const [
    [memberStats],
    [contractStats],
    [revenueStats],
    [checkInStats],
  ] = await Promise.all([
    // Member stats (total, active, and new this month in a single scan)
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${members.status} = 'ACTIVE')`,
        newThisMonth: sql<number>`count(*) filter (where ${members.createdAt} >= ${monthStartDate.toISOString()}::timestamptz)`,
      })
      .from(members)
      .where(inArray(members.branchId, branchIds)),

    // Contract stats (active and expiring soon in a single scan)
    db
      .select({
        active: count(),
        expiringSoon: sql<number>`count(*) filter (where ${contracts.endDate} >= ${todayStr} and ${contracts.endDate} <= ${sevenDaysFromNow})`,
      })
      .from(contracts)
      .where(
        and(
          inArray(contracts.branchId, branchIds),
          eq(contracts.status, 'ACTIVE')
        )
      ),

    // Revenue stats (this month and last month in a single scan)
    db
      .select({
        thisMonth: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentDate} >= ${monthStartDate.toISOString()}::timestamptz THEN ${payments.amount} ELSE 0 END), 0)`,
        lastMonth: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentDate} >= ${lastMonthStartDate.toISOString()}::timestamptz AND ${payments.paymentDate} <= ${lastMonthEndDate.toISOString()}::timestamptz THEN ${payments.amount} ELSE 0 END), 0)`,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.branchId, branchIds),
          eq(payments.type, 'INCOME'),
          gte(payments.paymentDate, lastMonthStartDate)
        )
      ),

    // Check-in stats (this month and today in a single scan)
    db
      .select({
        month: count(),
        today: sql<number>`count(*) filter (where ${checkIns.checkInTime} >= ${todayStart.toISOString()}::timestamptz)`,
      })
      .from(checkIns)
      .where(
        and(
          inArray(checkIns.branchId, branchIds),
          gte(checkIns.checkInTime, monthStartDate)
        )
      ),
  ]);

  const thisMonthTotal = Number(revenueStats?.thisMonth || 0);
  const lastMonthTotal = Number(revenueStats?.lastMonth || 0);
  const revenueGrowth = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1)
    : '0.0';

  return c.json({
    success: true,
    data: {
      members: {
        total: Number(memberStats?.total || 0),
        active: Number(memberStats?.active || 0),
        newThisMonth: Number(memberStats?.newThisMonth || 0),
      },
      contracts: {
        active: Number(contractStats?.active || 0),
        expiringSoon: Number(contractStats?.expiringSoon || 0),
      },
      revenue: {
        thisMonth: thisMonthTotal,
        lastMonth: lastMonthTotal,
        growth: parseFloat(revenueGrowth),
      },
      checkIns: {
        today: Number(checkInStats?.today || 0),
        thisMonth: Number(checkInStats?.month || 0),
      },
    },
  });
});

// Revenue trend (last 30 days or by month)
app.get('/revenue-trend', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const period = c.req.query('period') || 'daily'; // 'daily' or 'monthly'

  const allTenantBranchIds = await getTenantBranchIds(tenantId);
  const branchIds = branchId ? allTenantBranchIds.filter(id => id === branchId) : allTenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  if (period === 'monthly') {
    // Last 12 months
    const result = await db
      .select({
        month: sql<string>`to_char(${payments.paymentDate}, 'YYYY-MM')`,
        total: sum(payments.amount),
      })
      .from(payments)
      .where(
        and(
          inArray(payments.branchId, branchIds),
          eq(payments.type, 'INCOME'),
          gte(payments.paymentDate, sql`current_date - interval '12 months'`)
        )
      )
      .groupBy(sql`to_char(${payments.paymentDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${payments.paymentDate}, 'YYYY-MM')`);

    return c.json({
      success: true,
      data: result.map(r => ({
        period: r.month,
        amount: Number(r.total || 0),
      })),
    });
  }

  // Daily - last 30 days
  const result = await db
    .select({
      date: sql<string>`${payments.paymentDate}::date`,
      total: sum(payments.amount),
    })
    .from(payments)
    .where(
      and(
        inArray(payments.branchId, branchIds),
        eq(payments.type, 'INCOME'),
        gte(payments.paymentDate, sql`current_date - interval '30 days'`)
      )
    )
    .groupBy(sql`${payments.paymentDate}::date`)
    .orderBy(sql`${payments.paymentDate}::date`);

  return c.json({
    success: true,
    data: result.map(r => ({
      period: r.date,
      amount: Number(r.total || 0),
    })),
  });
});

// Today's classes
app.get('/todays-classes', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const today = new Date().toISOString().split('T')[0];

  const allTenantBranchIds = await getTenantBranchIds(tenantId);
  const branchIds = branchId ? allTenantBranchIds.filter(id => id === branchId) : allTenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const branchCondition = branchIds.length === 1
    ? eq(classSessions.branchId, branchIds[0])
    : inArray(classSessions.branchId, branchIds);

  const sessions = await db
    .select({
      session: classSessions,
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(classSessions)
    .innerJoin(branches, eq(classSessions.branchId, branches.id))
    .where(and(branchCondition, eq(classSessions.sessionDate, today)))
    .orderBy(classSessions.startTime);

  return c.json({
    success: true,
    data: sessions.map(s => ({
      ...s.session,
      branch: s.branch,
    })),
  });
});

// TODO: Lead funnel stats - Enable when leads table is added to schema
// app.get('/lead-funnel', async (c) => {
//   const tenantId = c.get('tenantId')!;
//   ...
// });

// Recent activities
app.get('/recent-activities', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const limit = Math.min(Number(c.req.query('limit')) || 10, 50);

  const allTenantBranchIds = await getTenantBranchIds(tenantId);
  const branchIds = branchId ? allTenantBranchIds.filter(id => id === branchId) : allTenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const branchCondition = branchIds.length === 1
    ? eq(checkIns.branchId, branchIds[0])
    : inArray(checkIns.branchId, branchIds);

  // Get recent check-ins as activities
  const recentCheckIns = await db
    .select({
      id: checkIns.id,
      type: sql<string>`'check_in'`,
      timestamp: checkIns.checkInTime,
      memberName: members.fullName,
      branchName: branches.name,
    })
    .from(checkIns)
    .innerJoin(members, eq(checkIns.memberId, members.id))
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(branchCondition)
    .orderBy(desc(checkIns.checkInTime))
    .limit(limit);

  return c.json({
    success: true,
    data: recentCheckIns.map(a => ({
      id: a.id,
      type: a.type,
      timestamp: a.timestamp,
      description: `${a.memberName} 入場 - ${a.branchName}`,
    })),
  });
});

export default app;
