import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { db, bookings, classSessions, members } from '../src/db/index.js';
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
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
} from './helpers.js';

// =============================================================================
// Coach Profile, Schedule & Classes API Tests
// =============================================================================
// Covers:
//   GET  /api/coach/me/              - Coach profile with stats
//   GET  /api/coach/schedule         - Weekly schedule
//   GET  /api/coach/schedule/today   - Today's classes
//   GET  /api/coach/classes          - List classes
//   GET  /api/coach/classes/:id      - Class detail
//   POST /api/coach/classes/:id/attendance - Mark attendance (booking ID)
//   POST /api/coach/classes/:id/cancel    - Cancel class (session ID)

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

describe('Coach Profile, Schedule & Classes API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // 1. Coach Profile
  // ===========================================================================

  describe('Coach Profile', () => {
    it('GET /api/coach/me/ should return 200 with employee info and stats', async () => {
      const response = await makeCoachRequest('/api/coach/me');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('id');
      expect(json.data).toHaveProperty('employee_code');
      expect(json.data).toHaveProperty('full_name');
      expect(json.data).toHaveProperty('email');
      expect(json.data).toHaveProperty('branch_id');
      expect(json.data).toHaveProperty('job_title');
      expect(json.data).toHaveProperty('status');

      // Stats sub-object
      expect(json.data).toHaveProperty('stats');
      expect(json.data.stats).toHaveProperty('student_count');
      expect(json.data.stats).toHaveProperty('today_class_count');
      expect(json.data.stats).toHaveProperty('week_class_count');
      expect(typeof json.data.stats.student_count).toBe('number');
      expect(typeof json.data.stats.today_class_count).toBe('number');
      expect(typeof json.data.stats.week_class_count).toBe('number');
    });

    it('GET /api/coach/me/ without token should return 401', async () => {
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
    it('GET /api/coach/schedule should return 200 with bookings and availability', async () => {
      const response = await makeCoachRequest('/api/coach/schedule');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('bookings');
      expect(json.data).toHaveProperty('availability');
      expect(json.data).toHaveProperty('date_range');
      expect(Array.isArray(json.data.bookings)).toBe(true);
      expect(Array.isArray(json.data.availability)).toBe(true);
      expect(json.data.date_range).toHaveProperty('start_date');
      expect(json.data.date_range).toHaveProperty('end_date');
    });

    it('GET /api/coach/schedule/today should return 200 with sessions and summary', async () => {
      const response = await makeCoachRequest('/api/coach/schedule/today');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('date');
      expect(json.data).toHaveProperty('sessions');
      expect(json.data).toHaveProperty('summary');
      expect(Array.isArray(json.data.sessions)).toBe(true);
      expect(json.data.summary).toHaveProperty('total_classes');
      expect(json.data.summary).toHaveProperty('scheduled');
      expect(json.data.summary).toHaveProperty('completed');
      expect(json.data.summary).toHaveProperty('cancelled');
    });
  });

  // ===========================================================================
  // 3. Classes
  // ===========================================================================

  describe('Classes', () => {
    it('GET /api/coach/classes should return 200 with data array and meta', async () => {
      const response = await makeCoachRequest('/api/coach/classes');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json).toHaveProperty('meta');
      expect(json.meta).toHaveProperty('total');
      expect(json.meta).toHaveProperty('limit');
      expect(json.meta).toHaveProperty('offset');
    });

    it('GET /api/coach/classes with date filter should return 200', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await makeCoachRequest(`/api/coach/classes?date=${today}`);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      // All returned sessions should match the requested date
      for (const session of json.data) {
        expect(session.session_date).toBe(today);
      }
    });

    it('GET /api/coach/classes/:id should return 200 with session detail and bookings', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}`);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('id');
      expect(json.data.id).toBe(TEST_COACH_SESSION_ID);
      expect(json.data).toHaveProperty('class_name');
      expect(json.data).toHaveProperty('session_date');
      expect(json.data).toHaveProperty('start_time');
      expect(json.data).toHaveProperty('end_time');
      expect(json.data).toHaveProperty('status');
      expect(json.data).toHaveProperty('bookings');
      expect(Array.isArray(json.data.bookings)).toBe(true);
      expect(json.data).toHaveProperty('lesson_plan');
    });

    it('GET /api/coach/classes/:id for another coach\'s session should return 403', async () => {
      // TEST_SESSION_ID belongs to TEST_EMPLOYEE_ID, not TEST_COACH_EMPLOYEE_ID
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_SESSION_ID}`);

      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it('GET /api/coach/classes/:id for non-existent session should return 404', async () => {
      const fakeId = '00000000-0000-0000-0000-ffffffffffff';
      const response = await makeCoachRequest(`/api/coach/classes/${fakeId}`);

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
    it('POST /api/coach/classes/:id/attendance (attended=true) should return 200', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_BOOKING_ID}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          attended: true,
        }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('ATTENDED');
    });

    it('POST /api/coach/classes/:id/attendance (attended=false) should mark NO_SHOW', async () => {
      // Create a fresh booking for the NO_SHOW test
      const [noShowMember] = await db.insert(members).values({
        fullName: 'No Show Member',
        phone: '0977888999',
        memberCode: 'M-NOSHOW-01',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      const [noShowBooking] = await db.insert(bookings).values({
        sessionId: TEST_COACH_SESSION_ID,
        memberId: noShowMember.id,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await makeCoachRequest(`/api/coach/classes/${noShowBooking.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          attended: false,
        }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('NO_SHOW');
    });

    it('POST /api/coach/classes/:id/attendance for non-existent booking should return 404', async () => {
      const fakeBookingId = '00000000-0000-0000-0000-ffffffffffff';
      const response = await makeCoachRequest(`/api/coach/classes/${fakeBookingId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          attended: true,
        }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('NOT_FOUND');
    });
  });

  // ===========================================================================
  // 5. Cancel
  // ===========================================================================

  describe('Cancel', () => {
    it('POST /api/coach/classes/:id/cancel should return 200', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Personal emergency',
        }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('POST /api/coach/classes/:id/cancel without reason should return 400', async () => {
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('POST /api/coach/classes/:id/cancel for already cancelled session should return 400', async () => {
      // TEST_COACH_SESSION_ID was already cancelled in the first cancel test above
      const response = await makeCoachRequest(`/api/coach/classes/${TEST_COACH_SESSION_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Trying to cancel again',
        }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('ALREADY_CANCELLED');
    });
  });
});
