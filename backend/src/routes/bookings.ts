import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, bookings, classSessions, classes, members, contracts, branches, BOOKING_STATUS } from '../db/index.js';
import { eq, and, sql, desc, or, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createBookingSchema = z.object({
  sessionId: z.string().uuid(),
  memberId: z.string().uuid(),
  contractId: z.string().uuid().optional().nullable(),
});

const cancelBookingSchema = z.object({
  reason: z.string().optional(),
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const memberId = c.req.query('memberId');
  const sessionId = c.req.query('sessionId');
  const status = c.req.query('status');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
  }

  let conditions = [inArray(classSessions.branchId, branchIds)];

  if (memberId) {
    conditions.push(eq(bookings.memberId, memberId));
  }

  if (sessionId) {
    conditions.push(eq(bookings.sessionId, sessionId));
  }

  if (status) {
    conditions.push(eq(bookings.bookingStatus, status as typeof BOOKING_STATUS[number]));
  }

  const whereCondition = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(whereCondition);

  const total = Number(countResult?.count || 0);

  const result = await db
    .select({
      booking: bookings,
      session: {
        id: classSessions.id,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        sessionStatus: classSessions.sessionStatus,
      },
      class: {
        id: classes.id,
        name: classes.name,
        category: classes.category,
      },
      member: {
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
      },
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(members, eq(bookings.memberId, members.id))
    .where(whereCondition)
    .orderBy(desc(classSessions.sessionDate), classSessions.startTime)
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.booking,
      session: r.session,
      class: r.class,
      member: r.member,
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [booking] = await db
    .select({
      booking: bookings,
      session: classSessions,
      class: classes,
      member: members,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(members, eq(bookings.memberId, members.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, booking.session.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此預約' }, 403);
  }

  return c.json({
    success: true,
    data: {
      ...booking.booking,
      session: booking.session,
      class: booking.class,
      member: booking.member,
    },
  });
});

app.post('/', zValidator('json', createBookingSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [session] = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.id, data.sessionId))
    .limit(1);

  if (!session) {
    return c.json({ success: false, error: '課程場次不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, session.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限預約此課程' }, 403);
  }

  if (session.sessionStatus !== 'SCHEDULED') {
    return c.json({ success: false, error: '此課程已取消或已結束' }, 400);
  }

  const sessionDate = new Date(session.sessionDate);
  if (sessionDate < new Date()) {
    return c.json({ success: false, error: '無法預約過去的課程' }, 400);
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, data.memberId))
    .limit(1);

  if (!member || member.status !== 'ACTIVE') {
    return c.json({ success: false, error: '會員不存在或狀態無效' }, 400);
  }

  const [existingBooking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, data.sessionId),
        eq(bookings.memberId, data.memberId),
        or(
          eq(bookings.bookingStatus, 'CONFIRMED'),
          eq(bookings.bookingStatus, 'WAITLIST')
        )
      )
    )
    .limit(1);

  if (existingBooking) {
    return c.json({ success: false, error: '您已預約此課程' }, 400);
  }

  let bookingStatus: 'CONFIRMED' | 'WAITLIST' = 'CONFIRMED';
  let waitlistPosition: number | null = null;

  const currentCount = session.currentCount ?? 0;
  const waitlistCount = session.waitlistCount ?? 0;

  if (currentCount >= session.maxCapacity) {
    bookingStatus = 'WAITLIST';
    waitlistPosition = waitlistCount + 1;
  }

  const [newBooking] = await db.insert(bookings).values({
    sessionId: data.sessionId,
    memberId: data.memberId,
    contractId: data.contractId,
    bookingStatus,
    waitlistPosition,
  }).returning();

  if (bookingStatus === 'CONFIRMED') {
    await db.update(classSessions).set({
      currentCount: currentCount + 1,
      updatedAt: new Date(),
    }).where(eq(classSessions.id, data.sessionId));
  } else {
    await db.update(classSessions).set({
      waitlistCount: waitlistCount + 1,
      updatedAt: new Date(),
    }).where(eq(classSessions.id, data.sessionId));
  }

  return c.json({
    success: true,
    data: newBooking,
    message: bookingStatus === 'CONFIRMED'
      ? '預約成功！'
      : `已加入候補名單，目前排序第 ${waitlistPosition} 位`,
  }, 201);
});

