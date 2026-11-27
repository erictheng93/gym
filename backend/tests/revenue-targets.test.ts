import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import app from '../src/app.js';
import { db, tenants, branches, users, sessions, members, membershipPlans, contracts, payments, revenueTargets } from '../src/db/index.js';
import { addMonths, localToday } from '../src/utils/report-dates.js';

// Revenue targets (/api/admin/dashboard/revenue-targets): tenant W (two branches)
// and a foreign tenant X. Actual revenue counts COMPLETED income only.

const monthStart = `${localToday().slice(0, 7)}-01`;
const month = monthStart.slice(0, 7);
const prevMonth = addMonths(monthStart, -1).slice(0, 7);
const at = (day: string, time: string) => new Date(`${day}T${time}:00+08:00`);

const id = () => randomUUID();
const W = id();
const W1 = id();
const W2 = id();
const X = id();
const X1 = id();
const ADMIN = id();
const MANAGER = id();
const STAFF = id();
const XADMIN = id();
const M1 = id();
const MX = id();
const PLAN = id();
const PLAN_X = id();
const C1 = id();
const CX = id();
const suffix = W.slice(0, 8);
const PASSWORD = 'TargetsPass123!';

const tenantIds = [W, X];
const userIds = [ADMIN, MANAGER, STAFF, XADMIN];

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
let managerToken: string;
let staffToken: string;
let xAdminToken: string;

const get = (path: string, token = adminToken) =>
  app.request(path, { headers: { Authorization: `Bearer ${token}` } });
const put = (body: unknown, token = adminToken) =>
  app.request('/api/admin/dashboard/revenue-targets', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await db.insert(tenants).values([
    { id: W, name: 'Targets Gym', slug: `targets-${suffix}`, email: `t-${suffix}@test.test` },
    { id: X, name: 'Other Gym', slug: `targets-x-${suffix}`, email: `tx-${suffix}@test.test` },
  ]);
  await db.insert(branches).values([
    { id: W1, name: 'W 台北店', code: 'W1', tenantId: W },
    { id: W2, name: 'W 台中店', code: 'W2', tenantId: W },
    { id: X1, name: 'X 店', code: 'X1', tenantId: X },
  ]);
  const passwordHash = await hash(PASSWORD);
  const user = (uid: string, role: 'admin' | 'manager' | 'staff', tenantId: string, tag: string) =>
    ({ id: uid, email: `rt-${tag}-${suffix}@test.test`, passwordHash, role, tenantId, isActive: true, emailVerified: true });
  await db.insert(users).values([
    user(ADMIN, 'admin', W, 'admin'),
    user(MANAGER, 'manager', W, 'manager'),
    user(STAFF, 'staff', W, 'staff'),
    user(XADMIN, 'admin', X, 'xadmin'),
  ]);
  await db.insert(members).values([
    { id: M1, fullName: '王小明', phone: '0911100001', memberCode: `RT1${suffix}`, branchId: W1, tenantId: W, status: 'ACTIVE', joinDate: monthStart },
    { id: MX, fullName: '外部會員', phone: '0911100099', memberCode: `RTX${suffix}`, branchId: X1, tenantId: X, status: 'ACTIVE', joinDate: monthStart },
  ]);
  await db.insert(membershipPlans).values([
    { id: PLAN, name: '月費方案', code: `T${suffix}`, planType: 'TIME_BASED', durationMonths: 1, price: '1000', tenantId: W },
    { id: PLAN_X, name: 'X 方案', code: `X${suffix}`, planType: 'TIME_BASED', durationMonths: 1, price: '9999', tenantId: X },
  ]);
  const contract = (cid: string, no: string, memberId: string, planId: string, branchId: string, tenantId: string) => ({
    id: cid, contractNo: `${no}-${suffix}`, memberId, planId, branchId, tenantId, status: 'ACTIVE' as const, startDate: monthStart,
    originalEndDate: addMonths(monthStart, 1), endDate: addMonths(monthStart, 1), totalAmount: '1000', paidAmount: '1000',
    paymentStatus: 'PAID' as const, termsAccepted: true,
  });
  await db.insert(contracts).values([contract(C1, 'RT1', M1, PLAN, W1, W), contract(CX, 'RTX', MX, PLAN_X, X1, X)]);
  // W1 this month: 1000 COMPLETED + 300 PENDING (must not count) + 200 refund (not income)
  // W1 last month: 400 COMPLETED (belongs to the other month)
  const pay = (memberId: string, branchId: string, tenantId: string, amount: string, paymentDate: Date, extra: Partial<typeof payments.$inferInsert> = {}) =>
    ({ memberId, contractId: memberId === M1 ? C1 : CX, branchId, tenantId, amount, paymentMethod: 'CASH' as const, paymentDate, ...extra });
  await db.insert(payments).values([
    pay(M1, W1, W, '1000', at(`${month}-01`, '00:30')),
    pay(M1, W1, W, '300', at(`${month}-02`, '10:00'), { status: 'PENDING' }),
    pay(M1, W1, W, '200', at(`${month}-02`, '11:00'), { type: 'REFUND' }),
    pay(M1, W1, W, '400', at(`${prevMonth}-28`, '23:30')),
    pay(MX, X1, X, '9999', at(`${month}-01`, '10:00')),
  ]);

  adminToken = await login(`rt-admin-${suffix}@test.test`);
  managerToken = await login(`rt-manager-${suffix}@test.test`);
  staffToken = await login(`rt-staff-${suffix}@test.test`);
  xAdminToken = await login(`rt-xadmin-${suffix}@test.test`);
});

