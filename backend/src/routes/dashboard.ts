import { Hono } from 'hono';
import { db, members, contracts, payments, checkIns, branches, classSessions } from '../db/index.js';
import { eq, and, sql, gte, count, sum, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const DASHBOARD_CLASS_SESSION_SELECT = {
  id: classSessions.id,
  status: classSessions.status,
  createdAt: classSessions.createdAt,
  updatedAt: classSessions.updatedAt,
  scheduleId: classSessions.scheduleId,
  classId: classSessions.classId,
  branchId: classSessions.branchId,
  instructorId: classSessions.instructorId,
  sessionDate: classSessions.sessionDate,
  startTime: classSessions.startTime,
  endTime: classSessions.endTime,
  room: classSessions.room,
  maxCapacity: classSessions.maxCapacity,
  currentCount: classSessions.currentCount,
  waitlistCount: classSessions.waitlistCount,
  sessionStatus: classSessions.sessionStatus,
  cancelledReason: classSessions.cancelledReason,
  cancelledAt: classSessions.cancelledAt,
  cancelledBy: classSessions.cancelledBy,
};
const DASHBOARD_MONTHLY_REVENUE_SELECT = {
  month: sql<string>`to_char(${payments.paymentDate}, 'YYYY-MM')`,
  total: sum(payments.amount),
};

const DASHBOARD_DAILY_REVENUE_SELECT = {
  date: sql<string>`${payments.paymentDate}::date`,
  total: sum(payments.amount),
};

const DASHBOARD_BRANCH_SELECT = {
  id: branches.id,
  name: branches.name,
};

const DASHBOARD_TODAYS_CLASSES_SELECT = {
  session: DASHBOARD_CLASS_SESSION_SELECT,
  branch: DASHBOARD_BRANCH_SELECT,
};

const DASHBOARD_RECENT_ACTIVITIES_SELECT = {
  id: checkIns.id,
  type: sql<string>`'check_in'`,
  timestamp: checkIns.checkInTime,
  memberName: members.fullName,
  branchName: branches.name,
};


const createDashboardMemberStatsSelect = (monthStartIso: string) => ({
  total: count(),
  active: sql<number>`count(*) filter (where ${members.status} = 'ACTIVE')`,
  newThisMonth: sql<number>`count(*) filter (where ${members.createdAt} >= ${monthStartIso}::timestamptz)`,
});

const createDashboardContractStatsSelect = (todayStr: string, sevenDaysFromNow: string) => ({
  active: count(),
  expiringSoon: sql<number>`count(*) filter (where ${contracts.endDate} >= ${todayStr} and ${contracts.endDate} <= ${sevenDaysFromNow})`,
});

const createDashboardRevenueStatsSelect = (monthStartIso: string, lastMonthStartIso: string, lastMonthEndIso: string) => ({
  thisMonth: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentDate} >= ${monthStartIso}::timestamptz THEN ${payments.amount} ELSE 0 END), 0)`,
  lastMonth: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentDate} >= ${lastMonthStartIso}::timestamptz AND ${payments.paymentDate} <= ${lastMonthEndIso}::timestamptz THEN ${payments.amount} ELSE 0 END), 0)`,
});

const createDashboardCheckInStatsSelect = (todayStartIso: string) => ({
  month: count(),
  today: sql<number>`count(*) filter (where ${checkIns.checkInTime} >= ${todayStartIso}::timestamptz)`,
});

app.use('*', requireAuth);
app.use('*', requireTenant);

const buildBranchFilter = (column: any, ids: string[]) =>
  ids.length === 1 ? eq(column, ids[0]) : inArray(column, ids);