app.post('/:id/cancel', zValidator('json', cancelBookingSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [booking] = await db
    .select({
      booking: bookings,
      session: classSessions,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  if (!booking.session.branchId) {
    return c.json({ success: false, error: '課程分店資訊遺失' }, 400);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, booking.session.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限取消此預約' }, 403);
  }

  if (['CANCELLED', 'ATTENDED', 'NO_SHOW'].includes(booking.booking.bookingStatus ?? '')) {
    return c.json({ success: false, error: '此預約無法取消' }, 400);
  }

  const sessionDateTime = new Date(`${booking.session.sessionDate}T${booking.session.startTime}`);
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

  if (sessionDateTime < twoHoursFromNow) {
    return c.json({ success: false, error: '課程開始前 2 小時內無法取消' }, 400);
  }

  const sessionCurrentCount = booking.session.currentCount ?? 0;
  const sessionWaitlistCount = booking.session.waitlistCount ?? 0;

  await db.update(bookings).set({
    bookingStatus: 'CANCELLED',
    cancelledAt: new Date(),
    cancelReason: data.reason,
    updatedAt: new Date(),
  }).where(eq(bookings.id, id));

  if (booking.booking.bookingStatus === 'CONFIRMED') {
    await db.update(classSessions).set({
      currentCount: Math.max(0, sessionCurrentCount - 1),
      updatedAt: new Date(),
    }).where(eq(classSessions.id, booking.session.id));

    const [nextWaitlist] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.sessionId, booking.session.id),
          eq(bookings.bookingStatus, 'WAITLIST')
        )
      )
      .orderBy(bookings.waitlistPosition)
      .limit(1);

    if (nextWaitlist) {
      await db.update(bookings).set({
        bookingStatus: 'CONFIRMED',
        waitlistPosition: null,
        updatedAt: new Date(),
      }).where(eq(bookings.id, nextWaitlist.id));

      await db.update(classSessions).set({
        currentCount: sessionCurrentCount,
        waitlistCount: Math.max(0, sessionWaitlistCount - 1),
        updatedAt: new Date(),
      }).where(eq(classSessions.id, booking.session.id));
    }
  } else {
    await db.update(classSessions).set({
      waitlistCount: Math.max(0, sessionWaitlistCount - 1),
      updatedAt: new Date(),
    }).where(eq(classSessions.id, booking.session.id));
  }

  return c.json({ success: true, message: '取消成功' });
});

app.post('/:id/attend', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [booking] = await db
    .select({
      booking: bookings,
      session: classSessions,
      class: classes,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, booking.session.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限操作此預約' }, 403);
  }

  if (booking.booking.bookingStatus !== 'CONFIRMED') {
    return c.json({ success: false, error: '只有已確認的預約才能簽到' }, 400);
  }

  const today = new Date().toISOString().split('T')[0];
  if (booking.session.sessionDate !== today) {
    return c.json({ success: false, error: '只能在課程當天簽到' }, 400);
  }

  let remainingCounts = null;

  if (booking.class.requiresCount && booking.booking.contractId) {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, booking.booking.contractId))
      .limit(1);

    if (contract?.remainingCounts !== null && contract.remainingCounts < (booking.class.countDeduction || 1)) {
      return c.json({ success: false, error: '剩餘次數不足' }, 400);
    }

    if (contract?.remainingCounts !== null) {
      remainingCounts = contract.remainingCounts - (booking.class.countDeduction || 1);
      await db.update(contracts).set({
        remainingCounts,
        updatedAt: new Date(),
      }).where(eq(contracts.id, booking.booking.contractId));
    }
  }

  await db.update(bookings).set({
    bookingStatus: 'ATTENDED',
    attendedAt: new Date(),
    countDeducted: booking.class.requiresCount,
    updatedAt: new Date(),
  }).where(eq(bookings.id, id));

  return c.json({
    success: true,
    data: { remainingCounts },
    message: '簽到成功！',
  });
});

export default app;
