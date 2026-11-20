import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, bookings, classSessions, classes, members, contracts, BOOKING_STATUS } from '../db/index.js';
import { eq, and, sql, desc, or, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

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

  const branchIds = await getTenantBranchIds(tenantId);

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

  const [[countResult], result] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(whereCondition),
    db
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
      .offset(offset),
  ]);

  const total = Number(countResult?.count || 0);

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

  const [[booking], branchIds] = await Promise.all([
    db
      .select({
        booking: bookings,
        session: {
          id: classSessions.id,
          branchId: classSessions.branchId,
          classId: classSessions.classId,
          instructorId: classSessions.instructorId,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          endTime: classSessions.endTime,
          sessionStatus: classSessions.sessionStatus,
          maxCapacity: classSessions.maxCapacity,
          currentCount: classSessions.currentCount,
          waitlistCount: classSessions.waitlistCount,
        },
        class: {
          id: classes.id,
          name: classes.name,
          category: classes.category,
          description: classes.description,
          durationMinutes: classes.durationMinutes,
        },
        member: {
          id: members.id,
          fullName: members.fullName,
          memberCode: members.memberCode,
          phone: members.phone,
          email: members.email,
          status: members.status,
        },
      })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .innerJoin(members, eq(bookings.memberId, members.id))
      .where(eq(bookings.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
  ]);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  if (!branchIds.includes(booking.session.branchId)) {
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

  const [[session], branchIds, [member], [existingBooking]] = await Promise.all([
    db
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
      .where(eq(classSessions.id, data.sessionId))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(eq(members.id, data.memberId))
      .limit(1),
    db
      .select({ id: bookings.id })
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
      .limit(1),
  ]);

  if (!session) {
    return c.json({ success: false, error: '課程場次不存在' }, 404);
  }

  if (!branchIds.includes(session.branchId)) {
    return c.json({ success: false, error: '無權限預約此課程' }, 403);
  }

  if (session.sessionStatus !== 'SCHEDULED') {
    return c.json({ success: false, error: '此課程已取消或已結束' }, 400);
  }

  const sessionDate = new Date(session.sessionDate);
  if (sessionDate < new Date()) {
    return c.json({ success: false, error: '無法預約過去的課程' }, 400);
  }

  if (!member || member.status !== 'ACTIVE') {
    return c.json({ success: false, error: '會員不存在或狀態無效' }, 400);
  }

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

  const [[newBooking]] = await Promise.all([
    db.insert(bookings).values({
      sessionId: data.sessionId,
      memberId: data.memberId,
      contractId: data.contractId,
      bookingStatus,
      waitlistPosition,
    }).returning({
      id: bookings.id,
      sessionId: bookings.sessionId,
      memberId: bookings.memberId,
      contractId: bookings.contractId,
      bookingStatus: bookings.bookingStatus,
      waitlistPosition: bookings.waitlistPosition,
      createdAt: bookings.createdAt,
    }),
    bookingStatus === 'CONFIRMED'
      ? db.update(classSessions).set({
          currentCount: currentCount + 1,
          updatedAt: new Date(),
        }).where(eq(classSessions.id, data.sessionId))
      : db.update(classSessions).set({
          waitlistCount: waitlistCount + 1,
          updatedAt: new Date(),
        }).where(eq(classSessions.id, data.sessionId)),
  ]);

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

  const [[booking], branchIds] = await Promise.all([
    db
      .select({
        booking: {
          id: bookings.id,
          bookingStatus: bookings.bookingStatus,
        },
        session: {
          id: classSessions.id,
          branchId: classSessions.branchId,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          currentCount: classSessions.currentCount,
          waitlistCount: classSessions.waitlistCount,
        },
      })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(eq(bookings.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
  ]);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  if (!booking.session.branchId || !branchIds.includes(booking.session.branchId)) {
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

  if (booking.booking.bookingStatus === 'CONFIRMED') {
    const [, [nextWaitlist]] = await Promise.all([
      db.update(bookings).set({
        bookingStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: data.reason,
        updatedAt: new Date(),
      }).where(eq(bookings.id, id)),
      db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.sessionId, booking.session.id),
            eq(bookings.bookingStatus, 'WAITLIST')
          )
        )
        .orderBy(bookings.waitlistPosition)
        .limit(1),
    ]);

    if (nextWaitlist) {
      await Promise.all([
        db.update(bookings).set({
          bookingStatus: 'CONFIRMED',
          waitlistPosition: null,
          updatedAt: new Date(),
        }).where(eq(bookings.id, nextWaitlist.id)),
        db.update(classSessions).set({
          currentCount: sessionCurrentCount,
          waitlistCount: Math.max(0, sessionWaitlistCount - 1),
          updatedAt: new Date(),
        }).where(eq(classSessions.id, booking.session.id)),
      ]);
    } else {
      await db.update(classSessions).set({
        currentCount: Math.max(0, sessionCurrentCount - 1),
        updatedAt: new Date(),
      }).where(eq(classSessions.id, booking.session.id));
    }
  } else {
    await Promise.all([
      db.update(bookings).set({
        bookingStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: data.reason,
        updatedAt: new Date(),
      }).where(eq(bookings.id, id)),
      db.update(classSessions).set({
        waitlistCount: Math.max(0, sessionWaitlistCount - 1),
        updatedAt: new Date(),
      }).where(eq(classSessions.id, booking.session.id)),
    ]);
  }

  return c.json({ success: true, message: '取消成功' });
});

app.post('/:id/attend', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[booking], branchIds] = await Promise.all([
    db
      .select({
        booking: {
          id: bookings.id,
          bookingStatus: bookings.bookingStatus,
          contractId: bookings.contractId,
        },
        session: {
          branchId: classSessions.branchId,
          sessionDate: classSessions.sessionDate,
        },
        class: {
          requiresCount: classes.requiresCount,
          countDeduction: classes.countDeduction,
        },
        contract: {
          remainingCounts: contracts.remainingCounts,
        },
      })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .leftJoin(contracts, eq(bookings.contractId, contracts.id))
      .where(eq(bookings.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
  ]);

  if (!booking) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  if (!booking.session.branchId || !branchIds.includes(booking.session.branchId)) {
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
    const contract = booking.contract;
    const countDeduction = booking.class.countDeduction || 1;

    if (contract && contract.remainingCounts !== null && contract.remainingCounts < countDeduction) {
      return c.json({ success: false, error: '剩餘次數不足' }, 400);
    }

    if (contract && contract.remainingCounts !== null) {
      remainingCounts = contract.remainingCounts - countDeduction;
      await Promise.all([
        db.update(contracts).set({
          remainingCounts,
          updatedAt: new Date(),
        }).where(eq(contracts.id, booking.booking.contractId)),
        db.update(bookings).set({
          bookingStatus: 'ATTENDED',
          attendedAt: new Date(),
          countDeducted: booking.class.requiresCount,
          updatedAt: new Date(),
        }).where(eq(bookings.id, id)),
      ]);

      return c.json({
        success: true,
        data: { remainingCounts },
        message: '簽到成功！',
      });
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
