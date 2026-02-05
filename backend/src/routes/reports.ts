import { Hono } from 'hono';
import { db, members, contracts, payments, branches, checkIns } from '../db/index.js';
import { eq, and, sql, gte, lte, count, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import {
  generateExcel,
  generateCsv,
  revenueColumns,
  memberGrowthColumns,
  contractExpiryColumns,
  memberActivityColumns,
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

export default app;
