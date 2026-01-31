import { Hono } from 'hono';
import { db, members, contracts, payments, checkIns, branches, classSessions } from '../db/index.js';
import { eq, and, sql, gte, lte, count, sum, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

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
  const branchConditions = [eq(branches.tenantId, tenantId)];
  if (branchId) {
    branchConditions.push(eq(branches.id, branchId));
  }

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(...branchConditions));

  const branchIds = tenantBranches.map(b => b.id);

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

  // Member stats
  const [memberStats] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${members.status} = 'ACTIVE')`,
    })
    .from(members)
    .where(inArray(members.branchId, branchIds));

  const [newMembersThisMonth] = await db
    .select({ count: count() })
    .from(members)
    .where(
      and(
        inArray(members.branchId, branchIds),
        gte(members.createdAt, monthStartDate)
      )
    );

  // Contract stats
  const [contractStats] = await db
    .select({
      active: count(),
    })
    .from(contracts)
    .where(
      and(
        inArray(contracts.branchId, branchIds),
        eq(contracts.status, 'ACTIVE')
      )
    );

  // Contracts expiring in 7 days
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [expiringContracts] = await db
    .select({ count: count() })
    .from(contracts)
    .where(
      and(
        inArray(contracts.branchId, branchIds),
        eq(contracts.status, 'ACTIVE'),
        gte(contracts.endDate, todayStr),
        lte(contracts.endDate, sevenDaysFromNow)
      )
    );

  // Revenue stats
  const [thisMonthRevenue] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        inArray(payments.branchId, branchIds),
        eq(payments.paymentType, 'INCOME'),
        gte(payments.paymentDate, monthStartDate)
      )
    );

  const [lastMonthRevenue] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        inArray(payments.branchId, branchIds),
        eq(payments.paymentType, 'INCOME'),
        gte(payments.paymentDate, lastMonthStartDate),
        lte(payments.paymentDate, lastMonthEndDate)
      )
    );

  const thisMonthTotal = Number(thisMonthRevenue?.total || 0);
  const lastMonthTotal = Number(lastMonthRevenue?.total || 0);
  const revenueGrowth = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1)
    : '0.0';

  // Check-in stats
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const [todayCheckIns] = await db
    .select({ count: count() })
    .from(checkIns)
    .where(
      and(
        inArray(checkIns.branchId, branchIds),
        gte(checkIns.checkInTime, todayStart)
      )
    );

  const [monthCheckIns] = await db
    .select({ count: count() })
    .from(checkIns)
    .where(
      and(
        inArray(checkIns.branchId, branchIds),
        gte(checkIns.checkInTime, monthStartDate)
      )
    );

  return c.json({
    success: true,
    data: {
      members: {
        total: Number(memberStats?.total || 0),
        active: Number(memberStats?.active || 0),
        newThisMonth: Number(newMembersThisMonth?.count || 0),
      },
      contracts: {
        active: Number(contractStats?.active || 0),
        expiringSoon: Number(expiringContracts?.count || 0),
      },
      revenue: {
        thisMonth: thisMonthTotal,
        lastMonth: lastMonthTotal,
        growth: parseFloat(revenueGrowth),
      },
      checkIns: {
        today: Number(todayCheckIns?.count || 0),
        thisMonth: Number(monthCheckIns?.count || 0),
      },
    },
  });
});

// Revenue trend (last 30 days or by month)
app.get('/revenue-trend', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');
  const period = c.req.query('period') || 'daily'; // 'daily' or 'monthly'

  const branchConditions = [eq(branches.tenantId, tenantId)];
  if (branchId) {
    branchConditions.push(eq(branches.id, branchId));
  }

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(...branchConditions));

  const branchIds = tenantBranches.map(b => b.id);

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
          eq(payments.paymentType, 'INCOME'),
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
        eq(payments.paymentType, 'INCOME'),
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

  const conditions = [
    eq(branches.tenantId, tenantId),
    eq(classSessions.sessionDate, today),
  ];

  if (branchId) {
    conditions.push(eq(classSessions.branchId, branchId));
  }

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
    .where(and(...conditions))
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

  const conditions = [eq(branches.tenantId, tenantId)];
  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

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
    .where(and(...conditions))
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
