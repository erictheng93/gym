import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  db,
  members,
  contracts,
  membershipPlans,
  memberGoals,
  bodyMeasurements,
  bookings,
  classSessions,
  coachMemberAssignments,
  coachNotes,
  classRecords,
} from '../db/index.js';
import { eq, and, desc, sql, inArray, like, or } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH STUDENTS ROUTES
// =============================================================================
// Manage assigned students and their notes

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createNoteSchema = z.object({
  note_type: z.enum(['PROGRESS', 'INJURY', 'PREFERENCE', 'GOAL', 'OTHER']),
  content: z.string().min(1, '請輸入內容'),
  is_private: z.boolean().optional().default(false),
});

const updateNoteSchema = z.object({
  note_type: z.enum(['PROGRESS', 'INJURY', 'PREFERENCE', 'GOAL', 'OTHER']).optional(),
  content: z.string().min(1, '請輸入內容').optional(),
  is_private: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/coach/students - List Assigned Students
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;
  const { role, search, status, limit = '20', offset = '0' } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Build conditions for assignments
  const assignmentConditions = [
    eq(coachMemberAssignments.coachId, coach.id),
    sql`${coachMemberAssignments.unassignedAt} IS NULL`,
  ];

  if (role) {
    assignmentConditions.push(eq(coachMemberAssignments.role, role as 'PRIMARY' | 'SECONDARY'));
  }

  // Get assigned member IDs
  const assignments = await db
    .select({
      memberId: coachMemberAssignments.memberId,
      role: coachMemberAssignments.role,
      assignedAt: coachMemberAssignments.assignedAt,
    })
    .from(coachMemberAssignments)
    .where(and(...assignmentConditions));

  const memberIds = assignments.map(a => a.memberId);

  if (memberIds.length === 0) {
    return c.json({
      success: true,
      data: [],
      meta: {
        total: 0,
        limit: limitNum,
        offset: offsetNum,
      },
    });
  }

  // Build member conditions
  const memberConditions = [inArray(members.id, memberIds)];

  if (search) {
    memberConditions.push(
      or(
        like(members.fullName, `%${search}%`),
        like(members.memberCode, `%${search}%`),
        like(members.phone, `%${search}%`)
      )!
    );
  }

  if (status) {
    memberConditions.push(eq(members.status, status as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED'));
  }

  // Get members
  const membersData = await db
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      phone: members.phone,
      email: members.email,
      gender: members.gender,
      birthday: members.birthday,
      status: members.status,
      avatar: members.avatar,
      joinDate: members.joinDate,
    })
    .from(members)
    .where(and(...memberConditions))
    .orderBy(members.fullName)
    .limit(limitNum)
    .offset(offsetNum);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(and(...memberConditions));

  // Get active contracts for each member
  const memberIdsForContracts = membersData.map(m => m.id);
  let activeContracts: Array<{
    memberId: string;
    planName: string;
    endDate: string;
    remainingCounts: number | null;
    contractStatus: string;
  }> = [];

  if (memberIdsForContracts.length > 0) {
    activeContracts = await db
      .select({
        memberId: contracts.memberId,
        planName: membershipPlans.name,
        endDate: contracts.endDate,
        remainingCounts: contracts.remainingCounts,
        contractStatus: contracts.status,
      })
      .from(contracts)
      .innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(
        and(
          inArray(contracts.memberId, memberIdsForContracts),
          eq(contracts.status, 'ACTIVE')
        )
      );
  }

  // Group contracts by member
  const contractsByMember = activeContracts.reduce((acc, c) => {
    if (!acc[c.memberId]) {
      acc[c.memberId] = [];
    }
    acc[c.memberId].push({
      plan_name: c.planName,
      end_date: c.endDate,
      remaining_counts: c.remainingCounts,
      status: c.contractStatus,
    });
    return acc;
  }, {} as Record<string, Array<{
    plan_name: string;
    end_date: string;
    remaining_counts: number | null;
    status: string;
  }>>);

  // Get assignment roles
  const rolesByMember = assignments.reduce((acc, a) => {
    acc[a.memberId] = {
      role: a.role,
      assigned_at: a.assignedAt,
    };
    return acc;
  }, {} as Record<string, { role: string; assigned_at: Date | null }>);

  // Format response
  const formattedData = membersData.map(member => ({
    id: member.id,
    member_code: member.memberCode,
    full_name: member.fullName,
    phone: member.phone,
    email: member.email,
    gender: member.gender,
    birthday: member.birthday,
    status: member.status,
    avatar: member.avatar,
    join_date: member.joinDate,
    role: rolesByMember[member.id]?.role || 'PRIMARY',
    assigned_at: rolesByMember[member.id]?.assigned_at,
    active_contracts: contractsByMember[member.id] || [],
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
// GET /api/coach/students/:id - Get Student Details
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Verify assignment
  const [assignment] = await db
    .select()
    .from(coachMemberAssignments)
    .where(
      and(
        eq(coachMemberAssignments.coachId, coach.id),
        eq(coachMemberAssignments.memberId, id),
        sql`${coachMemberAssignments.unassignedAt} IS NULL`
      )
    )
    .limit(1);

  if (!assignment) {
    return c.json({
      success: false,
      error: '無權查看此學員',
      code: 'FORBIDDEN',
    }, 403);
  }

  // Get member details
  const [member] = await db
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      phone: members.phone,
      email: members.email,
      gender: members.gender,
      birthday: members.birthday,
      status: members.status,
      avatar: members.avatar,
      joinDate: members.joinDate,
      address: members.address,
      emergencyContact: members.emergencyContact,
      emergencyPhone: members.emergencyPhone,
      height: members.height,
      notes: members.notes,
    })
    .from(members)
    .where(eq(members.id, id))
    .limit(1);

  if (!member) {
    return c.json({
      success: false,
      error: '找不到學員',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Get contracts
  const contractsData = await db
    .select({
      id: contracts.id,
      contractNo: contracts.contractNo,
      status: contracts.status,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      remainingCounts: contracts.remainingCounts,
      planName: membershipPlans.name,
      planType: membershipPlans.planType,
    })
    .from(contracts)
    .innerJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(eq(contracts.memberId, id))
    .orderBy(desc(contracts.startDate));

  // Get goals
  const goalsData = await db
    .select()
    .from(memberGoals)
    .where(eq(memberGoals.memberId, id))
    .orderBy(desc(memberGoals.createdAt))
    .limit(5);

  // Get measurements
  const measurementsData = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.memberId, id))
    .orderBy(desc(bodyMeasurements.date))
    .limit(10);

  // Get class history with this coach
  const classHistory = await db
    .select({
      id: bookings.id,
      scheduledAt: sql<string>`${classSessions.sessionDate}::text || 'T' || ${classSessions.startTime}::text`,
      status: bookings.bookingStatus,
      durationMinutes: sql<number>`EXTRACT(EPOCH FROM (${classSessions.endTime}::time - ${classSessions.startTime}::time)) / 60`,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(
      and(
        eq(bookings.memberId, id),
        eq(classSessions.instructorId, coach.id)
      )
    )
    .orderBy(desc(classSessions.sessionDate))
    .limit(20);

  // Get class records for these bookings
  const bookingIds = classHistory.map(h => h.id);
  let recordsMap: Record<string, {
    mainContent: unknown;
    coachNotes: string | null;
    nextPlan: string | null;
  }> = {};

  if (bookingIds.length > 0) {
    const records = await db
      .select({
        bookingId: classRecords.bookingId,
        mainContent: classRecords.mainContent,
        coachNotes: classRecords.coachNotes,
        nextPlan: classRecords.nextPlan,
      })
      .from(classRecords)
      .where(inArray(classRecords.bookingId, bookingIds));

    recordsMap = records.reduce((acc, r) => {
      acc[r.bookingId] = {
        mainContent: r.mainContent,
        coachNotes: r.coachNotes,
        nextPlan: r.nextPlan,
      };
      return acc;
    }, {} as typeof recordsMap);
  }

  // Get notes
  const notesData = await db
    .select()
    .from(coachNotes)
    .where(
      and(
        eq(coachNotes.coachId, coach.id),
        eq(coachNotes.memberId, id)
      )
    )
    .orderBy(desc(coachNotes.createdAt))
    .limit(20);

  return c.json({
    success: true,
    data: {
      id: member.id,
      member_code: member.memberCode,
      full_name: member.fullName,
      phone: member.phone,
      email: member.email,
      gender: member.gender,
      birthday: member.birthday,
      status: member.status,
      avatar: member.avatar,
      join_date: member.joinDate,
      address: member.address,
      emergency_contact: member.emergencyContact,
      emergency_phone: member.emergencyPhone,
      height: member.height,
      member_notes: member.notes,
      role: assignment.role,
      assigned_at: assignment.assignedAt,
      contracts: contractsData.map(c => ({
        id: c.id,
        contract_no: c.contractNo,
        status: c.status,
        start_date: c.startDate,
        end_date: c.endDate,
        remaining_counts: c.remainingCounts,
        plan_name: c.planName,
        plan_type: c.planType,
      })),
      goals: goalsData.map(g => ({
        id: g.id,
        goal_type: g.goalType,
        target_value: g.targetValue,
        current_value: g.currentValue,
        start_date: g.startDate,
        target_date: g.targetDate,
        status: g.status,
      })),
      measurements: measurementsData.map(m => ({
        id: m.id,
        date: m.date,
        weight: m.weight,
        body_fat: m.bodyFat,
        muscle_mass: m.muscleMass,
        bmi: m.bmi,
        source: m.source,
      })),
      class_history: classHistory.map(h => ({
        id: h.id,
        scheduled_at: h.scheduledAt,
        status: h.status,
        duration_minutes: h.durationMinutes,
        main_content: recordsMap[h.id]?.mainContent,
        coach_notes: recordsMap[h.id]?.coachNotes,
        next_plan: recordsMap[h.id]?.nextPlan,
      })),
      notes: notesData.map(n => ({
        id: n.id,
        note_type: n.noteType,
        content: n.content,
        is_private: n.isPrivate,
        created_at: n.createdAt,
        updated_at: n.updatedAt,
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/students/:id/notes - Get Student Notes
// -----------------------------------------------------------------------------

app.get('/:id/notes', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();
  const { note_type, limit = '20', offset = '0' } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Verify assignment
  const [assignment] = await db
    .select()
    .from(coachMemberAssignments)
    .where(
      and(
        eq(coachMemberAssignments.coachId, coach.id),
        eq(coachMemberAssignments.memberId, id),
        sql`${coachMemberAssignments.unassignedAt} IS NULL`
      )
    )
    .limit(1);

  if (!assignment) {
    return c.json({
      success: false,
      error: '無權查看此學員',
      code: 'FORBIDDEN',
    }, 403);
  }

  // Build conditions
  const conditions = [
    eq(coachNotes.coachId, coach.id),
    eq(coachNotes.memberId, id),
  ];

  if (note_type) {
    conditions.push(eq(coachNotes.noteType, note_type as 'PROGRESS' | 'INJURY' | 'PREFERENCE' | 'GOAL' | 'OTHER'));
  }

  // Get notes
  const notesData = await db
    .select()
    .from(coachNotes)
    .where(and(...conditions))
    .orderBy(desc(coachNotes.createdAt))
    .limit(limitNum)
    .offset(offsetNum);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(coachNotes)
    .where(and(...conditions));

  return c.json({
    success: true,
    data: notesData.map(n => ({
      id: n.id,
      note_type: n.noteType,
      content: n.content,
      is_private: n.isPrivate,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    })),
    meta: {
      total: Number(countResult?.count || 0),
      limit: limitNum,
      offset: offsetNum,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/coach/students/:id/notes - Create Student Note
// -----------------------------------------------------------------------------

app.post(
  '/:id/notes',
  zValidator('json', createNoteSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const { note_type, content, is_private } = c.req.valid('json');

    // Verify assignment
    const [assignment] = await db
      .select()
      .from(coachMemberAssignments)
      .where(
        and(
          eq(coachMemberAssignments.coachId, coach.id),
          eq(coachMemberAssignments.memberId, id),
          sql`${coachMemberAssignments.unassignedAt} IS NULL`
        )
      )
      .limit(1);

    if (!assignment) {
      return c.json({
        success: false,
        error: '無權為此學員建立筆記',
        code: 'FORBIDDEN',
      }, 403);
    }

    // Create note
    const [note] = await db
      .insert(coachNotes)
      .values({
        coachId: coach.id,
        memberId: id,
        noteType: note_type,
        content,
        isPrivate: is_private,
        tenantId: coach.tenantId || null,
      })
      .returning();

    return c.json({
      success: true,
      message: '筆記已建立',
      data: {
        id: note.id,
        note_type: note.noteType,
        content: note.content,
        is_private: note.isPrivate,
        created_at: note.createdAt,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// PATCH /api/coach/students/:id/notes/:noteId - Update Student Note
// -----------------------------------------------------------------------------

app.patch(
  '/:id/notes/:noteId',
  zValidator('json', updateNoteSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id, noteId } = c.req.param();
    const updates = c.req.valid('json');

    // Verify note exists and belongs to this coach
    const [existingNote] = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.id, noteId),
          eq(coachNotes.coachId, coach.id),
          eq(coachNotes.memberId, id)
        )
      )
      .limit(1);

    if (!existingNote) {
      return c.json({
        success: false,
        error: '找不到筆記',
        code: 'NOT_FOUND',
      }, 404);
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.note_type !== undefined) {
      updateData.noteType = updates.note_type;
    }
    if (updates.content !== undefined) {
      updateData.content = updates.content;
    }
    if (updates.is_private !== undefined) {
      updateData.isPrivate = updates.is_private;
    }

    // Update note
    const [updatedNote] = await db
      .update(coachNotes)
      .set(updateData)
      .where(eq(coachNotes.id, noteId))
      .returning();

    return c.json({
      success: true,
      message: '筆記已更新',
      data: {
        id: updatedNote.id,
        note_type: updatedNote.noteType,
        content: updatedNote.content,
        is_private: updatedNote.isPrivate,
        created_at: updatedNote.createdAt,
        updated_at: updatedNote.updatedAt,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/coach/students/:id/notes/:noteId - Delete Student Note
// -----------------------------------------------------------------------------

app.delete('/:id/notes/:noteId', async (c) => {
  const coach = c.get('coach')!;
  const { id, noteId } = c.req.param();

  // Verify note exists and belongs to this coach
  const [existingNote] = await db
    .select()
    .from(coachNotes)
    .where(
      and(
        eq(coachNotes.id, noteId),
        eq(coachNotes.coachId, coach.id),
        eq(coachNotes.memberId, id)
      )
    )
    .limit(1);

  if (!existingNote) {
    return c.json({
      success: false,
      error: '找不到筆記',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Delete note
  await db
    .delete(coachNotes)
    .where(eq(coachNotes.id, noteId));

  return c.json({
    success: true,
    message: '筆記已刪除',
  });
});

export default app;
