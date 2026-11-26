import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import app from '../src/app.js';
import { db, tenants, branches, users, sessions, members, membershipPlans, contracts, payments, checkIns } from '../src/db/index.js';
import { addDays, localToday } from '../src/utils/report-dates.js';

// War room + member analytics (/api/admin/dashboard|analytics|reports).
// Own tenant W (two branches) with fixed figures, and a foreign tenant X whose
// data must never show up. Days are Taiwan days, as in the routes.

const today = localToday();
const yesterday = addDays(today, -1);
const year = Number(today.slice(0, 4));
const at = (day: string, time: string) => new Date(`${day}T${time}:00+08:00`);

const id = () => randomUUID();
const W = id();
const W1 = id();
const W2 = id();
const X = id();
const X1 = id();
const ADMIN = id();
const COACH = id();
const STAFF = id();
const MANAGER = id();
const PLAN_TIME = id();
const PLAN_COUNT = id();
const PLAN_X = id();
const M1 = id();
const M2 = id();
const M3 = id();
const MX = id();
const C1 = id();
const C2 = id();
const C3 = id();
const C4 = id();
const C5 = id();
const CX = id();
const suffix = W.slice(0, 8);
const PASSWORD = 'WarRoomPass123!';

const tenantIds = [W, X];
const branchIds = [W1, W2, X1];
const userIds = [ADMIN, COACH, STAFF, MANAGER];
const memberIds = [M1, M2, M3, MX];

async function login(email: string) {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`login failed: ${JSON.stringify(data)}`);
  return data.data.token as string;
}

let adminToken: string;
let coachToken: string;
let staffToken: string;
let managerToken: string;

const get = (path: string, token = adminToken) =>
  app.request(path, { headers: { Authorization: `Bearer ${token}` } });
const getJson = async (path: string, token = adminToken) => {
  const res = await get(path, token);
  expect(res.status).toBe(200);
  return res.json();
};

