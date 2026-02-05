import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, attendances, employees, branches, jobTitles } from '../db/index.js';
import { eq, and, desc, asc, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware, requireAuth } from '../middleware/index.js';
import type { AuthVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables }>();

app.use('*', authMiddleware, requireAuth);

// -----------------------------------------------------------------------------
// GET /api/attendances - List Attendances
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  try {
  const {
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

  const conditions = [];

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

  const [records, countResult] = await Promise.all([
    db
      .select({
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
      })
      .from(attendances)
      .innerJoin(employees, eq(attendances.employeeId, employees.id))
      .leftJoin(branches, eq(attendances.branchId, branches.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(attendances)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  // Transform to API format expected by frontend
  const formattedRecords = records.map(r => {
    const checkInDate = r.checkIn ? new Date(r.checkIn) : null;
    const checkOutDate = r.checkOut ? new Date(r.checkOut) : null;

    // Calculate late minutes (standard start: 9:00 AM)
    let lateMinutes = 0;
    if (checkInDate) {
      const checkInHour = checkInDate.getHours();
      const checkInMinute = checkInDate.getMinutes();
      const standardMinutes = 9 * 60; // 9:00 AM
      const actualMinutes = checkInHour * 60 + checkInMinute;
      lateMinutes = Math.max(0, actualMinutes - standardMinutes);
    }

    // Calculate early leave minutes (standard end: 6:00 PM)
    let earlyLeaveMinutes = 0;
    if (checkOutDate) {
      const checkOutHour = checkOutDate.getHours();
      const checkOutMinute = checkOutDate.getMinutes();
      const standardMinutes = 18 * 60; // 6:00 PM
      const actualMinutes = checkOutHour * 60 + checkOutMinute;
      earlyLeaveMinutes = Math.max(0, standardMinutes - actualMinutes);
    }

    // Determine attendance status
    let attendanceStatus = 'PRESENT';
    if (lateMinutes > 0) attendanceStatus = 'LATE';
    else if (earlyLeaveMinutes > 0) attendanceStatus = 'EARLY_LEAVE';

    // Get attendance date from check_in
    const attendanceDateStr = checkInDate
      ? checkInDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

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
  });

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
    console.error('[Attendances Error]', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : '伺服器錯誤' }, 500);
  }
});

// -----------------------------------------------------------------------------
// GET /api/attendances/:id - Get Single Attendance
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const [record] = await db
    .select({
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
    })
    .from(attendances)
    .innerJoin(employees, eq(attendances.employeeId, employees.id))
    .leftJoin(branches, eq(attendances.branchId, branches.id))
    .where(eq(attendances.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到考勤記錄' }, 404);
  }

  const checkInDate = record.checkIn ? new Date(record.checkIn) : null;
  const checkOutDate = record.checkOut ? new Date(record.checkOut) : null;

  let lateMinutes = 0;
  if (checkInDate) {
    const actualMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    lateMinutes = Math.max(0, actualMinutes - 9 * 60);
  }

  let earlyLeaveMinutes = 0;
  if (checkOutDate) {
    const actualMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
    earlyLeaveMinutes = Math.max(0, 18 * 60 - actualMinutes);
  }

  let attendanceStatus = 'PRESENT';
  if (lateMinutes > 0) attendanceStatus = 'LATE';
  else if (earlyLeaveMinutes > 0) attendanceStatus = 'EARLY_LEAVE';

  const attendanceDateStr = checkInDate
    ? checkInDate.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return c.json({
    success: true,
    data: {
      id: record.id,
      employee_id: record.employeeId,
      employee: {
        id: record.employeeId,
        full_name: record.employeeFullName,
        employee_code: record.employeeCode,
      },
      check_in: record.checkIn?.toISOString() || null,
      check_out: record.checkOut?.toISOString() || null,
      attendance_date: attendanceDateStr,
      check_type: 'REGULAR',
      attendance_status: attendanceStatus,
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      work_hours: record.workHours ? parseFloat(record.workHours) : null,
      overtime_hours: 0,
      branch_id: record.branchId,
      notes: null,
      date_created: null,
    },
  });
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

  const checkInTime = data.check_in ? new Date(data.check_in) : new Date();

  const [record] = await db
    .insert(attendances)
    .values({
      employeeId: data.employee_id,
      branchId: data.branch_id,
      checkIn: checkInTime,
    })
    .returning();

  return c.json({
    success: true,
    data: {
      id: record.id,
      employee_id: record.employeeId,
      check_in: record.checkIn?.toISOString() || null,
      branch_id: record.branchId,
    },
  });
});

// -----------------------------------------------------------------------------
// PATCH /api/attendances/:id - Update Attendance (Check-out)
// -----------------------------------------------------------------------------

const updateSchema = z.object({
  check_out: z.string().optional(),
  work_hours: z.number().optional(),
  notes: z.string().optional(),
});

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(attendances)
    .where(eq(attendances.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到考勤記錄' }, 404);
  }

  const updates: Record<string, unknown> = {};

  if (data.check_out) {
    const checkOutTime = new Date(data.check_out);
    updates.checkOut = checkOutTime;

    // Calculate work hours if check_in exists
    if (existing.checkIn) {
      const checkInTime = new Date(existing.checkIn);
      const diffMs = checkOutTime.getTime() - checkInTime.getTime();
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

  return c.json({ success: true, message: '考勤記錄已更新' });
});

// -----------------------------------------------------------------------------
// DELETE /api/attendances/:id - Delete Attendance
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await db
    .select()
    .from(attendances)
    .where(eq(attendances.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '找不到考勤記錄' }, 404);
  }

  await db.delete(attendances).where(eq(attendances.id, id));

  return c.json({ success: true, message: '考勤記錄已刪除' });
});

export default app;
