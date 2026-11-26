import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, members, contracts, classes, classSessions, bookings, workoutLogs, bodyMeasurements } from '../src/db/index.js';
import { periodStartDate } from '../src/routes/member-workouts.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  memberAuthRequest,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_PLAN_ID,
  TEST_CONTRACT_ID,
  TEST_CLASS_ID,
  TEST_SESSION_ID,
  TEST_EMPLOYEE_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

// =============================================================================
// Endpoints the member-app calls (found by E2E against the real backend):
//   GET  /api/member/me (tenant-scoped)        PUT /api/member/me
//   GET  /api/member/workouts/stats            GET /api/member/measurements/stats
//   GET  /api/member/classes/sessions(/:id)
//   GET  /api/member/bookings  POST /api/member/bookings  DELETE /api/member/bookings/:id
// Every test checks own data only, other member / tenant invisible, and 401.
// =============================================================================

const NEIGHBOUR_ID = crypto.randomUUID();
const NO_CONTRACT_MEMBER_ID = crypto.randomUUID();
const TENANT_B_CLASS_ID = crypto.randomUUID();
const TENANT_B_SESSION_ID = crypto.randomUUID();
const FULL_SESSION_ID = crypto.randomUUID();
const SOON_SESSION_ID = crypto.randomUUID();
const PAST_SESSION_ID = crypto.randomUUID();

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const token = (id: string, branchId: string, tenantId: string, code = 'M000001') =>
  generateMemberTokens({ id, memberCode: code, branchId, tenantId }).accessToken;

const neighbourToken = () => token(NEIGHBOUR_ID, TEST_BRANCH_ID, TEST_TENANT_ID, 'M000097');
const tenantBToken = () => token(TEST_MEMBER_B_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID, 'OM0001');
/** Tenant A member id with a tenant B claim: must not reach tenant A data. */
const forgedToken = () => token(TEST_MEMBER_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID);

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

