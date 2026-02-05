import { Hono } from 'hono';
import { db, members, contracts, payments, branches, checkIns } from '../db/index.js';
import { eq, and, sql, gte, lte, count, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

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

export default app;
