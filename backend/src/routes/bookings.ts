import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, bookings, classSessions, classes, members, contracts, BOOKING_STATUS } from '../db/index.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';
import { createBooking, cancelBooking } from '../services/booking.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const BOOKING_SELECT = {
  id: bookings.id,
  status: bookings.status,
  createdAt: bookings.createdAt,
  updatedAt: bookings.updatedAt,
  sessionId: bookings.sessionId,
  memberId: bookings.memberId,
  contractId: bookings.contractId,
  bookingStatus: bookings.bookingStatus,
  waitlistPosition: bookings.waitlistPosition,
  bookedAt: bookings.bookedAt,
  cancelledAt: bookings.cancelledAt,
  cancelReason: bookings.cancelReason,
  attendedAt: bookings.attendedAt,
  countDeducted: bookings.countDeducted,
};
const BOOKING_COUNT_SELECT = { count: sql<number>`count(*)` };

const BOOKING_LIST_JOIN_SELECT = {
  booking: BOOKING_SELECT,
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
};

const BOOKING_DETAIL_JOIN_SELECT = {
  booking: BOOKING_SELECT,
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
};

const BOOKING_ATTEND_SELECT = {
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
    id: contracts.id,
    remainingCounts: contracts.remainingCounts,
  },
};


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
  // Session day (YYYY-MM-DD)
  const date = c.req.query('date');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: '日期格式必須為 YYYY-MM-DD' }, 400);
  }

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit } });
  }

  let conditions = [
    branchIds.length === 1
      ? eq(classSessions.branchId, branchIds[0])
      : inArray(classSessions.branchId, branchIds),
  ];

  if (memberId) {
    conditions.push(eq(bookings.memberId, memberId));
  }

  if (sessionId) {
    conditions.push(eq(bookings.sessionId, sessionId));
  }

  if (status) {
    conditions.push(eq(bookings.bookingStatus, status as typeof BOOKING_STATUS[number]));
  }

  if (date) {
    conditions.push(eq(classSessions.sessionDate, date));
  }

  const whereCondition = and(...conditions);

  const [[countResult], result] = await Promise.all([
    db
      .select(BOOKING_COUNT_SELECT)
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(whereCondition),
    db
      .select(BOOKING_LIST_JOIN_SELECT)
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

  const data = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const r = result[i]!;
    data[i] = {
      ...r.booking,
      session: r.session,
      class: r.class,
      member: r.member,
    };
  }

  return c.json({
    success: true,
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[booking], branchIds] = await Promise.all([
    db
      .select(BOOKING_DETAIL_JOIN_SELECT)
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .innerJoin(members, eq(bookings.memberId, members.id))
      .where(eq(bookings.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
  ]);

  if (!booking || !branchIds.includes(booking.session.branchId)) {
    return c.json({ success: false, error: '預約不存在' }, 404);
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

  const result = await createBooking({
    branchIds: await getTenantBranchIds(tenantId),
    sessionId: data.sessionId,
    memberId: data.memberId,
    contractId: data.contractId,
  });

  if (!result.ok) {
    return c.json({ success: false, error: result.error }, result.status);
  }

  return c.json({ success: true, data: result.booking, message: result.message }, 201);
});

app.post('/:id/cancel', zValidator('json', cancelBookingSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const result = await cancelBooking({
    branchIds: await getTenantBranchIds(tenantId),
    bookingId: c.req.param('id'),
    reason: data.reason,
  });

  if (!result.ok) {
    return c.json({ success: false, error: result.error }, result.status);
  }

  return c.json({ success: true, message: result.message });
});

app.post('/:id/attend', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[booking], branchIds] = await Promise.all([
    db
      .select(BOOKING_ATTEND_SELECT)
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .leftJoin(contracts, eq(bookings.contractId, contracts.id))
      .where(eq(bookings.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
  ]);

  if (!booking || !booking.session.branchId || !branchIds.includes(booking.session.branchId)) {
    return c.json({ success: false, error: '預約不存在' }, 404);
  }

  if (booking.booking.bookingStatus !== 'CONFIRMED') {
    return c.json({ success: false, error: '只有已確認的預約才能簽到' }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
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
