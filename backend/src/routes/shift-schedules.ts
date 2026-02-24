import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, shiftSchedules, employeeShifts, employees, branches } from '../db/index.js';
import { eq, and, desc, asc, sql, lte, or } from 'drizzle-orm';
import { authMiddleware, requireAuth } from '../middleware/index.js';
import type { AuthVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables }>();

app.use('*', authMiddleware, requireAuth);

// =============================================================================
// SHIFT SCHEDULES CRUD
// =============================================================================

// GET /api/shift_schedules - List Shift Schedules
app.get('/', async (c) => {
  try {
    const {
      branch_id,
      status,
      limit = '50',
      offset = '0',
      sortBy = 'start_time',
      sortOrder = 'asc'
    } = c.req.query();

    const conditions = [];

    // Filter by status (exclude archived by default)
    if (status) {
      conditions.push(eq(shiftSchedules.status, status as 'draft' | 'published' | 'archived'));
    } else {
      conditions.push(
        or(
          eq(shiftSchedules.status, 'published'),
          eq(shiftSchedules.status, 'draft')
        )
      );
    }

    if (branch_id) {
      conditions.push(eq(shiftSchedules.branchId, branch_id));
    }

    const sortColumn = sortBy === 'name' ? shiftSchedules.name :
                       sortBy === 'start_time' ? shiftSchedules.startTime :
                       sortBy === 'created_at' ? shiftSchedules.createdAt :
                       shiftSchedules.startTime;

    const orderFn = sortOrder === 'desc' ? desc : asc;

    const [records, countResult] = await Promise.all([
      db
        .select({
          id: shiftSchedules.id,
          status: shiftSchedules.status,
          createdAt: shiftSchedules.createdAt,
          updatedAt: shiftSchedules.updatedAt,
          branchId: shiftSchedules.branchId,
          name: shiftSchedules.name,
          startTime: shiftSchedules.startTime,
          endTime: shiftSchedules.endTime,
          breakStart: shiftSchedules.breakStart,
          breakEnd: shiftSchedules.breakEnd,
          gracePeriodMinutes: shiftSchedules.gracePeriodMinutes,
          earlyLeaveMinutes: shiftSchedules.earlyLeaveMinutes,
          overtimeStartAfter: shiftSchedules.overtimeStartAfter,
          isDefault: shiftSchedules.isDefault,
          applicableDays: shiftSchedules.applicableDays,
          branchName: branches.name,
        })
        .from(shiftSchedules)
        .leftJoin(branches, eq(shiftSchedules.branchId, branches.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderFn(sortColumn))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(shiftSchedules)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    const formattedRecords = records.map(r => ({
      id: r.id,
      status: r.status,
      date_created: r.createdAt?.toISOString() || null,
      date_updated: r.updatedAt?.toISOString() || null,
      branch_id: r.branchId,
      name: r.name,
      start_time: r.startTime,
      end_time: r.endTime,
      break_start: r.breakStart,
      break_end: r.breakEnd,
      grace_period_minutes: r.gracePeriodMinutes,
      early_leave_minutes: r.earlyLeaveMinutes,
      overtime_start_after: r.overtimeStartAfter,
      is_default: r.isDefault,
      applicable_days: r.applicableDays,
      branch: r.branchName ? { name: r.branchName } : null,
    }));

    return c.json({
      success: true,
      data: formattedRecords,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
        limit: parseInt(limit),
        totalPages: Math.ceil(Number(countResult[0]?.count || 0) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Shift Schedules Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '伺服器錯誤' }, 500);
  }
});

// GET /api/shift_schedules/:id - Get Single Shift Schedule
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const [record] = await db
    .select({
      id: shiftSchedules.id,
      status: shiftSchedules.status,
      createdAt: shiftSchedules.createdAt,
      updatedAt: shiftSchedules.updatedAt,
      branchId: shiftSchedules.branchId,
      name: shiftSchedules.name,
      startTime: shiftSchedules.startTime,
      endTime: shiftSchedules.endTime,
      breakStart: shiftSchedules.breakStart,
      breakEnd: shiftSchedules.breakEnd,
      gracePeriodMinutes: shiftSchedules.gracePeriodMinutes,
      earlyLeaveMinutes: shiftSchedules.earlyLeaveMinutes,
      overtimeStartAfter: shiftSchedules.overtimeStartAfter,
      isDefault: shiftSchedules.isDefault,
      applicableDays: shiftSchedules.applicableDays,
      branchName: branches.name,
    })
    .from(shiftSchedules)
    .leftJoin(branches, eq(shiftSchedules.branchId, branches.id))
    .where(eq(shiftSchedules.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到班表' }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: record.id,
      status: record.status,
      date_created: record.createdAt?.toISOString() || null,
      date_updated: record.updatedAt?.toISOString() || null,
      branch_id: record.branchId,
      name: record.name,
      start_time: record.startTime,
      end_time: record.endTime,
      break_start: record.breakStart,
      break_end: record.breakEnd,
      grace_period_minutes: record.gracePeriodMinutes,
      early_leave_minutes: record.earlyLeaveMinutes,
      overtime_start_after: record.overtimeStartAfter,
      is_default: record.isDefault,
      applicable_days: record.applicableDays,
      branch: record.branchName ? { name: record.branchName } : null,
    },
  });
});

// POST /api/shift_schedules - Create Shift Schedule
const createShiftSchema = z.object({
  branch_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  break_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  break_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  grace_period_minutes: z.number().int().min(0).max(60).optional(),
  early_leave_minutes: z.number().int().min(0).max(60).optional(),
  overtime_start_after: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  is_default: z.boolean().optional(),
  applicable_days: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

app.post('/', zValidator('json', createShiftSchema), async (c) => {
  const data = c.req.valid('json');

  try {
    const [record] = await db
      .insert(shiftSchedules)
      .values({
        branchId: data.branch_id,
        name: data.name,
        startTime: data.start_time,
        endTime: data.end_time,
        breakStart: data.break_start || null,
        breakEnd: data.break_end || null,
        gracePeriodMinutes: data.grace_period_minutes ?? 15,
        earlyLeaveMinutes: data.early_leave_minutes ?? 15,
        overtimeStartAfter: data.overtime_start_after || null,
        isDefault: data.is_default ?? false,
        applicableDays: data.applicable_days ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        status: data.status ?? 'published',
      })
      .returning();

    return c.json({
      success: true,
      data: {
        id: record.id,
        status: record.status,
        date_created: record.createdAt?.toISOString() || null,
        branch_id: record.branchId,
        name: record.name,
        start_time: record.startTime,
        end_time: record.endTime,
        break_start: record.breakStart,
        break_end: record.breakEnd,
        grace_period_minutes: record.gracePeriodMinutes,
        early_leave_minutes: record.earlyLeaveMinutes,
        overtime_start_after: record.overtimeStartAfter,
        is_default: record.isDefault,
        applicable_days: record.applicableDays,
      },
    });
  } catch (error) {
    console.error('[Create Shift Schedule Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '建立班表失敗' }, 500);
  }
});

// PATCH /api/shift_schedules/:id - Update Shift Schedule
const updateShiftSchema = z.object({
  branch_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  break_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  break_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  grace_period_minutes: z.number().int().min(0).max(60).optional(),
  early_leave_minutes: z.number().int().min(0).max(60).optional(),
  overtime_start_after: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  is_default: z.boolean().optional(),
  applicable_days: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

app.patch('/:id', zValidator('json', updateShiftSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(shiftSchedules)
    .where(eq(shiftSchedules.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到班表' }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.branch_id !== undefined) updates.branchId = data.branch_id;
  if (data.name !== undefined) updates.name = data.name;
  if (data.start_time !== undefined) updates.startTime = data.start_time;
  if (data.end_time !== undefined) updates.endTime = data.end_time;
  if (data.break_start !== undefined) updates.breakStart = data.break_start;
  if (data.break_end !== undefined) updates.breakEnd = data.break_end;
  if (data.grace_period_minutes !== undefined) updates.gracePeriodMinutes = data.grace_period_minutes;
  if (data.early_leave_minutes !== undefined) updates.earlyLeaveMinutes = data.early_leave_minutes;
  if (data.overtime_start_after !== undefined) updates.overtimeStartAfter = data.overtime_start_after;
  if (data.is_default !== undefined) updates.isDefault = data.is_default;
  if (data.applicable_days !== undefined) updates.applicableDays = data.applicable_days;
  if (data.status !== undefined) updates.status = data.status;

  const [updated] = await db
    .update(shiftSchedules)
    .set(updates)
    .where(eq(shiftSchedules.id, id))
    .returning();

  return c.json({
    success: true,
    data: {
      id: updated.id,
      status: updated.status,
      date_created: updated.createdAt?.toISOString() || null,
      date_updated: updated.updatedAt?.toISOString() || null,
      branch_id: updated.branchId,
      name: updated.name,
      start_time: updated.startTime,
      end_time: updated.endTime,
      break_start: updated.breakStart,
      break_end: updated.breakEnd,
      grace_period_minutes: updated.gracePeriodMinutes,
      early_leave_minutes: updated.earlyLeaveMinutes,
      overtime_start_after: updated.overtimeStartAfter,
      is_default: updated.isDefault,
      applicable_days: updated.applicableDays,
    },
  });
});

// DELETE /api/shift_schedules/:id - Delete (Archive) Shift Schedule
app.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await db
    .select()
    .from(shiftSchedules)
    .where(eq(shiftSchedules.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到班表' }, 404);
  }

  // Soft delete by setting status to archived
  await db
    .update(shiftSchedules)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(shiftSchedules.id, id));

  return c.json({ success: true, message: '班表已刪除' });
});

// =============================================================================
// EMPLOYEE SHIFTS CRUD
// =============================================================================

// GET /api/employee_shifts - List Employee Shift Assignments
app.get('/employee_shifts', async (c) => {
  try {
    const {
      employee_id,
      shift_schedule_id,
      effective_date_lte,
      limit = '100',
      offset = '0',
      sortBy = 'date_created',
      sortOrder = 'desc'
    } = c.req.query();

    const conditions = [];

    if (employee_id) {
      conditions.push(eq(employeeShifts.employeeId, employee_id));
    }

    if (shift_schedule_id) {
      conditions.push(eq(employeeShifts.shiftScheduleId, shift_schedule_id));
    }

    if (effective_date_lte) {
      conditions.push(lte(employeeShifts.effectiveDate, effective_date_lte));
    }

    const sortColumn = sortBy === 'effective_date' ? employeeShifts.effectiveDate :
                       sortBy === 'date_created' ? employeeShifts.createdAt :
                       employeeShifts.createdAt;

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const records = await db
      .select({
        id: employeeShifts.id,
        createdAt: employeeShifts.createdAt,
        employeeId: employeeShifts.employeeId,
        shiftScheduleId: employeeShifts.shiftScheduleId,
        effectiveDate: employeeShifts.effectiveDate,
        endDate: employeeShifts.endDate,
        employeeFullName: employees.fullName,
        employeeCode: employees.employeeCode,
        employeeBranchId: employees.branchId,
        shiftName: shiftSchedules.name,
        shiftStartTime: shiftSchedules.startTime,
        shiftEndTime: shiftSchedules.endTime,
      })
      .from(employeeShifts)
      .leftJoin(employees, eq(employeeShifts.employeeId, employees.id))
      .leftJoin(shiftSchedules, eq(employeeShifts.shiftScheduleId, shiftSchedules.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const formattedRecords = records.map(r => ({
      id: r.id,
      date_created: r.createdAt?.toISOString() || null,
      employee_id: r.employeeId,
      shift_schedule_id: r.shiftScheduleId,
      effective_date: r.effectiveDate,
      end_date: r.endDate,
      employee: {
        id: r.employeeId,
        full_name: r.employeeFullName,
        employee_code: r.employeeCode,
        branch_id: r.employeeBranchId,
      },
      shift_schedule: r.shiftName ? {
        id: r.shiftScheduleId,
        name: r.shiftName,
        start_time: r.shiftStartTime,
        end_time: r.shiftEndTime,
      } : null,
    }));

    return c.json({
      success: true,
      data: formattedRecords,
      pagination: {
        total: formattedRecords.length,
        page: 1,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('[Employee Shifts Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '伺服器錯誤' }, 500);
  }
});

// POST /api/employee_shifts - Create Employee Shift Assignment
const createEmployeeShiftSchema = z.object({
  employee_id: z.string().uuid(),
  shift_schedule_id: z.string().uuid(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

app.post('/employee_shifts', zValidator('json', createEmployeeShiftSchema), async (c) => {
  const data = c.req.valid('json');

  try {
    const [record] = await db
      .insert(employeeShifts)
      .values({
        employeeId: data.employee_id,
        shiftScheduleId: data.shift_schedule_id,
        effectiveDate: data.effective_date,
        endDate: data.end_date || null,
      })
      .returning();

    return c.json({
      success: true,
      data: {
        id: record.id,
        date_created: record.createdAt?.toISOString() || null,
        employee_id: record.employeeId,
        shift_schedule_id: record.shiftScheduleId,
        effective_date: record.effectiveDate,
        end_date: record.endDate,
      },
    });
  } catch (error) {
    console.error('[Create Employee Shift Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '建立班表指派失敗' }, 500);
  }
});

// PATCH /api/employee_shifts/:id - Update Employee Shift Assignment
const updateEmployeeShiftSchema = z.object({
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

app.patch('/employee_shifts/:id', zValidator('json', updateEmployeeShiftSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(employeeShifts)
    .where(eq(employeeShifts.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到班表指派' }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.effective_date !== undefined) updates.effectiveDate = data.effective_date;
  if (data.end_date !== undefined) updates.endDate = data.end_date;

  const [updated] = await db
    .update(employeeShifts)
    .set(updates)
    .where(eq(employeeShifts.id, id))
    .returning();

  return c.json({
    success: true,
    data: {
      id: updated.id,
      date_created: updated.createdAt?.toISOString() || null,
      employee_id: updated.employeeId,
      shift_schedule_id: updated.shiftScheduleId,
      effective_date: updated.effectiveDate,
      end_date: updated.endDate,
    },
  });
});

// DELETE /api/employee_shifts/:id - Delete Employee Shift Assignment
app.delete('/employee_shifts/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await db
    .select()
    .from(employeeShifts)
    .where(eq(employeeShifts.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到班表指派' }, 404);
  }

  await db.delete(employeeShifts).where(eq(employeeShifts.id, id));

  return c.json({ success: true, message: '班表指派已刪除' });
});

export default app;
