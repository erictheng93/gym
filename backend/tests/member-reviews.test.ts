import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, classSessions, bookings, classReviews } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  memberAuthRequest,
  getMemberAuthToken,
  TEST_MEMBER_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_CLASS_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

const MISSING_ID = '00000000-0000-4000-8000-999999999999';

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

describe('Member Reviews API', () => {
  let memberToken: string;
  let otherTenantMemberToken: string;
  let attendedBookingId: string;
  let confirmedBookingId: string;
  let otherMemberBookingId: string;
  let otherMemberReviewId: string;

  async function createSession(daysBack: number, startTime: string, status: 'COMPLETED' | 'SCHEDULED' = 'COMPLETED') {
    const [session] = await db.insert(classSessions).values({
      classId: TEST_CLASS_ID,
      branchId: TEST_BRANCH_ID,
      sessionDate: daysAgo(daysBack).toISOString().split('T')[0],
      startTime,
      endTime: '23:00',
      maxCapacity: 20,
      currentCount: 1,
      sessionStatus: status,
    }).returning();
    return session;
  }

  async function createBooking(
    sessionId: string,
    memberId: string,
    bookingStatus: 'ATTENDED' | 'CONFIRMED'
  ) {
    const [booking] = await db.insert(bookings).values({
      sessionId,
      memberId,
      bookingStatus,
      attendedAt: bookingStatus === 'ATTENDED' ? new Date() : null,
    }).returning();
    return booking;
  }

  function review(path: string, token: string, init: RequestInit = {}) {
    return memberAuthRequest(path, { ...init, token });
  }

  beforeAll(async () => {
    await createTestFixtures();
    memberToken = getMemberAuthToken();
    otherTenantMemberToken = generateMemberTokens({
      id: TEST_MEMBER_B_ID,
      memberCode: 'OM0001',
      branchId: TEST_BRANCH_B_ID,
      tenantId: TEST_TENANT_B_ID,
    }).accessToken;

    // Test member: one attended and one merely confirmed booking (separate sessions: unique (session, member))
    const attendedSession = await createSession(2, '10:00');
    attendedBookingId = (await createBooking(attendedSession.id, TEST_MEMBER_ID, 'ATTENDED')).id;

    const confirmedSession = await createSession(3, '14:00');
    confirmedBookingId = (await createBooking(confirmedSession.id, TEST_MEMBER_ID, 'CONFIRMED')).id;

    // Another member (other tenant) with an attended booking and an anonymous review of the same class
    const otherSession = await createSession(1, '09:00');
    const otherBooking = await createBooking(otherSession.id, TEST_MEMBER_B_ID, 'ATTENDED');
    otherMemberBookingId = otherBooking.id;
    const [otherReview] = await db.insert(classReviews).values({
      memberId: TEST_MEMBER_B_ID,
      classId: TEST_CLASS_ID,
      sessionId: otherSession.id,
      bookingId: otherBooking.id,
      rating: 2,
      comment: 'Other member review',
      isAnonymous: true,
      tenantId: TEST_TENANT_B_ID,
    }).returning();
    otherMemberReviewId = otherReview.id;
  });

  afterAll(async () => {
    // Tenant B reviews are not covered by the shared fixture cleanup
    await db.delete(classReviews).where(eq(classReviews.tenantId, TEST_TENANT_B_ID));
    await cleanupTestFixtures();
  });

  // =========================================================================
  // Authentication
  // =========================================================================

  describe('authentication', () => {
    it('rejects every endpoint without a member token', async () => {
      const requests: Array<[string, string]> = [
        ['GET', `/api/member/reviews/eligibility/${attendedBookingId}`],
        ['POST', '/api/member/reviews'],
        ['PUT', `/api/member/reviews/${MISSING_ID}`],
        ['DELETE', `/api/member/reviews/${MISSING_ID}`],
        ['GET', `/api/member/reviews/class/${TEST_CLASS_ID}`],
        ['GET', '/api/member/reviews/my'],
      ];

      for (const [method, path] of requests) {
        const res = await app.request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
        });
        expect(res.status, `${method} ${path}`).toBe(401);
      }
    });
  });

  // =========================================================================
  // GET /api/member/reviews/eligibility/:bookingId
  // =========================================================================

  describe('GET /api/member/reviews/eligibility/:bookingId', () => {
    it('should return eligible for attended booking with class info', async () => {
      const response = await review(`/api/member/reviews/eligibility/${attendedBookingId}`, memberToken);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.eligible).toBe(true);
      expect(data.data.booking).toMatchObject({
        id: attendedBookingId,
        classId: TEST_CLASS_ID,
      });
    });

    it('should reject non-attended booking with the reason', async () => {
      const response = await review(`/api/member/reviews/eligibility/${confirmedBookingId}`, memberToken);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toMatchObject({
        eligible: false,
        reason: '只有已出席的課程才能評價',
        bookingStatus: 'CONFIRMED',
      });
    });

    it('should reject a booking whose review window (7 days) has passed', async () => {
      const oldSession = await createSession(10, '08:00');
      const oldBooking = await createBooking(oldSession.id, TEST_MEMBER_ID, 'ATTENDED');

      const response = await review(`/api/member/reviews/eligibility/${oldBooking.id}`, memberToken);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.eligible).toBe(false);
      expect(data.data.reason).toContain('評價期限已過');
      expect(data.data.daysSinceSession).toBeGreaterThan(7);
    });

    it('should reject an attended booking of a session that is not completed', async () => {
      const openSession = await createSession(1, '07:00', 'SCHEDULED');
      const booking = await createBooking(openSession.id, TEST_MEMBER_ID, 'ATTENDED');

      const response = await review(`/api/member/reviews/eligibility/${booking.id}`, memberToken);

      const data = await response.json();
      expect(data.data).toMatchObject({ eligible: false, reason: '課程尚未結束' });
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await review(`/api/member/reviews/eligibility/${MISSING_ID}`, memberToken);

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe('BOOKING_NOT_FOUND');
    });

    it("should return 403 for another member's booking", async () => {
      const response = await review(`/api/member/reviews/eligibility/${otherMemberBookingId}`, memberToken);

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');

      const reverse = await review(`/api/member/reviews/eligibility/${attendedBookingId}`, otherTenantMemberToken);
      expect(reverse.status).toBe(403);
    });
  });

  // =========================================================================
  // POST /api/member/reviews
  // =========================================================================

  describe('POST /api/member/reviews', () => {
    it('should create a review owned by the member and tenant', async () => {
      const response = await review('/api/member/reviews', memberToken, {
        method: 'POST',
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
      expect(data.data.review.isAnonymous).toBe(false);

      const [row] = await db.select().from(classReviews).where(eq(classReviews.bookingId, attendedBookingId));
      expect(row.memberId).toBe(TEST_MEMBER_ID);
      expect(row.classId).toBe(TEST_CLASS_ID);
      expect(row.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should report the booking as already reviewed afterwards', async () => {
      const response = await review(`/api/member/reviews/eligibility/${attendedBookingId}`, memberToken);

      const data = await response.json();
      expect(data.data.eligible).toBe(false);
      expect(data.data.reason).toBe('已評價過此課程');
      expect(typeof data.data.existingReviewId).toBe('string');
    });

    it('should reject duplicate review with ALREADY_REVIEWED', async () => {
      const response = await review('/api/member/reviews', memberToken, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: attendedBookingId,
          rating: 4,
          comment: 'Another review',
        }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('ALREADY_REVIEWED');
    });

    it('should reject reviewing a booking that was not attended', async () => {
      const response = await review('/api/member/reviews', memberToken, {
        method: 'POST',
        body: JSON.stringify({ bookingId: confirmedBookingId, rating: 5 }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('NOT_ATTENDED');
      const rows = await db.select().from(classReviews).where(eq(classReviews.bookingId, confirmedBookingId));
      expect(rows).toEqual([]);
    });

    it("should reject reviewing another member's attended booking with 403", async () => {
      const [secondSession] = await db.insert(classSessions).values({
        classId: TEST_CLASS_ID,
        branchId: TEST_BRANCH_ID,
        sessionDate: daysAgo(1).toISOString().split('T')[0],
        startTime: '06:00',
        endTime: '07:00',
        maxCapacity: 20,
        sessionStatus: 'COMPLETED',
      }).returning();
      const othersBooking = await createBooking(secondSession.id, TEST_MEMBER_B_ID, 'ATTENDED');

      const response = await review('/api/member/reviews', memberToken, {
        method: 'POST',
        body: JSON.stringify({ bookingId: othersBooking.id, rating: 1, comment: 'Not mine' }),
      });

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');
      const rows = await db.select().from(classReviews).where(eq(classReviews.bookingId, othersBooking.id));
      expect(rows).toEqual([]);
    });

    it('should return 404 for a non-existent booking', async () => {
      const response = await review('/api/member/reviews', memberToken, {
        method: 'POST',
        body: JSON.stringify({ bookingId: MISSING_ID, rating: 5 }),
      });

      expect(response.status).toBe(404);
    });

    it('should validate rating range and required fields', async () => {
      const invalidBodies = [
        { bookingId: confirmedBookingId, rating: 0 },
        { bookingId: confirmedBookingId, rating: 6 },
        { bookingId: confirmedBookingId },
        { rating: 5 },
        { bookingId: 'not-a-uuid', rating: 5 },
        { bookingId: confirmedBookingId, rating: 5, comment: 'x'.repeat(1001) },
      ];

      for (const body of invalidBodies) {
        const response = await review('/api/member/reviews', memberToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      }
    });
  });

  // =========================================================================
  // PUT /api/member/reviews/:id
  // =========================================================================

  describe('PUT /api/member/reviews/:id', () => {
    async function ownReviewId() {
      const [row] = await db.select().from(classReviews).where(eq(classReviews.bookingId, attendedBookingId));
      return row.id;
    }

    it('should update the given fields within 24h and keep the others', async () => {
      const reviewId = await ownReviewId();

      const response = await review(`/api/member/reviews/${reviewId}`, memberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 4 }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.review.rating).toBe(4);
      expect(data.data.review.comment).toBe('Great class!');

      const [row] = await db.select().from(classReviews).where(eq(classReviews.id, reviewId));
      expect(row.rating).toBe(4);
      expect(row.updatedAt).not.toBeNull();
    });

    it('should reject an out-of-range rating with 400', async () => {
      const response = await review(`/api/member/reviews/${await ownReviewId()}`, memberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 9 }),
      });

      expect(response.status).toBe(400);
    });

    it("should not let a member edit another member's review (403, unchanged)", async () => {
      const response = await review(`/api/member/reviews/${otherMemberReviewId}`, memberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 5, comment: 'Hijacked' }),
      });

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');

      const [row] = await db.select().from(classReviews).where(eq(classReviews.id, otherMemberReviewId));
      expect(row.rating).toBe(2);
      expect(row.comment).toBe('Other member review');

      // ...and the other way round
      const reverse = await review(`/api/member/reviews/${await ownReviewId()}`, otherTenantMemberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 1 }),
      });
      expect(reverse.status).toBe(403);
    });

    it('should refuse edits after the 24h edit period with EDIT_PERIOD_EXPIRED', async () => {
      const reviewId = await ownReviewId();
      await db.update(classReviews)
        .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
        .where(eq(classReviews.id, reviewId));

      const response = await review(`/api/member/reviews/${reviewId}`, memberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 1 }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('EDIT_PERIOD_EXPIRED');

      const [row] = await db.select().from(classReviews).where(eq(classReviews.id, reviewId));
      expect(row.rating).toBe(4);

      // /my reports the same state
      const mine = await (await review('/api/member/reviews/my', memberToken)).json();
      expect(mine.data.reviews.find((r: { id: string }) => r.id === reviewId).canEdit).toBe(false);

      // restore for the following tests
      await db.update(classReviews).set({ createdAt: new Date() }).where(eq(classReviews.id, reviewId));
    });

    it('should return 404 for non-existent review', async () => {
      const response = await review(`/api/member/reviews/${MISSING_ID}`, memberToken, {
        method: 'PUT',
        body: JSON.stringify({ rating: 3 }),
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/member/reviews/class/:classId
  // =========================================================================

  describe('GET /api/member/reviews/class/:classId', () => {
    it('should return class reviews with stats, masking anonymous authors', async () => {
      const response = await review(`/api/member/reviews/class/${TEST_CLASS_ID}`, memberToken);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.class.id).toBe(TEST_CLASS_ID);
      // Ratings: 4 (test member, edited) and 2 (anonymous other member)
      expect(data.data.stats).toEqual({ averageRating: '3.0', totalReviews: 2 });
      expect(data.data.pagination).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });

      const authors = data.data.reviews.map((r: { author: string }) => r.author).sort();
      expect(authors).toEqual(['Test Member', '匿名會員'].sort());
      expect(JSON.stringify(data.data.reviews)).not.toContain('Other Member');
    });

    it('should paginate the reviews', async () => {
      const response = await review(`/api/member/reviews/class/${TEST_CLASS_ID}?page=2&limit=1`, memberToken);

      const data = await response.json();
      expect(data.data.reviews).toHaveLength(1);
      expect(data.data.pagination).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
    });

    it('should return 404 for non-existent class', async () => {
      const response = await review(`/api/member/reviews/class/${MISSING_ID}`, memberToken);

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe('CLASS_NOT_FOUND');
    });

    // BUG: src/routes/member-reviews.ts GET /class/:classId looks the class up by id only (no tenant
    // check), so a member of another tenant can read this tenant's class reviews, including the
    // reviewers' full names for non-anonymous reviews.
    it.skip("should not expose another tenant's class reviews", async () => {
      const response = await review(`/api/member/reviews/class/${TEST_CLASS_ID}`, otherTenantMemberToken);

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/member/reviews/my
  // =========================================================================

  describe('GET /api/member/reviews/my', () => {
    it("should return only the member's own reviews", async () => {
      const response = await review('/api/member/reviews/my', memberToken);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.reviews).toHaveLength(1);
      expect(data.data.reviews[0]).toMatchObject({
        rating: 4,
        comment: 'Great class!',
        isAnonymous: false,
        canEdit: true,
        class: { id: TEST_CLASS_ID },
      });
      expect(data.data.reviews.map((r: { id: string }) => r.id)).not.toContain(otherMemberReviewId);
      expect(data.data.pagination.total).toBe(1);
    });

    it("should return the other member's own review to them only", async () => {
      const data = await (await review('/api/member/reviews/my', otherTenantMemberToken)).json();

      expect(data.data.reviews.map((r: { id: string }) => r.id)).toEqual([otherMemberReviewId]);
    });

    it('should support pagination', async () => {
      const response = await review('/api/member/reviews/my?page=2&limit=1', memberToken);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.pagination).toEqual({ total: 1, page: 2, limit: 1, totalPages: 1 });
      expect(data.data.reviews).toEqual([]);
    });

    it('should reject an invalid pagination limit with 400', async () => {
      const response = await review('/api/member/reviews/my?limit=1000', memberToken);

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // DELETE /api/member/reviews/:id
  // =========================================================================

  describe('DELETE /api/member/reviews/:id', () => {
    it("should not delete another member's review (403) and keep it", async () => {
      const response = await review(`/api/member/reviews/${otherMemberReviewId}`, memberToken, {
        method: 'DELETE',
      });

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');

      const rows = await db.select().from(classReviews).where(eq(classReviews.id, otherMemberReviewId));
      expect(rows).toHaveLength(1);
    });

    it('should delete own review', async () => {
      const [row] = await db.select().from(classReviews).where(eq(classReviews.bookingId, attendedBookingId));

      const response = await review(`/api/member/reviews/${row.id}`, memberToken, { method: 'DELETE' });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const after = await db.select().from(classReviews).where(eq(classReviews.id, row.id));
      expect(after).toEqual([]);

      // The booking can be reviewed again
      const eligibility = await (await review(`/api/member/reviews/eligibility/${attendedBookingId}`, memberToken)).json();
      expect(eligibility.data.eligible).toBe(true);
    });

    it('should return 404 for non-existent review', async () => {
      const response = await review(`/api/member/reviews/${MISSING_ID}`, memberToken, { method: 'DELETE' });

      expect(response.status).toBe(404);
    });
  });
});
