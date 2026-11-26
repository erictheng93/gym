import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, bookings, classSessions, classes, contracts, employees, classReviews, BOOKING_STATUS } from '../db/index.js';
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { createBooking, cancelBooking } from '../services/booking.js';

// =============================================================================
// MEMBER BOOKINGS ROUTES
// =============================================================================
// Class booking self-service for member-app.
// Endpoints: GET /, POST /, DELETE /:id
//
// The member always comes from the token (never the body) and every query is
// scoped by that member id AND the token's tenant branches. Booking/cancel rules
// are the staff ones (services/booking.ts); on top of that a member can only book
// with one of their own contracts that is valid today. No class count is deducted
// when booking: COUNT_BASED deduction happens at attendance.

const app = new Hono<{ Variables: MemberVariables }>();

app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

const listQuerySchema = z.object({
  status: z.enum(BOOKING_STATUS).optional(),
  upcoming: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createSchema = z.object({
  sessionId: z.string().uuid(),
  contractId: z.string().uuid().optional().nullable(),
});

const BOOKING_LIST_SELECT = {
  id: bookings.id,
  sessionId: bookings.sessionId,
  contractId: bookings.contractId,
  bookingStatus: bookings.bookingStatus,
  waitlistPosition: bookings.waitlistPosition,
  bookedAt: bookings.bookedAt,
  cancelledAt: bookings.cancelledAt,
  attendedAt: bookings.attendedAt,
  session: {
    sessionDate: classSessions.sessionDate,
    startTime: classSessions.startTime,
    endTime: classSessions.endTime,
    room: classSessions.room,
    sessionStatus: classSessions.sessionStatus,
  },
  class: {
    id: classes.id,
    name: classes.name,
    category: classes.category,
  },
  instructor: {
    id: employees.id,
    fullName: employees.fullName,
  },
  reviewId: classReviews.id,
};

// -----------------------------------------------------------------------------
// GET /api/member/bookings - Own bookings
// -----------------------------------------------------------------------------

app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const memberInfo = c.get('member')!;
  const { status, upcoming, limit } = c.req.valid('query');
  const today = new Date().toISOString().slice(0, 10);

  const branchIds = await getTenantBranchIds(memberInfo.tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: true, data: { bookings: [] } });
  }

  const conditions = [
    eq(bookings.memberId, memberInfo.id),
    inArray(classSessions.branchId, branchIds),
  ];
  if (status) conditions.push(eq(bookings.bookingStatus, status));
  if (upcoming === 'true') conditions.push(gte(classSessions.sessionDate, today));

  const rows = await db
    .select(BOOKING_LIST_SELECT)
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(employees, eq(classSessions.instructorId, employees.id))
    .leftJoin(classReviews, and(eq(classReviews.bookingId, bookings.id), eq(classReviews.memberId, memberInfo.id)))
    .where(and(...conditions))
    .orderBy(desc(classSessions.sessionDate), desc(classSessions.startTime))
    .limit(limit);

  return c.json({
    success: true,
    data: {
      bookings: rows.map(({ reviewId, instructor, ...r }) => ({
        ...r,
        instructor: instructor?.id ? instructor : null,
        hasReview: reviewId !== null,
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/member/bookings - Book a session
// -----------------------------------------------------------------------------

app.post('/', zValidator('json', createSchema), async (c) => {
  const memberInfo = c.get('member')!;
  const { sessionId, contractId } = c.req.valid('json');
  const today = new Date().toISOString().slice(0, 10);

  // A contract the member can book with: their own, in their tenant, ACTIVE and valid today.
  const [contract] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(
      eq(contracts.memberId, memberInfo.id),
      eq(contracts.tenantId, memberInfo.tenantId),
      eq(contracts.status, 'ACTIVE'),
      lte(contracts.startDate, today),
      gte(contracts.endDate, today),
      ...(contractId ? [eq(contracts.id, contractId)] : []),
    ))
    .orderBy(desc(contracts.endDate))
    .limit(1);

  if (!contract) {
    return c.json({
      success: false,
      error: contractId ? '此合約無法用於預約' : '沒有有效合約，無法預約課程',
      code: 'NO_VALID_CONTRACT',
    }, 400);
  }

  const result = await createBooking({
    branchIds: await getTenantBranchIds(memberInfo.tenantId),
    sessionId,
    memberId: memberInfo.id,
    contractId: contract.id,
  });

  if (!result.ok) {
    return c.json({ success: false, error: result.error }, result.status);
  }

  const { memberId: _memberId, ...booking } = result.booking;
  return c.json({ success: true, message: result.message, data: { booking } }, 201);
});

// -----------------------------------------------------------------------------
// DELETE /api/member/bookings/:id - Cancel own booking
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const bookingId = c.req.param('id');

  if (!z.string().uuid().safeParse(bookingId).success) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  const result = await cancelBooking({
    branchIds: await getTenantBranchIds(memberInfo.tenantId),
    bookingId,
    memberId: memberInfo.id,
  });

  if (!result.ok) {
    return c.json({ success: false, error: result.error }, result.status);
  }

  return c.json({ success: true, message: result.message });
});

export default app;