beforeAll(async () => {
  await db.insert(tenants).values([
    { id: W, name: 'War Room Gym', slug: `war-room-${suffix}`, email: `w-${suffix}@test.test` },
    { id: X, name: 'Other Gym', slug: `war-room-x-${suffix}`, email: `x-${suffix}@test.test` },
  ]);
  await db.insert(branches).values([
    { id: W1, name: 'W 台北店', code: 'W1', tenantId: W },
    { id: W2, name: 'W 台中店', code: 'W2', tenantId: W },
    { id: X1, name: 'X 店', code: 'X1', tenantId: X },
  ]);
  const passwordHash = await hash(PASSWORD);
  await db.insert(users).values([
    { id: ADMIN, email: `wr-admin-${suffix}@test.test`, passwordHash, role: 'admin', tenantId: W, isActive: true, emailVerified: true },
    { id: COACH, email: `wr-coach-${suffix}@test.test`, passwordHash, role: 'coach', tenantId: W, isActive: true, emailVerified: true },
    { id: STAFF, email: `wr-staff-${suffix}@test.test`, passwordHash, role: 'staff', tenantId: W, isActive: true, emailVerified: true },
    { id: MANAGER, email: `wr-manager-${suffix}@test.test`, passwordHash, role: 'manager', tenantId: W, isActive: true, emailVerified: true },
  ]);
  await db.insert(membershipPlans).values([
    { id: PLAN_TIME, name: '月費方案', code: `T${suffix}`, planType: 'TIME_BASED', durationMonths: 1, price: '1000', tenantId: W },
    { id: PLAN_COUNT, name: '堂數方案', code: `C${suffix}`, planType: 'COUNT_BASED', classCounts: 10, price: '2000', tenantId: W },
    { id: PLAN_X, name: 'X 方案', code: `X${suffix}`, planType: 'TIME_BASED', durationMonths: 1, price: '9999', tenantId: X },
  ]);
  await db.insert(members).values([
    { id: M1, fullName: '王小明', phone: '0911000001', memberCode: `W1${suffix}`, branchId: W1, tenantId: W, status: 'ACTIVE', gender: 'MALE', birthday: `${year - 30}-01-01`, joinDate: today },
    { id: M2, fullName: '陳小華', phone: '0911000002', memberCode: `W2${suffix}`, branchId: W1, tenantId: W, status: 'SUSPENDED', gender: 'FEMALE', joinDate: addDays(today, -10) },
    { id: M3, fullName: '林小美', phone: '0911000003', memberCode: `W3${suffix}`, branchId: W2, tenantId: W, status: 'ACTIVE', gender: 'FEMALE', birthday: `${year - 20}-06-15`, joinDate: addDays(today, -40) },
    { id: MX, fullName: '外部會員', phone: '0911000099', memberCode: `WX${suffix}`, branchId: X1, tenantId: X, status: 'ACTIVE', gender: 'MALE', joinDate: today },
  ]);
  const contract = (cid: string, no: string, memberId: string, planId: string, branchId: string, tenantId: string,
    status: 'ACTIVE' | 'EXPIRED', startDate: string, endDate: string, totalAmount: string) => ({
    id: cid, contractNo: `${no}-${suffix}`, memberId, planId, branchId, tenantId, status, startDate,
    originalEndDate: endDate, endDate, totalAmount, paidAmount: totalAmount, paymentStatus: 'PAID' as const, termsAccepted: true,
  });
  await db.insert(contracts).values([
    contract(C1, 'WR1', M1, PLAN_TIME, W1, W, 'ACTIVE', today, addDays(today, 3), '1000'), // URGENT
    contract(C2, 'WR2', M3, PLAN_COUNT, W2, W, 'ACTIVE', addDays(today, -40), addDays(today, 20), '2000'), // SOON
    contract(C3, 'WR3', M2, PLAN_TIME, W1, W, 'EXPIRED', addDays(today, -35), addDays(today, -5), '500'), // churned
    contract(C4, 'WR4', M1, PLAN_TIME, W1, W, 'ACTIVE', today, addDays(today, 60), '1500'), // UPCOMING
    contract(C5, 'WR5', M1, PLAN_TIME, W1, W, 'EXPIRED', addDays(today, -32), addDays(today, -2), '700'), // renewed by C1
    contract(CX, 'WRX', MX, PLAN_X, X1, X, 'ACTIVE', today, addDays(today, 2), '9999'),
  ]);
  const payment = (memberId: string, contractId: string, branchId: string, tenantId: string, amount: string,
    paymentMethod: 'CASH' | 'CREDIT_CARD', paymentDate: Date, extra: Partial<typeof payments.$inferInsert> = {}) =>
    ({ memberId, contractId, branchId, tenantId, amount, paymentMethod, paymentDate, ...extra });
  await db.insert(payments).values([
    payment(M1, C1, W1, W, '1000', 'CASH', at(today, '10:00')),
    payment(M3, C2, W2, W, '500', 'CREDIT_CARD', at(today, '11:00')),
    payment(M1, C1, W1, W, '300', 'CASH', at(today, '12:00'), { status: 'PENDING' }),
    payment(M1, C1, W1, W, '200', 'CASH', at(today, '13:00'), { type: 'REFUND' }),
    payment(M2, C3, W1, W, '800', 'CASH', at(yesterday, '12:00')),
    payment(MX, CX, X1, X, '9999', 'CASH', at(today, '10:00')),
  ]);
  await db.insert(checkIns).values([
    { memberId: M1, branchId: W1, checkInTime: at(today, '07:15'), checkInMethod: 'QR_CODE' },
    { memberId: M3, branchId: W2, checkInTime: at(today, '07:40'), checkInMethod: 'MANUAL' },
    { memberId: M1, branchId: W1, checkInTime: at(today, '18:05'), checkInMethod: 'QR_CODE' },
    { memberId: M2, branchId: W1, checkInTime: at(yesterday, '07:10'), checkInMethod: 'CARD' },
    { memberId: MX, branchId: X1, checkInTime: at(today, '07:00'), checkInMethod: 'QR_CODE' },
  ]);

  adminToken = await login(`wr-admin-${suffix}@test.test`);
  coachToken = await login(`wr-coach-${suffix}@test.test`);
  staffToken = await login(`wr-staff-${suffix}@test.test`);
  managerToken = await login(`wr-manager-${suffix}@test.test`);
});

