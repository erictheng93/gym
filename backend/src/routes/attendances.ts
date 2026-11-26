import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, attendances, employees, branches, jobTitles } from '../db/index.js';
import { eq, and, desc, asc, sql, gte, lte, inArray, isNull } from 'drizzle-orm';
import { authMiddleware, requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

// =============================================================================
// ATTENDANCE ROUTES
// =============================================================================
// Every attendance row is scoped to the caller's tenant through its employee's
// branch (getTenantBranchIds). Another tenant's record gets the same 404 as a
// missing one. inArray(col, []) renders as false, so a tenant without branches
// matches nothing.

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const NOT_FOUND = '找不到考勤記錄';
const MANAGER_ROLES = ['super_admin', 'admin', 'manager'];

const ATTENDANCE_SELECT = {
  id: attendances.id,
  employeeId: attendances.employeeId,
  checkIn: attendances.checkIn,
  checkOut: attendances.checkOut,
  workHours: attendances.workHours,
  branchId: attendances.branchId,
  locationIp: attendances.locationIp,
  locationGps: attendances.locationGps,
  employeeFullName: employees.fullName,
  employeeCode: employees.employeeCode,
  branchName: branches.name,
  jobTitleName: jobTitles.name,
};

const ATTENDANCE_ID_SELECT = { id: attendances.id };
const EMPLOYEE_BRANCH_SELECT = { id: employees.id, branchId: employees.branchId };
const ATTENDANCE_COUNT_SELECT = { count: sql<number>`count(*)` };

type AttendanceRow = {
  id: string;
  employeeId: string;
  checkIn: Date | null;
  checkOut: Date | null;
  workHours: string | null;
  branchId: string | null;
  locationIp: string | null;
  locationGps: string | null;
  employeeFullName: string;
  employeeCode: string;
  branchName: string | null;
  jobTitleName: string | null;
};

function formatAttendance(r: AttendanceRow) {
  const checkInDate = r.checkIn ? new Date(r.checkIn) : null;
  const checkOutDate = r.checkOut ? new Date(r.checkOut) : null;

  // Late minutes against the standard 9:00 start
  let lateMinutes = 0;
  if (checkInDate) {
    const actualMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    lateMinutes = Math.max(0, actualMinutes - 9 * 60);
  }

  // Early-leave minutes against the standard 18:00 end
  let earlyLeaveMinutes = 0;
  if (checkOutDate) {
    const actualMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
    earlyLeaveMinutes = Math.max(0, 18 * 60 - actualMinutes);
  }

  let attendanceStatus = 'PRESENT';
  if (lateMinutes > 0) attendanceStatus = 'LATE';
  else if (earlyLeaveMinutes > 0) attendanceStatus = 'EARLY_LEAVE';

  const attendanceDateStr = checkInDate
    ? checkInDate.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    id: r.id,
    employee_id: r.employeeId,
    employee: {
      id: r.employeeId,
      full_name: r.employeeFullName,
      employee_code: r.employeeCode,
      job_title: r.jobTitleName ? { name: r.jobTitleName } : null,
      branch: r.branchName ? { name: r.branchName } : null,
    },
    check_in: r.checkIn?.toISOString() || null,
    check_out: r.checkOut?.toISOString() || null,
    attendance_date: attendanceDateStr,
    check_type: 'REGULAR',
    attendance_status: attendanceStatus,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    work_hours: r.workHours ? parseFloat(r.workHours) : null,
    overtime_hours: 0,
    branch_id: r.branchId,
    location_ip: r.locationIp,
    location_gps: r.locationGps,
    notes: null,
    date_created: null,
  };
}

/** One attendance row of the caller's tenant, or undefined (missing and foreign look the same). */
async function findTenantAttendance(id: string, branchIds: string[]) {
  const [record] = await db
    .select(ATTENDANCE_SELECT)
    .from(attendances)
    .innerJoin(employees, eq(attendances.employeeId, employees.id))
    .leftJoin(branches, eq(attendances.branchId, branches.id))
    .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .where(and(eq(attendances.id, id), inArray(employees.branchId, branchIds)))
    .limit(1);
  return record;
}

app.use('*', authMiddleware, requireAuth, requireTenant);

