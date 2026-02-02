import { Hono } from 'hono';
import {
  db,
  bookings,
  classSessions,
  classes,
  members,
  classSchedules,
} from '../db/index.js';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH SCHEDULE ROUTES
// =============================================================================
// Weekly schedule view for coaches

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// GET /api/coach/schedule - Get Weekly Schedule
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;
  const { start_date, end_date } = c.req.query();

  // Default to current week if no dates provided
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const startDate = start_date || monday.toISOString().split('T')[0];
  const endDate = end_date || (() => {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return sunday.toISOString().split('T')[0];
  })();

  // Get sessions in date range
  const sessionsData = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      room: classSessions.room,
      maxCapacity: classSessions.maxCapacity,
      currentCount: classSessions.currentCount,
      waitlistCount: classSessions.waitlistCount,
      sessionStatus: classSessions.sessionStatus,
      className: classes.name,
      classCategory: classes.category,
      classDuration: classes.durationMinutes,
      branchId: classSessions.branchId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classSessions.instructorId, coach.id),
        gte(classSessions.sessionDate, startDate),
        lte(classSessions.sessionDate, endDate)
      )
    )
    .orderBy(classSessions.sessionDate, classSessions.startTime);

  // Get bookings for these sessions
  const sessionIds = sessionsData.map(s => s.id);
  let bookingsData: Array<{
    sessionId: string;
    memberId: string;
    memberName: string;
    memberCode: string;
    bookingStatus: string | null;
  }> = [];

  if (sessionIds.length > 0) {
    bookingsData = await db
      .select({
        sessionId: bookings.sessionId,
        memberId: bookings.memberId,
        memberName: members.fullName,
        memberCode: members.memberCode,
        bookingStatus: bookings.bookingStatus,
      })
      .from(bookings)
      .innerJoin(members, eq(bookings.memberId, members.id))
      .where(
        and(
          inArray(bookings.sessionId, sessionIds),
          inArray(bookings.bookingStatus, ['CONFIRMED', 'ATTENDED', 'NO_SHOW'])
        )
      );
  }

  // Group bookings by session
  const bookingsBySession = bookingsData.reduce((acc, b) => {
    if (!acc[b.sessionId]) {
      acc[b.sessionId] = [];
    }
    acc[b.sessionId].push({
      member_id: b.memberId,
      member_name: b.memberName,
      member_code: b.memberCode,
      booking_status: b.bookingStatus || 'UNKNOWN',
    });
    return acc;
  }, {} as Record<string, Array<{
    member_id: string;
    member_name: string;
    member_code: string;
    booking_status: string;
  }>>);

  // Format sessions as bookings for consistency with frontend
  const formattedBookings = sessionsData.map(session => ({
    id: session.id,
    class_id: session.classId,
    class_name: session.className,
    class_category: session.classCategory,
    scheduled_at: `${session.sessionDate}T${session.startTime}`,
    session_date: session.sessionDate,
    start_time: session.startTime,
    end_time: session.endTime,
    duration_minutes: session.classDuration,
    room: session.room,
    max_capacity: session.maxCapacity,
    current_count: session.currentCount,
    waitlist_count: session.waitlistCount,
    status: session.sessionStatus,
    branch_id: session.branchId,
    member: bookingsBySession[session.id]?.[0] ? {
      id: bookingsBySession[session.id][0].member_id,
      full_name: bookingsBySession[session.id][0].member_name,
      member_code: bookingsBySession[session.id][0].member_code,
    } : null,
    all_members: bookingsBySession[session.id] || [],
  }));

  // Get recurring schedule (availability)
  const availability = await db
    .select({
      dayOfWeek: classSchedules.dayOfWeek,
      startTime: classSchedules.startTime,
      endTime: classSchedules.endTime,
      classId: classSchedules.classId,
      className: classes.name,
      room: classSchedules.room,
      maxCapacity: classSchedules.maxCapacity,
      isRecurring: classSchedules.isRecurring,
    })
    .from(classSchedules)
    .innerJoin(classes, eq(classSchedules.classId, classes.id))
    .where(
      and(
        eq(classSchedules.instructorId, coach.id),
        eq(classSchedules.status, 'active')
      )
    )
    .orderBy(classSchedules.dayOfWeek, classSchedules.startTime);

  // Format availability
  const formattedAvailability = availability.map(slot => ({
    day_of_week: slot.dayOfWeek,
    start_time: slot.startTime,
    end_time: slot.endTime,
    is_available: true,
    class_id: slot.classId,
    class_name: slot.className,
    room: slot.room,
    max_capacity: slot.maxCapacity,
    is_recurring: slot.isRecurring,
  }));

  return c.json({
    success: true,
    data: {
      bookings: formattedBookings,
      availability: formattedAvailability,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/schedule/today - Get Today's Classes
// -----------------------------------------------------------------------------

app.get('/today', async (c) => {
  const coach = c.get('coach')!;
  const today = new Date().toISOString().split('T')[0];

  // Get today's sessions
  const sessionsData = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      room: classSessions.room,
      maxCapacity: classSessions.maxCapacity,
      currentCount: classSessions.currentCount,
      sessionStatus: classSessions.sessionStatus,
      className: classes.name,
      classCategory: classes.category,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classSessions.instructorId, coach.id),
        eq(classSessions.sessionDate, today)
      )
    )
    .orderBy(classSessions.startTime);

  // Get bookings count
  const sessionIds = sessionsData.map(s => s.id);
  let attendanceCounts: Record<string, { confirmed: number; attended: number; noShow: number }> = {};

  if (sessionIds.length > 0) {
    const countsData = await db
      .select({
        sessionId: bookings.sessionId,
        bookingStatus: bookings.bookingStatus,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(inArray(bookings.sessionId, sessionIds))
      .groupBy(bookings.sessionId, bookings.bookingStatus);

    attendanceCounts = countsData.reduce((acc, row) => {
      if (!acc[row.sessionId]) {
        acc[row.sessionId] = { confirmed: 0, attended: 0, noShow: 0 };
      }
      if (row.bookingStatus === 'CONFIRMED') acc[row.sessionId].confirmed = Number(row.count);
      if (row.bookingStatus === 'ATTENDED') acc[row.sessionId].attended = Number(row.count);
      if (row.bookingStatus === 'NO_SHOW') acc[row.sessionId].noShow = Number(row.count);
      return acc;
    }, {} as typeof attendanceCounts);
  }

  const formattedSessions = sessionsData.map(session => ({
    id: session.id,
    class_name: session.className,
    class_category: session.classCategory,
    start_time: session.startTime,
    end_time: session.endTime,
    room: session.room,
    max_capacity: session.maxCapacity,
    current_count: session.currentCount,
    status: session.sessionStatus,
    attendance: attendanceCounts[session.id] || { confirmed: 0, attended: 0, noShow: 0 },
  }));

  return c.json({
    success: true,
    data: {
      date: today,
      sessions: formattedSessions,
      summary: {
        total_classes: formattedSessions.length,
        scheduled: formattedSessions.filter(s => s.status === 'SCHEDULED').length,
        completed: formattedSessions.filter(s => s.status === 'COMPLETED').length,
        cancelled: formattedSessions.filter(s => s.status === 'CANCELLED').length,
      },
    },
  });
});

export default app;