afterAll(async () => {
  await db.delete(revenueTargets).where(inArray(revenueTargets.tenantId, tenantIds));
  await db.delete(payments).where(inArray(payments.memberId, [M1, MX]));
  await db.delete(contracts).where(inArray(contracts.memberId, [M1, MX]));
  await db.delete(membershipPlans).where(inArray(membershipPlans.tenantId, tenantIds));
  await db.delete(members).where(inArray(members.id, [M1, MX]));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(branches).where(inArray(branches.id, [W1, W2, X1]));
  await db.delete(tenants).where(inArray(tenants.id, tenantIds));
});

describe('PUT /revenue-targets', () => {
  it('is closed to manager and staff, open to admin', async () => {
    expect((await put({ branch_id: W1, month, target_amount: 5000 }, managerToken)).status).toBe(403);
    expect((await put({ branch_id: W1, month, target_amount: 5000 }, staffToken)).status).toBe(403);
    expect((await put({ branch_id: W1, month, target_amount: 5000 })).status).toBe(200);
  });

  it('is idempotent: a second PUT updates the same row', async () => {
    const first = await (await put({ branch_id: W1, month, target_amount: 4000 })).json();
    const second = await (await put({ branch_id: W1, month, target_amount: 4000 })).json();
    expect(second.target.id).toBe(first.target.id);
    const third = await (await put({ branch_id: W1, month, target_amount: 8000 })).json();
    expect(third.target.id).toBe(first.target.id);
    expect(third.target.target_amount).toBe(8000);
    const rows = await db.select().from(revenueTargets).where(inArray(revenueTargets.tenantId, [W]));
    expect(rows.filter(r => r.branchId === W1 && r.month === monthStart)).toHaveLength(1);
  });

  it('accepts year + month integers (admin-web composable shape)', async () => {
    const res = await put({ branch_id: W2, year: Number(month.slice(0, 4)), month: Number(month.slice(5)), target_amount: 3000 });
    expect(res.status).toBe(200);
  });

  it('404s a branch of another tenant', async () => {
    expect((await put({ branch_id: X1, month, target_amount: 1 })).status).toBe(404);
    expect((await put({ branch_id: randomUUID(), month, target_amount: 1 })).status).toBe(404);
  });

  it.each([
    { target_amount: -1 },
    { target_amount: 'abc' },
    { target_amount: null },
    { month: '2026-13' },
    { month: 'next' },
  ])('rejects invalid input %j', async (patch) => {
    expect((await put({ branch_id: W1, month, target_amount: 1, ...patch })).status).toBe(400);
  });
});

describe('GET /revenue-targets', () => {
  beforeAll(async () => {
    await put({ branch_id: W1, month, target_amount: 4000 });
    await put({ branch_id: W1, month: prevMonth, target_amount: 1000 });
    await put({ branch_id: W2, month, target_amount: 3000 });
    await put({ branch_id: X1, month, target_amount: 7 }, xAdminToken);
  });

  it('returns actual COMPLETED revenue and achievement for the month (PENDING and refunds excluded)', async () => {
    const data = await (await get(`/api/admin/dashboard/revenue-targets?month=${month}`)).json();
    const w1 = data.targets.find((t: { branch_id: string }) => t.branch_id === W1);
    expect(w1).toMatchObject({ year: Number(month.slice(0, 4)), month: Number(month.slice(5)), target_amount: 4000, actual_amount: 1000, achievement_percent: 25 });
    const w2 = data.targets.find((t: { branch_id: string }) => t.branch_id === W2);
    expect(w2).toMatchObject({ actual_amount: 0, achievement_percent: 0 });
  });

  it('keeps months apart and defaults to the current month', async () => {
    const prev = await (await get(`/api/admin/dashboard/revenue-targets?month=${prevMonth}`)).json();
    expect(prev.targets).toHaveLength(1);
    expect(prev.targets[0]).toMatchObject({ branch_id: W1, target_amount: 1000, actual_amount: 400, achievement_percent: 40 });
    const current = await (await get('/api/admin/dashboard/revenue-targets')).json();
    expect(current.targets.map((t: { branch_id: string }) => t.branch_id).sort()).toEqual([W1, W2].sort());
  });

  it('filters by branch and is readable by managers', async () => {
    const data = await (await get(`/api/admin/dashboard/revenue-targets?month=${month}&branch_id=${W2}`, managerToken)).json();
    expect(data.targets).toHaveLength(1);
    expect(data.targets[0].branch_id).toBe(W2);
  });

  it('is tenant-isolated in both directions', async () => {
    const mine = await (await get(`/api/admin/dashboard/revenue-targets?month=${month}`)).json();
    expect(mine.targets.some((t: { branch_id: string }) => t.branch_id === X1)).toBe(false);
    const foreign = await (await get(`/api/admin/dashboard/revenue-targets?month=${month}&branch_id=${X1}`)).json();
    expect(foreign.targets).toEqual([]);
    const theirs = await (await get(`/api/admin/dashboard/revenue-targets?month=${month}`, xAdminToken)).json();
    expect(theirs.targets).toHaveLength(1);
    expect(theirs.targets[0]).toMatchObject({ branch_id: X1, target_amount: 7, actual_amount: 9999 });
  });

  it('is closed to staff and rejects a malformed month', async () => {
    expect((await get('/api/admin/dashboard/revenue-targets', staffToken)).status).toBe(403);
    expect((await get('/api/admin/dashboard/revenue-targets?month=oops')).status).toBe(400);
  });
});
