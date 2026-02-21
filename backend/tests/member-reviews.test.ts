import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, classSessions, bookings, classReviews } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  memberAuthRequest,
  getMemberAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_CLASS_ID,
  TEST_SESSION_ID,
  TEST_TENANT_ID,
} from './helpers.js';

describe('Member Reviews API', () => {
  let memberToken: string;
  let attendedBookingId: string;
  let attendedSessionId: string;

  beforeAll(async () => {
    await createTestFixtures();
    memberToken = getMemberAuthToken();

    // Create a COMPLETED session for reviews
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    const [completedSession] = await db.insert(classSessions).values({
      classId: TEST_CLASS_ID,
      branchId: TEST_BRANCH_ID,
      sessionDate: pastDateStr,
      startTime: '10:00',
      endTime: '11:00',
      maxCapacity: 20,
      currentCount: 1,
      sessionStatus: 'COMPLETED',
    }).returning();

    attendedSessionId = completedSession.id;

    // Create an attended booking for the test member
    const [booking] = await db.insert(bookings).values({
      sessionId: completedSession.id,
      memberId: TEST_MEMBER_ID,
      bookingStatus: 'ATTENDED',
      attendedAt: pastDate,
    }).returning();

    attendedBookingId = booking.id;
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  // =========================================================================
  // GET /api/member/reviews/eligibility/:bookingId
  // =========================================================================

  describe('GET /api/member/reviews/eligibility/:bookingId', () => {
    it('should return eligible for attended booking', async () => {
      const response = await memberAuthRequest(`/api/member/reviews/eligibility/${attendedBookingId}`, {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.eligible).toBe(true);
    });

    it('should reject non-attended booking', async () => {
      // Create a separate session to avoid unique constraint on (session_id, member_id)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const [otherSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: pastDate.toISOString().split('T')[0],
        startTime: '14:00',
        endTime: '15:00',
        maxCapacity: 20,
        sessionStatus: 'COMPLETED',
      }).returning();

      // Create a confirmed-only booking (not attended)
      const [confirmedBooking] = await db.insert(bookings).values({
        sessionId: otherSession.id,
        memberId: TEST_MEMBER_ID,
        bookingStatus: 'CONFIRMED',
      }).returning();

      const response = await memberAuthRequest(`/api/member/reviews/eligibility/${confirmedBooking.id}`, {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.eligible).toBe(false);
      expect(data.data.reason).toBeDefined();
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await memberAuthRequest('/api/member/reviews/eligibility/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/member/reviews
  // =========================================================================

  describe('POST /api/member/reviews', () => {
    it('should create a review', async () => {
      const response = await memberAuthRequest('/api/member/reviews', {
        method: 'POST',
        token: memberToken,
        body: JSON.stringify({
          bookingId: attendedBookingId,
          rating: 5,
          comment: 'Great class!',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.review.rating).toBe(5);
      expect(data.data.review.comment).toBe('Great class!');
    });

    it('should reject duplicate review', async () => {
      const response = await memberAuthRequest('/api/member/reviews', {
        method: 'POST',
        token: memberToken,
        body: JSON.stringify({
          bookingId: attendedBookingId,
          rating: 4,
          comment: 'Another review',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate rating range (too low)', async () => {
      const response = await memberAuthRequest('/api/member/reviews', {
        method: 'POST',
        token: memberToken,
        body: JSON.stringify({
          bookingId: attendedBookingId,
          rating: 0,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate rating range (too high)', async () => {
      const response = await memberAuthRequest('/api/member/reviews', {
        method: 'POST',
        token: memberToken,
        body: JSON.stringify({
          bookingId: attendedBookingId,
          rating: 6,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/member/reviews/:id
  // =========================================================================

  describe('PUT /api/member/reviews/:id', () => {
    it('should update review within 24h', async () => {
      // Get the review we created
      const [review] = await db
        .select()
        .from(classReviews)
        .where(eq(classReviews.bookingId, attendedBookingId));

      const response = await memberAuthRequest(`/api/member/reviews/${review.id}`, {
        method: 'PUT',
        token: memberToken,
        body: JSON.stringify({
          rating: 4,
          comment: 'Updated review',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.review.rating).toBe(4);
    });

    it('should return 404 for non-existent review', async () => {
      const response = await memberAuthRequest('/api/member/reviews/00000000-0000-0000-0000-999999999999', {
        method: 'PUT',
        token: memberToken,
        body: JSON.stringify({
          rating: 3,
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/member/reviews/class/:classId
  // =========================================================================

  describe('GET /api/member/reviews/class/:classId', () => {
    it('should return class reviews with stats', async () => {
      const response = await memberAuthRequest(`/api/member/reviews/class/${TEST_CLASS_ID}`, {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('stats');
      expect(data.data.stats).toHaveProperty('averageRating');
      expect(data.data.stats).toHaveProperty('totalReviews');
      expect(data.data).toHaveProperty('reviews');
      expect(data.data).toHaveProperty('pagination');
    });

    it('should return 404 for non-existent class', async () => {
      const response = await memberAuthRequest('/api/member/reviews/class/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/member/reviews/my
  // =========================================================================

  describe('GET /api/member/reviews/my', () => {
    it("should return member's reviews", async () => {
      const response = await memberAuthRequest('/api/member/reviews/my', {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.reviews)).toBe(true);
      expect(data.data.reviews.length).toBeGreaterThanOrEqual(1);
      expect(data.data.reviews[0]).toHaveProperty('canEdit');
    });

    it('should support pagination', async () => {
      const response = await memberAuthRequest('/api/member/reviews/my?page=1&limit=1', {
        method: 'GET',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.pagination.limit).toBe(1);
      expect(data.data.pagination.page).toBe(1);
    });
  });

  // =========================================================================
  // DELETE /api/member/reviews/:id
  // =========================================================================

  describe('DELETE /api/member/reviews/:id', () => {
    it('should delete own review', async () => {
      // Get the review we created
      const [review] = await db
        .select()
        .from(classReviews)
        .where(eq(classReviews.bookingId, attendedBookingId));

      const response = await memberAuthRequest(`/api/member/reviews/${review.id}`, {
        method: 'DELETE',
        token: memberToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent review', async () => {
      const response = await memberAuthRequest('/api/member/reviews/00000000-0000-0000-0000-999999999999', {
        method: 'DELETE',
        token: memberToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