describe('member-app endpoints', () => {
  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values([
      { id: NEIGHBOUR_ID, fullName: 'Neighbour', phone: '0911000333', memberCode: 'M000097', branchId: TEST_BRANCH_ID, status: 'ACTIVE', joinDate: '2026-01-01', tenantId: TEST_TENANT_ID },
      { id: NO_CONTRACT_MEMBER_ID, fullName: 'No Contract', phone: '0911000444', memberCode: 'M000096', branchId: TEST_BRANCH_ID, status: 'ACTIVE', joinDate: '2026-01-01', tenantId: TEST_TENANT_ID },
    ]);
    await db.insert(contracts).values({
      contractNo: 'NB-1', memberId: NEIGHBOUR_ID, planId: TEST_PLAN_ID, startDate: isoDay(-1), originalEndDate: isoDay(30), endDate: isoDay(30),
      status: 'ACTIVE', totalAmount: '1', paidAmount: '1', paymentStatus: 'PAID', termsAccepted: true, branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID,
    });
    await db.insert(classes).values({
      id: TENANT_B_CLASS_ID, name: 'Tenant B Class', durationMinutes: 60, maxCapacity: 10, branchId: TEST_BRANCH_B_ID,
    });
    await db.insert(classSessions).values([
      { id: TENANT_B_SESSION_ID, classId: TENANT_B_CLASS_ID, branchId: TEST_BRANCH_B_ID, sessionDate: isoDay(1), startTime: '10:00', endTime: '11:00', maxCapacity: 10, sessionStatus: 'SCHEDULED' },
      { id: FULL_SESSION_ID, classId: TEST_CLASS_ID, branchId: TEST_BRANCH_ID, instructorId: TEST_EMPLOYEE_ID, sessionDate: isoDay(2), startTime: '09:00', endTime: '10:00', maxCapacity: 1, currentCount: 1, waitlistCount: 0, sessionStatus: 'SCHEDULED' },
      { id: SOON_SESSION_ID, classId: TEST_CLASS_ID, branchId: TEST_BRANCH_ID, sessionDate: isoDay(3), startTime: '08:00', endTime: '09:00', maxCapacity: 5, sessionStatus: 'SCHEDULED' },
      { id: PAST_SESSION_ID, classId: TEST_CLASS_ID, branchId: TEST_BRANCH_ID, sessionDate: isoDay(-3), startTime: '08:00', endTime: '09:00', maxCapacity: 5, sessionStatus: 'SCHEDULED' },
    ]);
  });

  afterAll(async () => {
    await db.delete(workoutLogs).where(inArray(workoutLogs.memberId, [TEST_MEMBER_ID, NEIGHBOUR_ID, TEST_MEMBER_B_ID]));
    await db.delete(bodyMeasurements).where(inArray(bodyMeasurements.memberId, [TEST_MEMBER_ID, NEIGHBOUR_ID, TEST_MEMBER_B_ID]));
    await db.delete(classSessions).where(eq(classSessions.id, TENANT_B_SESSION_ID));
    await db.delete(classes).where(eq(classes.id, TENANT_B_CLASS_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  describe('GET/PUT /api/member/me', () => {
    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/me')).status).toBe(401);
      expect((await app.request('/api/member/me', { method: 'PUT', body: '{}' })).status).toBe(401);
    });

    it('returns the own profile with branch and contracts, without staff-only fields', async () => {
      const res = await memberAuthRequest('/api/member/me');
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.member).toMatchObject({ id: TEST_MEMBER_ID, memberCode: 'M000001', status: 'ACTIVE' });
      expect(data.branch.id).toBe(TEST_BRANCH_ID);
      expect(data.contracts.map((c: { id: string }) => c.id)).toEqual([TEST_CONTRACT_ID]);
      for (const key of ['notes', 'tags', 'idNumber', 'salesPersonId', 'tenantId']) {
        expect(data.member).not.toHaveProperty(key);
      }
    });

    it('does not resolve a member id outside the token tenant', async () => {
      const res = await memberAuthRequest('/api/member/me', { token: forgedToken() });
      expect(res.status).toBe(404);

      const put = await memberAuthRequest('/api/member/me', { token: forgedToken(), method: 'PUT', body: JSON.stringify({ address: 'forged' }) });
      expect(put.status).toBe(404);
      const [row] = await db.select({ address: members.address }).from(members).where(eq(members.id, TEST_MEMBER_ID));
      expect(row!.address).not.toBe('forged');
    });

    it('/api/member/profile is not a route (member-app uses /me)', async () => {
      expect((await memberAuthRequest('/api/member/profile')).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET/PUT /api/member/notifications/preferences', () => {
    const put = (body: unknown, opts: { token?: string } = {}) =>
      memberAuthRequest('/api/member/notifications/preferences', { method: 'PUT', body: JSON.stringify(body), ...opts });

    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/notifications/preferences')).status).toBe(401);
    });

    it('stores every option the member-app settings page offers', async () => {
      const res = await put({ types: { booking_confirmation: false, payment_confirmation: false }, smsFallback: true });
      expect(res.status).toBe(200);

      const { data } = await (await memberAuthRequest('/api/member/notifications/preferences')).json();
      expect(data.preferences.types).toMatchObject({ booking_confirmation: false, payment_confirmation: false, booking_reminder: true });
      expect(data.preferences.smsFallback).toBe(true);
    });

    it('keeps each member\'s preferences separate and refuses a member outside the token tenant', async () => {
      const theirs = await (await memberAuthRequest('/api/member/notifications/preferences', { token: neighbourToken() })).json();
      expect(theirs.data.preferences.smsFallback).toBe(false);

      expect((await put({ smsFallback: false }, { token: forgedToken() })).status).toBe(404);
      const mine = await (await memberAuthRequest('/api/member/notifications/preferences')).json();
      expect(mine.data.preferences.smsFallback).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/member/workouts/stats', () => {
    beforeAll(async () => {
      const today = isoDay(0);
      await db.insert(workoutLogs).values([
        { memberId: TEST_MEMBER_ID, date: today, duration: 30, calories: 200, exercises: [] },
        { memberId: TEST_MEMBER_ID, date: today, duration: 50, calories: 300, exercises: [] },
        { memberId: TEST_MEMBER_ID, date: '2000-01-01', duration: 999, calories: 999, exercises: [] },
        { memberId: NEIGHBOUR_ID, date: today, duration: 45, calories: 777, exercises: [] },
      ]);
    });

    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/workouts/stats')).status).toBe(401);
    });

    it('aggregates only own workouts in the current calendar period', async () => {
      const res = await memberAuthRequest('/api/member/workouts/stats?period=week');
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.stats).toMatchObject({
        period: 'week', totalWorkouts: 2, totalDuration: 80, totalCalories: 500, avgDuration: 40, avgCalories: 250, workoutDays: 1,
      });
      expect(data.daily).toEqual([{ date: isoDay(0), duration: 80, calories: 500, count: 2 }]);
    });

    it('defaults to week and rejects unknown periods', async () => {
      expect((await (await memberAuthRequest('/api/member/workouts/stats')).json()).data.stats.period).toBe('week');
      expect((await memberAuthRequest('/api/member/workouts/stats?period=decade')).status).toBe(400);
    });

    it('does not count another member\'s workouts', async () => {
      const theirs = await (await memberAuthRequest('/api/member/workouts/stats?period=year', { token: neighbourToken() })).json();
      expect(theirs.data.stats.totalCalories).toBe(777);
      const tenantB = await (await memberAuthRequest('/api/member/workouts/stats?period=year', { token: tenantBToken() })).json();
      expect(tenantB.data.stats.totalWorkouts).toBe(0);
    });

    it('a non-uuid id is a 404, not a 500', async () => {
      expect((await memberAuthRequest('/api/member/workouts/not-a-uuid')).status).toBe(404);
    });

    it('periodStartDate uses Monday / 1st of month / Jan 1', () => {
      const wed = new Date('2026-11-25T12:00:00Z');
      expect(periodStartDate('week', wed)).toBe('2026-11-23');
      expect(periodStartDate('week', new Date('2026-11-29T12:00:00Z'))).toBe('2026-11-23'); // Sunday
      expect(periodStartDate('month', wed)).toBe('2026-11-01');
      expect(periodStartDate('year', wed)).toBe('2026-01-01');
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/member/measurements/stats', () => {
    beforeAll(async () => {
      await db.insert(bodyMeasurements).values([
        { memberId: TEST_MEMBER_ID, date: isoDay(-20), weight: 80, bodyFat: 25, source: 'MANUAL' },
        { memberId: TEST_MEMBER_ID, date: isoDay(-5), weight: 78.2, bodyFat: 24.8, muscleMass: 35, source: 'MANUAL' },
        { memberId: TEST_MEMBER_ID, date: isoDay(-200), weight: 90, source: 'MANUAL' },
        { memberId: NEIGHBOUR_ID, date: isoDay(-2), weight: 120, source: 'MANUAL' },
      ]);
    });

    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/measurements/stats')).status).toBe(401);
    });

    it('returns per-metric trends for own measurements in the period', async () => {
      const res = await memberAuthRequest('/api/member/measurements/stats?period=30');
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.stats.totalRecords).toBe(2);
      expect(data.stats.periodDays).toBe(30);
      expect(data.stats.weight.first).toBe(80);
      expect(data.stats.weight.last).toBeCloseTo(78.2, 1);
      expect(data.stats.weight.change).toBeCloseTo(-1.8, 1);
      expect(data.stats.weight.trend).toBe('down');
      expect(data.stats.bodyFat.trend).toBe('stable');
      expect(data.stats.muscleMass).toMatchObject({ first: 35, last: 35, change: 0, trend: 'stable' });
      expect(data.stats.bmi).toEqual({ first: null, last: null, change: null, trend: null });
      expect(data.daily.map((d: { date: string }) => d.date)).toEqual([isoDay(-20), isoDay(-5)]);
    });

    it('does not include another member\'s measurements', async () => {
      const theirs = await (await memberAuthRequest('/api/member/measurements/stats', { token: neighbourToken() })).json();
      expect(theirs.data.stats.totalRecords).toBe(1);
      expect(theirs.data.stats.weight.last).toBe(120);
      const tenantB = await (await memberAuthRequest('/api/member/measurements/stats', { token: tenantBToken() })).json();
      expect(tenantB.data.stats.totalRecords).toBe(0);
    });

    it('rejects an out-of-range period', async () => {
      expect((await memberAuthRequest('/api/member/measurements/stats?period=0')).status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/member/classes/sessions', () => {
    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/classes/sessions')).status).toBe(401);
      expect((await app.request(`/api/member/classes/sessions/${TEST_SESSION_ID}`)).status).toBe(401);
    });

    it('lists upcoming scheduled sessions of the token tenant only', async () => {
      const res = await memberAuthRequest('/api/member/classes/sessions');
      expect(res.status).toBe(200);
      const ids = (await res.json()).data.sessions.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([TEST_SESSION_ID, FULL_SESSION_ID, SOON_SESSION_ID]));
      expect(ids).not.toContain(TENANT_B_SESSION_ID);
      expect(ids).not.toContain(PAST_SESSION_ID);

      const tenantB = await (await memberAuthRequest('/api/member/classes/sessions', { token: tenantBToken() })).json();
      expect(tenantB.data.sessions.map((s: { id: string }) => s.id)).toEqual([TENANT_B_SESSION_ID]);
    });

    it('returns member-facing fields with class and instructor', async () => {
      const { data } = await (await memberAuthRequest('/api/member/classes/sessions')).json();
      const s = data.sessions.find((x: { id: string }) => x.id === TEST_SESSION_ID);
      expect(s).toMatchObject({
        sessionDate: isoDay(1), startTime: '10:00:00', maxCapacity: 20, sessionStatus: 'SCHEDULED',
        class: { id: TEST_CLASS_ID, name: 'Test Yoga', category: 'YOGA' },
        branch: { id: TEST_BRANCH_ID },
      });
      expect(s.instructor.id).toBe(TEST_EMPLOYEE_ID);
      expect(s).not.toHaveProperty('cancelledBy');
      expect(s.instructor).not.toHaveProperty('phone');
    });

    it('filters by branch and ignores a branch of another tenant', async () => {
      const other = await (await memberAuthRequest(`/api/member/classes/sessions?branchId=${TEST_BRANCH_B_ID}`)).json();
      expect(other.data.sessions).toEqual([]);
    });

    it('session detail is tenant-scoped', async () => {
      expect((await memberAuthRequest(`/api/member/classes/sessions/${TEST_SESSION_ID}`)).status).toBe(200);
      expect((await memberAuthRequest(`/api/member/classes/sessions/${TENANT_B_SESSION_ID}`)).status).toBe(404);
      expect((await memberAuthRequest('/api/member/classes/sessions/nope')).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('/api/member/bookings', () => {
    beforeEach(async () => {
      await db.delete(bookings).where(inArray(bookings.sessionId, [TEST_SESSION_ID, FULL_SESSION_ID, SOON_SESSION_ID, PAST_SESSION_ID, TENANT_B_SESSION_ID]));
      await db.update(classSessions).set({ currentCount: 0, waitlistCount: 0 }).where(inArray(classSessions.id, [TEST_SESSION_ID, SOON_SESSION_ID]));
      await db.update(classSessions).set({ currentCount: 1, waitlistCount: 0 }).where(eq(classSessions.id, FULL_SESSION_ID));
    });

    const counts = async (id: string) =>
      (await db.select({ currentCount: classSessions.currentCount, waitlistCount: classSessions.waitlistCount }).from(classSessions).where(eq(classSessions.id, id)))[0]!;

    it('returns 401 without a token', async () => {
      expect((await app.request('/api/member/bookings')).status).toBe(401);
      expect((await app.request('/api/member/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: TEST_SESSION_ID }) })).status).toBe(401);
      expect((await app.request(`/api/member/bookings/${crypto.randomUUID()}`, { method: 'DELETE' })).status).toBe(401);
    });

    it('books with the member\'s own valid contract and does not deduct counts', async () => {
      const res = await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID, memberId: NEIGHBOUR_ID }));
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data.booking).toMatchObject({ sessionId: TEST_SESSION_ID, contractId: TEST_CONTRACT_ID, bookingStatus: 'CONFIRMED' });
      expect(data.booking).not.toHaveProperty('memberId');

      const [stored] = await db.select().from(bookings).where(eq(bookings.id, data.booking.id));
      expect(stored!.memberId).toBe(TEST_MEMBER_ID); // body memberId is ignored
      expect(stored!.countDeducted).toBe(false);
      expect((await counts(TEST_SESSION_ID)).currentCount).toBe(1);
    });

    it('puts the booking on the waitlist when the session is full', async () => {
      const res = await memberAuthRequest('/api/member/bookings', json({ sessionId: FULL_SESSION_ID }));
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data.booking).toMatchObject({ bookingStatus: 'WAITLIST', waitlistPosition: 1 });
      expect(await counts(FULL_SESSION_ID)).toEqual({ currentCount: 1, waitlistCount: 1 });
    });

    it('refuses duplicate, past and other-tenant sessions', async () => {
      expect((await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID }))).status).toBe(201);
      const dup = await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID }));
      expect(dup.status).toBe(400);
      expect((await memberAuthRequest('/api/member/bookings', json({ sessionId: PAST_SESSION_ID }))).status).toBe(400);
      expect((await memberAuthRequest('/api/member/bookings', json({ sessionId: TENANT_B_SESSION_ID }))).status).toBe(404);
    });

    it('requires a valid contract owned by the member', async () => {
      const none = await memberAuthRequest('/api/member/bookings', {
        ...json({ sessionId: TEST_SESSION_ID }),
        token: token(NO_CONTRACT_MEMBER_ID, TEST_BRANCH_ID, TEST_TENANT_ID, 'M000096'),
      });
      expect(none.status).toBe(400);
      expect((await none.json()).code).toBe('NO_VALID_CONTRACT');

      const [neighbourContract] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.memberId, NEIGHBOUR_ID));
      const foreign = await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID, contractId: neighbourContract!.id }));
      expect(foreign.status).toBe(400);

      const forged = await memberAuthRequest('/api/member/bookings', { ...json({ sessionId: TEST_SESSION_ID }), token: forgedToken() });
      expect(forged.status).toBe(400);
      expect(await counts(TEST_SESSION_ID)).toEqual({ currentCount: 0, waitlistCount: 0 });
    });

    it('lists only own bookings with session and class info', async () => {
      await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID }));
      await memberAuthRequest('/api/member/bookings', { ...json({ sessionId: SOON_SESSION_ID }), token: neighbourToken() });

      const mine = await (await memberAuthRequest('/api/member/bookings')).json();
      expect(mine.data.bookings).toHaveLength(1);
      expect(mine.data.bookings[0]).toMatchObject({
        sessionId: TEST_SESSION_ID, bookingStatus: 'CONFIRMED', hasReview: false,
        session: { sessionDate: isoDay(1), startTime: '10:00:00' },
        class: { name: 'Test Yoga' },
      });
      expect(mine.data.bookings[0]).not.toHaveProperty('memberId');

      const theirs = await (await memberAuthRequest('/api/member/bookings', { token: neighbourToken() })).json();
      expect(theirs.data.bookings.map((b: { sessionId: string }) => b.sessionId)).toEqual([SOON_SESSION_ID]);
      const forged = await (await memberAuthRequest('/api/member/bookings', { token: forgedToken() })).json();
      expect(forged.data.bookings).toEqual([]);
    });

    it('cancels an own booking, frees the seat and allows rebooking', async () => {
      const { data } = await (await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID }))).json();
      const res = await memberAuthRequest(`/api/member/bookings/${data.booking.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect((await counts(TEST_SESSION_ID)).currentCount).toBe(0);

      const again = await memberAuthRequest('/api/member/bookings', json({ sessionId: TEST_SESSION_ID }));
      expect(again.status).toBe(201);
      expect((await again.json()).data.booking.id).toBe(data.booking.id);
    });

    it('cannot cancel another member\'s booking', async () => {
      const { data } = await (await memberAuthRequest('/api/member/bookings', { ...json({ sessionId: SOON_SESSION_ID }), token: neighbourToken() })).json();
      expect((await memberAuthRequest(`/api/member/bookings/${data.booking.id}`, { method: 'DELETE' })).status).toBe(404);
      expect((await memberAuthRequest(`/api/member/bookings/${data.booking.id}`, { method: 'DELETE', token: tenantBToken() })).status).toBe(404);
      const [stored] = await db.select({ bookingStatus: bookings.bookingStatus }).from(bookings).where(eq(bookings.id, data.booking.id));
      expect(stored!.bookingStatus).toBe('CONFIRMED');
    });
  });
});
