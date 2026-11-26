import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, shiftSchedules, employeeShifts, employees, branches } from '../db/index.js';
import { eq, and, desc, asc, sql, lte, or, inArray } from 'drizzle-orm';
import { authMiddleware, requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

// =============================================================================
// SHIFT SCHEDULES (/api/shift_schedules) and EMPLOYEE SHIFTS (/api/employee_shifts)
// =============================================================================
// Two routers: app.ts mounts each on its own prefix. Shift schedules are scoped
// to the caller's tenant through their branch, employee shifts through the
// employee's branch (getTenantBranchIds). Another tenant's row gets the same
// 404 as a missing one. Writes need a manager, like employees.ts.

type Variables = AuthVariables & TenantVariables;

const MANAGER_ROLES = ['super_admin', 'admin', 'manager'] as const;
const SCHEDULE_NOT_FOUND = '找不到班表';
const ASSIGNMENT_NOT_FOUND = '找不到班表指派';
const INVALID_BRANCH = '無效的分店';

const COUNT_SELECT = { count: sql<number>`count(*)` };

const SHIFT_SCHEDULE_SELECT = {
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
};

const SHIFT_SCHEDULE_LIST_SELECT = {
  ...SHIFT_SCHEDULE_SELECT,
  branchName: branches.name,
};

const ID_SELECT = { id: shiftSchedules.id };

const EMPLOYEE_SHIFT_RETURNING = {
  id: employeeShifts.id,
  createdAt: employeeShifts.createdAt,
  employeeId: employeeShifts.employeeId,
  shiftScheduleId: employeeShifts.shiftScheduleId,
  effectiveDate: employeeShifts.effectiveDate,
  endDate: employeeShifts.endDate,
};

const EMPLOYEE_SHIFT_LIST_SELECT = {
  ...EMPLOYEE_SHIFT_RETURNING,
  employeeFullName: employees.fullName,
  employeeCode: employees.employeeCode,
  employeeBranchId: employees.branchId,
  shiftName: shiftSchedules.name,
  shiftStartTime: shiftSchedules.startTime,
  shiftEndTime: shiftSchedules.endTime,
};

type ShiftScheduleRow = {
  id: string;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  gracePeriodMinutes: number | null;
  earlyLeaveMinutes: number | null;
  overtimeStartAfter: string | null;
  isDefault: boolean | null;
  applicableDays: string[] | null;
  branchName?: string | null;
};

function formatShiftSchedule(r: ShiftScheduleRow) {
  return {
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
    ...(r.branchName !== undefined ? { branch: r.branchName ? { name: r.branchName } : null } : {}),
  };
}

type EmployeeShiftRow = {
  id: string;
  createdAt: Date | null;
  employeeId: string;
  shiftScheduleId: string;
  effectiveDate: string;
  endDate: string | null;
};

function formatEmployeeShift(r: EmployeeShiftRow) {
  return {
    id: r.id,
    date_created: r.createdAt?.toISOString() || null,
    employee_id: r.employeeId,
    shift_schedule_id: r.shiftScheduleId,
    effective_date: r.effectiveDate,
    end_date: r.endDate,
  };
}

const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);

// =============================================================================
// SHIFT SCHEDULES CRUD
// =============================================================================

export const shiftSchedulesRoutes = new Hono<{ Variables: Variables }>();
shiftSchedulesRoutes.use('*', authMiddleware, requireAuth, requireTenant);

