import { db, bookings, classSessions, members } from '../db/index.js';
import { eq, and } from 'drizzle-orm';

// =============================================================================
// BOOKING SERVICE
// =============================================================================
// Booking rules shared by the staff route (routes/bookings.ts) and the member
// self-service route (routes/member-bookings.ts), so both enforce the same rules:
// - the session must belong to one of the caller's tenant branches
// - only SCHEDULED, non-past sessions can be booked
// - the member must be ACTIVE and not already hold a CONFIRMED/WAITLIST booking
// - a full session puts the booking on the waitlist
// - cancelling within 2 hours of the start is refused; cancelling a CONFIRMED
//   booking promotes the first waitlisted booking
// No class count is deducted here: COUNT_BASED deduction happens at attendance
// (POST /api/bookings/:id/attend).

export type BookingFailure = { ok: false; status: 400 | 404; error: string };

export type CreateBookingResult =
  | {
      ok: true;
      booking: {
        id: string;
        sessionId: string;
        memberId: string;
        contractId: string | null;
        bookingStatus: string | null;
        waitlistPosition: number | null;
        createdAt: Date | null;
      };
      message: string;
    }
  | BookingFailure;

export type CancelBookingResult = { ok: true; message: string } | BookingFailure;

const BOOKING_RETURNING = {
  id: bookings.id,
  sessionId: bookings.sessionId,
  memberId: bookings.memberId,
  contractId: bookings.contractId,
  bookingStatus: bookings.bookingStatus,
  waitlistPosition: bookings.waitlistPosition,
  createdAt: bookings.createdAt,
};

export async function createBooking(input: {
  branchIds: string[];
  sessionId: string;
  memberId: string;
  contractId?: string | null;
}): Promise<CreateBookingResult> {
  const { branchIds, sessionId, memberId } = input;

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: classSessions.id,
        branchId: classSessions.branchId,
        sessionStatus: classSessions.sessionStatus,
        sessionDate: classSessions.sessionDate,
        maxCapacity: classSessions.maxCapacity,
        currentCount: classSessions.currentCount,
        waitlistCount: classSessions.waitlistCount,
      })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId))
      .limit(1)
      .for('update');

    const [[member], [existing]] = await Promise.all([
      tx.select({ id: members.id, status: members.status }).from(members).where(eq(members.id, memberId)).limit(1),
      tx
        .select({ id: bookings.id, bookingStatus: bookings.bookingStatus })
        .from(bookings)
        .where(and(eq(bookings.sessionId, sessionId), eq(bookings.memberId, memberId)))
        .limit(1),
    ]);

    if (!session || !branchIds.includes(session.branchId)) {
      return { ok: false, status: 404, error: '課程場次不存在' } as const;
    }

    if (session.sessionStatus !== 'SCHEDULED') {
      return { ok: false, status: 400, error: '此課程已取消或已結束' } as const;
    }

    if (new Date(session.sessionDate) < new Date()) {
      return { ok: false, status: 400, error: '無法預約過去的課程' } as const;
    }

    if (!member || member.status !== 'ACTIVE') {
      return { ok: false, status: 400, error: '會員不存在或狀態無效' } as const;
    }

    if (existing && (existing.bookingStatus === 'CONFIRMED' || existing.bookingStatus === 'WAITLIST')) {
      return { ok: false, status: 400, error: '您已預約此課程' } as const;
    }

    // (sessionId, memberId) is unique, so a member who attended / no-showed cannot rebook.
    if (existing && existing.bookingStatus !== 'CANCELLED') {
      return { ok: false, status: 400, error: '此課程已有預約紀錄，無法重複預約' } as const;
    }

    const currentCount = session.currentCount ?? 0;
    const waitlistCount = session.waitlistCount ?? 0;
    const isFull = currentCount >= session.maxCapacity;
    const bookingStatus: 'CONFIRMED' | 'WAITLIST' = isFull ? 'WAITLIST' : 'CONFIRMED';
    const waitlistPosition = isFull ? waitlistCount + 1 : null;

    const values = {
      contractId: input.contractId ?? null,
      bookingStatus,
      waitlistPosition,
    };

    // A previously cancelled booking is re-activated in place (unique (session, member)).
    const [booking] = existing
      ? await tx
          .update(bookings)
          .set({ ...values, bookedAt: new Date(), cancelledAt: null, cancelReason: null, updatedAt: new Date() })
          .where(eq(bookings.id, existing.id))
          .returning(BOOKING_RETURNING)
      : await tx
          .insert(bookings)
          .values({ sessionId, memberId, ...values })
          .returning(BOOKING_RETURNING);

    await tx
      .update(classSessions)
      .set({
        ...(isFull ? { waitlistCount: waitlistCount + 1 } : { currentCount: currentCount + 1 }),
        updatedAt: new Date(),
      })
      .where(eq(classSessions.id, sessionId));

    return {
      ok: true,
      booking: booking!,
      message: isFull ? `已加入候補名單，目前排序第 ${waitlistPosition} 位` : '預約成功！',
    } as const;
  });
}

