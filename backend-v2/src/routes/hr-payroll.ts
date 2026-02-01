import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, salaryRecords, promotionRecords, employees, jobTitles, branches } from '../db/index.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { authMiddleware, requireAuth } from '../middleware/index.js';
import type { AuthVariables } from '../middleware/index.js';

// =============================================================================
// HR PAYROLL ROUTES
// =============================================================================

const app = new Hono<{ Variables: AuthVariables }>();

app.use('*', authMiddleware, requireAuth);

// -----------------------------------------------------------------------------
// GET /api/payroll/salary-records - List Salary Records
// -----------------------------------------------------------------------------

app.get('/salary-records', async (c) => {
  const { employee_id, period, status, branch_id, limit = '20', offset = '0' } = c.req.query();

  const conditions = [];
  if (employee_id) conditions.push(eq(salaryRecords.employeeId, employee_id));
  if (period) conditions.push(eq(salaryRecords.period, period));
  if (status) conditions.push(eq(salaryRecords.status, status as 'PENDING' | 'APPROVED' | 'PAID'));
  if (branch_id) conditions.push(eq(salaryRecords.branchId, branch_id));

  const [records, countResult] = await Promise.all([
    db
      .select({
        id: salaryRecords.id,
        employeeId: salaryRecords.employeeId,
        period: salaryRecords.period,
        baseSalary: salaryRecords.baseSalary,
        overtimeHours: salaryRecords.overtimeHours,
        overtimePay: salaryRecords.overtimePay,
        commission: salaryRecords.commission,
        bonus: salaryRecords.bonus,
        deductions: salaryRecords.deductions,
        netSalary: salaryRecords.netSalary,
        hourlyRate: salaryRecords.hourlyRate,
        workDays: salaryRecords.workDays,
        leaveDays: salaryRecords.leaveDays,
        notes: salaryRecords.notes,
        status: salaryRecords.status,
        approvedBy: salaryRecords.approvedBy,
        approvedAt: salaryRecords.approvedAt,
        paidAt: salaryRecords.paidAt,
        createdAt: salaryRecords.createdAt,
        employeeName: employees.fullName,
        employeeCode: employees.employeeCode,
        branchName: branches.name,
        jobTitleName: jobTitles.name,
      })
      .from(salaryRecords)
      .innerJoin(employees, eq(salaryRecords.employeeId, employees.id))
      .innerJoin(branches, eq(salaryRecords.branchId, branches.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(salaryRecords.period), desc(salaryRecords.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(salaryRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const formattedRecords = records.map(r => ({
    id: r.id,
    employee_id: r.employeeId,
    employee: {
      id: r.employeeId,
      full_name: r.employeeName,
      employee_code: r.employeeCode,
      job_title: r.jobTitleName ? { name: r.jobTitleName } : null,
      branch: { name: r.branchName },
    },
    period: r.period,
    base_salary: parseFloat(r.baseSalary),
    overtime_hours: parseFloat(r.overtimeHours || '0'),
    overtime_pay: parseFloat(r.overtimePay || '0'),
    commission: parseFloat(r.commission || '0'),
    bonus: parseFloat(r.bonus || '0'),
    deductions: parseFloat(r.deductions || '0'),
    net_salary: parseFloat(r.netSalary),
    hourly_rate: r.hourlyRate ? parseFloat(r.hourlyRate) : null,
    work_days: r.workDays || 0,
    leave_days: r.leaveDays,
    notes: r.notes,
    status: r.status,
    approved_by: r.approvedBy,
    approved_at: r.approvedAt?.toISOString() || null,
    paid_at: r.paidAt?.toISOString() || null,
    date_created: r.createdAt?.toISOString() || null,
  }));

  return c.json({
    success: true,
    data: formattedRecords,
    meta: { total: Number(countResult[0]?.count || 0) },
  });
});

// -----------------------------------------------------------------------------
// GET /api/payroll/salary-records/:id - Get Single Salary Record
// -----------------------------------------------------------------------------

app.get('/salary-records/:id', async (c) => {
  const id = c.req.param('id');

  const [record] = await db
    .select({
      id: salaryRecords.id,
      employeeId: salaryRecords.employeeId,
      period: salaryRecords.period,
      baseSalary: salaryRecords.baseSalary,
      overtimeHours: salaryRecords.overtimeHours,
      overtimePay: salaryRecords.overtimePay,
      commission: salaryRecords.commission,
      bonus: salaryRecords.bonus,
      deductions: salaryRecords.deductions,
      netSalary: salaryRecords.netSalary,
      hourlyRate: salaryRecords.hourlyRate,
      workDays: salaryRecords.workDays,
      leaveDays: salaryRecords.leaveDays,
      notes: salaryRecords.notes,
      status: salaryRecords.status,
      approvedBy: salaryRecords.approvedBy,
      approvedAt: salaryRecords.approvedAt,
      paidAt: salaryRecords.paidAt,
      createdAt: salaryRecords.createdAt,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      branchName: branches.name,
    })
    .from(salaryRecords)
    .innerJoin(employees, eq(salaryRecords.employeeId, employees.id))
    .innerJoin(branches, eq(salaryRecords.branchId, branches.id))
    .where(eq(salaryRecords.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: record.id,
      employee_id: record.employeeId,
      employee: {
        id: record.employeeId,
        full_name: record.employeeName,
        employee_code: record.employeeCode,
      },
      period: record.period,
      base_salary: parseFloat(record.baseSalary),
      overtime_hours: parseFloat(record.overtimeHours || '0'),
      overtime_pay: parseFloat(record.overtimePay || '0'),
      commission: parseFloat(record.commission || '0'),
      bonus: parseFloat(record.bonus || '0'),
      deductions: parseFloat(record.deductions || '0'),
      net_salary: parseFloat(record.netSalary),
      hourly_rate: record.hourlyRate ? parseFloat(record.hourlyRate) : null,
      work_days: record.workDays || 0,
      leave_days: record.leaveDays,
      notes: record.notes,
      status: record.status,
      approved_by: record.approvedBy,
      approved_at: record.approvedAt?.toISOString() || null,
      paid_at: record.paidAt?.toISOString() || null,
      date_created: record.createdAt?.toISOString() || null,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/generate - Generate Salary Records for Period
// -----------------------------------------------------------------------------

const generateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
  branch_id: z.string().uuid().optional(),
  employee_ids: z.array(z.string().uuid()).optional(),
});

app.post('/generate', zValidator('json', generateSchema), async (c) => {
  const { period, branch_id, employee_ids } = c.req.valid('json');

  // Get employees to generate records for
  const conditions = [eq(employees.status, 'ACTIVE')];
  if (branch_id) conditions.push(eq(employees.branchId, branch_id));
  if (employee_ids && employee_ids.length > 0) {
    conditions.push(inArray(employees.id, employee_ids));
  }

  const employeeList = await db
    .select({
      id: employees.id,
      branchId: employees.branchId,
      basicSalary: employees.basicSalary,
    })
    .from(employees)
    .where(and(...conditions));

  // Check for existing records
  const existingRecords = await db
    .select({ employeeId: salaryRecords.employeeId })
    .from(salaryRecords)
    .where(
      and(
        eq(salaryRecords.period, period),
        inArray(salaryRecords.employeeId, employeeList.map(e => e.id))
      )
    );

  const existingEmployeeIds = new Set(existingRecords.map(r => r.employeeId));

  // Create records for employees without existing records
  const newRecords = employeeList
    .filter(emp => !existingEmployeeIds.has(emp.id))
    .map(emp => {
      const baseSalary = parseFloat(emp.basicSalary || '0');
      return {
        employeeId: emp.id,
        branchId: emp.branchId,
        period,
        baseSalary: baseSalary.toString(),
        netSalary: baseSalary.toString(), // Will be recalculated
        status: 'PENDING' as const,
      };
    });

  if (newRecords.length > 0) {
    await db.insert(salaryRecords).values(newRecords);
  }

  return c.json({
    success: true,
    data: {
      generated: newRecords.length,
      skipped: existingEmployeeIds.size,
    },
  });
});

// -----------------------------------------------------------------------------
// PATCH /api/payroll/salary-records/:id - Update Salary Record
// -----------------------------------------------------------------------------

const updateSchema = z.object({
  overtime_hours: z.number().optional(),
  commission: z.number().optional(),
  bonus: z.number().optional(),
  deductions: z.number().optional(),
  notes: z.string().optional(),
});

app.patch('/salary-records/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');

  // Get current record
  const [record] = await db
    .select()
    .from(salaryRecords)
    .where(eq(salaryRecords.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  if (record.status === 'PAID') {
    return c.json({ success: false, error: '已發放的薪資不能修改' }, 400);
  }

  // Calculate new net salary
  const baseSalary = parseFloat(record.baseSalary);
  const overtimePay = (updates.overtime_hours || parseFloat(record.overtimeHours || '0')) *
                      (parseFloat(record.hourlyRate || '0') * 1.33);
  const commission = updates.commission ?? parseFloat(record.commission || '0');
  const bonus = updates.bonus ?? parseFloat(record.bonus || '0');
  const deductions = updates.deductions ?? parseFloat(record.deductions || '0');
  const netSalary = baseSalary + overtimePay + commission + bonus - deductions;

  await db
    .update(salaryRecords)
    .set({
      overtimeHours: updates.overtime_hours?.toString(),
      overtimePay: overtimePay.toString(),
      commission: commission.toString(),
      bonus: bonus.toString(),
      deductions: deductions.toString(),
      netSalary: netSalary.toString(),
      notes: updates.notes,
      updatedAt: new Date(),
    })
    .where(eq(salaryRecords.id, id));

  return c.json({ success: true, message: '薪資記錄已更新' });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/salary-records/:id/approve - Approve Salary Record
// -----------------------------------------------------------------------------

app.post('/salary-records/:id/approve', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const [record] = await db
    .select()
    .from(salaryRecords)
    .where(eq(salaryRecords.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  if (record.status !== 'PENDING') {
    return c.json({ success: false, error: '此記錄無法核准' }, 400);
  }

  await db
    .update(salaryRecords)
    .set({
      status: 'APPROVED',
      approvedBy: user?.employeeId || null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(salaryRecords.id, id));

  return c.json({ success: true, message: '薪資已核准' });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/batch-approve - Batch Approve
// -----------------------------------------------------------------------------

const batchApproveSchema = z.object({
  ids: z.array(z.string().uuid()),
});

app.post('/batch-approve', zValidator('json', batchApproveSchema), async (c) => {
  const { ids } = c.req.valid('json');
  const user = c.get('user');

  await db
    .update(salaryRecords)
    .set({
      status: 'APPROVED',
      approvedBy: user?.employeeId || null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(salaryRecords.id, ids),
        eq(salaryRecords.status, 'PENDING')
      )
    );

  return c.json({
    success: true,
    data: { approved_count: ids.length },
  });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/salary-records/:id/pay - Mark as Paid
// -----------------------------------------------------------------------------

app.post('/salary-records/:id/pay', async (c) => {
  const id = c.req.param('id');

  const [record] = await db
    .select()
    .from(salaryRecords)
    .where(eq(salaryRecords.id, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  if (record.status !== 'APPROVED') {
    return c.json({ success: false, error: '只能標記已核准的記錄為已發放' }, 400);
  }

  await db
    .update(salaryRecords)
    .set({
      status: 'PAID',
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(salaryRecords.id, id));

  return c.json({ success: true, message: '已標記為已發放' });
});

// -----------------------------------------------------------------------------
// GET /api/payroll/promotions - List Promotion Records
// -----------------------------------------------------------------------------

app.get('/promotions', async (c) => {
  const { employee_id, type, limit = '20', offset = '0' } = c.req.query();

  const conditions = [];
  if (employee_id) conditions.push(eq(promotionRecords.employeeId, employee_id));
  if (type) conditions.push(eq(promotionRecords.type, type as 'PROMOTION' | 'TRANSFER' | 'DEMOTION'));

  const records = await db
    .select({
      id: promotionRecords.id,
      employeeId: promotionRecords.employeeId,
      type: promotionRecords.type,
      fromJobTitleId: promotionRecords.fromJobTitleId,
      toJobTitleId: promotionRecords.toJobTitleId,
      fromBranchId: promotionRecords.fromBranchId,
      toBranchId: promotionRecords.toBranchId,
      effectiveDate: promotionRecords.effectiveDate,
      newBaseSalary: promotionRecords.newBaseSalary,
      reason: promotionRecords.reason,
      createdAt: promotionRecords.createdAt,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(promotionRecords)
    .innerJoin(employees, eq(promotionRecords.employeeId, employees.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(promotionRecords.effectiveDate))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(promotionRecords)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({
    success: true,
    data: records.map(r => ({
      id: r.id,
      employee_id: r.employeeId,
      employee: {
        id: r.employeeId,
        full_name: r.employeeName,
        employee_code: r.employeeCode,
      },
      type: r.type,
      from_job_title_id: r.fromJobTitleId,
      to_job_title_id: r.toJobTitleId,
      from_branch_id: r.fromBranchId,
      to_branch_id: r.toBranchId,
      effective_date: r.effectiveDate,
      new_base_salary: r.newBaseSalary ? parseFloat(r.newBaseSalary) : null,
      reason: r.reason,
      date_created: r.createdAt?.toISOString() || null,
    })),
    meta: { total: Number(countResult[0]?.count || 0) },
  });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/promotions - Create Promotion Record
// -----------------------------------------------------------------------------

const promotionSchema = z.object({
  employee_id: z.string().uuid(),
  type: z.enum(['PROMOTION', 'TRANSFER', 'DEMOTION']),
  effective_date: z.string(),
  to_job_title_id: z.string().uuid().optional(),
  to_branch_id: z.string().uuid().optional(),
  new_base_salary: z.number().nullable().optional(),
  reason: z.string().optional(),
});

app.post('/promotions', zValidator('json', promotionSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');

  // Get current employee data
  const [employee] = await db
    .select({
      jobTitleId: employees.jobTitleId,
      branchId: employees.branchId,
    })
    .from(employees)
    .where(eq(employees.id, data.employee_id))
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '找不到員工' }, 404);
  }

  // Create promotion record
  const [record] = await db
    .insert(promotionRecords)
    .values({
      employeeId: data.employee_id,
      type: data.type,
      fromJobTitleId: employee.jobTitleId,
      toJobTitleId: data.to_job_title_id,
      fromBranchId: employee.branchId,
      toBranchId: data.to_branch_id,
      effectiveDate: data.effective_date,
      newBaseSalary: data.new_base_salary?.toString(),
      reason: data.reason,
      createdBy: user?.employeeId,
    })
    .returning();

  // Update employee if changes are effective today or earlier
  const today = new Date().toISOString().split('T')[0];
  if (data.effective_date <= today) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.to_job_title_id) updates.jobTitleId = data.to_job_title_id;
    if (data.to_branch_id) updates.branchId = data.to_branch_id;
    if (data.new_base_salary) updates.basicSalary = data.new_base_salary.toString();

    await db.update(employees).set(updates).where(eq(employees.id, data.employee_id));
  }

  return c.json({ success: true, data: record });
});

export default app;