// GET /api/shift_schedules - List Shift Schedules
shiftSchedulesRoutes.get('/', async (c) => {
  try {
    const {
      branch_id,
      status,
      limit = '50',
      offset = '0',
      sortBy = 'start_time',
      sortOrder = 'asc'
    } = c.req.query();

    const branchIds = await getTenantBranchIds(c.get('tenantId')!);
    const conditions = [inArray(shiftSchedules.branchId, branchIds)];

    // Filter by status (exclude archived by default)
    if (status) {
      conditions.push(eq(shiftSchedules.status, status as 'draft' | 'published' | 'archived'));
    } else {
      conditions.push(
        or(
          eq(shiftSchedules.status, 'published'),
          eq(shiftSchedules.status, 'draft')
        )!
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
    const where = and(...conditions);

    const [records, countResult] = await Promise.all([
      db
        .select(SHIFT_SCHEDULE_LIST_SELECT)
        .from(shiftSchedules)
        .leftJoin(branches, eq(shiftSchedules.branchId, branches.id))
        .where(where)
        .orderBy(orderFn(sortColumn))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db
        .select(COUNT_SELECT)
        .from(shiftSchedules)
        .where(where),
    ]);

    return c.json({
      success: true,
      data: records.map(formatShiftSchedule),
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
shiftSchedulesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const [record] = await db
    .select(SHIFT_SCHEDULE_LIST_SELECT)
    .from(shiftSchedules)
    .leftJoin(branches, eq(shiftSchedules.branchId, branches.id))
    .where(and(eq(shiftSchedules.id, id), inArray(shiftSchedules.branchId, branchIds)))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: SCHEDULE_NOT_FOUND }, 404);
  }

  return c.json({ success: true, data: formatShiftSchedule(record) });
});

// POST /api/shift_schedules - Create Shift Schedule
const createShiftSchema = z.object({
  branch_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  start_time: z.string().regex(TIME),
  end_time: z.string().regex(TIME),
  break_start: z.string().regex(TIME).optional().nullable(),
  break_end: z.string().regex(TIME).optional().nullable(),
  grace_period_minutes: z.number().int().min(0).max(60).optional(),
  early_leave_minutes: z.number().int().min(0).max(60).optional(),
  overtime_start_after: z.string().regex(TIME).optional().nullable(),
  is_default: z.boolean().optional(),
  applicable_days: z.array(WEEKDAYS).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

shiftSchedulesRoutes.post('/', requireRole(...MANAGER_ROLES), zValidator('json', createShiftSchema), async (c) => {
  const data = c.req.valid('json');
  const tenantId = c.get('tenantId')!;
  const branchIds = await getTenantBranchIds(tenantId);

  if (!branchIds.includes(data.branch_id)) {
    return c.json({ success: false, error: INVALID_BRANCH }, 400);
  }

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
        tenantId,
      })
      .returning(SHIFT_SCHEDULE_SELECT);

    return c.json({ success: true, data: formatShiftSchedule(record!) }, 201);
  } catch (error) {
    console.error('[Create Shift Schedule Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '建立班表失敗' }, 500);
  }
});

// PATCH /api/shift_schedules/:id - Update Shift Schedule
const updateShiftSchema = createShiftSchema.partial();

shiftSchedulesRoutes.patch('/:id', requireRole(...MANAGER_ROLES), zValidator('json', updateShiftSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  if (data.branch_id !== undefined && !branchIds.includes(data.branch_id)) {
    return c.json({ success: false, error: INVALID_BRANCH }, 400);
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
    .where(and(eq(shiftSchedules.id, id), inArray(shiftSchedules.branchId, branchIds)))
    .returning(SHIFT_SCHEDULE_SELECT);

  if (!updated) {
    return c.json({ success: false, error: SCHEDULE_NOT_FOUND }, 404);
  }

  return c.json({ success: true, data: formatShiftSchedule(updated) });
});

// DELETE /api/shift_schedules/:id - Delete (Archive) Shift Schedule
shiftSchedulesRoutes.delete('/:id', requireRole(...MANAGER_ROLES), async (c) => {
  const id = c.req.param('id');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  // Atomic soft delete by setting status to archived
  const [updated] = await db
    .update(shiftSchedules)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(shiftSchedules.id, id), inArray(shiftSchedules.branchId, branchIds)))
    .returning(ID_SELECT);

  if (!updated) {
    return c.json({ success: false, error: SCHEDULE_NOT_FOUND }, 404);
  }

  return c.json({ success: true, message: '班表已刪除' });
});

// =============================================================================
// EMPLOYEE SHIFTS CRUD
// =============================================================================

export const employeeShiftsRoutes = new Hono<{ Variables: Variables }>();
employeeShiftsRoutes.use('*', authMiddleware, requireAuth, requireTenant);

/** The assignment if its employee belongs to one of branchIds (missing and foreign look the same). */
async function findTenantEmployeeShift(id: string, branchIds: string[]) {
  const [row] = await db
    .select({ id: employeeShifts.id })
    .from(employeeShifts)
    .innerJoin(employees, eq(employeeShifts.employeeId, employees.id))
    .where(and(eq(employeeShifts.id, id), inArray(employees.branchId, branchIds)))
    .limit(1);
  return row;
}

// GET /api/employee_shifts - List Employee Shift Assignments
employeeShiftsRoutes.get('/', async (c) => {
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

    const branchIds = await getTenantBranchIds(c.get('tenantId')!);
    const conditions = [inArray(employees.branchId, branchIds)];

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
    const where = and(...conditions);

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    const [records, countResult] = await Promise.all([
      db
        .select(EMPLOYEE_SHIFT_LIST_SELECT)
        .from(employeeShifts)
        .innerJoin(employees, eq(employeeShifts.employeeId, employees.id))
        .leftJoin(shiftSchedules, eq(employeeShifts.shiftScheduleId, shiftSchedules.id))
        .where(where)
        .orderBy(orderFn(sortColumn))
        .limit(limitNum)
        .offset(offsetNum),
      db
        .select(COUNT_SELECT)
        .from(employeeShifts)
        .innerJoin(employees, eq(employeeShifts.employeeId, employees.id))
        .where(where),
    ]);

    const formattedRecords = records.map(r => ({
      ...formatEmployeeShift(r),
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

    const total = Number(countResult[0]?.count || 0);

    return c.json({
      success: true,
      data: formattedRecords,
      pagination: {
        total,
        page: Math.floor(offsetNum / limitNum) + 1,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
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
  effective_date: z.string().regex(DATE),
  end_date: z.string().regex(DATE).optional().nullable(),
});

employeeShiftsRoutes.post('/', requireRole(...MANAGER_ROLES), zValidator('json', createEmployeeShiftSchema), async (c) => {
  const data = c.req.valid('json');
  const tenantId = c.get('tenantId')!;
  const branchIds = await getTenantBranchIds(tenantId);

  const [[employee], [schedule]] = await Promise.all([
    db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, data.employee_id), inArray(employees.branchId, branchIds))).limit(1),
    db.select(ID_SELECT).from(shiftSchedules)
      .where(and(eq(shiftSchedules.id, data.shift_schedule_id), inArray(shiftSchedules.branchId, branchIds))).limit(1),
  ]);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }
  if (!schedule) {
    return c.json({ success: false, error: SCHEDULE_NOT_FOUND }, 404);
  }

  try {
    const [record] = await db
      .insert(employeeShifts)
      .values({
        employeeId: data.employee_id,
        shiftScheduleId: data.shift_schedule_id,
        effectiveDate: data.effective_date,
        endDate: data.end_date || null,
        tenantId,
      })
      .returning(EMPLOYEE_SHIFT_RETURNING);

    return c.json({ success: true, data: formatEmployeeShift(record!) }, 201);
  } catch (error) {
    console.error('[Create Employee Shift Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '建立班表指派失敗' }, 500);
  }
});

// PATCH /api/employee_shifts/:id - Update Employee Shift Assignment
const updateEmployeeShiftSchema = z.object({
  effective_date: z.string().regex(DATE).optional(),
  end_date: z.string().regex(DATE).optional().nullable(),
});

employeeShiftsRoutes.patch('/:id', requireRole(...MANAGER_ROLES), zValidator('json', updateEmployeeShiftSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  if (!await findTenantEmployeeShift(id, branchIds)) {
    return c.json({ success: false, error: ASSIGNMENT_NOT_FOUND }, 404);
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
    .returning(EMPLOYEE_SHIFT_RETURNING);

  return c.json({ success: true, data: formatEmployeeShift(updated!) });
});

// DELETE /api/employee_shifts/:id - Delete Employee Shift Assignment
employeeShiftsRoutes.delete('/:id', requireRole(...MANAGER_ROLES), async (c) => {
  const id = c.req.param('id');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  if (!await findTenantEmployeeShift(id, branchIds)) {
    return c.json({ success: false, error: ASSIGNMENT_NOT_FOUND }, 404);
  }

  await db.delete(employeeShifts).where(eq(employeeShifts.id, id));

  return c.json({ success: true, message: '班表指派已刪除' });
});
