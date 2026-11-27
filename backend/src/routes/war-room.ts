/**
 * War room (戰情室) and member-analytics endpoints for admin-web.
 *
 * Ported from rust-backend/src/http/dashboard_reports.rs (dashboard_kpis,
 * contract_alerts, revenue_targets, dashboard_export, admin_member_demographics,
 * admin_contract_analytics, admin_revenue_breakdown, admin_checkin_heatmap,
 * admin_member_growth_report) with the Rust shortcuts replaced by real figures:
 * revenue counts COMPLETED INCOME payments only, expiring counts only ACTIVE
 * contracts, alert totals are counted before the list limit, active_rate is a
 * percentage, and the export returns data instead of an empty placeholder.
 *
 * Access: super_admin, admin and manager of the tenant (WAR_ROOM_ROLES); coach
 * and staff get 403. /api/dashboard and /api/reports have no role gate to copy,
 * and these figures (tenant-wide revenue, member phone numbers in alerts and
 * exports) are management data. Managers are not limited to a branch anywhere
 * else in the API, so they see all of the tenant's branches here too. Every
 * query is limited to the tenant's branches; an unknown or foreign branch_id
 * yields empty figures.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { db, members, contracts, payments, checkIns, branches, membershipPlans, bookings, classSessions, revenueTargets } from '../db/index.js';
import { requireAuth, requireRole, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranches } from '../utils/tenant-cache.js';
import type { TenantBranchInfo } from '../utils/tenant-cache.js';
import { generateCsv } from '../services/export.js';
import type { ExportColumn } from '../services/export.js';
import {
  PERIOD_TYPES,
  addDays,
  addMonths,
  dateInDays,
  eachDay,
  localDay,
  localToday,
  percentChange,
  percentage,
  periodWindow,
  rollingWindow,
  timestampInDays,
} from '../utils/report-dates.js';
import type { PeriodType, ReportWindow } from '../utils/report-dates.js';

type Env = { Variables: AuthVariables & TenantVariables };
type Ctx = Context<Env>;

export const WAR_ROOM_ROLES = ['super_admin', 'admin', 'manager'] as const;
const requireWarRoomRole = requireRole(...WAR_ROOM_ROLES);

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

/** Branches the request covers: all of the tenant's, or the one in branch_id if it is the tenant's. */
async function scopeBranches(c: Ctx): Promise<TenantBranchInfo[]> {
  const all = await getTenantBranches(c.get('tenantId')!);
  const requested = c.req.query('branch_id') || c.req.query('branchId');
  return requested ? all.filter(b => b.id === requested) : all;
}

/** `column in (ids)`, or false for an empty scope (no rows instead of a SQL error). */
function inBranches(column: AnyColumn, branchList: TenantBranchInfo[]): SQL {
  return branchList.length === 0 ? sql`false` : inArray(column, branchList.map(b => b.id)) as SQL;
}

/** Integer query parameter within [min, max]; the fallback when absent; null when malformed. */
function intParam(c: Ctx, names: string[], fallback: number, min: number, max: number): number | null {
  const raw = names.map(n => c.req.query(n)).find(v => v !== undefined && v !== '');
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  return Math.min(Math.max(Number(raw), min), max);
}

const num = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => Math.round(num(value) * 100) / 100;

const completedIncome = (branchList: TenantBranchInfo[]) => and(
  inBranches(payments.branchId, branchList),
  eq(payments.type, 'INCOME'),
  eq(payments.status, 'COMPLETED'),
)!;

const sumAmountIn = (start: string, end: string) =>
  sql<string>`coalesce(sum(${payments.amount}) filter (where ${timestampInDays(payments.paymentDate, start, end)}), 0)`;
const countIn = (column: AnyColumn, start: string, end: string) =>
  sql<number>`count(*) filter (where ${timestampInDays(column, start, end)})`;

// Contract renewal: of the contracts that ended in the window (up to today),
// the share whose member already has a later contract.
async function renewalRate(branchList: TenantBranchInfo[], window: ReportWindow, today: string): Promise<number> {
  const end = window.end < today ? window.end : today;
  const [row] = await db
    .select({
      ended: count(),
      // Outer columns spelled out: drizzle leaves them unqualified in a
      // single-table select, where they would bind to the subquery's alias.
      renewed: sql<number>`count(*) filter (where exists (
        select 1 from contracts later
        where later.member_id = "contracts"."member_id"
          and later.id <> "contracts"."id"
          and later.start_date > "contracts"."start_date"
          and later.status not in ('DRAFT', 'CANCELLED')
      ))`,
    })
    .from(contracts)
    .where(and(
      inBranches(contracts.branchId, branchList),
      dateInDays(contracts.endDate, window.start, end),
      sql`${contracts.status} not in ('DRAFT', 'CANCELLED', 'TRANSFERRED')`,
    ));
  return percentage(num(row?.renewed), num(row?.ended));
}