// Main dashboard overview
app.get('/overview', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
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
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      .select(createDashboardMemberStatsSelect(monthStartDate.toISOString()))
      .from(members)
      .where(buildBranchFilter(members.branchId, branchIds)),

    // Contract stats (active and expiring soon in a single scan)
    db
      .select(createDashboardContractStatsSelect(todayStr, sevenDaysFromNow))
      .from(contracts)
      .where(
        and(
          buildBranchFilter(contracts.branchId, branchIds),
          eq(contracts.status, 'ACTIVE')
        )
      ),

    // Revenue stats (this month and last month in a single scan)
    db
      .select(createDashboardRevenueStatsSelect(
        monthStartDate.toISOString(),
        lastMonthStartDate.toISOString(),
        lastMonthEndDate.toISOString()
      ))
      .from(payments)
      .where(
        and(
          buildBranchFilter(payments.branchId, branchIds),
          eq(payments.type, 'INCOME'),
          gte(payments.paymentDate, lastMonthStartDate)
        )
      ),

    // Check-in stats (this month and today in a single scan)
    db
      .select(createDashboardCheckInStatsSelect(todayStart.toISOString()))
      .from(checkIns)
      .where(
        and(
          buildBranchFilter(checkIns.branchId, branchIds),
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
      .select(DASHBOARD_MONTHLY_REVENUE_SELECT)
      .from(payments)
      .where(
        and(
          buildBranchFilter(payments.branchId, branchIds),
          eq(payments.type, 'INCOME'),
          gte(payments.paymentDate, sql`current_date - interval '12 months'`)
        )
      )
      .groupBy(sql`to_char(${payments.paymentDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${payments.paymentDate}, 'YYYY-MM')`);

    const data = new Array(result.length);
    for (let i = 0; i < result.length; i++) {
      const r = result[i];
      data[i] = {
        period: r.month,
        amount: Number(r.total || 0),
      };
    }

    return c.json({
      success: true,
      data,
    });
  }

  // Daily - last 30 days
  const result = await db
    .select(DASHBOARD_DAILY_REVENUE_SELECT)
    .from(payments)
    .where(
      and(
        buildBranchFilter(payments.branchId, branchIds),
        eq(payments.type, 'INCOME'),
        gte(payments.paymentDate, sql`current_date - interval '30 days'`)
      )
    )
    .groupBy(sql`${payments.paymentDate}::date`)
    .orderBy(sql`${payments.paymentDate}::date`);

  const data = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    data[i] = {
      period: r.date,
      amount: Number(r.total || 0),
    };
  }

  return c.json({
    success: true,
    data,
  });
});

// Today's classes
app.get('/todays-classes', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const today = new Date().toISOString().slice(0, 10);

  const allTenantBranchIds = await getTenantBranchIds(tenantId);
  const branchIds = branchId ? allTenantBranchIds.filter(id => id === branchId) : allTenantBranchIds;

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const sessions = await db
    .select(DASHBOARD_TODAYS_CLASSES_SELECT)
    .from(classSessions)
    .innerJoin(branches, eq(classSessions.branchId, branches.id))
    .where(and(buildBranchFilter(classSessions.branchId, branchIds), eq(classSessions.sessionDate, today)))
    .orderBy(classSessions.startTime);

  const data = new Array(sessions.length);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    data[i] = {
      ...s.session,
      branch: s.branch,
    };
  }

  return c.json({
    success: true,
    data,
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

  // Get recent check-ins as activities
  const recentCheckIns = await db
    .select(DASHBOARD_RECENT_ACTIVITIES_SELECT)
    .from(checkIns)
    .innerJoin(members, eq(checkIns.memberId, members.id))
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(buildBranchFilter(checkIns.branchId, branchIds))
    .orderBy(desc(checkIns.checkInTime))
    .limit(limit);

  const data = new Array(recentCheckIns.length);
  for (let i = 0; i < recentCheckIns.length; i++) {
    const a = recentCheckIns[i];
    data[i] = {
      id: a.id,
      type: a.type,
      timestamp: a.timestamp,
      description: `${a.memberName} 入場 - ${a.branchName}`,
    };
  }

  return c.json({
    success: true,
    data,
  });
});

export default app;