// -----------------------------------------------------------------------------
// GET /api/attendances - List Attendances
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  try {
  const {
    id,
    employee_id,
    branch_id,
    attendance_date,
    attendance_date_gte,
    attendance_date_lte,
    limit = '50',
    offset = '0',
    sortBy = 'check_in',
    sortOrder = 'desc'
  } = c.req.query();

  const branchIds = await getTenantBranchIds(c.get('tenantId')!);
  const conditions = [inArray(employees.branchId, branchIds)];

  if (id) {
    conditions.push(eq(attendances.id, id));
  }

  if (employee_id) {
    conditions.push(eq(attendances.employeeId, employee_id));
  }

  if (branch_id) {
    conditions.push(eq(attendances.branchId, branch_id));
  }

  // Handle date filtering - attendance_date filters by the date part of check_in
  if (attendance_date) {
    const startOfDay = new Date(`${attendance_date}T00:00:00.000Z`);
    const endOfDay = new Date(`${attendance_date}T23:59:59.999Z`);
    conditions.push(gte(attendances.checkIn, startOfDay));
    conditions.push(lte(attendances.checkIn, endOfDay));
  }

  if (attendance_date_gte) {
    const startDate = new Date(`${attendance_date_gte}T00:00:00.000Z`);
    conditions.push(gte(attendances.checkIn, startDate));
  }

  if (attendance_date_lte) {
    const endDate = new Date(`${attendance_date_lte}T23:59:59.999Z`);
    conditions.push(lte(attendances.checkIn, endDate));
  }

  // Determine sort column and order
  const sortColumn = sortBy === 'check_in' ? attendances.checkIn :
                     sortBy === 'check_out' ? attendances.checkOut :
                     sortBy === 'employee_id' ? attendances.employeeId :
                     attendances.checkIn;

  const orderFn = sortOrder === 'asc' ? asc : desc;
  const where = and(...conditions);

  const [records, countResult] = await Promise.all([
    db
      .select(ATTENDANCE_SELECT)
      .from(attendances)
      .innerJoin(employees, eq(attendances.employeeId, employees.id))
      .leftJoin(branches, eq(attendances.branchId, branches.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select(ATTENDANCE_COUNT_SELECT)
      .from(attendances)
      .innerJoin(employees, eq(attendances.employeeId, employees.id))
      .where(where),
  ]);

  return c.json({
    success: true,
    data: records.map(formatAttendance),
    pagination: {
      total: Number(countResult[0]?.count || 0),
      page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      limit: parseInt(limit),
      totalPages: Math.ceil(Number(countResult[0]?.count || 0) / parseInt(limit)),
    },
  });
  } catch (error) {
    console.error('[Attendances Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '伺服器錯誤' }, 500);
  }
});

// -----------------------------------------------------------------------------
// GET /api/attendances/:id - Get Single Attendance
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);
  const record = await findTenantAttendance(c.req.param('id'), branchIds);

  if (!record) {
    return c.json({ success: false, error: NOT_FOUND }, 404);
  }

  return c.json({ success: true, data: formatAttendance(record) });
});

// -----------------------------------------------------------------------------
// POST /api/attendances - Create Attendance (Check-in)
// -----------------------------------------------------------------------------

const createSchema = z.object({
  employee_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  check_in: z.string().optional(),
  notes: z.string().optional(),
});

app.post('/', zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const [employee] = await db
    .select(EMPLOYEE_BRANCH_SELECT)
    .from(employees)
    .where(and(eq(employees.id, data.employee_id), inArray(employees.branchId, branchIds)))
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }

  if (data.branch_id && !branchIds.includes(data.branch_id)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  // An employee has at most one open (not checked-out) record per shift. A record
  // left open for more than a day (forgot to check out) does not block a new one.
  const openSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [open] = await db
    .select(ATTENDANCE_ID_SELECT)
    .from(attendances)
    .where(and(
      eq(attendances.employeeId, employee.id),
      isNull(attendances.checkOut),
      gte(attendances.checkIn, openSince),
    ))
    .limit(1);

  if (open) {
    return c.json({ success: false, error: '此員工已打卡上班，尚未打卡下班' }, 409);
  }

  const checkInTime = data.check_in ? new Date(data.check_in) : new Date();

  const [created] = await db
    .insert(attendances)
    .values({
      employeeId: employee.id,
      branchId: data.branch_id ?? employee.branchId,
      checkIn: checkInTime,
    })
    .returning(ATTENDANCE_ID_SELECT);

  const record = await findTenantAttendance(created!.id, branchIds);
  return c.json({ success: true, data: formatAttendance(record!) }, 201);
});

// -----------------------------------------------------------------------------
// PATCH /api/attendances/:id - Update Attendance (Check-out)
// -----------------------------------------------------------------------------
// Any staff member of the tenant can check an open record out (front desk).
// Changing a record that is already checked out, or overriding work_hours, is
// a correction and needs a manager.

const updateSchema = z.object({
  check_out: z.string().optional(),
  work_hours: z.number().optional(),
  notes: z.string().optional(),
});

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const existing = await findTenantAttendance(id, branchIds);
  if (!existing) {
    return c.json({ success: false, error: NOT_FOUND }, 404);
  }

  const isManager = MANAGER_ROLES.includes(c.get('user')!.role);
  const isCorrection = existing.checkOut !== null || data.work_hours !== undefined;
  if (isCorrection && !isManager) {
    return c.json({
      success: false,
      error: existing.checkOut !== null ? '此筆考勤已打卡下班' : '權限不足',
    }, existing.checkOut !== null ? 409 : 403);
  }

  const updates: Record<string, unknown> = {};

  if (data.check_out) {
    const checkOutTime = new Date(data.check_out);
    updates.checkOut = checkOutTime;

    // Calculate work hours if check_in exists
    if (existing.checkIn) {
      const diffMs = checkOutTime.getTime() - new Date(existing.checkIn).getTime();
      const hours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      updates.workHours = hours.toString();
    }
  }

  if (data.work_hours !== undefined) {
    updates.workHours = data.work_hours.toString();
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(attendances)
      .set(updates)
      .where(eq(attendances.id, id));
  }

  const record = await findTenantAttendance(id, branchIds);
  return c.json({ success: true, message: '考勤記錄已更新', data: formatAttendance(record!) });
});

// -----------------------------------------------------------------------------
// DELETE /api/attendances/:id - Delete Attendance
// -----------------------------------------------------------------------------

app.delete('/:id', requireRole(...MANAGER_ROLES), async (c) => {
  const id = c.req.param('id');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const existing = await findTenantAttendance(id, branchIds);
  if (!existing) {
    return c.json({ success: false, error: NOT_FOUND }, 404);
  }

  await db.delete(attendances).where(eq(attendances.id, id));

  return c.json({ success: true, message: '考勤記錄已刪除' });
});

export default app;