export async function cancelBooking(input: {
  branchIds: string[];
  bookingId: string;
  /** When set, the booking must belong to this member (member self-service). */
  memberId?: string;
  reason?: string;
}): Promise<CancelBookingResult> {
  const { branchIds, bookingId } = input;

  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({
        bookingStatus: bookings.bookingStatus,
        memberId: bookings.memberId,
        sessionId: bookings.sessionId,
        branchId: classSessions.branchId,
      })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (
      !found ||
      !branchIds.includes(found.branchId) ||
      (input.memberId !== undefined && found.memberId !== input.memberId)
    ) {
      return { ok: false, status: 404, error: '預約不存在' } as const;
    }

    // Lock the session row so counters stay consistent with concurrent bookings.
    const [session] = await tx
      .select({
        id: classSessions.id,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        currentCount: classSessions.currentCount,
        waitlistCount: classSessions.waitlistCount,
      })
      .from(classSessions)
      .where(eq(classSessions.id, found.sessionId))
      .limit(1)
      .for('update');

    if (['CANCELLED', 'ATTENDED', 'NO_SHOW'].includes(found.bookingStatus ?? '')) {
      return { ok: false, status: 400, error: '此預約無法取消' } as const;
    }

    const sessionStart = new Date(`${session!.sessionDate}T${session!.startTime}`);
    if (sessionStart < new Date(Date.now() + 2 * 60 * 60 * 1000)) {
      return { ok: false, status: 400, error: '課程開始前 2 小時內無法取消' } as const;
    }

    const currentCount = session!.currentCount ?? 0;
    const waitlistCount = session!.waitlistCount ?? 0;
    const now = new Date();

    await tx
      .update(bookings)
      .set({ bookingStatus: 'CANCELLED', cancelledAt: now, cancelReason: input.reason, updatedAt: now })
      .where(eq(bookings.id, bookingId));

    if (found.bookingStatus === 'CONFIRMED') {
      const [next] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.sessionId, session!.id), eq(bookings.bookingStatus, 'WAITLIST')))
        .orderBy(bookings.waitlistPosition)
        .limit(1);

      if (next) {
        await tx
          .update(bookings)
          .set({ bookingStatus: 'CONFIRMED', waitlistPosition: null, updatedAt: now })
          .where(eq(bookings.id, next.id));
        await tx
          .update(classSessions)
          .set({ waitlistCount: Math.max(0, waitlistCount - 1), updatedAt: now })
          .where(eq(classSessions.id, session!.id));
      } else {
        await tx
          .update(classSessions)
          .set({ currentCount: Math.max(0, currentCount - 1), updatedAt: now })
          .where(eq(classSessions.id, session!.id));
      }
    } else {
      await tx
        .update(classSessions)
        .set({ waitlistCount: Math.max(0, waitlistCount - 1), updatedAt: now })
        .where(eq(classSessions.id, session!.id));
    }

    return { ok: true, message: '取消成功' } as const;
  });
}