afterAll(async () => {
  await db.delete(checkIns).where(inArray(checkIns.memberId, memberIds));
  await db.delete(payments).where(inArray(payments.memberId, memberIds));
  await db.delete(contracts).where(inArray(contracts.memberId, memberIds));
  await db.delete(members).where(inArray(members.id, memberIds));
  await db.delete(membershipPlans).where(inArray(membershipPlans.tenantId, tenantIds));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(branches).where(inArray(branches.id, branchIds));
  await db.delete(tenants).where(inArray(tenants.id, tenantIds));
});

const ENDPOINTS = [
  '/api/admin/dashboard/kpis',
  '/api/admin/dashboard/contract-alerts',
  '/api/admin/dashboard/revenue-targets',
  '/api/admin/dashboard/export?type=kpis&format=json',
  '/api/admin/analytics/member-demographics',
  '/api/admin/analytics/contract-analytics',
  '/api/admin/analytics/revenue-breakdown',
  '/api/admin/analytics/checkin-heatmap',
  '/api/admin/reports/member-growth',
];

describe('access', () => {
  it.each(ENDPOINTS)('%s requires a session', async (path) => {
    expect((await app.request(path)).status).toBe(401);
  });

  it.each(ENDPOINTS)('%s is closed to coach and staff', async (path) => {
    expect((await get(path, coachToken)).status).toBe(403);
    expect((await get(path, staffToken)).status).toBe(403);
  });

  it.each(ENDPOINTS)('%s is open to manager and admin', async (path) => {
    expect((await get(path, managerToken)).status).toBe(200);
    expect((await get(path, adminToken)).status).toBe(200);
  });

  it('a manager sees every branch of the tenant (managers are not branch-scoped elsewhere)', async () => {
    const k = await getJson('/api/admin/dashboard/kpis?period=today', managerToken);
    expect(k.revenue.today).toBe(1500);
    expect(k.revenue.by_branch).toHaveLength(2);
  });
});

