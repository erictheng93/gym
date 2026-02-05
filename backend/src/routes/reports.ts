import { Hono } from 'hono';
import { db, members, contracts, payments, branches, checkIns, classSessions, employees, jobTitles, bookings, classReviews, coachMemberAssignments, coachNotes, lessonPlans, classes } from '../db/index.js';
import { eq, and, sql, gte, lte, count, inArray, avg, or, isNotNull } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import {
  generateExcel,
  generateCsv,
  revenueColumns,
  memberGrowthColumns,
  contractExpiryColumns,
  memberActivityColumns,
  branchPerformanceColumns,
  coachPerformanceColumns,
  translateStatus,
} from '../services/export.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

app.get('/revenue', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const startDate = c.req.query('startDate') || c.req.query('start_date') || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  const endDate = c.req.query('endDate') || c.req.query('end_date') || new Date().toISOString().split('T')[0];

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: { total: 0, byBranch: [], byDay: [] } });
  }

  let conditions = [
    inArray(payments.branchId, branchIds),
    gte(payments.paymentDate, new Date(startDate)),
    lte(payments.paymentDate, new Date(endDate)),
    eq(payments.type, 'INCOME'),
  ];

  if (branchId) {
    conditions.push(eq(payments.branchId, branchId));
  }

  const [totalResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(and(...conditions));

  const byBranch = await db
    .select({
      branchId: payments.branchId,
      branchName: branches.name,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .innerJoin(branches, eq(payments.branchId, branches.id))
    .where(and(...conditions))
    .groupBy(payments.branchId, branches.name);

  const byDay = await db
    .select({
      date: sql<string>`DATE(${payments.paymentDate})`,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(...conditions))
    .groupBy(sql`DATE(${payments.paymentDate})`)
    .orderBy(sql`DATE(${payments.paymentDate})`);

  return c.json({
    success: true,
    data: {
      total: Number(totalResult?.total || 0),
      byBranch: byBranch.map(b => ({
        branchId: b.branchId,
        branchName: b.branchName,
        total: Number(b.total),
      })),
      byDay: byDay.map(d => ({
        date: d.date,
        total: Number(d.total),
      })),
    },
  });
});

app.get('/member-growth', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const months = Number(c.req.query('months')) || 6;

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: { total: 0, byMonth: [] } });
  }

  let conditions = [inArray(members.branchId, branchIds)];

  if (branchId) {
    conditions.push(eq(members.branchId, branchId));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(members)
    .where(and(...conditions, eq(members.status, 'ACTIVE')));

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const byMonth = await db
    .select({
      month: sql<string>`TO_CHAR(${members.createdAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(members)
    .where(and(...conditions, gte(members.createdAt, startDate)))
    .groupBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`);

  return c.json({
    success: true,
    data: {
      total: Number(totalResult?.count || 0),
      byMonth: byMonth.map(m => ({
        month: m.month,
        count: Number(m.count),
      })),
    },
  });
});

