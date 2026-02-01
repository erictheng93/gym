import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, classReviews, bookings, classSessions, classes, members } from '../db/index.js';
import { eq, and, desc, avg, count, sql, gte, lte } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember, rateLimiter } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER REVIEWS ROUTES
// =============================================================================
// Class reviews for member-app
// Endpoints: /eligibility/:bookingId, POST /, PUT /:id, DELETE /:id,
//            /class/:classId, /my

const app = new Hono<{ Variables: MemberVariables }>();

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createReviewSchema = z.object({
  bookingId: z.string().uuid('請提供有效的預約 ID'),
  rating: z.number().min(1).max(5, '評分必須是 1-5'),
  comment: z.string().max(1000, '評論最多 1000 字').optional(),
  isAnonymous: z.boolean().default(false),
});

const updateReviewSchema = z.object({
  rating: z.number().min(1).max(5, '評分必須是 1-5').optional(),
  comment: z.string().max(1000, '評論最多 1000 字').optional(),
  isAnonymous: z.boolean().optional(),
});

const classReviewsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
});

const myReviewsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
});

// Apply auth middleware for all routes
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// GET /api/member/reviews/eligibility/:bookingId - Check review eligibility
// -----------------------------------------------------------------------------

app.get('/eligibility/:bookingId', async (c) => {
  const memberInfo = c.get('member')!;
  const bookingId = c.req.param('bookingId');

  // Get booking with session info
  const [booking] = await db
    .select({
      id: bookings.id,
      memberId: bookings.memberId,
      sessionId: bookings.sessionId,
      bookingStatus: bookings.bookingStatus,
      attendedAt: bookings.attendedAt,
      sessionDate: classSessions.sessionDate,
      sessionStatus: classSessions.sessionStatus,
      classId: classSessions.classId,
      className: classes.name,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    return c.json({
      success: false,
      error: '預約不存在',
      code: 'BOOKING_NOT_FOUND',
    }, 404);
  }

  // Check ownership
  if (booking.memberId !== memberInfo.id) {
    return c.json({
      success: false,
      error: '無權限',
      code: 'FORBIDDEN',
    }, 403);
  }

  // Check if already reviewed
  const [existingReview] = await db
    .select({ id: classReviews.id })
    .from(classReviews)
    .where(eq(classReviews.bookingId, bookingId))
    .limit(1);

  if (existingReview) {
    return c.json({
      success: true,
      data: {
        eligible: false,
        reason: '已評價過此課程',
        existingReviewId: existingReview.id,
      },
    });
  }

  // Check booking status - must have attended
  if (booking.bookingStatus !== 'ATTENDED') {
    return c.json({
      success: true,
      data: {
        eligible: false,
        reason: '只有已出席的課程才能評價',
        bookingStatus: booking.bookingStatus,
      },
    });
  }

  // Check if session is completed
  if (booking.sessionStatus !== 'COMPLETED') {
    return c.json({
      success: true,
      data: {
        eligible: false,
        reason: '課程尚未結束',
      },
    });
  }

  // Check time limit (e.g., within 7 days of session)
  const sessionDate = new Date(booking.sessionDate);
  const daysSinceSession = Math.floor((Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceSession > 7) {
    return c.json({
      success: true,
      data: {
        eligible: false,
        reason: '評價期限已過（課程結束後 7 天內）',
        daysSinceSession,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      eligible: true,
      booking: {
        id: booking.id,
        classId: booking.classId,
        className: booking.className,
        sessionDate: booking.sessionDate,
      },
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/member/reviews - Create a review
// -----------------------------------------------------------------------------

app.post(
  '/',
  rateLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100 : 5,
    message: '評價過於頻繁，請稍後再試',
  }),
  zValidator('json', createReviewSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { bookingId, rating, comment, isAnonymous } = c.req.valid('json');

    // Verify eligibility (same logic as eligibility endpoint)
    const [booking] = await db
      .select({
        id: bookings.id,
        memberId: bookings.memberId,
        sessionId: bookings.sessionId,
        bookingStatus: bookings.bookingStatus,
        classId: classSessions.classId,
        sessionStatus: classSessions.sessionStatus,
        sessionDate: classSessions.sessionDate,
        tenantId: classes.branchId, // Will get actual tenantId from class
      })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return c.json({
        success: false,
        error: '預約不存在',
        code: 'BOOKING_NOT_FOUND',
      }, 404);
    }

    if (booking.memberId !== memberInfo.id) {
      return c.json({
        success: false,
        error: '無權限',
        code: 'FORBIDDEN',
      }, 403);
    }

    if (booking.bookingStatus !== 'ATTENDED') {
      return c.json({
        success: false,
        error: '只有已出席的課程才能評價',
        code: 'NOT_ATTENDED',
      }, 400);
    }

    // Check for existing review
    const [existingReview] = await db
      .select({ id: classReviews.id })
      .from(classReviews)
      .where(eq(classReviews.bookingId, bookingId))
      .limit(1);

    if (existingReview) {
      return c.json({
        success: false,
        error: '已評價過此課程',
        code: 'ALREADY_REVIEWED',
      }, 400);
    }

    // Create review
    const [review] = await db.insert(classReviews).values({
      memberId: memberInfo.id,
      classId: booking.classId,
      sessionId: booking.sessionId,
      bookingId,
      rating,
      comment: comment || null,
      isAnonymous,
      tenantId: memberInfo.tenantId,
    }).returning();

    return c.json({
      success: true,
      message: '評價已提交',
      data: {
        review: {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          isAnonymous: review.isAnonymous,
          createdAt: review.createdAt,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// PUT /api/member/reviews/:id - Update a review
// -----------------------------------------------------------------------------

app.put(
  '/:id',
  zValidator('json', updateReviewSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const reviewId = c.req.param('id');
    const updates = c.req.valid('json');

    // Get review
    const [review] = await db
      .select({
        id: classReviews.id,
        memberId: classReviews.memberId,
        createdAt: classReviews.createdAt,
      })
      .from(classReviews)
      .where(eq(classReviews.id, reviewId))
      .limit(1);

    if (!review) {
      return c.json({
        success: false,
        error: '評價不存在',
        code: 'NOT_FOUND',
      }, 404);
    }

    if (review.memberId !== memberInfo.id) {
      return c.json({
        success: false,
        error: '無權限',
        code: 'FORBIDDEN',
      }, 403);
    }

    // Check if within edit period (e.g., 24 hours)
    const hoursSinceCreation = (Date.now() - new Date(review.createdAt!).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      return c.json({
        success: false,
        error: '已超過編輯期限（24 小時）',
        code: 'EDIT_PERIOD_EXPIRED',
      }, 400);
    }

    // Update review
    const [updatedReview] = await db
      .update(classReviews)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(classReviews.id, reviewId))
      .returning();

    return c.json({
      success: true,
      message: '評價已更新',
      data: {
        review: {
          id: updatedReview.id,
          rating: updatedReview.rating,
          comment: updatedReview.comment,
          isAnonymous: updatedReview.isAnonymous,
          updatedAt: updatedReview.updatedAt,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/reviews/:id - Delete a review
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const reviewId = c.req.param('id');

  // Get review
  const [review] = await db
    .select({
      id: classReviews.id,
      memberId: classReviews.memberId,
    })
    .from(classReviews)
    .where(eq(classReviews.id, reviewId))
    .limit(1);

  if (!review) {
    return c.json({
      success: false,
      error: '評價不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  if (review.memberId !== memberInfo.id) {
    return c.json({
      success: false,
      error: '無權限',
      code: 'FORBIDDEN',
    }, 403);
  }

  // Delete review
  await db.delete(classReviews).where(eq(classReviews.id, reviewId));

  return c.json({
    success: true,
    message: '評價已刪除',
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/reviews/class/:classId - Get reviews for a class (public)
// -----------------------------------------------------------------------------

app.get(
  '/class/:classId',
  zValidator('query', classReviewsQuerySchema),
  async (c) => {
    const classId = c.req.param('classId');
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    // Get class info
    const [classInfo] = await db
      .select({
        id: classes.id,
        name: classes.name,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classInfo) {
      return c.json({
        success: false,
        error: '課程不存在',
        code: 'CLASS_NOT_FOUND',
      }, 404);
    }

    // Get review stats
    const [stats] = await db
      .select({
        avgRating: avg(classReviews.rating),
        totalReviews: count(classReviews.id),
      })
      .from(classReviews)
      .where(and(
        eq(classReviews.classId, classId),
        eq(classReviews.status, 'published'),
        eq(classReviews.isPublic, true),
      ));

    // Get reviews
    const reviews = await db
      .select({
        id: classReviews.id,
        rating: classReviews.rating,
        comment: classReviews.comment,
        isAnonymous: classReviews.isAnonymous,
        createdAt: classReviews.createdAt,
        staffResponse: classReviews.staffResponse,
        staffResponseAt: classReviews.staffResponseAt,
        memberFullName: members.fullName,
      })
      .from(classReviews)
      .leftJoin(members, eq(classReviews.memberId, members.id))
      .where(and(
        eq(classReviews.classId, classId),
        eq(classReviews.status, 'published'),
        eq(classReviews.isPublic, true),
      ))
      .orderBy(desc(classReviews.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        class: {
          id: classInfo.id,
          name: classInfo.name,
        },
        stats: {
          averageRating: stats.avgRating ? Number(stats.avgRating).toFixed(1) : null,
          totalReviews: Number(stats.totalReviews),
        },
        reviews: reviews.map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          author: r.isAnonymous ? '匿名會員' : r.memberFullName,
          staffResponse: r.staffResponse ? {
            content: r.staffResponse,
            respondedAt: r.staffResponseAt,
          } : null,
        })),
        pagination: {
          total: Number(stats.totalReviews),
          page,
          limit,
          totalPages: Math.ceil(Number(stats.totalReviews) / limit),
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/reviews/my - Get member's own reviews
// -----------------------------------------------------------------------------

app.get(
  '/my',
  zValidator('query', myReviewsQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    // Get total count
    const [{ total }] = await db
      .select({ total: count(classReviews.id) })
      .from(classReviews)
      .where(eq(classReviews.memberId, memberInfo.id));

    // Get reviews
    const reviews = await db
      .select({
        id: classReviews.id,
        rating: classReviews.rating,
        comment: classReviews.comment,
        isAnonymous: classReviews.isAnonymous,
        status: classReviews.status,
        createdAt: classReviews.createdAt,
        updatedAt: classReviews.updatedAt,
        staffResponse: classReviews.staffResponse,
        staffResponseAt: classReviews.staffResponseAt,
        classId: classReviews.classId,
        className: classes.name,
        sessionId: classReviews.sessionId,
        sessionDate: classSessions.sessionDate,
      })
      .from(classReviews)
      .leftJoin(classes, eq(classReviews.classId, classes.id))
      .leftJoin(classSessions, eq(classReviews.sessionId, classSessions.id))
      .where(eq(classReviews.memberId, memberInfo.id))
      .orderBy(desc(classReviews.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        reviews: reviews.map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          isAnonymous: r.isAnonymous,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          class: {
            id: r.classId,
            name: r.className,
          },
          session: r.sessionId ? {
            id: r.sessionId,
            date: r.sessionDate,
          } : null,
          staffResponse: r.staffResponse ? {
            content: r.staffResponse,
            respondedAt: r.staffResponseAt,
          } : null,
          // Check if within edit period
          canEdit: r.createdAt
            ? (Date.now() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60) <= 24
            : false,
        })),
        pagination: {
          total: Number(total),
          page,
          limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    });
  }
);

export default app;