describe('GET /api/admin/dashboard/kpis', () => {
  it("computes today's KPIs from this tenant's data only", async () => {
    const k = await getJson('/api/admin/dashboard/kpis?period=today');

    expect(k.period).toEqual({ type: 'today', start_date: today, end_date: today });
    // COMPLETED INCOME only: the PENDING 300 and the 200 refund are left out, tenant X's 9999 too
    expect(k.revenue.today).toBe(1500);
    expect(k.revenue.period).toBe(1500);
    expect(k.revenue.transactions).toEqual({ today: 2, period: 2 });
    expect(k.revenue.change).toBe(87.5); // vs yesterday's 800
    expect(k.revenue.mtd).toBe(yesterday.slice(0, 7) === today.slice(0, 7) ? 2300 : 1500);
    expect(k.revenue.ytd).toBe(yesterday.slice(0, 4) === today.slice(0, 4) ? 2300 : 1500);
    expect(k.revenue.by_payment_method).toEqual([
      { payment_method: 'CASH', amount: 1000, count: 1 },
      { payment_method: 'CREDIT_CARD', amount: 500, count: 1 },
    ]);
    expect(k.revenue.by_branch).toEqual(expect.arrayContaining([
      { branch_id: W1, branch_name: 'W 台北店', revenue: 1000, transactions: 1 },
      { branch_id: W2, branch_name: 'W 台中店', revenue: 500, transactions: 1 },
    ]));
    expect(k.revenue.by_branch).toHaveLength(2);

    expect(k.members).toMatchObject({
      total: 3, active: 2, new: 1, active_rate: 66.7, by_gender: { male: 1, female: 2 },
      by_age: [{ age_group: '18-24', count: 1 }, { age_group: '25-34', count: 1 }, { age_group: 'UNKNOWN', count: 1 }],
    });
    expect(k.members.by_branch).toEqual(expect.arrayContaining([
      { branch_id: W1, branch_name: 'W 台北店', total: 2, active: 1 },
      { branch_id: W2, branch_name: 'W 台中店', total: 1, active: 1 },
    ]));

    expect(k.contracts).toMatchObject({ active: 3, expiring_7: 1, expiring_30: 2, expiring_90: 3 });
    expect(k.contracts.by_type).toEqual([
      { contract_type: 'TIME_BASED', plan_name: '月費方案', count: 2, total_value: 2500 },
      { contract_type: 'COUNT_BASED', plan_name: '堂數方案', count: 1, total_value: 2000 },
    ]);

    expect(k.operations.today_checkins).toBe(3);
    expect(k.operations.period_checkins).toBe(3);
    expect(k.operations.peak_hour).toBe(7);
    expect(k.operations.hourly_distribution[7]).toBe(2);
    expect(k.operations.hourly_distribution[18]).toBe(1);
    expect(k.operations.by_branch).toEqual(expect.arrayContaining([
      { branch_id: W1, branch_name: 'W 台北店', today_checkins: 2, period_checkins: 2 },
      { branch_id: W2, branch_name: 'W 台中店', today_checkins: 1, period_checkins: 1 },
    ]));
  });

  it('counts the previous days in a longer period', async () => {
    const k = await getJson('/api/admin/dashboard/kpis?period=year');
    const sameYear = yesterday.slice(0, 4) === today.slice(0, 4);
    expect(k.period.start_date).toBe(`${year}-01-01`);
    expect(k.revenue.period).toBe(sameYear ? 2300 : 1500);
    expect(k.operations.period_checkins).toBe(sameYear ? 4 : 3);
    expect(k.operations.today_checkins).toBe(3);
  });

  it('narrows to one branch with branch_id', async () => {
    const k = await getJson(`/api/admin/dashboard/kpis?period=today&branch_id=${W2}`);
    expect(k.revenue.today).toBe(500);
    expect(k.members.total).toBe(1);
    expect(k.contracts.active).toBe(1);
    expect(k.operations.today_checkins).toBe(1);
    expect(k.revenue.by_branch.map((b: { branch_id: string }) => b.branch_id)).toEqual([W2]);
  });

  it("returns empty figures for another tenant's branch", async () => {
    const k = await getJson(`/api/admin/dashboard/kpis?period=today&branch_id=${X1}`);
    expect(k.revenue.today).toBe(0);
    expect(k.members.total).toBe(0);
    expect(k.contracts.active).toBe(0);
    expect(k.operations.today_checkins).toBe(0);
    expect(k.revenue.by_branch).toEqual([]);
  });

  it('rejects an unknown period', async () => {
    expect((await get('/api/admin/dashboard/kpis?period=decade')).status).toBe(400);
  });
});

describe('GET /api/admin/dashboard/contract-alerts', () => {
  it('lists ACTIVE contracts ending within days_ahead, soonest first', async () => {
    const a = await getJson('/api/admin/dashboard/contract-alerts');
    expect(a.summary).toEqual({ total: 2, urgent: 1, soon: 1, upcoming: 0 });
    expect(a.alerts).toEqual([
      expect.objectContaining({ contract_id: C1, days_until_expiry: 3, member_name: '王小明', member_phone: '0911000001', plan_name: '月費方案', branch_name: 'W 台北店', urgency: 'URGENT' }),
      expect.objectContaining({ contract_id: C2, days_until_expiry: 20, urgency: 'SOON' }),
    ]);
    expect(a.grouped.urgent).toHaveLength(1);
    expect(a.grouped.soon).toHaveLength(1);
  });

  it('counts the summary before applying the limit', async () => {
    const a = await getJson('/api/admin/dashboard/contract-alerts?days_ahead=90&limit=1');
    expect(a.summary).toEqual({ total: 3, urgent: 1, soon: 1, upcoming: 1 });
    expect(a.alerts).toHaveLength(1);
  });
});

