import { Hono } from 'hono';
import { db, members, contracts, payments, branches, checkIns, classSessions, employees, jobTitles, bookings, classReviews, coachMemberAssignments, coachNotes, lessonPlans, classes } from '../db/index.js';
import { eq, and, sql, gte, lte, count, inArray, avg, or, isNotNull } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranches, getTenantBranchIds } from '../utils/tenant-cache.js';
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

const REPORT_EXPIRING_CONTRACT_SELECT = {
  id: contracts.id,
  contractNo: contracts.contractNo,
  memberId: contracts.memberId,
  planId: contracts.planId,
  branchId: contracts.branchId,
  salesPersonId: contracts.salesPersonId,
  status: contracts.status,
  signDate: contracts.signDate,
  startDate: contracts.startDate,
  originalEndDate: contracts.originalEndDate,
  endDate: contracts.endDate,
  remainingCounts: contracts.remainingCounts,
  totalAmount: contracts.totalAmount,
  paidAmount: contracts.paidAmount,
  paymentStatus: contracts.paymentStatus,
  notes: contracts.notes,
  createdBy: contracts.createdBy,
  createdAt: contracts.createdAt,
  updatedAt: contracts.updatedAt,
  tenantId: contracts.tenantId,
};

const REPORT_EXPIRING_MEMBER_SELECT = {
  id: members.id,
  fullName: members.fullName,
  memberCode: members.memberCode,
  phone: members.phone,
};

const REPORT_EXPIRING_BRANCH_SELECT = {
  id: branches.id,
  name: branches.name,
};

const REPORT_EXPIRING_EXPORT_CONTRACT_SELECT = {
  contractNo: contracts.contractNo,
  endDate: contracts.endDate,
  status: contracts.status,
};

const REPORT_REVENUE_BY_BRANCH_SELECT = {
  branchId: payments.branchId,
  branchName: branches.name,
  total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
};

const REPORT_REVENUE_BY_DAY_SELECT = {
  date: sql<string>`DATE(${payments.paymentDate})`,
  total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
};

const REPORT_BRANCH_REVENUE_SELECT = {
  branchId: payments.branchId,
  total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
};

const REPORT_BRANCH_MEMBERS_COUNT_SELECT = {
  branchId: members.branchId,
  count: count(),
};

const REPORT_BRANCH_CHECKINS_COUNT_SELECT = {
  branchId: checkIns.branchId,
  count: count(),
};

const REPORT_BRANCH_CONTRACTS_COUNT_SELECT = {
  branchId: contracts.branchId,
  count: count(),
};

const REPORT_COACH_COMPLETED_SESSIONS_SELECT = {
  instructorId: classSessions.instructorId,
  count: count(),
};

const REPORT_COACH_STUDENTS_COUNT_SELECT = {
  coachId: coachMemberAssignments.coachId,
  count: sql<number>`COUNT(DISTINCT ${coachMemberAssignments.memberId})`,
};

const REPORT_COACH_REVIEWS_SELECT = {
  instructorId: classReviews.coachId,
  avgRating: avg(classReviews.rating),
  reviewCount: count(),
};

