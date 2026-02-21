import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, classSessions, bookings, members, contracts, membershipPlans } from '../src/db/index.js';
import { eq, and } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
  TEST_CONTRACT_ID,
  TEST_CLASS_ID,
  TEST_SESSION_ID,
  TEST_TENANT_ID,
} from './helpers.js';

describe('Bookings API', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  // =========================================================================
  // GET /api/bookings
  // =========================================================================

  describe('GET /api/bookings', () => {
    it('should list bookings', async () => {
      const response = await authRequest('/api/bookings', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('total');
    });

    it('should filter by memberId', async () => {
      const response = await authRequest(`/api/bookings?memberId=${TEST_MEMBER_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await authRequest('/api/bookings?status=CONFIRMED', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  // =========================================================================
  // POST /api/bookings
  // =========================================================================

  describe('POST /api/bookings', () => {
    it('should create a CONFIRMED booking', async () => {
      const response = await authRequest('/api/bookings', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          memberId: TEST_MEMBER_ID,
          contractId: TEST_CONTRACT_ID,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.bookingStatus).toBe('CONFIRMED');
      expect(data.data.memberId).toBe(TEST_MEMBER_ID);
      expect(data.data.sessionId).toBe(TEST_SESSION_ID);

      // Verify session count incremented
      const [session] = await db
        .select()
        .from(classSessions)
        .where(eq(classSessions.id, TEST_SESSION_ID));
      expect(session.currentCount).toBeGreaterThanOrEqual(1);
    });

    it('should reject duplicate booking', async () => {
      // Previous test already created a booking for this session/member
      const response = await authRequest('/api/bookings', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          memberId: TEST_MEMBER_ID,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should create WAITLIST booking when full', async () => {
      // Set session to full capacity
      await db.update(classSessions).set({
        maxCapacity: 1,
        currentCount: 1,
      }).where(eq(classSessions.id, TEST_SESSION_ID));

      // Create a new member for this booking
      const [waitlistMember] = await db.insert(members).values({
        fullName: 'Waitlist Member',
        phone: '0911222333',
        memberCode: 'M-WAIT-001',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      const response = await authRequest('/api/bookings', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          memberId: waitlistMember.id,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.data.bookingStatus).toBe('WAITLIST');
      expect(data.data.waitlistPosition).toBe(1);

      // Reset session capacity and count
      await db.update(classSessions).set({
        maxCapacity: 20,
        currentCount: 1,
      }).where(eq(classSessions.id, TEST_SESSION_ID));
    });

    it('should reject non-existent session', async () => {
      const response = await authRequest('/api/bookings', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          sessionId: '00000000-0000-0000-0000-999999999999',
          memberId: TEST_MEMBER_ID,
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should reject past session', async () => {
      // Create a past session
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const [pastSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        instructorId: null,
        sessionDate: pastDate.toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '11:00',
        maxCapacity: 20,
        sessionStatus: 'SCHEDULED',
      }).returning();

      const response = await authRequest('/api/bookings', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          sessionId: pastSession.id,
          memberId: TEST_MEMBER_ID,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/bookings/:id
  // =========================================================================

  describe('GET /api/bookings/:id', () => {
    it('should get booking details', async () => {
      // Get the booking created earlier for TEST_MEMBER_ID + TEST_SESSION_ID
      const [existingBooking] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.sessionId, TEST_SESSION_ID), eq(bookings.memberId, TEST_MEMBER_ID)))
        .limit(1);

      expect(existingBooking).toBeDefined();

      const response = await authRequest(`/api/bookings/${existingBooking.id}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('session');
      expect(data.data).toHaveProperty('class');
      expect(data.data).toHaveProperty('member');
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await authRequest('/api/bookings/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/bookings/:id/cancel
  // =========================================================================

  describe('POST /api/bookings/:id/cancel', () => {
    it('should cancel a confirmed booking', async () => {
      // Create a far-future session so cancellation is allowed (>2hr before)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const [futureSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        instructorId: null,
        sessionDate: futureDate.toISOString().split('T')[0],
        startTime: '14:00',
        endTime: '15:00',
        maxCapacity: 20,
        currentCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      // Create a new member for fresh booking
      const [cancelMember] = await db.insert(members).values({
        fullName: 'Cancel Test Member',
        phone: '0933444555',
        memberCode: 'M-CANCEL-01',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      const [booking] = await db.insert(bookings).values({
        sessionId: futureSession.id,
        memberId: cancelMember.id,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await authRequest(`/api/bookings/${booking.id}/cancel`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ reason: 'Test cancellation' }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should promote waitlist on cancel', async () => {
      // Create a future session
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 8);

      const [futureSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: futureDate.toISOString().split('T')[0],
        startTime: '14:00',
        endTime: '15:00',
        maxCapacity: 1,
        currentCount: 1,
        waitlistCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      // Create two members
      const [member1] = await db.insert(members).values({
        fullName: 'Confirm Member',
        phone: '0955111222',
        memberCode: 'M-PRO-001',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      const [member2] = await db.insert(members).values({
        fullName: 'Waitlist Member 2',
        phone: '0955333444',
        memberCode: 'M-PRO-002',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      // Create confirmed and waitlist bookings
      const [confirmedBooking] = await db.insert(bookings).values({
        sessionId: futureSession.id,
        memberId: member1.id,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const [waitlistBooking] = await db.insert(bookings).values({
        sessionId: futureSession.id,
        memberId: member2.id,
        bookingStatus: 'WAITLIST',
        waitlistPosition: 1,
      }).returning();

      // Cancel the confirmed booking
      const response = await authRequest(`/api/bookings/${confirmedBooking.id}/cancel`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ reason: 'Promote test' }),
      });

      expect(response.status).toBe(200);

      // Verify waitlist member was promoted
      const [updatedWaitlist] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, waitlistBooking.id));

      expect(updatedWaitlist.bookingStatus).toBe('CONFIRMED');
      expect(updatedWaitlist.waitlistPosition).toBeNull();
    });

    it('should reject already cancelled booking', async () => {
      // Create a session and a cancelled booking
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 9);

      const [futureSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: futureDate.toISOString().split('T')[0],
        startTime: '16:00',
        endTime: '17:00',
        maxCapacity: 20,
        sessionStatus: 'SCHEDULED',
      }).returning();

      const [cancelledBooking] = await db.insert(bookings).values({
        sessionId: futureSession.id,
        memberId: TEST_MEMBER_ID,
        bookingStatus: 'CANCELLED',
        cancelledAt: new Date(),
      }).returning();

      const response = await authRequest(`/api/bookings/${cancelledBooking.id}/cancel`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ reason: 'double cancel' }),
      });

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /api/bookings/:id/attend
  // =========================================================================

  describe('POST /api/bookings/:id/attend', () => {
    it('should mark as attended and deduct count', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Create a COUNT_BASED plan and contract
      const [countPlan] = await db.insert(membershipPlans).values({
        name: 'Attend Count Plan',
        code: 'ATTEND-COUNT',
        planType: 'COUNT_BASED',
        classCounts: 10,
        price: '3000',
        tenantId: TEST_TENANT_ID,
        branchId: TEST_BRANCH_ID,
        isActive: true,
        allowPause: false,
        allowTransfer: false,
      }).returning();

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);

      const [countContract] = await db.insert(contracts).values({
        contractNo: 'C-ATT-001',
        memberId: TEST_MEMBER_ID,
        planId: countPlan.id,
        startDate: today,
        originalEndDate: endDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        status: 'ACTIVE',
        remainingCounts: 10,
        totalAmount: '3000',
        paymentStatus: 'PAID',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).returning();

      // Create a today session
      const [todaySession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: today,
        startTime: '10:00',
        endTime: '11:00',
        maxCapacity: 20,
        currentCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      // Create a confirmed booking
      const [booking] = await db.insert(bookings).values({
        sessionId: todaySession.id,
        memberId: TEST_MEMBER_ID,
        contractId: countContract.id,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await authRequest(`/api/bookings/${booking.id}/attend`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.remainingCounts).toBe(9);
    });

    it('should reject attend for non-CONFIRMED booking', async () => {
      const today = new Date().toISOString().split('T')[0];

      const [todaySession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: today,
        startTime: '11:00',
        endTime: '12:00',
        maxCapacity: 20,
        currentCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      // Create a booking that is already ATTENDED
      const [attendedBooking] = await db.insert(bookings).values({
        sessionId: todaySession.id,
        memberId: TEST_MEMBER_ID,
        bookingStatus: 'ATTENDED',
        attendedAt: new Date(),
      }).returning();

      const response = await authRequest(`/api/bookings/${attendedBooking.id}/attend`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject attend on wrong day', async () => {
      // Create a future session (not today)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const [futureSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: futureDate.toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '11:00',
        maxCapacity: 20,
        currentCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      const [booking] = await db.insert(bookings).values({
        sessionId: futureSession.id,
        memberId: TEST_MEMBER_ID,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await authRequest(`/api/bookings/${booking.id}/attend`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject attend with insufficient remaining counts', async () => {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);

      // Create a COUNT_BASED contract with 0 remaining counts
      const [zeroPlan] = await db.insert(membershipPlans).values({
        name: 'Zero Count Plan',
        code: 'PLAN-ZERO',
        planType: 'COUNT_BASED',
        classCounts: 10,
        price: '3000',
        tenantId: TEST_TENANT_ID,
        branchId: TEST_BRANCH_ID,
        isActive: true,
        allowPause: false,
        allowTransfer: false,
      }).returning();

      const [zeroContract] = await db.insert(contracts).values({
        contractNo: 'C-ZERO-001',
        memberId: TEST_MEMBER_ID,
        planId: zeroPlan.id,
        startDate: today,
        originalEndDate: endDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        status: 'ACTIVE',
        remainingCounts: 0,
        totalAmount: '3000',
        paymentStatus: 'PAID',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).returning();

      const [todaySession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: today,
        startTime: '12:00',
        endTime: '13:00',
        maxCapacity: 20,
        currentCount: 1,
        sessionStatus: 'SCHEDULED',
      }).returning();

      const [booking] = await db.insert(bookings).values({
        sessionId: todaySession.id,
        memberId: TEST_MEMBER_ID,
        contractId: zeroContract.id,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await authRequest(`/api/bookings/${booking.id}/attend`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await authRequest('/api/bookings/00000000-0000-0000-0000-999999999999/attend', {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
