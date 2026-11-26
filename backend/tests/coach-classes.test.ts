import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import {
  db,
  bookings,
  classSessions,
  members,
  contracts,
  contractLogs,
  classRecords,
} from '../src/db/index.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_COACH_SESSION_ID,
  TEST_COACH_CLASS_ID,
  TEST_COACH_EMPLOYEE_ID,
  TEST_BOOKING_ID,
  TEST_SESSION_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_MEMBER_ID,
  TEST_COUNT_PLAN_ID,
} from './helpers.js';

// =============================================================================
// Coach Profile, Schedule & Classes API Tests
// =============================================================================
// Covers:
//   GET  /api/coach/me/              - Coach profile with stats
//   GET  /api/coach/schedule         - Schedule for a date range
//   GET  /api/coach/schedule/today   - Today's classes
//   GET  /api/coach/classes          - List classes
//   GET  /api/coach/classes/:id      - Class detail
//   POST /api/coach/classes/:id/attendance - Mark attendance (booking ID)
//   POST /api/coach/classes/:id/cancel    - Cancel class (session ID)

const todayStr = new Date().toISOString().split('T')[0];
const MISSING_ID = '00000000-0000-4000-8000-ffffffffffff';

async function makeCoachRequest(path: string, options: RequestInit = {}) {
  const token = await getCoachToken();
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', token);
  headers.set('X-Tenant-Id', TEST_TENANT_ID);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

/** Request as a coach of ANOTHER tenant (token only; these routes do not need a matching DB row). */
function otherTenantCoachRequest(path: string, options: RequestInit = {}) {
  const { accessToken } = generateCoachTokens({
    id: TEST_EMPLOYEE_B_ID,
    employeeCode: 'OEMP01',
    branchId: TEST_BRANCH_B_ID,
    tenantId: TEST_TENANT_B_ID,
    jobTitle: 'COACH',
  });
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', accessToken);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

describe('Coach Profile, Schedule & Classes API', () => {
  // Rows created by individual tests; removed in afterAll before fixture cleanup
  const createdBookingIds: string[] = [];
  const createdContractIds: string[] = [];
  let memberSeq = 0;

  async function createMember() {
    memberSeq += 1;
    const [member] = await db.insert(members).values({
      fullName: `Class Test Member ${memberSeq}`,
      phone: `09778890${memberSeq.toString().padStart(2, '0')}`,
      memberCode: `M-CLS-${memberSeq.toString().padStart(2, '0')}`,
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: todayStr,
      tenantId: TEST_TENANT_ID,
    }).returning();
    return member;
  }

  async function createCountContract(memberId: string, contractNo: string) {
    const [contract] = await db.insert(contracts).values({
      contractNo,
      memberId,
      planId: TEST_COUNT_PLAN_ID,
      startDate: todayStr,
      originalEndDate: '2099-12-31',
      endDate: '2099-12-31',
      status: 'ACTIVE',
      totalAmount: '2000',
      paidAmount: '2000',
      paymentStatus: 'PAID',
      termsAccepted: true,
      remainingCounts: 5,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
    }).returning();
    createdContractIds.push(contract.id);
    return contract;
  }

  async function createBooking(values: {
    sessionId: string;
    memberId: string;
    contractId?: string;
  }) {
    const [booking] = await db.insert(bookings).values({
      ...values,
      bookingStatus: 'CONFIRMED',
    }).returning();
    createdBookingIds.push(booking.id);
    return booking;
  }

  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    if (createdBookingIds.length > 0) {
      await db.delete(classRecords).where(inArray(classRecords.bookingId, createdBookingIds));
      await db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
    }
    await db.delete(classRecords).where(eq(classRecords.bookingId, TEST_BOOKING_ID));
    for (const contractId of createdContractIds) {
      await db.delete(contractLogs).where(eq(contractLogs.contractId, contractId));
    }
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // 1. Coach Profile
  // ===========================================================================

  describe('Coach Profile', () => {
    it('GET /api/coach/me returns the coach profile and stats', async () => {
      const response = await makeCoachRequest('/api/coach/me');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(json.data.employee_code).toBe('COACH001');
      expect(json.data.full_name).toBe('Test Coach');
      expect(json.data.branch_id).toBe(TEST_BRANCH_ID);
      expect(json.data.job_title).toBe('教練');
      expect(json.data.status).toBe('ACTIVE');

      // Fixtures: 1 active assignment, 1 scheduled session today
      expect(json.data.stats.student_count).toBe(1);
      expect(json.data.stats.today_class_count).toBe(1);
      expect(json.data.stats.week_class_count).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/coach/me without token should return 401', async () => {
      const response = await app.request('/api/coach/me', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // 2. Schedule
  // ===========================================================================

  describe('Schedule', () => {
    it('GET /api/coach/schedule returns the coach session with its members for the range', async () => {
      const response = await makeCoachRequest(
        `/api/coach/schedule?start_date=${todayStr}&end_date=${todayStr}`
      );

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.date_range).toEqual({ start_date: todayStr, end_date: todayStr });
      expect(Array.isArray(json.data.availability)).toBe(true);

      const session = json.data.bookings.find((b: { id: string }) => b.id === TEST_COACH_SESSION_ID);
      expect(session).toBeDefined();
      expect(session.class_name).toBe('私人教練課');
      expect(session.session_date).toBe(todayStr);
      expect(session.status).toBe('SCHEDULED');
      expect(session.member.id).toBe(TEST_MEMBER_ID);
      expect(session.member.member_code).toBe('M000001');
      // Other coaches' sessions must not leak into this schedule
      expect(json.data.bookings.some((b: { id: string }) => b.id === TEST_SESSION_ID)).toBe(false);
    });

    it("GET /api/coach/schedule/today returns today's session with attendance summary", async () => {
      const response = await makeCoachRequest('/api/coach/schedule/today');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.date).toBe(todayStr);
      expect(json.data.sessions).toHaveLength(1);
      expect(json.data.sessions[0].id).toBe(TEST_COACH_SESSION_ID);
      expect(json.data.sessions[0].attendance).toEqual({ confirmed: 1, attended: 0, noShow: 0 });
      expect(json.data.summary).toEqual({
        total_classes: 1,
        scheduled: 1,
        completed: 0,
        cancelled: 0,
      });
    });

    it('GET /api/coach/schedule/today for a coach in another tenant returns no sessions', async () => {
      const response = await otherTenantCoachRequest('/api/coach/schedule/today');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.sessions).toEqual([]);
      expect(json.data.summary.total_classes).toBe(0);
    });
  });

  // ===========================================================================
  // 3. Classes
  // ===========================================================================

  describe('Classes', () => {
    it("GET /api/coach/classes lists only the coach's sessions with their bookings", async () => {
      const response = await makeCoachRequest('/api/coach/classes');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.meta.limit).toBe(20);
      expect(json.meta.offset).toBe(0);

      const session = json.data.find((s: { id: string }) => s.id === TEST_COACH_SESSION_ID);
      expect(session).toBeDefined();
      expect(session.class_name).toBe('私人教練課');
      expect(session.bookings).toHaveLength(1);
      expect(session.bookings[0].member_id).toBe(TEST_MEMBER_ID);
      expect(session.bookings[0].booking_status).toBe('CONFIRMED');
      expect(json.data.some((s: { id: string }) => s.id === TEST_SESSION_ID)).toBe(false);
    });

    it('GET /api/coach/classes with date filter only returns sessions on that date', async () => {
      const response = await makeCoachRequest(`/api/coach/classes?date=${todayStr}`);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      for (const session of json.data) {
        expect(session.session_date).toBe(todayStr);
      }

      const empty = await (await makeCoachRequest('/api/coach/classes?date=1999-01-01')).json();
      expect(empty.data).toEqual([]);
      expect(empty.meta.total).toBe(0);
    });

    it('GET /api/coach/classes for a coach in another tenant returns nothing', async () => {
      const response = await otherTenantCoachRequest('/api/coach/classes');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toEqual([]);
    });

    it('GET /api/coach/classes/:id returns session detail with bookings', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}`);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(TEST_COACH_SESSION_ID);
      expect(json.data.class_id).toBe(TEST_COACH_CLASS_ID);
      expect(json.data.class_name).toBe('私人教練課');
      expect(json.data.session_date).toBe(todayStr);
      expect(json.data.start_time).toMatch(/^10:00/);
      expect(json.data.end_time).toMatch(/^11:00/);
      expect(json.data.status).toBe('SCHEDULED');
      expect(json.data.lesson_plan).toBeNull();
      expect(json.data.bookings).toHaveLength(1);
      expect(json.data.bookings[0]).toMatchObject({
        id: TEST_BOOKING_ID,
        member_id: TEST_MEMBER_ID,
        member_code: 'M000001',
        booking_status: 'CONFIRMED',
        record: null,
      });
    });

    it("GET /api/coach/classes/:id for another coach's session should return 403", async () => {
      // TEST_SESSION_ID belongs to TEST_EMPLOYEE_ID, not TEST_COACH_EMPLOYEE_ID
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_SESSION_ID}`);

      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it("GET /api/coach/classes/:id from another tenant's coach should return 403 without leaking data", async () => {
      const response = await otherTenantCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}`);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe('FORBIDDEN');
      expect(JSON.stringify(json)).not.toContain('M000001');
    });

    it('GET /api/coach/classes/:id for non-existent session should return 404', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${MISSING_ID}`);

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('NOT_FOUND');
    });
  });

  // ===========================================================================
  // 4. Attendance
  // ===========================================================================

  describe('Attendance', () => {
    it('attended=true marks the booking ATTENDED and stamps attended_at', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_BOOKING_ID}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: true }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('ATTENDED');

      const [row] = await db.select().from(bookings).where(eq(bookings.id, TEST_BOOKING_ID));
      expect(row.bookingStatus).toBe('ATTENDED');
      expect(row.attendedAt).not.toBeNull();
    });

    it('attended=false marks the booking NO_SHOW without attended_at', async () => {
      const member = await createMember();
      const booking = await createBooking({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: member.id,
      });

      const response = await makeCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: false }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('NO_SHOW');

      const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(row.bookingStatus).toBe('NO_SHOW');
      expect(row.attendedAt).toBeNull();
    });

    it('stores the class record sent with attendance', async () => {
      const member = await createMember();
      const booking = await createBooking({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: member.id,
      });

      const response = await makeCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          attended: true,
          class_record: { warmup: '慢跑 5 分鐘', coach_notes: '狀況良好', next_plan: '加重 5kg' },
        }),
      });
      expect(response.status).toBe(200);

      const [record] = await db.select().from(classRecords).where(eq(classRecords.bookingId, booking.id));
      expect(record.warmupContent).toBe('慢跑 5 分鐘');
      expect(record.coachNotes).toBe('狀況良好');
      expect(record.nextPlan).toBe('加重 5kg');
      expect(record.coachId).toBe(TEST_COACH_EMPLOYEE_ID);

      // The session detail exposes the record for that booking
      const detail = await (await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}`)).json();
      const detailBooking = detail.data.bookings.find((b: { id: string }) => b.id === booking.id);
      expect(detailBooking.record.coach_notes).toBe('狀況良好');
    });

    it('deducts one COUNT_BASED class exactly once and logs it', async () => {
      const member = await createMember();
      const contract = await createCountContract(member.id, 'C-CLS-COUNT-1');
      const booking = await createBooking({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: member.id,
        contractId: contract.id,
      });

      const attend = () => makeCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: true }),
      });

      expect((await attend()).status).toBe(200);

      const [afterFirst] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
      expect(afterFirst.remainingCounts).toBe(4);
      const [bookingRow] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(bookingRow.countDeducted).toBe(true);
      const logs = await db.select().from(contractLogs).where(eq(contractLogs.contractId, contract.id));
      expect(logs).toHaveLength(1);
      expect(logs[0].logType).toBe('CLASS_USED');

      // Marking the same booking again must not deduct a second class
      expect((await attend()).status).toBe(200);
      const [afterSecond] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
      expect(afterSecond.remainingCounts).toBe(4);
    });

    it('does not deduct a class when the member is marked NO_SHOW', async () => {
      const member = await createMember();
      const contract = await createCountContract(member.id, 'C-CLS-COUNT-2');
      const booking = await createBooking({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: member.id,
        contractId: contract.id,
      });

      const response = await makeCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: false }),
      });
      expect(response.status).toBe(200);

      const [row] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
      expect(row.remainingCounts).toBe(5);
    });

    it("rejects attendance for a booking on another coach's session with 403", async () => {
      const member = await createMember();
      const booking = await createBooking({ sessionId: TEST_SESSION_ID, memberId: member.id });

      const response = await makeCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: true }),
      });

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');
      const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(row.bookingStatus).toBe('CONFIRMED');
    });

    it('rejects attendance from a coach of another tenant with 403', async () => {
      const member = await createMember();
      const booking = await createBooking({ sessionId: TEST_COACH_SESSION_ID, memberId: member.id });

      const response = await otherTenantCoachRequest(`/api/coach/classes/${booking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: true }),
      });

      expect(response.status).toBe(403);
      const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(row.bookingStatus).toBe('CONFIRMED');
    });

    it('for non-existent booking should return 404', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${MISSING_ID}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ attended: true }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('NOT_FOUND');
    });

    it('rejects a body without the attended flag with 400', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_BOOKING_ID}/attendance`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  // ===========================================================================
  // 5. Cancel
  // ===========================================================================

  describe('Cancel', () => {
    it("rejects cancellation from another tenant's coach with 403 and leaves the session untouched", async () => {
      const response = await otherTenantCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'not mine' }),
      });

      expect(response.status).toBe(403);
      const [row] = await db.select().from(classSessions).where(eq(classSessions.id, TEST_COACH_SESSION_ID));
      expect(row.sessionStatus).toBe('SCHEDULED');
    });

    it('cancels the session and its CONFIRMED bookings only', async () => {
      const member = await createMember();
      const confirmed = await createBooking({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: member.id,
      });

      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Personal emergency' }),
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const [session] = await db.select().from(classSessions).where(eq(classSessions.id, TEST_COACH_SESSION_ID));
      expect(session.sessionStatus).toBe('CANCELLED');
      expect(session.cancelledReason).toBe('Personal emergency');
      expect(session.cancelledAt).not.toBeNull();

      const [cancelledBooking] = await db.select().from(bookings).where(eq(bookings.id, confirmed.id));
      expect(cancelledBooking.bookingStatus).toBe('CANCELLED');
      expect(cancelledBooking.cancelReason).toContain('Personal emergency');

      // Already-attended bookings keep their status
      const [attendedBooking] = await db.select().from(bookings).where(eq(bookings.id, TEST_BOOKING_ID));
      expect(attendedBooking.bookingStatus).toBe('ATTENDED');
    });

    it('without reason should return 400', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('for already cancelled session should return 400 ALREADY_CANCELLED', async () => {
      // TEST_COACH_SESSION_ID was cancelled in the test above
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Trying to cancel again' }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('ALREADY_CANCELLED');
    });

    it('for a COMPLETED session should return 400 ALREADY_COMPLETED', async () => {
      const [completed] = await db.insert(classSessions).values({
        classId: TEST_COACH_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        instructorId: TEST_COACH_EMPLOYEE_ID,
        sessionDate: todayStr,
        startTime: '14:00',
        endTime: '15:00',
        maxCapacity: 1,
        currentCount: 0,
        waitlistCount: 0,
        sessionStatus: 'COMPLETED',
      }).returning();

      const response = await makeCoachRequest(`/api/coach/classes/${completed.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'too late' }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('ALREADY_COMPLETED');
    });

    it('for a non-existent session should return 404', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${MISSING_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'x' }),
      });

      expect(response.status).toBe(404);
    });
  });
});