// Churn: members whose contract expired in the window and who hold no active
// or paused contract now.
async function churnedMembers(branchList: TenantBranchInfo[], window: ReportWindow): Promise<number> {
  const [row] = await db
    .select({ churned: sql<number>`count(distinct ${contracts.memberId})` })
    .from(contracts)
    .where(and(
      inBranches(contracts.branchId, branchList),
      eq(contracts.status, 'EXPIRED'),
      dateInDays(contracts.endDate, window.start, window.end),
      sql`not exists (
        select 1 from contracts current_contract
        where current_contract.member_id = "contracts"."member_id"
          and current_contract.status in ('ACTIVE', 'PAUSED')
      )`,
    ));
  return num(row?.churned);
}

const AGE_GROUPS = ['<18', '18-24', '25-34', '35-44', '45-54', '55+', 'UNKNOWN'] as const;

function ageGroupSql(today: string): SQL<string> {
  const age = sql`extract(year from age(${today}::date, ${members.birthday}))`;
  return sql<string>`case
    when ${members.birthday} is null then 'UNKNOWN'
    when ${age} < 18 then '<18'
    when ${age} < 25 then '18-24'
    when ${age} < 35 then '25-34'
    when ${age} < 45 then '35-44'
    when ${age} < 55 then '45-54'
    else '55+'
  end`;
}

async function ageDistribution(branchList: TenantBranchInfo[], today: string) {
  const ageGroup = ageGroupSql(today);
  const rows = await db
    .select({ ageGroup, count: count() })
    .from(members)
    .where(inBranches(members.branchId, branchList))
    // by position: the expression carries a bound date, and a repeated
    // parameter is a different expression to Postgres
    .groupBy(sql`1`);
  const counts = new Map(rows.map(r => [r.ageGroup, num(r.count)]));
  return AGE_GROUPS.filter(g => counts.has(g)).map(g => ({ age_group: g, count: counts.get(g)! }));
}

// -----------------------------------------------------------------------------
// KPI computation (used by /dashboard/kpis and the KPI export)
// -----------------------------------------------------------------------------

