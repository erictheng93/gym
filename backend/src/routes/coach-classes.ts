import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  db,
  bookings,
  classSessions,
  classes,
  members,
  contracts,
  classRecords,
  lessonPlans,
  contractLogs,
} from '../db/index.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH CLASSES ROUTES
// =============================================================================
// Endpoints for coach to manage their classes, attendance, and cancellations

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const attendanceSchema = z.object({
  attended: z.boolean(),
  notes: z.string().optional(),
  class_record: z.object({
    warmup: z.string().optional(),
    main: z.record(z.unknown()).optional(),
    cooldown: z.string().optional(),
    member_condition: z.string().optional(),
    coach_notes: z.string().optional(),
    next_plan: z.string().optional(),
  }).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1, '請填寫取消原因'),
});

// -----------------------------------------------------------------------------
// GET /api/coach/classes - List Coach's Classes
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;
  const { date, status, limit = '20', offset = '0' } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Build conditions
  const conditions = [
    eq(classSessions.instructorId, coach.id),
  ];

  if (date) {
    conditions.push(eq(classSessions.sessionDate, date));
  }

  if (status) {
    conditions.push(eq(classSessions.sessionStatus, status as 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'));
  }

  // Get sessions with class info
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
      cancelledReason: classSessions.cancelledReason,
      cancelledAt: classSessions.cancelledAt,
      className: classes.name,
      classCategory: classes.category,
      classDuration: classes.durationMinutes,
      branchId: classSessions.branchId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(and(...conditions))
    .orderBy(desc(classSessions.sessionDate), classSessions.startTime)
    .limit(limitNum)
    .offset(offsetNum);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(classSessions)
    .where(and(...conditions));

  // Get bookings for each session
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

  // Format response
  const formattedData = sessionsData.map(session => ({
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
    cancelled_reason: session.cancelledReason,
    cancelled_at: session.cancelledAt,
    branch_id: session.branchId,
    bookings: bookingsBySession[session.id] || [],
  }));

  return c.json({
    success: true,
    data: formattedData,
    meta: {
      total: Number(countResult?.count || 0),
      limit: limitNum,
      offset: offsetNum,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/classes/:id - Get Class Details
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Get session details
  const [session] = await db
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
      cancelledReason: classSessions.cancelledReason,
      cancelledAt: classSessions.cancelledAt,
      instructorId: classSessions.instructorId,
      className: classes.name,
      classCategory: classes.category,
      classDuration: classes.durationMinutes,
      classDescription: classes.description,
      branchId: classSessions.branchId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(classSessions.id, id))
    .limit(1);

  if (!session) {
    return c.json({
      success: false,
      error: '找不到課程',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Verify coach owns this session
  if (session.instructorId !== coach.id) {
    return c.json({
      success: false,
      error: '無權查看此課程',
      code: 'FORBIDDEN',
    }, 403);
  }

  // Get all bookings with member details
  const bookingsData = await db
    .select({
      id: bookings.id,
      memberId: bookings.memberId,
      memberName: members.fullName,
      memberCode: members.memberCode,
      memberPhone: members.phone,
      memberEmail: members.email,
      bookingStatus: bookings.bookingStatus,
      bookedAt: bookings.bookedAt,
      attendedAt: bookings.attendedAt,
      cancelledAt: bookings.cancelledAt,
      cancelReason: bookings.cancelReason,
      contractId: bookings.contractId,
    })
    .from(bookings)
    .innerJoin(members, eq(bookings.memberId, members.id))
    .where(eq(bookings.sessionId, id))
    .orderBy(bookings.bookedAt);

  // Get class records for attended bookings
  const bookingIds = bookingsData.map(b => b.id);
  let recordsMap: Record<string, {
    id: string;
    warmupContent: string | null;
    mainContent: unknown;
    cooldownContent: string | null;
    memberCondition: string | null;
    coachNotes: string | null;
    nextPlan: string | null;
  }> = {};

  if (bookingIds.length > 0) {
    const records = await db
      .select()
      .from(classRecords)
      .where(inArray(classRecords.bookingId, bookingIds));

    recordsMap = records.reduce((acc, r) => {
      acc[r.bookingId] = {
        id: r.id,
        warmupContent: r.warmupContent,
        mainContent: r.mainContent,
        cooldownContent: r.cooldownContent,
        memberCondition: r.memberCondition,
        coachNotes: r.coachNotes,
        nextPlan: r.nextPlan,
      };
      return acc;
    }, {} as typeof recordsMap);
  }

  // Get lesson plan if linked
  const [lessonPlan] = await db
    .select({
      id: lessonPlans.id,
      title: lessonPlans.title,
      objectives: lessonPlans.objectives,
      warmupExercises: lessonPlans.warmupExercises,
      mainExercises: lessonPlans.mainExercises,
      cooldownExercises: lessonPlans.cooldownExercises,
    })
    .from(lessonPlans)
    .where(eq(lessonPlans.sessionId, id))
    .limit(1);

  // Format response
  const formattedBookings = bookingsData.map(b => ({
    id: b.id,
    member_id: b.memberId,
    member_name: b.memberName,
    member_code: b.memberCode,
    member_phone: b.memberPhone,
    member_email: b.memberEmail,
    booking_status: b.bookingStatus,
    booked_at: b.bookedAt,
    attended_at: b.attendedAt,
    cancelled_at: b.cancelledAt,
    cancel_reason: b.cancelReason,
    contract_id: b.contractId,
    record: recordsMap[b.id] ? {
      id: recordsMap[b.id].id,
      warmup_content: recordsMap[b.id].warmupContent,
      main_content: recordsMap[b.id].mainContent,
      cooldown_content: recordsMap[b.id].cooldownContent,
      member_condition: recordsMap[b.id].memberCondition,
      coach_notes: recordsMap[b.id].coachNotes,
      next_plan: recordsMap[b.id].nextPlan,
    } : null,
  }));

  return c.json({
    success: true,
    data: {
      id: session.id,
      class_id: session.classId,
      class_name: session.className,
      class_category: session.classCategory,
      class_description: session.classDescription,
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
      cancelled_reason: session.cancelledReason,
      cancelled_at: session.cancelledAt,
      branch_id: session.branchId,
      bookings: formattedBookings,
      lesson_plan: lessonPlan ? {
        id: lessonPlan.id,
        title: lessonPlan.title,
        objectives: lessonPlan.objectives,
        warmup_exercises: lessonPlan.warmupExercises,
        main_exercises: lessonPlan.mainExercises,
        cooldown_exercises: lessonPlan.cooldownExercises,
      } : null,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/coach/classes/:id/attendance - Mark Attendance
// -----------------------------------------------------------------------------

app.post(
  '/:id/attendance',
  zValidator('json', attendanceSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const { attended, notes, class_record } = c.req.valid('json');

    // Verify this is a booking ID and coach owns the session
    const [booking] = await db
      .select({
        id: bookings.id,
        sessionId: bookings.sessionId,
        memberId: bookings.memberId,
        bookingStatus: bookings.bookingStatus,
        contractId: bookings.contractId,
        countDeducted: bookings.countDeducted,
      })
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);

    if (!booking) {
      return c.json({
        success: false,
        error: '找不到預約',
        code: 'NOT_FOUND',
      }, 404);
    }

    // Verify coach owns this session
    const [session] = await db
      .select({
        id: classSessions.id,
        instructorId: classSessions.instructorId,
        sessionDate: classSessions.sessionDate,
      })
      .from(classSessions)
      .where(eq(classSessions.id, booking.sessionId))
      .limit(1);

    if (!session || session.instructorId !== coach.id) {
      return c.json({
        success: false,
        error: '無權操作此課程',
        code: 'FORBIDDEN',
      }, 403);
    }

    const newStatus = attended ? 'ATTENDED' : 'NO_SHOW';

    // Update booking status
    await db
      .update(bookings)
      .set({
        bookingStatus: newStatus,
        attendedAt: attended ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    // Handle class count deduction for COUNT_BASED contracts
    if (attended && booking.contractId && !booking.countDeducted) {
      const [contract] = await db
        .select({
          id: contracts.id,
          remainingCounts: contracts.remainingCounts,
        })
        .from(contracts)
        .where(eq(contracts.id, booking.contractId))
        .limit(1);

      if (contract && contract.remainingCounts && contract.remainingCounts > 0) {
        // Deduct class count
        await db
          .update(contracts)
          .set({
            remainingCounts: contract.remainingCounts - 1,
            updatedAt: new Date(),
          })
          .where(eq(contracts.id, contract.id));

        // Mark as deducted
        await db
          .update(bookings)
          .set({ countDeducted: true })
          .where(eq(bookings.id, booking.id));

        // Log the class usage
        await db.insert(contractLogs).values({
          contractId: contract.id,
          logType: 'CLASS_USED',
          startDate: session.sessionDate,
          endDate: session.sessionDate,
          days: 1,
          reason: `課程點名 - ${session.sessionDate}`,
          createdBy: coach.id,
        });
      }
    }

    // Create or update class record
    if (class_record) {
      const existingRecord = await db
        .select({ id: classRecords.id })
        .from(classRecords)
        .where(eq(classRecords.bookingId, booking.id))
        .limit(1);

      if (existingRecord.length > 0) {
        await db
          .update(classRecords)
          .set({
            warmupContent: class_record.warmup,
            mainContent: class_record.main,
            cooldownContent: class_record.cooldown,
            memberCondition: class_record.member_condition,
            coachNotes: class_record.coach_notes || notes,
            nextPlan: class_record.next_plan,
            updatedAt: new Date(),
          })
          .where(eq(classRecords.id, existingRecord[0].id));
      } else {
        await db.insert(classRecords).values({
          bookingId: booking.id,
          coachId: coach.id,
          classDate: session.sessionDate,
          warmupContent: class_record.warmup,
          mainContent: class_record.main,
          cooldownContent: class_record.cooldown,
          memberCondition: class_record.member_condition,
          coachNotes: class_record.coach_notes || notes,
          nextPlan: class_record.next_plan,
        });
      }
    }

    return c.json({
      success: true,
      message: attended ? '已標記出席' : '已標記未到',
      status: newStatus,
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/coach/classes/:id/cancel - Cancel Class (Coach-initiated)
// -----------------------------------------------------------------------------

app.post(
  '/:id/cancel',
  zValidator('json', cancelSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const { reason } = c.req.valid('json');

    // Get session
    const [session] = await db
      .select({
        id: classSessions.id,
        instructorId: classSessions.instructorId,
        sessionStatus: classSessions.sessionStatus,
        sessionDate: classSessions.sessionDate,
      })
      .from(classSessions)
      .where(eq(classSessions.id, id))
      .limit(1);

    if (!session) {
      return c.json({
        success: false,
        error: '找不到課程',
        code: 'NOT_FOUND',
      }, 404);
    }

    if (session.instructorId !== coach.id) {
      return c.json({
        success: false,
        error: '無權取消此課程',
        code: 'FORBIDDEN',
      }, 403);
    }

    if (session.sessionStatus === 'CANCELLED') {
      return c.json({
        success: false,
        error: '課程已取消',
        code: 'ALREADY_CANCELLED',
      }, 400);
    }

    if (session.sessionStatus === 'COMPLETED') {
      return c.json({
        success: false,
        error: '課程已完成，無法取消',
        code: 'ALREADY_COMPLETED',
      }, 400);
    }

    // Cancel the session
    await db
      .update(classSessions)
      .set({
        sessionStatus: 'CANCELLED',
        cancelledReason: reason,
        cancelledAt: new Date(),
        cancelledBy: coach.id,
        updatedAt: new Date(),
      })
      .where(eq(classSessions.id, session.id));

    // Cancel all confirmed bookings
    await db
      .update(bookings)
      .set({
        bookingStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: `教練取消: ${reason}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.sessionId, session.id),
          eq(bookings.bookingStatus, 'CONFIRMED')
        )
      );

    // TODO: Send notifications to members about cancellation

    return c.json({
      success: true,
      message: '課程已取消',
    });
  }
);

export default app;