describe('GET /api/admin/dashboard/export', () => {
  it('downloads the KPIs as JSON', async () => {
    const res = await get('/api/admin/dashboard/export?type=kpis&format=json&days=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="kpis-${today}.json"`);
    const body = await res.json();
    expect(body.revenue.period).toBe(1500);
    expect(body.members.total).toBe(3);
  });

  it("exports this tenant's completed payments as CSV", async () => {
    const res = await get('/api/admin/dashboard/export?type=revenue&format=csv&days=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const csv = await res.text();
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3); // header + 1000 + 500
    expect(csv).toContain('王小明');
    expect(csv).not.toContain('9999');
    expect(csv).not.toContain('外部會員');
  });

  it('exports check-ins with their local time', async () => {
    const res = await get('/api/admin/dashboard/export?type=checkins&format=json&days=1');
    const body = await res.json();
    expect(body.data.map((r: { time: string }) => r.time)).toEqual(['07:15', '07:40', '18:05']);
  });

  it('rejects an unknown export type', async () => {
    expect((await get('/api/admin/dashboard/export?type=payroll')).status).toBe(400);
  });
});

describe('GET /api/admin/analytics/*', () => {
  it('member-demographics: status, gender and age of the current members', async () => {
    const { data } = await getJson('/api/admin/analytics/member-demographics?days=30');
    expect(data.status_distribution).toEqual([{ status: 'ACTIVE', count: 2 }, { status: 'SUSPENDED', count: 1 }]);
    expect(data.gender_distribution).toEqual([{ gender: 'FEMALE', count: 2 }, { gender: 'MALE', count: 1 }]);
    expect(data.age_distribution).toEqual([
      { age_group: '18-24', count: 1 }, { age_group: '25-34', count: 1 }, { age_group: 'UNKNOWN', count: 1 },
    ]);
  });

  it('contract-analytics: contracts sold in the window and the renewal rate', async () => {
    const { data } = await getJson('/api/admin/analytics/contract-analytics?days=30');
    expect(data.total_contracts).toBe(5);
    expect(data.total_value).toBe(5700);
    expect(data.type_distribution).toEqual([
      { contract_type: 'TIME_BASED', count: 4, total_value: 3700, percentage: 80 },
      { contract_type: 'COUNT_BASED', count: 1, total_value: 2000, percentage: 20 },
    ]);
    expect(data.plan_stats[0]).toMatchObject({ plan_id: PLAN_TIME, plan_name: '月費方案', contract_count: 4 });
    // C3 and C5 ended in the window; only C5's member signed a later contract
    expect(data.renewal_rate).toBe(50);
  });

  it('revenue-breakdown: completed income by month and method', async () => {
    const { data } = await getJson('/api/admin/analytics/revenue-breakdown?days=30');
    expect(data.total_revenue).toBe(2300);
    expect(data.by_method).toEqual([
      { payment_method: 'CASH', amount: 1800, count: 2 },
      { payment_method: 'CREDIT_CARD', amount: 500, count: 1 },
    ]);
    expect(data.by_month.reduce((s: number, m: { revenue: number }) => s + m.revenue, 0)).toBe(2300);
  });

  it('checkin-heatmap: 7 x 24 counts by local weekday and hour', async () => {
    const { data } = await getJson('/api/admin/analytics/checkin-heatmap?weeks=1');
    const dow = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
    expect(data.heatmap).toHaveLength(7);
    expect(data.heatmap[0]).toHaveLength(24);
    expect(data.heatmap[dow(today)][7]).toBe(2);
    expect(data.heatmap[dow(today)][18]).toBe(1);
    expect(data.heatmap[dow(yesterday)][7]).toBe(1);
    const total = data.heatmap.flat().reduce((s: number, n: number) => s + n, 0);
    expect(total).toBe(4);
  });
});

describe('GET /api/admin/reports/member-growth', () => {
  it('cumulates members per day from the total before the window', async () => {
    const { data } = await getJson('/api/admin/reports/member-growth?days=30');
    expect(data.growth).toHaveLength(30);
    expect(data.growth[0].total).toBe(1); // M3 joined 40 days ago
    expect(data.growth.at(-1)).toEqual({ date: today, newMembers: 1, new_members: 1, total: 3 });
    expect(data.newMembers).toBe(2);
    expect(data.totalMembers).toBe(3);
    expect(data.growthRate).toBe(200);
    // M2's contract expired and M2 holds no other; M1 still has active ones
    expect(data.churnedMembers).toBe(1);
  });

  it('rejects a malformed days value', async () => {
    expect((await get('/api/admin/reports/member-growth?days=abc')).status).toBe(400);
  });
});