app.get('/contract-expiry', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const days = Number(c.req.query('days') || c.req.query('days_ahead')) || 30;

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  let conditions = [
    inArray(contracts.branchId, branchIds),
    eq(contracts.status, 'ACTIVE'),
    gte(contracts.endDate, today.toISOString().split('T')[0]),
    lte(contracts.endDate, futureDate.toISOString().split('T')[0]),
  ];

  if (branchId) {
    conditions.push(eq(contracts.branchId, branchId));
  }

  const expiringContracts = await db
    .select({
      contract: contracts,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
        phone: members.phone,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(contracts)
    .innerJoin(members, eq(contracts.memberId, members.id))
    .innerJoin(branches, eq(contracts.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(contracts.endDate);

  return c.json({
    success: true,
    data: expiringContracts.map(c => ({
      ...c.contract,
      member: c.member,
      branch: c.branch,
      daysUntilExpiry: Math.ceil(
        (new Date(c.contract.endDate!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
    })),
  });
});

app.get('/member-activity', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const days = Number(c.req.query('days')) || 30;

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: { totalCheckIns: 0, byBranch: [], byDay: [] } });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let conditions = [
    inArray(checkIns.branchId, branchIds),
    gte(checkIns.checkInTime, startDate),
  ];

  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(checkIns)
    .where(and(...conditions));

  const byBranch = await db
    .select({
      branchId: checkIns.branchId,
      branchName: branches.name,
      count: count(),
      uniqueMembers: sql<number>`COUNT(DISTINCT ${checkIns.memberId})`,
    })
    .from(checkIns)
    .innerJoin(branches, eq(checkIns.branchId, branches.id))
    .where(and(...conditions))
    .groupBy(checkIns.branchId, branches.name);

  const byDay = await db
    .select({
      date: sql<string>`DATE(${checkIns.checkInTime})`,
      count: count(),
    })
    .from(checkIns)
    .where(and(...conditions))
    .groupBy(sql`DATE(${checkIns.checkInTime})`)
    .orderBy(sql`DATE(${checkIns.checkInTime})`);

  return c.json({
    success: true,
    data: {
      totalCheckIns: Number(totalResult?.count || 0),
      byBranch: byBranch.map(b => ({
        branchId: b.branchId,
        branchName: b.branchName,
        checkInCount: Number(b.count),
        uniqueMembers: Number(b.uniqueMembers),
      })),
      byDay: byDay.map(d => ({
        date: d.date,
        count: Number(d.count),
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/revenue/export - Export Revenue Report
// -----------------------------------------------------------------------------

app.get('/revenue/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const startDate = c.req.query('startDate') || c.req.query('start_date') || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  const endDate = c.req.query('endDate') || c.req.query('end_date') || new Date().toISOString().split('T')[0];
  const format = c.req.query('format') || 'csv';

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    const result = generateCsv(revenueColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revenue_report.csv"`,
      },
    });
  }

  let conditions = [
    inArray(payments.branchId, branchIds),
    gte(payments.paymentDate, new Date(startDate)),
    lte(payments.paymentDate, new Date(endDate)),
    eq(payments.type, 'INCOME'),
  ];

  if (branchId) {
    conditions.push(eq(payments.branchId, branchId));
  }

  const byDay = await db
    .select({
      date: sql<string>`DATE(${payments.paymentDate})`,
      branchId: payments.branchId,
      branchName: branches.name,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .innerJoin(branches, eq(payments.branchId, branches.id))
    .where(and(...conditions))
    .groupBy(sql`DATE(${payments.paymentDate})`, payments.branchId, branches.name)
    .orderBy(sql`DATE(${payments.paymentDate})`);

  const exportData = byDay.map(d => ({
    date: d.date,
    branchName: d.branchName || '',
    total: Number(d.total),
  }));

  const filename = `營收報表_${startDate}_${endDate}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(revenueColumns, exportData, '營收報表');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(revenueColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/member-growth/export - Export Member Growth Report
// -----------------------------------------------------------------------------

app.get('/member-growth/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const months = Number(c.req.query('months')) || 6;
  const format = c.req.query('format') || 'csv';

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    const result = generateCsv(memberGrowthColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="member_growth_report.csv"`,
      },
    });
  }

  let conditions = [inArray(members.branchId, branchIds)];

  if (branchId) {
    conditions.push(eq(members.branchId, branchId));
  }

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const byMonth = await db
    .select({
      month: sql<string>`TO_CHAR(${members.createdAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(members)
    .where(and(...conditions, gte(members.createdAt, startDate)))
    .groupBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`);

  const exportData = byMonth.map(m => ({
    month: m.month,
    count: Number(m.count),
  }));

  const filename = `會員成長報表_${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(memberGrowthColumns, exportData, '會員成長報表');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(memberGrowthColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/contract-expiry/export - Export Contract Expiry Report
// -----------------------------------------------------------------------------

app.get('/contract-expiry/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const days = Number(c.req.query('days') || c.req.query('days_ahead')) || 30;
  const format = c.req.query('format') || 'csv';

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    const result = generateCsv(contractExpiryColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="contract_expiry_report.csv"`,
      },
    });
  }

  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  let conditions = [
    inArray(contracts.branchId, branchIds),
    eq(contracts.status, 'ACTIVE'),
    gte(contracts.endDate, today.toISOString().split('T')[0]),
    lte(contracts.endDate, futureDate.toISOString().split('T')[0]),
  ];

  if (branchId) {
    conditions.push(eq(contracts.branchId, branchId));
  }

  const expiringContracts = await db
    .select({
      contract: contracts,
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
        phone: members.phone,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(contracts)
    .innerJoin(members, eq(contracts.memberId, members.id))
    .innerJoin(branches, eq(contracts.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(contracts.endDate);

  const exportData = expiringContracts.map(c => ({
    contractNo: c.contract.contractNo || '',
    memberName: c.member.fullName || '',
    memberCode: c.member.memberCode || '',
    memberPhone: c.member.phone || '',
    branchName: c.branch.name || '',
    endDate: c.contract.endDate || '',
    daysUntilExpiry: Math.ceil(
      (new Date(c.contract.endDate!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    ),
    status: translateStatus(c.contract.status),
  }));

  const filename = `合約到期提醒_${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(contractExpiryColumns, exportData, '合約到期提醒');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(contractExpiryColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/member-activity/export - Export Member Activity Report
// -----------------------------------------------------------------------------

app.get('/member-activity/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const days = Number(c.req.query('days')) || 30;
  const format = c.req.query('format') || 'csv';

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    const result = generateCsv(memberActivityColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="member_activity_report.csv"`,
      },
    });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let conditions = [
    inArray(checkIns.branchId, branchIds),
    gte(checkIns.checkInTime, startDate),
  ];

  if (branchId) {
    conditions.push(eq(checkIns.branchId, branchId));
  }

  const byDay = await db
    .select({
      date: sql<string>`DATE(${checkIns.checkInTime})`,
      count: count(),
    })
    .from(checkIns)
    .where(and(...conditions))
    .groupBy(sql`DATE(${checkIns.checkInTime})`)
    .orderBy(sql`DATE(${checkIns.checkInTime})`);

  const exportData = byDay.map(d => ({
    date: d.date,
    count: Number(d.count),
  }));

  const filename = `會員活躍度報表_${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(memberActivityColumns, exportData, '會員活躍度報表');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(memberActivityColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/branch-performance - Branch Performance Report
// -----------------------------------------------------------------------------

app.get('/branch-performance', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const period = c.req.query('period') || 'month'; // week, month, year
  const compareWithPrevious = c.req.query('compareWithPrevious') !== 'false';

  // Calculate date ranges based on period
  const today = new Date();
  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (period) {
    case 'week':
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    case 'year':
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setFullYear(currentStart.getFullYear() - 1);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setFullYear(previousStart.getFullYear() - 1);
      break;
    case 'month':
    default:
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setMonth(currentStart.getMonth() - 1);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setMonth(previousStart.getMonth() - 1);
      break;
  }

  // Get tenant branches
  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  let branchIds = tenantBranches.map(b => b.id);

  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      period: {
        current: { start: currentStart.toISOString().split('T')[0], end: currentEnd.toISOString().split('T')[0] },
        previous: { start: previousStart.toISOString().split('T')[0], end: previousEnd.toISOString().split('T')[0] },
      },
      summary: {
        total_revenue: 0,
        total_revenue_growth: 0,
        total_new_members: 0,
        total_check_ins: 0,
        total_active_contracts: 0,
      },
      data: [],
      ranking: { by_revenue: [], by_growth: [], by_check_ins: [] },
    });
  }

  // Fetch current period data for all branches
  const [currentRevenue, currentMembers, currentCheckIns, currentContracts] = await Promise.all([
    // Revenue by branch
    db.select({
      branchId: payments.branchId,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(
      inArray(payments.branchId, branchIds),
      eq(payments.type, 'INCOME'),
      gte(payments.paymentDate, currentStart),
      lte(payments.paymentDate, currentEnd)
    ))
    .groupBy(payments.branchId),

    // New members by branch
    db.select({
      branchId: members.branchId,
      count: count(),
    })
    .from(members)
    .where(and(
      inArray(members.branchId, branchIds),
      gte(members.createdAt, currentStart),
      lte(members.createdAt, currentEnd)
    ))
    .groupBy(members.branchId),

    // Check-ins by branch
    db.select({
      branchId: checkIns.branchId,
      count: count(),
    })
    .from(checkIns)
    .where(and(
      inArray(checkIns.branchId, branchIds),
      gte(checkIns.checkInTime, currentStart),
      lte(checkIns.checkInTime, currentEnd)
    ))
    .groupBy(checkIns.branchId),

    // Active contracts by branch
    db.select({
      branchId: contracts.branchId,
      count: count(),
    })
    .from(contracts)
    .where(and(
      inArray(contracts.branchId, branchIds),
      eq(contracts.status, 'ACTIVE')
    ))
    .groupBy(contracts.branchId),
  ]);

  // Fetch previous period data if needed
  let previousRevenue: typeof currentRevenue = [];
  let previousMembers: typeof currentMembers = [];
  let previousCheckIns: typeof currentCheckIns = [];

  if (compareWithPrevious) {
    [previousRevenue, previousMembers, previousCheckIns] = await Promise.all([
      db.select({
        branchId: payments.branchId,
        total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(and(
        inArray(payments.branchId, branchIds),
        eq(payments.type, 'INCOME'),
        gte(payments.paymentDate, previousStart),
        lte(payments.paymentDate, previousEnd)
      ))
      .groupBy(payments.branchId),

      db.select({
        branchId: members.branchId,
        count: count(),
      })
      .from(members)
      .where(and(
        inArray(members.branchId, branchIds),
        gte(members.createdAt, previousStart),
        lte(members.createdAt, previousEnd)
      ))
      .groupBy(members.branchId),

      db.select({
        branchId: checkIns.branchId,
        count: count(),
      })
      .from(checkIns)
      .where(and(
        inArray(checkIns.branchId, branchIds),
        gte(checkIns.checkInTime, previousStart),
        lte(checkIns.checkInTime, previousEnd)
      ))
      .groupBy(checkIns.branchId),
    ]);
  }

  // Build branch data map
  const branchMap = new Map<string, {
    branch_id: string;
    branch_name: string;
    current_period: { revenue: number; new_members: number; check_ins: number; active_contracts: number };
    previous_period: { revenue: number; new_members: number; check_ins: number };
    growth: { revenue_change: number; members_change: number; check_ins_change: number };
  }>();

  // Initialize all branches
  tenantBranches.forEach(b => {
    if (branchIds.includes(b.id)) {
      branchMap.set(b.id, {
        branch_id: b.id,
        branch_name: b.name,
        current_period: { revenue: 0, new_members: 0, check_ins: 0, active_contracts: 0 },
        previous_period: { revenue: 0, new_members: 0, check_ins: 0 },
        growth: { revenue_change: 0, members_change: 0, check_ins_change: 0 },
      });
    }
  });

  // Fill in current period data
  currentRevenue.forEach(r => {
    const branch = branchMap.get(r.branchId);
    if (branch) branch.current_period.revenue = Number(r.total);
  });

  currentMembers.forEach(m => {
    const branch = branchMap.get(m.branchId);
    if (branch) branch.current_period.new_members = Number(m.count);
  });

  currentCheckIns.forEach(c => {
    const branch = branchMap.get(c.branchId);
    if (branch) branch.current_period.check_ins = Number(c.count);
  });

  currentContracts.forEach(c => {
    const branch = branchMap.get(c.branchId);
    if (branch) branch.current_period.active_contracts = Number(c.count);
  });

  // Fill in previous period data
  previousRevenue.forEach(r => {
    const branch = branchMap.get(r.branchId);
    if (branch) branch.previous_period.revenue = Number(r.total);
  });

  previousMembers.forEach(m => {
    const branch = branchMap.get(m.branchId);
    if (branch) branch.previous_period.new_members = Number(m.count);
  });

  previousCheckIns.forEach(c => {
    const branch = branchMap.get(c.branchId);
    if (branch) branch.previous_period.check_ins = Number(c.count);
  });

  // Calculate growth percentages
  const calculateGrowth = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  branchMap.forEach(branch => {
    branch.growth.revenue_change = calculateGrowth(
      branch.current_period.revenue,
      branch.previous_period.revenue
    );
    branch.growth.members_change = calculateGrowth(
      branch.current_period.new_members,
      branch.previous_period.new_members
    );
    branch.growth.check_ins_change = calculateGrowth(
      branch.current_period.check_ins,
      branch.previous_period.check_ins
    );
  });

  // Convert to array and calculate rankings
  const data = Array.from(branchMap.values());

  // Sort for rankings
  const byRevenue = [...data].sort((a, b) => b.current_period.revenue - a.current_period.revenue);
  const byGrowth = [...data].sort((a, b) => b.growth.revenue_change - a.growth.revenue_change);
  const byCheckIns = [...data].sort((a, b) => b.current_period.check_ins - a.current_period.check_ins);

  // Add rank to each item
  const dataWithRank = data.map(d => ({
    ...d,
    rank: byRevenue.findIndex(r => r.branch_id === d.branch_id) + 1,
  }));

  // Calculate totals
  const totalRevenue = data.reduce((sum, d) => sum + d.current_period.revenue, 0);
  const totalPreviousRevenue = data.reduce((sum, d) => sum + d.previous_period.revenue, 0);
  const totalNewMembers = data.reduce((sum, d) => sum + d.current_period.new_members, 0);
  const totalCheckIns = data.reduce((sum, d) => sum + d.current_period.check_ins, 0);
  const totalActiveContracts = data.reduce((sum, d) => sum + d.current_period.active_contracts, 0);

  return c.json({
    success: true,
    period: {
      current: { start: currentStart.toISOString().split('T')[0], end: currentEnd.toISOString().split('T')[0] },
      previous: { start: previousStart.toISOString().split('T')[0], end: previousEnd.toISOString().split('T')[0] },
    },
    summary: {
      total_revenue: totalRevenue,
      total_revenue_growth: calculateGrowth(totalRevenue, totalPreviousRevenue),
      total_new_members: totalNewMembers,
      total_check_ins: totalCheckIns,
      total_active_contracts: totalActiveContracts,
    },
    data: dataWithRank,
    ranking: {
      by_revenue: byRevenue.map((d, i) => ({ branch_id: d.branch_id, branch_name: d.branch_name, value: d.current_period.revenue, rank: i + 1 })),
      by_growth: byGrowth.map((d, i) => ({ branch_id: d.branch_id, branch_name: d.branch_name, value: d.growth.revenue_change, rank: i + 1 })),
      by_check_ins: byCheckIns.map((d, i) => ({ branch_id: d.branch_id, branch_name: d.branch_name, value: d.current_period.check_ins, rank: i + 1 })),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/branch-performance/export - Export Branch Performance Report
// -----------------------------------------------------------------------------

app.get('/branch-performance/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const period = c.req.query('period') || 'month';
  const format = c.req.query('format') || 'csv';

  // Reuse the same logic as branch-performance endpoint
  const today = new Date();
  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (period) {
    case 'week':
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    case 'year':
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setFullYear(currentStart.getFullYear() - 1);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setFullYear(previousStart.getFullYear() - 1);
      break;
    case 'month':
    default:
      currentEnd = new Date(today);
      currentStart = new Date(today);
      currentStart.setMonth(currentStart.getMonth() - 1);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setMonth(previousStart.getMonth() - 1);
      break;
  }

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  let branchIds = tenantBranches.map(b => b.id);
  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    const result = generateCsv(branchPerformanceColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="branch_performance_report.csv"`,
      },
    });
  }

  // Fetch data
  const [currentRevenue, currentMembers, currentCheckIns, currentContracts, previousRevenue] = await Promise.all([
    db.select({
      branchId: payments.branchId,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(
      inArray(payments.branchId, branchIds),
      eq(payments.type, 'INCOME'),
      gte(payments.paymentDate, currentStart),
      lte(payments.paymentDate, currentEnd)
    ))
    .groupBy(payments.branchId),

    db.select({ branchId: members.branchId, count: count() })
    .from(members)
    .where(and(inArray(members.branchId, branchIds), gte(members.createdAt, currentStart), lte(members.createdAt, currentEnd)))
    .groupBy(members.branchId),

    db.select({ branchId: checkIns.branchId, count: count() })
    .from(checkIns)
    .where(and(inArray(checkIns.branchId, branchIds), gte(checkIns.checkInTime, currentStart), lte(checkIns.checkInTime, currentEnd)))
    .groupBy(checkIns.branchId),

    db.select({ branchId: contracts.branchId, count: count() })
    .from(contracts)
    .where(and(inArray(contracts.branchId, branchIds), eq(contracts.status, 'ACTIVE')))
    .groupBy(contracts.branchId),

    db.select({
      branchId: payments.branchId,
      total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(
      inArray(payments.branchId, branchIds),
      eq(payments.type, 'INCOME'),
      gte(payments.paymentDate, previousStart),
      lte(payments.paymentDate, previousEnd)
    ))
    .groupBy(payments.branchId),
  ]);

  // Build export data
  const exportData = tenantBranches
    .filter(b => branchIds.includes(b.id))
    .map(b => {
      const revenue = currentRevenue.find(r => r.branchId === b.id);
      const members = currentMembers.find(m => m.branchId === b.id);
      const checkIns = currentCheckIns.find(c => c.branchId === b.id);
      const contracts = currentContracts.find(c => c.branchId === b.id);
      const prevRevenue = previousRevenue.find(r => r.branchId === b.id);

      const currentRev = Number(revenue?.total || 0);
      const prevRev = Number(prevRevenue?.total || 0);
      const growth = prevRev === 0 ? (currentRev > 0 ? 100 : 0) : ((currentRev - prevRev) / prevRev) * 100;

      return {
        branchName: b.name,
        revenue: currentRev,
        previousRevenue: prevRev,
        revenueGrowth: growth.toFixed(1) + '%',
        newMembers: Number(members?.count || 0),
        checkIns: Number(checkIns?.count || 0),
        activeContracts: Number(contracts?.count || 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const filename = `分店業績報表_${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(branchPerformanceColumns, exportData, '分店業績報表');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(branchPerformanceColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/coach-performance - Coach Performance Report
// -----------------------------------------------------------------------------

app.get('/coach-performance', async (c) => {
  const tenantId = c.get('tenantId')!;
  const coachId = c.req.query('coachId') || c.req.query('coach_id');
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const period = c.req.query('period') || 'month'; // month, quarter, year

  // Calculate date range based on period
  const today = new Date();
  let startDate: Date;
  let endDate: Date = new Date(today);

  switch (period) {
    case 'quarter':
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'year':
      startDate = new Date(today);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'month':
    default:
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  // Get all branches for tenant
  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  let branchIds = tenantBranches.map(b => b.id);
  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      period: { start_date: startDate.toISOString().split('T')[0], end_date: endDate.toISOString().split('T')[0] },
      summary: {
        total_coaches: 0,
        total_classes_taught: 0,
        total_students: 0,
        average_satisfaction: 0,
      },
      data: [],
    });
  }

  // Get coaches (employees with coach role or instructors)
  let coachConditions = [
    inArray(employees.branchId, branchIds),
    eq(employees.status, 'ACTIVE'),
  ];
  if (coachId) {
    coachConditions.push(eq(employees.id, coachId));
  }

  // Get coaches who are instructors (have taught classes)
  const coachesWithClasses = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      branchId: employees.branchId,
      branchName: branches.name,
      jobTitleName: jobTitles.name,
    })
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .innerJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .where(and(...coachConditions));

  // Filter to only those who have taught classes or have coach assignments
  const coachIdList = coachesWithClasses.map(c => c.id);

  if (coachIdList.length === 0) {
    return c.json({
      success: true,
      period: { start_date: startDate.toISOString().split('T')[0], end_date: endDate.toISOString().split('T')[0] },
      summary: {
        total_coaches: 0,
        total_classes_taught: 0,
        total_students: 0,
        average_satisfaction: 0,
      },
      data: [],
    });
  }

  // Fetch all metrics in parallel
  const [
    classesCount,
    studentsCount,
    reviewsData,
    bookingStats,
    notesCount,
    lessonPlansCount,
    classesByCategory,
  ] = await Promise.all([
    // Classes taught (completed sessions)
    db.select({
      instructorId: classSessions.instructorId,
      count: count(),
    })
    .from(classSessions)
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().split('T')[0]),
      lte(classSessions.sessionDate, endDate.toISOString().split('T')[0])
    ))
    .groupBy(classSessions.instructorId),

    // Students count (distinct members assigned to coach)
    db.select({
      coachId: coachMemberAssignments.coachId,
      count: sql<number>`COUNT(DISTINCT ${coachMemberAssignments.memberId})`,
    })
    .from(coachMemberAssignments)
    .where(and(
      inArray(coachMemberAssignments.coachId, coachIdList),
      or(
        sql`${coachMemberAssignments.unassignedAt} IS NULL`,
        gte(coachMemberAssignments.unassignedAt, startDate)
      )
    ))
    .groupBy(coachMemberAssignments.coachId),

    // Reviews (average rating and count)
    db.select({
      instructorId: classSessions.instructorId,
      avgRating: avg(classReviews.rating),
      reviewCount: count(),
    })
    .from(classReviews)
    .innerJoin(classSessions, eq(classReviews.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classReviews.createdAt, startDate),
      lte(classReviews.createdAt, endDate)
    ))
    .groupBy(classSessions.instructorId),

    // Booking stats (attendance rate)
    db.select({
      instructorId: classSessions.instructorId,
      attended: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'ATTENDED')`,
      noShow: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'NO_SHOW')`,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classSessions.sessionDate, startDate.toISOString().split('T')[0]),
      lte(classSessions.sessionDate, endDate.toISOString().split('T')[0])
    ))
    .groupBy(classSessions.instructorId),

    // Notes created
    db.select({
      coachId: coachNotes.coachId,
      count: count(),
    })
    .from(coachNotes)
    .where(and(
      inArray(coachNotes.coachId, coachIdList),
      gte(coachNotes.createdAt, startDate),
      lte(coachNotes.createdAt, endDate)
    ))
    .groupBy(coachNotes.coachId),

    // Lesson plans created
    db.select({
      coachId: lessonPlans.coachId,
      count: count(),
    })
    .from(lessonPlans)
    .where(and(
      inArray(lessonPlans.coachId, coachIdList),
      gte(lessonPlans.createdAt, startDate),
      lte(lessonPlans.createdAt, endDate)
    ))
    .groupBy(lessonPlans.coachId),

    // Classes by category
    db.select({
      instructorId: classSessions.instructorId,
      category: classes.category,
      count: count(),
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().split('T')[0]),
      lte(classSessions.sessionDate, endDate.toISOString().split('T')[0])
    ))
    .groupBy(classSessions.instructorId, classes.category),
  ]);

  // Build coach data
  const coachData = coachesWithClasses.map(coach => {
    const classCount = classesCount.find(c => c.instructorId === coach.id);
    const studentCount = studentsCount.find(s => s.coachId === coach.id);
    const reviews = reviewsData.find(r => r.instructorId === coach.id);
    const booking = bookingStats.find(b => b.instructorId === coach.id);
    const notes = notesCount.find(n => n.coachId === coach.id);
    const plans = lessonPlansCount.find(p => p.coachId === coach.id);
    const categories = classesByCategory.filter(c => c.instructorId === coach.id);

    const attended = Number(booking?.attended || 0);
    const noShow = Number(booking?.noShow || 0);
    const attendanceRate = attended + noShow > 0
      ? (attended / (attended + noShow)) * 100
      : 0;

    return {
      coach_id: coach.id,
      coach_name: coach.fullName,
      coach_code: coach.employeeCode,
      branch_id: coach.branchId,
      branch_name: coach.branchName,
      job_title: coach.jobTitleName,
      metrics: {
        classes_taught: Number(classCount?.count || 0),
        total_students: Number(studentCount?.count || 0),
        satisfaction_rating: reviews?.avgRating ? Number(Number(reviews.avgRating).toFixed(1)) : null,
        review_count: Number(reviews?.reviewCount || 0),
        renewal_rate: null, // Would need more complex calculation
        attendance_rate: Number(attendanceRate.toFixed(1)),
        notes_created: Number(notes?.count || 0),
        lesson_plans_created: Number(plans?.count || 0),
      },
      details: {
        classes_by_category: categories.map(c => ({
          category: c.category,
          count: Number(c.count),
        })),
      },
    };
  });

  // Filter out coaches with no activity if no specific coach requested
  const filteredData = coachId
    ? coachData
    : coachData.filter(c =>
        c.metrics.classes_taught > 0 ||
        c.metrics.total_students > 0 ||
        c.metrics.notes_created > 0 ||
        c.metrics.lesson_plans_created > 0
      );

  // Calculate summary
  const totalCoaches = filteredData.length;
  const totalClasses = filteredData.reduce((sum, c) => sum + c.metrics.classes_taught, 0);
  const totalStudents = filteredData.reduce((sum, c) => sum + c.metrics.total_students, 0);
  const ratingsWithValues = filteredData.filter(c => c.metrics.satisfaction_rating !== null);
  const avgSatisfaction = ratingsWithValues.length > 0
    ? ratingsWithValues.reduce((sum, c) => sum + (c.metrics.satisfaction_rating || 0), 0) / ratingsWithValues.length
    : 0;

  return c.json({
    success: true,
    period: { start_date: startDate.toISOString().split('T')[0], end_date: endDate.toISOString().split('T')[0] },
    summary: {
      total_coaches: totalCoaches,
      total_classes_taught: totalClasses,
      total_students: totalStudents,
      average_satisfaction: Number(avgSatisfaction.toFixed(1)),
    },
    data: filteredData,
  });
});

// -----------------------------------------------------------------------------
// GET /api/reports/coach-performance/export - Export Coach Performance Report
// -----------------------------------------------------------------------------

app.get('/coach-performance/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const coachId = c.req.query('coachId') || c.req.query('coach_id');
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const period = c.req.query('period') || 'month';
  const format = c.req.query('format') || 'csv';

  // Calculate date range
  const today = new Date();
  let startDate: Date;
  let endDate: Date = new Date(today);

  switch (period) {
    case 'quarter':
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'year':
      startDate = new Date(today);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'month':
    default:
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const tenantBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  let branchIds = tenantBranches.map(b => b.id);
  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    if (format === 'xlsx' || format === 'excel') {
      const result = await generateExcel(coachPerformanceColumns, [], '教練績效報表');
      return new Response(result.buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="coach_performance_report.xlsx"`,
        },
      });
    }
    const result = generateCsv(coachPerformanceColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="coach_performance_report.csv"`,
      },
    });
  }

  let coachConditions = [
    inArray(employees.branchId, branchIds),
    eq(employees.status, 'ACTIVE'),
  ];
  if (coachId) {
    coachConditions.push(eq(employees.id, coachId));
  }

  const coachesWithClasses = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      branchId: employees.branchId,
      branchName: branches.name,
    })
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .where(and(...coachConditions));

  const coachIdList = coachesWithClasses.map(c => c.id);

  if (coachIdList.length === 0) {
    if (format === 'xlsx' || format === 'excel') {
      const result = await generateExcel(coachPerformanceColumns, [], '教練績效報表');
      return new Response(result.buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="coach_performance_report.xlsx"`,
        },
      });
    }
    const result = generateCsv(coachPerformanceColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="coach_performance_report.csv"`,
      },
    });
  }

  // Fetch metrics
  const [classesCount, studentsCount, reviewsData, bookingStats] = await Promise.all([
    db.select({
      instructorId: classSessions.instructorId,
      count: count(),
    })
    .from(classSessions)
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().split('T')[0]),
      lte(classSessions.sessionDate, endDate.toISOString().split('T')[0])
    ))
    .groupBy(classSessions.instructorId),

    db.select({
      coachId: coachMemberAssignments.coachId,
      count: sql<number>`COUNT(DISTINCT ${coachMemberAssignments.memberId})`,
    })
    .from(coachMemberAssignments)
    .where(and(
      inArray(coachMemberAssignments.coachId, coachIdList),
      or(
        sql`${coachMemberAssignments.unassignedAt} IS NULL`,
        gte(coachMemberAssignments.unassignedAt, startDate)
      )
    ))
    .groupBy(coachMemberAssignments.coachId),

    db.select({
      instructorId: classSessions.instructorId,
      avgRating: avg(classReviews.rating),
      reviewCount: count(),
    })
    .from(classReviews)
    .innerJoin(classSessions, eq(classReviews.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classReviews.createdAt, startDate),
      lte(classReviews.createdAt, endDate)
    ))
    .groupBy(classSessions.instructorId),

    db.select({
      instructorId: classSessions.instructorId,
      attended: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'ATTENDED')`,
      noShow: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'NO_SHOW')`,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classSessions.sessionDate, startDate.toISOString().split('T')[0]),
      lte(classSessions.sessionDate, endDate.toISOString().split('T')[0])
    ))
    .groupBy(classSessions.instructorId),
  ]);

  // Build export data
  const exportData = coachesWithClasses.map(coach => {
    const classCount = classesCount.find(c => c.instructorId === coach.id);
    const studentCount = studentsCount.find(s => s.coachId === coach.id);
    const reviews = reviewsData.find(r => r.instructorId === coach.id);
    const booking = bookingStats.find(b => b.instructorId === coach.id);

    const attended = Number(booking?.attended || 0);
    const noShow = Number(booking?.noShow || 0);
    const attendanceRate = attended + noShow > 0
      ? (attended / (attended + noShow)) * 100
      : 0;

    return {
      coachName: coach.fullName,
      coachCode: coach.employeeCode,
      branchName: coach.branchName,
      classesTaught: Number(classCount?.count || 0),
      totalStudents: Number(studentCount?.count || 0),
      satisfactionRating: reviews?.avgRating ? Number(Number(reviews.avgRating).toFixed(1)) : '-',
      reviewCount: Number(reviews?.reviewCount || 0),
      attendanceRate: attendanceRate.toFixed(1) + '%',
    };
  }).filter(c => c.classesTaught > 0 || c.totalStudents > 0);

  const filename = `教練績效報表_${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(coachPerformanceColumns, exportData, '教練績效報表');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const result = generateCsv(coachPerformanceColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

export default app;