const REPORT_COACH_BOOKING_STATS_SELECT = {
  instructorId: classSessions.instructorId,
  attended: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'ATTENDED')`,
  noShow: sql<number>`COUNT(*) FILTER (WHERE ${bookings.bookingStatus} = 'NO_SHOW')`,
};

const REPORT_COACH_NOTES_COUNT_SELECT = {
  coachId: coachNotes.coachId,
  count: count(),
};

const REPORT_COACH_LESSON_PLANS_COUNT_SELECT = {
  coachId: lessonPlans.coachId,
  count: count(),
};

const REPORT_COACH_CLASSES_BY_CATEGORY_SELECT = {
  instructorId: classSessions.instructorId,
  category: classes.category,
  count: count(),
};

const REPORT_MEMBER_GROWTH_TOTAL_SELECT = {
  count: count(),
};

const REPORT_MEMBER_GROWTH_BY_MONTH_SELECT = {
  month: sql<string>`TO_CHAR(${members.createdAt}, 'YYYY-MM')`,
  count: count(),
};

const REPORT_EXPIRING_JOIN_SELECT = {
  contract: REPORT_EXPIRING_CONTRACT_SELECT,
  member: REPORT_EXPIRING_MEMBER_SELECT,
  branch: REPORT_EXPIRING_BRANCH_SELECT,
};

const REPORT_EXPIRING_EXPORT_JOIN_SELECT = {
  contract: REPORT_EXPIRING_EXPORT_CONTRACT_SELECT,
  member: REPORT_EXPIRING_MEMBER_SELECT,
  branch: REPORT_EXPIRING_BRANCH_SELECT,
};

const REPORT_MEMBER_ACTIVITY_BY_BRANCH_SELECT = {
  branchId: checkIns.branchId,
  branchName: branches.name,
  count: count(),
  uniqueMembers: sql<number>`COUNT(DISTINCT ${checkIns.memberId})`,
};

const REPORT_MEMBER_ACTIVITY_BY_DAY_SELECT = {
  date: sql<string>`DATE(${checkIns.checkInTime})`,
  count: count(),
};

const REPORT_REVENUE_EXPORT_BY_DAY_SELECT = {
  date: sql<string>`DATE(${payments.paymentDate})`,
  branchId: payments.branchId,
  branchName: branches.name,
  total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
};

const REPORT_COACH_EMPLOYEES_SELECT = {
  id: employees.id,
  fullName: employees.fullName,
  employeeCode: employees.employeeCode,
  branchId: employees.branchId,
  branchName: branches.name,
  jobTitleName: jobTitles.name,
};

const REPORT_COACH_EXPORT_EMPLOYEES_SELECT = {
  id: employees.id,
  fullName: employees.fullName,
  employeeCode: employees.employeeCode,
  branchId: employees.branchId,
  branchName: branches.name,
};

app.use('*', requireAuth);
app.use('*', requireTenant);

app.get('/revenue', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId') || c.req.query('branch_id');
  const startDate = c.req.query('startDate') || c.req.query('start_date') || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const endDate = c.req.query('endDate') || c.req.query('end_date') || new Date().toISOString().slice(0, 10);

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    return c.json({ success: true, data: { total: 0, byBranch: [], byDay: [] } });
  }

  const branchCondition = branchId
    ? eq(payments.branchId, branchId)
    : inArray(payments.branchId, branchIds);

  const conditions = [
    branchCondition,
    gte(payments.paymentDate, new Date(startDate)),
    lte(payments.paymentDate, new Date(endDate)),
    eq(payments.type, 'INCOME'),
  ];

  const [byBranch, byDay] = await Promise.all([
    db
      .select(REPORT_REVENUE_BY_BRANCH_SELECT)
      .from(payments)
      .innerJoin(branches, eq(payments.branchId, branches.id))
      .where(and(...conditions))
      .groupBy(payments.branchId, branches.name),
    db
      .select(REPORT_REVENUE_BY_DAY_SELECT)
      .from(payments)
      .where(and(...conditions))
      .groupBy(sql`DATE(${payments.paymentDate})`)
      .orderBy(sql`DATE(${payments.paymentDate})`),
  ]);

  let total = 0;
  const mappedByBranch = new Array(byBranch.length);
  for (let i = 0; i < byBranch.length; i++) {
    const b = byBranch[i];
    const branchTotal = Number(b.total);
    total += branchTotal;
    mappedByBranch[i] = {
      branchId: b.branchId,
      branchName: b.branchName,
      total: branchTotal,
    };
  }

  return c.json({
    success: true,
    data: {
      total,
      byBranch: mappedByBranch,
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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    return c.json({ success: true, data: { total: 0, byMonth: [] } });
  }

  const branchCondition = branchId
    ? eq(members.branchId, branchId)
    : inArray(members.branchId, branchIds);

  const conditions = [branchCondition];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const [[totalResult], byMonth] = await Promise.all([
    db
      .select(REPORT_MEMBER_GROWTH_TOTAL_SELECT)
      .from(members)
      .where(and(...conditions, eq(members.status, 'ACTIVE'))),
    db
      .select(REPORT_MEMBER_GROWTH_BY_MONTH_SELECT)
      .from(members)
      .where(and(...conditions, gte(members.createdAt, startDate)))
      .groupBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`),
  ]);

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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    return c.json({ success: true, data: [] });
  }

  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  const branchCondition = branchId
    ? eq(contracts.branchId, branchId)
    : inArray(contracts.branchId, branchIds);

  const conditions = [
    branchCondition,
    eq(contracts.status, 'ACTIVE'),
    gte(contracts.endDate, today.toISOString().slice(0, 10)),
    lte(contracts.endDate, futureDate.toISOString().slice(0, 10)),
  ];

  const expiringContracts = await db
    .select(REPORT_EXPIRING_JOIN_SELECT)
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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    return c.json({ success: true, data: { totalCheckIns: 0, byBranch: [], byDay: [] } });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const branchCondition = branchId
    ? eq(checkIns.branchId, branchId)
    : inArray(checkIns.branchId, branchIds);

  const conditions = [
    branchCondition,
    gte(checkIns.checkInTime, startDate),
  ];

  const [byBranch, byDay] = await Promise.all([
    db
      .select(REPORT_MEMBER_ACTIVITY_BY_BRANCH_SELECT)
      .from(checkIns)
      .innerJoin(branches, eq(checkIns.branchId, branches.id))
      .where(and(...conditions))
      .groupBy(checkIns.branchId, branches.name),
    db
      .select(REPORT_MEMBER_ACTIVITY_BY_DAY_SELECT)
      .from(checkIns)
      .where(and(...conditions))
      .groupBy(sql`DATE(${checkIns.checkInTime})`)
      .orderBy(sql`DATE(${checkIns.checkInTime})`),
  ]);

  let totalCheckIns = 0;
  const mappedByBranch = new Array(byBranch.length);
  for (let i = 0; i < byBranch.length; i++) {
    const b = byBranch[i];
    const count = Number(b.count);
    totalCheckIns += count;
    mappedByBranch[i] = {
      branchId: b.branchId,
      branchName: b.branchName,
      checkInCount: count,
      uniqueMembers: Number(b.uniqueMembers),
    };
  }

  return c.json({
    success: true,
    data: {
      totalCheckIns,
      byBranch: mappedByBranch,
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
    return d.toISOString().slice(0, 10);
  })();
  const endDate = c.req.query('endDate') || c.req.query('end_date') || new Date().toISOString().slice(0, 10);
  const format = c.req.query('format') || 'csv';

  const tenantBranches = await getTenantBranches(tenantId);
  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    const result = generateCsv(revenueColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revenue_report.csv"`,
      },
    });
  }

  const branchCondition = branchId
    ? eq(payments.branchId, branchId)
    : inArray(payments.branchId, branchIds);

  const conditions = [
    branchCondition,
    gte(payments.paymentDate, new Date(startDate)),
    lte(payments.paymentDate, new Date(endDate)),
    eq(payments.type, 'INCOME'),
  ];

  const byDay = await db
    .select(REPORT_REVENUE_EXPORT_BY_DAY_SELECT)
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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
    const result = generateCsv(memberGrowthColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="member_growth_report.csv"`,
      },
    });
  }

  const branchCondition = branchId
    ? eq(members.branchId, branchId)
    : inArray(members.branchId, branchIds);

  const conditions = [branchCondition];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const byMonth = await db
    .select(REPORT_MEMBER_GROWTH_BY_MONTH_SELECT)
    .from(members)
    .where(and(...conditions, gte(members.createdAt, startDate)))
    .groupBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${members.createdAt}, 'YYYY-MM')`);

  const exportData = byMonth.map(m => ({
    month: m.month,
    count: Number(m.count),
  }));

  const filename = `會員成長報表_${new Date().toISOString().slice(0, 10)}`;

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

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
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

  const branchCondition = branchId
    ? eq(contracts.branchId, branchId)
    : inArray(contracts.branchId, branchIds);

  const conditions = [
    branchCondition,
    eq(contracts.status, 'ACTIVE'),
    gte(contracts.endDate, today.toISOString().slice(0, 10)),
    lte(contracts.endDate, futureDate.toISOString().slice(0, 10)),
  ];

  const expiringContracts = await db
    .select(REPORT_EXPIRING_EXPORT_JOIN_SELECT)
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

  const filename = `合約到期提醒_${new Date().toISOString().slice(0, 10)}`;

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

  const tenantBranches = await getTenantBranches(tenantId);
  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId))) {
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

  const branchCondition = branchId
    ? eq(checkIns.branchId, branchId)
    : inArray(checkIns.branchId, branchIds);

  const conditions = [
    branchCondition,
    gte(checkIns.checkInTime, startDate),
  ];

  const byDay = await db
    .select(REPORT_MEMBER_ACTIVITY_BY_DAY_SELECT)
    .from(checkIns)
    .where(and(...conditions))
    .groupBy(sql`DATE(${checkIns.checkInTime})`)
    .orderBy(sql`DATE(${checkIns.checkInTime})`);

  const exportData = byDay.map(d => ({
    date: d.date,
    count: Number(d.count),
  }));

  const filename = `會員活躍度報表_${new Date().toISOString().slice(0, 10)}`;

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
  const tenantBranches = await getTenantBranches(tenantId);
  let branchIds = tenantBranches.map(b => b.id);

  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      period: {
        current: { start: currentStart.toISOString().slice(0, 10), end: currentEnd.toISOString().slice(0, 10) },
        previous: { start: previousStart.toISOString().slice(0, 10), end: previousEnd.toISOString().slice(0, 10) },
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

  // Fetch current period data and optional previous period data concurrently
  const [
    currentRevenue,
    currentMembers,
    currentCheckIns,
    currentContracts,
    previousRevenue,
    previousMembers,
    previousCheckIns,
  ] = await Promise.all([
    // Revenue by branch
    db.select(REPORT_BRANCH_REVENUE_SELECT)
    .from(payments)
    .where(and(
      inArray(payments.branchId, branchIds),
      eq(payments.type, 'INCOME'),
      gte(payments.paymentDate, currentStart),
      lte(payments.paymentDate, currentEnd)
    ))
    .groupBy(payments.branchId),

    // New members by branch
    db.select(REPORT_BRANCH_MEMBERS_COUNT_SELECT)
    .from(members)
    .where(and(
      inArray(members.branchId, branchIds),
      gte(members.createdAt, currentStart),
      lte(members.createdAt, currentEnd)
    ))
    .groupBy(members.branchId),

    // Check-ins by branch
    db.select(REPORT_BRANCH_CHECKINS_COUNT_SELECT)
    .from(checkIns)
    .where(and(
      inArray(checkIns.branchId, branchIds),
      gte(checkIns.checkInTime, currentStart),
      lte(checkIns.checkInTime, currentEnd)
    ))
    .groupBy(checkIns.branchId),

    // Active contracts by branch
    db.select(REPORT_BRANCH_CONTRACTS_COUNT_SELECT)
    .from(contracts)
    .where(and(
      inArray(contracts.branchId, branchIds),
      eq(contracts.status, 'ACTIVE')
    ))
    .groupBy(contracts.branchId),

    // Previous period revenue
    compareWithPrevious
      ? db.select(REPORT_BRANCH_REVENUE_SELECT)
        .from(payments)
        .where(and(
          inArray(payments.branchId, branchIds),
          eq(payments.type, 'INCOME'),
          gte(payments.paymentDate, previousStart),
          lte(payments.paymentDate, previousEnd)
        ))
        .groupBy(payments.branchId)
      : Promise.resolve([]),

    // Previous period new members
    compareWithPrevious
      ? db.select(REPORT_BRANCH_MEMBERS_COUNT_SELECT)
        .from(members)
        .where(and(
          inArray(members.branchId, branchIds),
          gte(members.createdAt, previousStart),
          lte(members.createdAt, previousEnd)
        ))
        .groupBy(members.branchId)
      : Promise.resolve([]),

    // Previous period check-ins
    compareWithPrevious
      ? db.select(REPORT_BRANCH_CHECKINS_COUNT_SELECT)
        .from(checkIns)
        .where(and(
          inArray(checkIns.branchId, branchIds),
          gte(checkIns.checkInTime, previousStart),
          lte(checkIns.checkInTime, previousEnd)
        ))
        .groupBy(checkIns.branchId)
      : Promise.resolve([]),
  ]);

  // Build branch data map
  const branchMap = new Map<string, {
    branch_id: string;
    branch_name: string;
    current_period: { revenue: number; new_members: number; check_ins: number; active_contracts: number };
    previous_period: { revenue: number; new_members: number; check_ins: number };
    growth: { revenue_change: number; members_change: number; check_ins_change: number };
  }>();

  // Initialize all branches
  const branchIdSet = new Set(branchIds);
  tenantBranches.forEach(b => {
    if (branchIdSet.has(b.id)) {
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

  // Pre-index revenue rank for O(1) lookups
  const rankMap = new Map<string, number>();
  for (let i = 0; i < byRevenue.length; i++) {
    rankMap.set(byRevenue[i].branch_id, i + 1);
  }

  // Add rank to each item and calculate totals in a single pass
  let totalRevenue = 0;
  let totalPreviousRevenue = 0;
  let totalNewMembers = 0;
  let totalCheckIns = 0;
  let totalActiveContracts = 0;

  const dataWithRank = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    totalRevenue += d.current_period.revenue;
    totalPreviousRevenue += d.previous_period.revenue;
    totalNewMembers += d.current_period.new_members;
    totalCheckIns += d.current_period.check_ins;
    totalActiveContracts += d.current_period.active_contracts;

    dataWithRank[i] = {
      ...d,
      rank: rankMap.get(d.branch_id) || 1,
    };
  }

  return c.json({
    success: true,
    period: {
      current: { start: currentStart.toISOString().slice(0, 10), end: currentEnd.toISOString().slice(0, 10) },
      previous: { start: previousStart.toISOString().slice(0, 10), end: previousEnd.toISOString().slice(0, 10) },
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

  const tenantBranches = await getTenantBranches(tenantId);
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
    db.select(REPORT_BRANCH_REVENUE_SELECT)
    .from(payments)
    .where(and(
      inArray(payments.branchId, branchIds),
      eq(payments.type, 'INCOME'),
      gte(payments.paymentDate, currentStart),
      lte(payments.paymentDate, currentEnd)
    ))
    .groupBy(payments.branchId),

    db.select(REPORT_BRANCH_MEMBERS_COUNT_SELECT)
    .from(members)
    .where(and(inArray(members.branchId, branchIds), gte(members.createdAt, currentStart), lte(members.createdAt, currentEnd)))
    .groupBy(members.branchId),

    db.select(REPORT_BRANCH_CHECKINS_COUNT_SELECT)
    .from(checkIns)
    .where(and(inArray(checkIns.branchId, branchIds), gte(checkIns.checkInTime, currentStart), lte(checkIns.checkInTime, currentEnd)))
    .groupBy(checkIns.branchId),

    db.select(REPORT_BRANCH_CONTRACTS_COUNT_SELECT)
    .from(contracts)
    .where(and(inArray(contracts.branchId, branchIds), eq(contracts.status, 'ACTIVE')))
    .groupBy(contracts.branchId),

    db.select(REPORT_BRANCH_REVENUE_SELECT)
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
  const revenueMap = new Map(currentRevenue.map(r => [r.branchId, Number(r.total)]));
  const membersMap = new Map(currentMembers.map(m => [m.branchId, Number(m.count)]));
  const checkInsMap = new Map(currentCheckIns.map(c => [c.branchId, Number(c.count)]));
  const contractsMap = new Map(currentContracts.map(c => [c.branchId, Number(c.count)]));
  const prevRevenueMap = new Map(previousRevenue.map(r => [r.branchId, Number(r.total)]));
  const branchIdSet = new Set(branchIds);

  const exportData = tenantBranches
    .filter(b => branchIdSet.has(b.id))
    .map(b => {
      const currentRev = revenueMap.get(b.id) || 0;
      const prevRev = prevRevenueMap.get(b.id) || 0;
      const growth = prevRev === 0 ? (currentRev > 0 ? 100 : 0) : ((currentRev - prevRev) / prevRev) * 100;

      return {
        branchName: b.name,
        revenue: currentRev,
        previousRevenue: prevRev,
        revenueGrowth: growth.toFixed(1) + '%',
        newMembers: membersMap.get(b.id) || 0,
        checkIns: checkInsMap.get(b.id) || 0,
        activeContracts: contractsMap.get(b.id) || 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const filename = `分店業績報表_${new Date().toISOString().slice(0, 10)}`;

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
  const tenantBranches = await getTenantBranches(tenantId);
  let branchIds = tenantBranches.map(b => b.id);
  if (branchId) {
    branchIds = branchIds.filter(id => id === branchId);
  }

  if (branchIds.length === 0) {
    return c.json({
      success: true,
      period: { start_date: startDate.toISOString().slice(0, 10), end_date: endDate.toISOString().slice(0, 10) },
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
    .select(REPORT_COACH_EMPLOYEES_SELECT)
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .innerJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .where(and(...coachConditions));

  // Filter to only those who have taught classes or have coach assignments
  const coachIdList = coachesWithClasses.map(c => c.id);

  if (coachIdList.length === 0) {
    return c.json({
      success: true,
      period: { start_date: startDate.toISOString().slice(0, 10), end_date: endDate.toISOString().slice(0, 10) },
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
    db.select(REPORT_COACH_COMPLETED_SESSIONS_SELECT)
    .from(classSessions)
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().slice(0, 10)),
      lte(classSessions.sessionDate, endDate.toISOString().slice(0, 10))
    ))
    .groupBy(classSessions.instructorId),

    // Students count (distinct members assigned to coach)
    db.select(REPORT_COACH_STUDENTS_COUNT_SELECT)
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
    // Use coachId column directly - more reliable than joining through classes
    db.select(REPORT_COACH_REVIEWS_SELECT)
    .from(classReviews)
    .where(and(
      isNotNull(classReviews.coachId),
      inArray(classReviews.coachId, coachIdList),
      gte(classReviews.createdAt, startDate),
      lte(classReviews.createdAt, endDate)
    ))
    .groupBy(classReviews.coachId),

    // Booking stats (attendance rate)
    db.select(REPORT_COACH_BOOKING_STATS_SELECT)
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classSessions.sessionDate, startDate.toISOString().slice(0, 10)),
      lte(classSessions.sessionDate, endDate.toISOString().slice(0, 10))
    ))
    .groupBy(classSessions.instructorId),

    // Notes created
    db.select(REPORT_COACH_NOTES_COUNT_SELECT)
    .from(coachNotes)
    .where(and(
      inArray(coachNotes.coachId, coachIdList),
      gte(coachNotes.createdAt, startDate),
      lte(coachNotes.createdAt, endDate)
    ))
    .groupBy(coachNotes.coachId),

    // Lesson plans created
    db.select(REPORT_COACH_LESSON_PLANS_COUNT_SELECT)
    .from(lessonPlans)
    .where(and(
      inArray(lessonPlans.coachId, coachIdList),
      gte(lessonPlans.createdAt, startDate),
      lte(lessonPlans.createdAt, endDate)
    ))
    .groupBy(lessonPlans.coachId),

    // Classes by category
    db.select(REPORT_COACH_CLASSES_BY_CATEGORY_SELECT)
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().slice(0, 10)),
      lte(classSessions.sessionDate, endDate.toISOString().slice(0, 10))
    ))
    .groupBy(classSessions.instructorId, classes.category),
  ]);

  // Build lookup maps for O(1) coach metric lookups
  const classCountMap = new Map(classesCount.map(c => [c.instructorId, c]));
  const studentCountMap = new Map(studentsCount.map(s => [s.coachId, s]));
  const reviewsMap = new Map(reviewsData.map(r => [r.instructorId, r]));
  const bookingMap = new Map(bookingStats.map(b => [b.instructorId, b]));
  const notesMap = new Map(notesCount.map(n => [n.coachId, n]));
  const plansMap = new Map(lessonPlansCount.map(p => [p.coachId, p]));

  // Group classes by category per instructor
  const categoriesMap = new Map<string, Array<{ category: string | null; count: number }>>();
  for (let i = 0; i < classesByCategory.length; i++) {
    const item = classesByCategory[i];
    if (!item.instructorId) continue;
    let list = categoriesMap.get(item.instructorId);
    if (!list) {
      list = [];
      categoriesMap.set(item.instructorId, list);
    }
    list.push({ category: item.category, count: Number(item.count) });
  }

  // Build coach data
  const coachData = coachesWithClasses.map(coach => {
    const classCount = classCountMap.get(coach.id);
    const studentCount = studentCountMap.get(coach.id);
    const reviews = reviewsMap.get(coach.id);
    const booking = bookingMap.get(coach.id);
    const notes = notesMap.get(coach.id);
    const plans = plansMap.get(coach.id);
    const categories = categoriesMap.get(coach.id) || [];

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
        classes_by_category: categories,
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

  // Calculate summary in a single pass
  const totalCoaches = filteredData.length;
  let totalClasses = 0;
  let totalStudents = 0;
  let satisfactionSum = 0;
  let satisfactionCount = 0;

  for (let i = 0; i < totalCoaches; i++) {
    const m = filteredData[i].metrics;
    totalClasses += m.classes_taught;
    totalStudents += m.total_students;
    if (m.satisfaction_rating !== null) {
      satisfactionSum += m.satisfaction_rating;
      satisfactionCount++;
    }
  }

  const avgSatisfaction = satisfactionCount > 0
    ? satisfactionSum / satisfactionCount
    : 0;

  return c.json({
    success: true,
    period: { start_date: startDate.toISOString().slice(0, 10), end_date: endDate.toISOString().slice(0, 10) },
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

  const tenantBranches = await getTenantBranches(tenantId);
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
    .select(REPORT_COACH_EXPORT_EMPLOYEES_SELECT)
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
    db.select(REPORT_COACH_COMPLETED_SESSIONS_SELECT)
    .from(classSessions)
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      eq(classSessions.sessionStatus, 'COMPLETED'),
      gte(classSessions.sessionDate, startDate.toISOString().slice(0, 10)),
      lte(classSessions.sessionDate, endDate.toISOString().slice(0, 10))
    ))
    .groupBy(classSessions.instructorId),

    db.select(REPORT_COACH_STUDENTS_COUNT_SELECT)
    .from(coachMemberAssignments)
    .where(and(
      inArray(coachMemberAssignments.coachId, coachIdList),
      or(
        sql`${coachMemberAssignments.unassignedAt} IS NULL`,
        gte(coachMemberAssignments.unassignedAt, startDate)
      )
    ))
    .groupBy(coachMemberAssignments.coachId),

    // Use coachId column directly - more reliable than joining through classes
    db.select(REPORT_COACH_REVIEWS_SELECT)
    .from(classReviews)
    .where(and(
      isNotNull(classReviews.coachId),
      inArray(classReviews.coachId, coachIdList),
      gte(classReviews.createdAt, startDate),
      lte(classReviews.createdAt, endDate)
    ))
    .groupBy(classReviews.coachId),

    db.select(REPORT_COACH_BOOKING_STATS_SELECT)
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(and(
      isNotNull(classSessions.instructorId),
      inArray(classSessions.instructorId, coachIdList),
      gte(classSessions.sessionDate, startDate.toISOString().slice(0, 10)),
      lte(classSessions.sessionDate, endDate.toISOString().slice(0, 10))
    ))
    .groupBy(classSessions.instructorId),
  ]);

  // Build lookup maps for O(1) coach metric lookups
  const classCountMap = new Map(classesCount.map(c => [c.instructorId, c]));
  const studentCountMap = new Map(studentsCount.map(s => [s.coachId, s]));
  const reviewsMap = new Map(reviewsData.map(r => [r.instructorId, r]));
  const bookingMap = new Map(bookingStats.map(b => [b.instructorId, b]));

  // Build export data
  const exportData = coachesWithClasses.map(coach => {
    const classCount = classCountMap.get(coach.id);
    const studentCount = studentCountMap.get(coach.id);
    const reviews = reviewsMap.get(coach.id);
    const booking = bookingMap.get(coach.id);

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

  const filename = `教練績效報表_${new Date().toISOString().slice(0, 10)}`;

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