async function computeKpis(branchList: TenantBranchInfo[], periodType: PeriodType | 'custom', window: ReportWindow, today: string) {
  const { start, end, previousStart, previousEnd } = window;
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  // Revenue rows needed for today, the period, the previous period, MTD and YTD;
  // check-in rows for today and the period.
  const earliest = [start, previousStart, yearStart].sort()[0];
  const latest = [end, today].sort()[1];
  const checkInFrom = [start, today].sort()[0];
  const income = completedIncome(branchList);
  const periodPayments = and(income, timestampInDays(payments.paymentDate, start, end));
  const periodCheckIns = and(inBranches(checkIns.branchId, branchList), timestampInDays(checkIns.checkInTime, start, end));
  const checkInHour = sql<number>`extract(hour from ${checkIns.checkInTime} at time zone 'Asia/Taipei')::int`;

  const [
    [revenue],
    byMethod,
    revenueByBranch,
    [memberStats],
    byAge,
    membersByBranch,
    churned,
    [contractStats],
    [newContracts],
    byType,
    renewal,
    [checkInStats],
    hourly,
    checkInsByBranch,
    [attendance],
  ] = await Promise.all([
    db.select({
      today: sumAmountIn(today, today),
      todayCount: countIn(payments.paymentDate, today, today),
      period: sumAmountIn(start, end),
      periodCount: countIn(payments.paymentDate, start, end),
      previous: sumAmountIn(previousStart, previousEnd),
      mtd: sumAmountIn(monthStart, today),
      ytd: sumAmountIn(yearStart, today),
    }).from(payments).where(and(income, timestampInDays(payments.paymentDate, earliest, latest))),

    db.select({ method: payments.paymentMethod, amount: sql<string>`coalesce(sum(${payments.amount}), 0)`, count: count() })
      .from(payments).where(periodPayments).groupBy(payments.paymentMethod),

    db.select({ branchId: payments.branchId, revenue: sql<string>`coalesce(sum(${payments.amount}), 0)`, count: count() })
      .from(payments).where(periodPayments).groupBy(payments.branchId),

    db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${members.status} = 'ACTIVE')`,
      new: sql<number>`count(*) filter (where ${dateInDays(members.joinDate, start, end)})`,
      male: sql<number>`count(*) filter (where ${members.gender} = 'MALE')`,
      female: sql<number>`count(*) filter (where ${members.gender} = 'FEMALE')`,
    }).from(members).where(inBranches(members.branchId, branchList)),

    ageDistribution(branchList, today),

    db.select({
      branchId: members.branchId,
      total: count(),
      active: sql<number>`count(*) filter (where ${members.status} = 'ACTIVE')`,
    }).from(members).where(inBranches(members.branchId, branchList)).groupBy(members.branchId),

    churnedMembers(branchList, window),

    db.select({
      active: count(),
      expiring7: sql<number>`count(*) filter (where ${dateInDays(contracts.endDate, today, addDays(today, 7))})`,
      expiring30: sql<number>`count(*) filter (where ${dateInDays(contracts.endDate, today, addDays(today, 30))})`,
      expiring90: sql<number>`count(*) filter (where ${dateInDays(contracts.endDate, today, addDays(today, 90))})`,
    }).from(contracts).where(and(inBranches(contracts.branchId, branchList), eq(contracts.status, 'ACTIVE'))),

    db.select({ avg: sql<string>`coalesce(avg(${contracts.totalAmount}), 0)` })
      .from(contracts)
      .where(and(inBranches(contracts.branchId, branchList), ne(contracts.status, 'DRAFT'), timestampInDays(contracts.createdAt, start, end))),

    db.select({
      contractType: membershipPlans.planType,
      planName: membershipPlans.name,
      count: count(),
      totalValue: sql<string>`coalesce(sum(${contracts.totalAmount}), 0)`,
    })
      .from(contracts)
      .innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(and(inBranches(contracts.branchId, branchList), eq(contracts.status, 'ACTIVE')))
      .groupBy(membershipPlans.planType, membershipPlans.name)
      .orderBy(sql`count(*) desc`, membershipPlans.name),

    renewalRate(branchList, window, today),

    db.select({
      today: countIn(checkIns.checkInTime, today, today),
      period: countIn(checkIns.checkInTime, start, end),
    }).from(checkIns).where(and(
      inBranches(checkIns.branchId, branchList),
      timestampInDays(checkIns.checkInTime, checkInFrom, latest),
    )),

    db.select({ hour: checkInHour, count: count() }).from(checkIns).where(periodCheckIns).groupBy(checkInHour),

    db.select({
      branchId: checkIns.branchId,
      today: countIn(checkIns.checkInTime, today, today),
      period: countIn(checkIns.checkInTime, start, end),
    }).from(checkIns).where(and(
      inBranches(checkIns.branchId, branchList),
      timestampInDays(checkIns.checkInTime, checkInFrom, latest),
    )).groupBy(checkIns.branchId),

    db.select({
      attended: sql<number>`count(*) filter (where ${bookings.bookingStatus} = 'ATTENDED')`,
      noShow: sql<number>`count(*) filter (where ${bookings.bookingStatus} = 'NO_SHOW')`,
    })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(and(inBranches(classSessions.branchId, branchList), dateInDays(classSessions.sessionDate, start, end))),
  ]);

  const hourlyDistribution = new Array<number>(24).fill(0);
  for (const row of hourly) hourlyDistribution[num(row.hour)] = num(row.count);
  const peakCount = Math.max(...hourlyDistribution);
  const peakHour = peakCount > 0 ? hourlyDistribution.indexOf(peakCount) : 0;

  const revenueMap = new Map(revenueByBranch.map(r => [r.branchId, r]));
  const memberMap = new Map(membersByBranch.map(r => [r.branchId, r]));
  const checkInMap = new Map(checkInsByBranch.map(r => [r.branchId, r]));
  const totalMembers = num(memberStats?.total);
  const activeMembers = num(memberStats?.active);
  const periodRevenue = money(revenue?.period);
  const attended = num(attendance?.attended);

  return {
    success: true,
    period: { type: periodType, start_date: start, end_date: end },
    revenue: {
      today: money(revenue?.today),
      mtd: money(revenue?.mtd),
      ytd: money(revenue?.ytd),
      period: periodRevenue,
      change: percentChange(periodRevenue, money(revenue?.previous)),
      transactions: { today: num(revenue?.todayCount), period: num(revenue?.periodCount) },
      by_payment_method: byMethod
        .map(r => ({ payment_method: r.method, amount: money(r.amount), count: num(r.count) }))
        .sort((a, b) => b.amount - a.amount),
      by_branch: branchList.map(b => ({
        branch_id: b.id,
        branch_name: b.name,
        revenue: money(revenueMap.get(b.id)?.revenue),
        transactions: num(revenueMap.get(b.id)?.count),
      })),
    },
    members: {
      total: totalMembers,
      active: activeMembers,
      new: num(memberStats?.new),
      churned,
      active_rate: percentage(activeMembers, totalMembers),
      by_gender: { male: num(memberStats?.male), female: num(memberStats?.female) },
      by_age: byAge,
      by_branch: branchList.map(b => ({
        branch_id: b.id,
        branch_name: b.name,
        total: num(memberMap.get(b.id)?.total),
        active: num(memberMap.get(b.id)?.active),
      })),
    },
    contracts: {
      active: num(contractStats?.active),
      expiring_7: num(contractStats?.expiring7),
      expiring_30: num(contractStats?.expiring30),
      expiring_90: num(contractStats?.expiring90),
      renewal_rate: renewal,
      avg_value: money(newContracts?.avg),
      by_type: byType.map(r => ({
        contract_type: r.contractType,
        plan_name: r.planName,
        count: num(r.count),
        total_value: money(r.totalValue),
      })),
    },
    operations: {
      today_checkins: num(checkInStats?.today),
      period_checkins: num(checkInStats?.period),
      peak_hour: peakHour,
      hourly_distribution: hourlyDistribution,
      class_attendance_rate: percentage(attended, attended + num(attendance?.noShow)),
      by_branch: branchList.map(b => ({
        branch_id: b.id,
        branch_name: b.name,
        today_checkins: num(checkInMap.get(b.id)?.today),
        period_checkins: num(checkInMap.get(b.id)?.period),
      })),
    },
    generated_at: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// /api/admin/dashboard
// -----------------------------------------------------------------------------

export const adminDashboardRoutes = new Hono<Env>();
adminDashboardRoutes.use('*', requireAuth);
adminDashboardRoutes.use('*', requireTenant);
adminDashboardRoutes.use('*', requireWarRoomRole);

adminDashboardRoutes.get('/kpis', async (c) => {
  const period = (c.req.query('period') || 'today') as PeriodType;
  if (!PERIOD_TYPES.includes(period)) {
    return c.json({ success: false, error: 'period 必須為 today、week、month 或 year' }, 400);
  }
  const today = localToday();
  const branchList = await scopeBranches(c);
  return c.json(await computeKpis(branchList, period, periodWindow(period, today), today));
});

const CONTRACT_ALERT_SELECT = {
  contractId: contracts.id,
  contractNo: contracts.contractNo,
  endDate: contracts.endDate,
  memberName: members.fullName,
  memberPhone: members.phone,
  planName: membershipPlans.name,
  branchName: branches.name,
};

type Urgency = 'URGENT' | 'SOON' | 'UPCOMING';
const urgencyOf = (days: number): Urgency => (days <= 7 ? 'URGENT' : days <= 30 ? 'SOON' : 'UPCOMING');

adminDashboardRoutes.get('/contract-alerts', async (c) => {
  const daysAhead = intParam(c, ['days_ahead', 'days'], 30, 0, 365);
  const limit = intParam(c, ['limit'], 50, 1, 200);
  if (daysAhead === null || limit === null) {
    return c.json({ success: false, error: 'days_ahead 與 limit 必須為正整數' }, 400);
  }
  const today = localToday();
  const branchList = await scopeBranches(c);
  const expiring = and(
    inBranches(contracts.branchId, branchList),
    eq(contracts.status, 'ACTIVE'),
    dateInDays(contracts.endDate, today, addDays(today, daysAhead)),
  );

  const [[summary], rows] = await Promise.all([
    db.select({
      total: count(),
      urgent: sql<number>`count(*) filter (where ${contracts.endDate} <= ${addDays(today, 7)}::date)`,
      soon: sql<number>`count(*) filter (where ${contracts.endDate} > ${addDays(today, 7)}::date and ${contracts.endDate} <= ${addDays(today, 30)}::date)`,
    }).from(contracts).where(expiring),
    db.select(CONTRACT_ALERT_SELECT)
      .from(contracts)
      .innerJoin(members, eq(contracts.memberId, members.id))
      .innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .innerJoin(branches, eq(contracts.branchId, branches.id))
      .where(expiring)
      .orderBy(contracts.endDate, contracts.contractNo)
      .limit(limit),
  ]);

  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const alerts = rows.map(r => {
    const days = Math.round((Date.parse(`${r.endDate}T00:00:00Z`) - todayMs) / 86_400_000);
    return {
      contract_id: r.contractId,
      contract_no: r.contractNo,
      days_until_expiry: days,
      member_name: r.memberName,
      member_phone: r.memberPhone,
      plan_name: r.planName,
      branch_name: r.branchName,
      urgency: urgencyOf(days),
    };
  });
  const total = num(summary?.total);
  const urgent = num(summary?.urgent);
  const soon = num(summary?.soon);

  return c.json({
    success: true,
    summary: { total, urgent, soon, upcoming: total - urgent - soon },
    grouped: {
      urgent: alerts.filter(a => a.urgency === 'URGENT'),
      soon: alerts.filter(a => a.urgency === 'SOON'),
      upcoming: alerts.filter(a => a.urgency === 'UPCOMING'),
    },
    alerts,
  });
});

// Revenue targets: one amount per tenant + branch + month (month = first day).
// Reading is open to the war-room roles; writing is admin / super_admin only.
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const monthEnd = (monthStart: string) => addDays(addMonths(monthStart, 1), -1);

adminDashboardRoutes.get('/revenue-targets', async (c) => {
  const monthParam = c.req.query('month');
  const yearParam = c.req.query('year');
  let start: string;
  let end: string;
  if (monthParam) {
    if (!MONTH_RE.test(monthParam)) return c.json({ success: false, error: 'month 格式必須為 YYYY-MM' }, 400);
    start = `${monthParam}-01`;
    end = monthEnd(start);
  } else if (yearParam) {
    if (!/^\d{4}$/.test(yearParam)) return c.json({ success: false, error: 'year 格式必須為 YYYY' }, 400);
    start = `${yearParam}-01-01`;
    end = `${yearParam}-12-31`;
  } else {
    start = `${localToday().slice(0, 7)}-01`;
    end = monthEnd(start);
  }

  const branchList = await scopeBranches(c);
  const rows = await db
    .select({
      id: revenueTargets.id,
      branchId: revenueTargets.branchId,
      month: revenueTargets.month,
      targetAmount: revenueTargets.targetAmount,
    })
    .from(revenueTargets)
    .where(and(
      eq(revenueTargets.tenantId, c.get('tenantId')!),
      inBranches(revenueTargets.branchId, branchList),
      dateInDays(revenueTargets.month, start, end),
    ))
    .orderBy(revenueTargets.month, revenueTargets.branchId);

  // Actual revenue per (branch, month): COMPLETED income, half-open Taiwan-day ranges.
  const actualMonth = sql<string>`to_char(date_trunc('month', ${payments.paymentDate} at time zone 'Asia/Taipei'), 'YYYY-MM-DD')`;
  const actuals = rows.length === 0 ? [] : await db
    .select({ branchId: payments.branchId, month: actualMonth, amount: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(completedIncome(branchList), timestampInDays(payments.paymentDate, start, end)))
    .groupBy(payments.branchId, actualMonth);
  const actualMap = new Map(actuals.map(a => [`${a.branchId}|${a.month}`, money(a.amount)]));
  const branchNames = new Map(branchList.map(b => [b.id, b.name]));

  const targets = rows.map(r => {
    const target = money(r.targetAmount);
    const actual = actualMap.get(`${r.branchId}|${r.month}`) ?? 0;
    return {
      id: r.id,
      branch_id: r.branchId,
      branch_name: branchNames.get(r.branchId) ?? '',
      year: Number(r.month.slice(0, 4)),
      month: Number(r.month.slice(5, 7)),
      target_amount: target,
      actual_amount: actual,
      achievement_percent: percentage(actual, target),
    };
  });
  return c.json({ success: true, targets });
});

adminDashboardRoutes.put('/revenue-targets', requireRole('super_admin', 'admin'), async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const branchId = body?.branch_id;
  const rawAmount = body?.target_amount;
  const amount = typeof rawAmount === 'number' ? rawAmount : typeof rawAmount === 'string' && rawAmount.trim() !== '' ? Number(rawAmount) : NaN;
  let monthKey: string | null = null;
  if (typeof body?.month === 'string') {
    monthKey = MONTH_RE.test(body.month) ? body.month : null;
  } else if (Number.isInteger(body?.year) && Number.isInteger(body?.month)) {
    const key = `${String(body!.year).padStart(4, '0')}-${String(body!.month).padStart(2, '0')}`;
    monthKey = MONTH_RE.test(key) ? key : null;
  }
  if (typeof branchId !== 'string' || !monthKey || !Number.isFinite(amount) || amount < 0 || amount >= 1e10) {
    return c.json({ success: false, error: 'branch_id、month (YYYY-MM) 與 target_amount (>= 0) 為必填' }, 400);
  }
  const tenantId = c.get('tenantId')!;
  const branch = (await getTenantBranches(tenantId)).find(b => b.id === branchId);
  if (!branch) return c.json({ success: false, error: '找不到分店' }, 404);

  const [row] = await db.insert(revenueTargets)
    .values({ tenantId, branchId, month: `${monthKey}-01`, targetAmount: amount.toFixed(2), createdBy: c.get('user')?.id ?? null })
    .onConflictDoUpdate({
      target: [revenueTargets.tenantId, revenueTargets.branchId, revenueTargets.month],
      set: { targetAmount: amount.toFixed(2), updatedAt: new Date() },
    })
    .returning();
  return c.json({
    success: true,
    target: {
      id: row!.id,
      branch_id: branchId,
      branch_name: branch.name,
      year: Number(monthKey.slice(0, 4)),
      month: Number(monthKey.slice(5, 7)),
      target_amount: money(row!.targetAmount),
    },
  });
});

// -----------------------------------------------------------------------------
// /api/admin/dashboard/export
// -----------------------------------------------------------------------------

const EXPORT_TYPES = ['kpis', 'revenue', 'contracts', 'checkins', 'member-analytics'] as const;
type ExportType = typeof EXPORT_TYPES[number];

const EXPORT_COLUMNS: Record<Exclude<ExportType, 'kpis'>, ExportColumn[]> = {
  revenue: [
    { header: '付款日期', key: 'date' },
    { header: '分店', key: 'branchName' },
    { header: '會員姓名', key: 'memberName' },
    { header: '會員編號', key: 'memberCode' },
    { header: '付款方式', key: 'paymentMethod' },
    { header: '金額', key: 'amount' },
  ],
  contracts: [
    { header: '合約編號', key: 'contractNo' },
    { header: '會員姓名', key: 'memberName' },
    { header: '方案', key: 'planName' },
    { header: '分店', key: 'branchName' },
    { header: '狀態', key: 'status' },
    { header: '開始日', key: 'startDate' },
    { header: '到期日', key: 'endDate' },
    { header: '總金額', key: 'totalAmount' },
    { header: '已付金額', key: 'paidAmount' },
  ],
  checkins: [
    { header: '日期', key: 'date' },
    { header: '時間', key: 'time' },
    { header: '會員姓名', key: 'memberName' },
    { header: '會員編號', key: 'memberCode' },
    { header: '分店', key: 'branchName' },
    { header: '方式', key: 'method' },
  ],
  'member-analytics': [
    { header: '類別', key: 'category' },
    { header: '項目', key: 'key' },
    { header: '人數', key: 'count' },
  ],
};

const KPI_EXPORT_COLUMNS: ExportColumn[] = [
  { header: '指標', key: 'metric' },
  { header: '數值', key: 'value' },
];

const EXPORT_ROW_LIMIT = 50_000;

async function exportRows(type: Exclude<ExportType, 'kpis'>, branchList: TenantBranchInfo[], window: ReportWindow, today: string) {
  const { start, end } = window;
  switch (type) {
    case 'revenue': {
      const rows = await db.select({
        date: localDay(payments.paymentDate),
        branchName: branches.name,
        memberName: members.fullName,
        memberCode: members.memberCode,
        paymentMethod: payments.paymentMethod,
        amount: payments.amount,
      })
        .from(payments)
        .innerJoin(branches, eq(payments.branchId, branches.id))
        .innerJoin(members, eq(payments.memberId, members.id))
        .where(and(completedIncome(branchList), timestampInDays(payments.paymentDate, start, end)))
        .orderBy(payments.paymentDate)
        .limit(EXPORT_ROW_LIMIT);
      return rows.map(r => ({ ...r, amount: money(r.amount) }));
    }
    case 'contracts': {
      const rows = await db.select({
        contractNo: contracts.contractNo,
        memberName: members.fullName,
        planName: membershipPlans.name,
        branchName: branches.name,
        status: contracts.status,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        totalAmount: contracts.totalAmount,
        paidAmount: contracts.paidAmount,
      })
        .from(contracts)
        .innerJoin(members, eq(contracts.memberId, members.id))
        .innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
        .innerJoin(branches, eq(contracts.branchId, branches.id))
        .where(and(inBranches(contracts.branchId, branchList), ne(contracts.status, 'DRAFT'), timestampInDays(contracts.createdAt, start, end)))
        .orderBy(contracts.createdAt)
        .limit(EXPORT_ROW_LIMIT);
      return rows.map(r => ({ ...r, totalAmount: money(r.totalAmount), paidAmount: money(r.paidAmount) }));
    }
    case 'checkins': {
      const rows = await db.select({
        date: localDay(checkIns.checkInTime),
        time: sql<string>`to_char(${checkIns.checkInTime} at time zone 'Asia/Taipei', 'HH24:MI')`,
        memberName: members.fullName,
        memberCode: members.memberCode,
        branchName: branches.name,
        method: checkIns.checkInMethod,
      })
        .from(checkIns)
        .innerJoin(members, eq(checkIns.memberId, members.id))
        .innerJoin(branches, eq(checkIns.branchId, branches.id))
        .where(and(inBranches(checkIns.branchId, branchList), timestampInDays(checkIns.checkInTime, start, end)))
        .orderBy(checkIns.checkInTime)
        .limit(EXPORT_ROW_LIMIT);
      return rows;
    }
    case 'member-analytics': {
      const demographics = await memberDemographics(branchList, today);
      return [
        ...demographics.status_distribution.map(r => ({ category: 'status', key: r.status, count: r.count })),
        ...demographics.gender_distribution.map(r => ({ category: 'gender', key: r.gender, count: r.count })),
        ...demographics.age_distribution.map(r => ({ category: 'age', key: r.age_group, count: r.count })),
      ];
    }
  }
}

function attachment(body: string | Uint8Array, contentType: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

adminDashboardRoutes.get('/export', async (c) => {
  const type = (c.req.query('type') || 'kpis') as ExportType;
  const format = c.req.query('format') || 'csv';
  const days = intParam(c, ['days'], 30, 1, 730);
  if (!EXPORT_TYPES.includes(type)) {
    return c.json({ success: false, error: `type 必須為 ${EXPORT_TYPES.join('、')}` }, 400);
  }
  if (format !== 'csv' && format !== 'json') {
    return c.json({ success: false, error: 'format 必須為 csv 或 json' }, 400);
  }
  if (days === null) {
    return c.json({ success: false, error: 'days 必須為正整數' }, 400);
  }

  const today = localToday();
  const window = rollingWindow(days, today);
  const branchList = await scopeBranches(c);
  const filename = `${type}-${today}.${format}`;

  if (type === 'kpis') {
    const kpis = await computeKpis(branchList, 'custom', window, today);
    if (format === 'json') return attachment(JSON.stringify(kpis, null, 2), 'application/json; charset=utf-8', filename);
    const rows = [
      ['期間開始', kpis.period.start_date],
      ['期間結束', kpis.period.end_date],
      ['期間營收', kpis.revenue.period],
      ['今日營收', kpis.revenue.today],
      ['營收變化 (%)', kpis.revenue.change],
      ['期間交易筆數', kpis.revenue.transactions.period],
      ['會員總數', kpis.members.total],
      ['活躍會員', kpis.members.active],
      ['新增會員', kpis.members.new],
      ['流失會員', kpis.members.churned],
      ['活躍率 (%)', kpis.members.active_rate],
      ['有效合約', kpis.contracts.active],
      ['7 天內到期', kpis.contracts.expiring_7],
      ['30 天內到期', kpis.contracts.expiring_30],
      ['續約率 (%)', kpis.contracts.renewal_rate],
      ['今日入場', kpis.operations.today_checkins],
      ['期間入場', kpis.operations.period_checkins],
      ['尖峰時段', kpis.operations.peak_hour],
    ].map(([metric, value]) => ({ metric, value }));
    const csv = generateCsv(KPI_EXPORT_COLUMNS, rows);
    if (!csv.success || !csv.buffer) return c.json({ success: false, error: csv.error || '匯出失敗' }, 500);
    return attachment(new Uint8Array(csv.buffer), 'text/csv; charset=utf-8', filename);
  }

  const data = await exportRows(type, branchList, window, today);
  if (format === 'json') {
    return attachment(
      JSON.stringify({ success: true, type, start_date: window.start, end_date: window.end, generated_at: new Date().toISOString(), data }, null, 2),
      'application/json; charset=utf-8',
      filename,
    );
  }
  const csv = generateCsv(EXPORT_COLUMNS[type], data);
  if (!csv.success || !csv.buffer) return c.json({ success: false, error: csv.error || '匯出失敗' }, 500);
  return attachment(new Uint8Array(csv.buffer), 'text/csv; charset=utf-8', filename);
});

// -----------------------------------------------------------------------------
// /api/admin/analytics
// -----------------------------------------------------------------------------

export const adminAnalyticsRoutes = new Hono<Env>();
adminAnalyticsRoutes.use('*', requireAuth);
adminAnalyticsRoutes.use('*', requireTenant);
adminAnalyticsRoutes.use('*', requireWarRoomRole);

/** Current membership snapshot (the `days` window does not apply to who is a member now). */
async function memberDemographics(branchList: TenantBranchInfo[], today: string) {
  const gender = sql<string>`coalesce(${members.gender}, 'UNKNOWN')`;
  const [statusRows, genderRows, age] = await Promise.all([
    db.select({ status: members.status, count: count() })
      .from(members).where(inBranches(members.branchId, branchList))
      .groupBy(members.status).orderBy(sql`count(*) desc`, members.status),
    db.select({ gender, count: count() })
      .from(members).where(inBranches(members.branchId, branchList))
      .groupBy(gender).orderBy(sql`count(*) desc`, gender),
    ageDistribution(branchList, today),
  ]);
  return {
    status_distribution: statusRows.map(r => ({ status: r.status, count: num(r.count) })),
    gender_distribution: genderRows.map(r => ({ gender: r.gender, count: num(r.count) })),
    age_distribution: age,
  };
}

function daysWindow(c: Ctx): { window: ReportWindow; today: string } | null {
  const days = intParam(c, ['days'], 30, 1, 730);
  if (days === null) return null;
  const today = localToday();
  return { window: rollingWindow(days, today), today };
}

const INVALID_DAYS = { success: false, error: 'days 必須為正整數' } as const;

adminAnalyticsRoutes.get('/member-demographics', async (c) => {
  const range = daysWindow(c);
  if (!range) return c.json(INVALID_DAYS, 400);
  const branchList = await scopeBranches(c);
  return c.json({ success: true, data: await memberDemographics(branchList, range.today) });
});

adminAnalyticsRoutes.get('/contract-analytics', async (c) => {
  const range = daysWindow(c);
  if (!range) return c.json(INVALID_DAYS, 400);
  const { window, today } = range;
  const branchList = await scopeBranches(c);
  const sold = and(
    inBranches(contracts.branchId, branchList),
    ne(contracts.status, 'DRAFT'),
    timestampInDays(contracts.createdAt, window.start, window.end),
  );
  const totalValue = sql<string>`coalesce(sum(${contracts.totalAmount}), 0)`;

  const [typeRows, planRows, renewal] = await Promise.all([
    db.select({ contractType: membershipPlans.planType, count: count(), totalValue })
      .from(contracts).innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(sold).groupBy(membershipPlans.planType).orderBy(sql`count(*) desc`),
    db.select({ planId: membershipPlans.id, planName: membershipPlans.name, count: count(), totalValue })
      .from(contracts).innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(sold).groupBy(membershipPlans.id, membershipPlans.name)
      .orderBy(sql`count(*) desc`, sql`coalesce(sum(${contracts.totalAmount}), 0) desc`),
    renewalRate(branchList, window, today),
  ]);

  const totalContracts = typeRows.reduce((s, r) => s + num(r.count), 0);
  return c.json({
    success: true,
    data: {
      type_distribution: typeRows.map(r => ({
        contract_type: r.contractType,
        count: num(r.count),
        total_value: money(r.totalValue),
        percentage: percentage(num(r.count), totalContracts),
      })),
      plan_stats: planRows.map(r => ({
        plan_id: r.planId,
        plan_name: r.planName,
        contract_count: num(r.count),
        total_value: money(r.totalValue),
        percentage: percentage(num(r.count), totalContracts),
      })),
      renewal_rate: renewal,
      total_contracts: totalContracts,
      total_value: money(typeRows.reduce((s, r) => s + num(r.totalValue), 0)),
    },
  });
});

adminAnalyticsRoutes.get('/revenue-breakdown', async (c) => {
  const range = daysWindow(c);
  if (!range) return c.json(INVALID_DAYS, 400);
  const { window } = range;
  const branchList = await scopeBranches(c);
  const where = and(completedIncome(branchList), timestampInDays(payments.paymentDate, window.start, window.end));
  const month = sql<string>`to_char(${payments.paymentDate} at time zone 'Asia/Taipei', 'YYYY-MM')`;
  const amount = sql<string>`coalesce(sum(${payments.amount}), 0)`;

  const [byMonth, byMethod] = await Promise.all([
    db.select({ month, revenue: amount, count: count() }).from(payments).where(where).groupBy(month).orderBy(month),
    db.select({ method: payments.paymentMethod, amount, count: count() }).from(payments).where(where)
      .groupBy(payments.paymentMethod).orderBy(sql`coalesce(sum(${payments.amount}), 0) desc`),
  ]);

  return c.json({
    success: true,
    data: {
      by_month: byMonth.map(r => ({
        year: Number(r.month.slice(0, 4)),
        month: Number(r.month.slice(5, 7)),
        revenue: money(r.revenue),
        count: num(r.count),
      })),
      by_method: byMethod.map(r => ({ payment_method: r.method, amount: money(r.amount), count: num(r.count) })),
      total_revenue: money(byMonth.reduce((s, r) => s + num(r.revenue), 0)),
    },
  });
});

adminAnalyticsRoutes.get('/checkin-heatmap', async (c) => {
  const weeks = intParam(c, ['weeks'], 4, 1, 52);
  if (weeks === null) return c.json({ success: false, error: 'weeks 必須為正整數' }, 400);
  const today = localToday();
  const window = rollingWindow(weeks * 7, today);
  const branchList = await scopeBranches(c);
  const local = sql`${checkIns.checkInTime} at time zone 'Asia/Taipei'`;
  const day = sql<number>`extract(dow from ${local})::int`;
  const hour = sql<number>`extract(hour from ${local})::int`;

  const rows = await db.select({ day, hour, count: count() })
    .from(checkIns)
    .where(and(inBranches(checkIns.branchId, branchList), timestampInDays(checkIns.checkInTime, window.start, window.end)))
    .groupBy(day, hour);

  // 7 rows (Sunday first, as Postgres dow) x 24 hours
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of rows) heatmap[num(r.day)][num(r.hour)] = num(r.count);

  return c.json({ success: true, data: { heatmap, start_date: window.start, end_date: window.end } });
});

// -----------------------------------------------------------------------------
// /api/admin/reports
// -----------------------------------------------------------------------------

export const adminReportsRoutes = new Hono<Env>();
adminReportsRoutes.use('*', requireAuth);
adminReportsRoutes.use('*', requireTenant);
adminReportsRoutes.use('*', requireWarRoomRole);

adminReportsRoutes.get('/member-growth', async (c) => {
  const range = daysWindow(c);
  if (!range) return c.json(INVALID_DAYS, 400);
  const { window } = range;
  const branchList = await scopeBranches(c);
  const scope = inBranches(members.branchId, branchList);

  const [[before], daily, churned] = await Promise.all([
    db.select({ count: count() }).from(members).where(and(scope, sql`${members.joinDate} < ${window.start}::date`)),
    db.select({ date: sql<string>`${members.joinDate}::text`, count: count() })
      .from(members).where(and(scope, dateInDays(members.joinDate, window.start, window.end)))
      .groupBy(members.joinDate),
    churnedMembers(branchList, window),
  ]);

  const joined = new Map(daily.map(r => [r.date, num(r.count)]));
  const startingTotal = num(before?.count);
  let total = startingTotal;
  let newMembers = 0;
  const growth = eachDay(window.start, window.end).map(date => {
    const added = joined.get(date) ?? 0;
    total += added;
    newMembers += added;
    return { date, newMembers: added, new_members: added, total };
  });

  return c.json({
    success: true,
    data: {
      growth,
      newMembers,
      growthRate: percentChange(total, startingTotal),
      churnedMembers: churned,
      totalMembers: total,
    },
  });
});
