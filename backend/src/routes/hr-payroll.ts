import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, salaryRecords, promotionRecords, employees, jobTitles, branches } from '../db/index.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { authMiddleware, requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { generateExcel, generateCsv, payrollColumns, translateStatus } from '../services/export.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

// =============================================================================
// HR PAYROLL ROUTES
// =============================================================================
// Every payroll row is scoped to the caller's tenant through its branch
// (getTenantBranchIds). inArray(col, []) renders as false, so a tenant without
// branches matches nothing.

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

// Monthly salary -> hourly rate (Taiwan Labor Standards Act: 30 days x 8 hours)
const MONTHLY_WORK_HOURS = 240;
const OVERTIME_MULTIPLIER = 1.33;

function hourlyRateFor(baseSalary: number): number {
  return Math.round((baseSalary / MONTHLY_WORK_HOURS) * 100) / 100;
}

const EMPLOYEE_ID_SELECT = { id: employees.id };
const JOB_TITLE_ID_SELECT = { id: jobTitles.id };

function tenantEmployeeIds(branchIds: string[]) {
  return db.select(EMPLOYEE_ID_SELECT).from(employees).where(inArray(employees.branchId, branchIds));
}

const COUNT_SELECT = { count: sql<number>`count(*)` };

const PROMOTION_RECORD_RETURNING = {
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
  createdBy: promotionRecords.createdBy,
  createdAt: promotionRecords.createdAt,
  tenantId: promotionRecords.tenantId,
};

const SALARY_RECORD_LIST_SELECT = {
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
};

const SALARY_RECORD_BY_ID_SELECT = {
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
};

const EMPLOYEE_GENERATE_SELECT = {
  id: employees.id,
  branchId: employees.branchId,
  basicSalary: employees.basicSalary,
};

const SALARY_RECORD_EXISTING_SELECT = {
  employeeId: salaryRecords.employeeId,
};

const SALARY_RECORD_ID_SELECT = {
  id: salaryRecords.id,
};

const SALARY_RECORD_UPDATE_SELECT = {
  id: salaryRecords.id,
  status: salaryRecords.status,
  baseSalary: salaryRecords.baseSalary,
  overtimeHours: salaryRecords.overtimeHours,
  hourlyRate: salaryRecords.hourlyRate,
  commission: salaryRecords.commission,
  bonus: salaryRecords.bonus,
  deductions: salaryRecords.deductions,
};

const SALARY_RECORD_EXPORT_SELECT = {
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
  status: salaryRecords.status,
  employeeName: employees.fullName,
  employeeCode: employees.employeeCode,
  branchName: branches.name,
  jobTitleName: jobTitles.name,
};

const PROMOTION_RECORD_LIST_SELECT = {
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
};

const EMPLOYEE_PROMOTION_SELECT = {
  jobTitleId: employees.jobTitleId,
  branchId: employees.branchId,
};

// Salary data is not for every staff member: reading needs a manager, and
// anything that creates, changes, approves or pays a salary (or a promotion,
// which changes salary) needs an admin - the same split as branches/employees
// (writes: super_admin/admin/manager, deletes and money: super_admin/admin).
const HR_READ_ROLES = ['super_admin', 'admin', 'manager'];
const HR_ADMIN_ROLES = ['super_admin', 'admin'];

app.use('*', authMiddleware, requireAuth, requireTenant, requireRole(...HR_READ_ROLES));

// -----------------------------------------------------------------------------
// GET /api/payroll/salary-records - List Salary Records
// -----------------------------------------------------------------------------

app.get('/salary-records', async (c) => {
  const { employee_id, period, status, branch_id, limit = '20', offset = '0' } = c.req.query();
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const conditions = [inArray(salaryRecords.branchId, branchIds)];
  if (employee_id) conditions.push(eq(salaryRecords.employeeId, employee_id));
  if (period) conditions.push(eq(salaryRecords.period, period));
  if (status) conditions.push(eq(salaryRecords.status, status as 'PENDING' | 'APPROVED' | 'PAID'));
  if (branch_id) conditions.push(eq(salaryRecords.branchId, branch_id));

  const [records, countResult] = await Promise.all([
    db
      .select(SALARY_RECORD_LIST_SELECT)
      .from(salaryRecords)
      .innerJoin(employees, eq(salaryRecords.employeeId, employees.id))
      .innerJoin(branches, eq(salaryRecords.branchId, branches.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(and(...conditions))
      .orderBy(desc(salaryRecords.period), desc(salaryRecords.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select(COUNT_SELECT)
      .from(salaryRecords)
      .where(and(...conditions)),
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
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const [record] = await db
    .select(SALARY_RECORD_BY_ID_SELECT)
    .from(salaryRecords)
    .innerJoin(employees, eq(salaryRecords.employeeId, employees.id))
    .innerJoin(branches, eq(salaryRecords.branchId, branches.id))
    .where(and(eq(salaryRecords.id, id), inArray(salaryRecords.branchId, branchIds)))
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

app.post('/generate', requireRole(...HR_ADMIN_ROLES), zValidator('json', generateSchema), async (c) => {
  const { period, branch_id, employee_ids } = c.req.valid('json');
  const tenantId = c.get('tenantId')!;
  const branchIds = await getTenantBranchIds(tenantId);

  if (branch_id && !branchIds.includes(branch_id)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  // Get employees to generate records for: never outside the caller's tenant
  const conditions = [eq(employees.status, 'ACTIVE'), inArray(employees.branchId, branchIds)];
  if (branch_id) conditions.push(eq(employees.branchId, branch_id));
  if (employee_ids && employee_ids.length > 0) {
    const requestedIds = [...new Set(employee_ids)];
    const owned = await db
      .select(EMPLOYEE_ID_SELECT)
      .from(employees)
      .where(and(inArray(employees.id, requestedIds), inArray(employees.branchId, branchIds)));
    if (owned.length !== requestedIds.length) {
      return c.json({ success: false, error: '無效的員工' }, 400);
    }
    conditions.push(inArray(employees.id, requestedIds));
  }

  const employeeList = await db
    .select(EMPLOYEE_GENERATE_SELECT)
    .from(employees)
    .where(and(...conditions));

  if (employeeList.length === 0) {
    return c.json({ success: true, data: { generated: 0, skipped: 0 } });
  }

  // Check for existing records
  const existingRecords = await db
    .select(SALARY_RECORD_EXISTING_SELECT)
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
        hourlyRate: hourlyRateFor(baseSalary).toString(),
        netSalary: baseSalary.toString(), // Will be recalculated
        status: 'PENDING' as const,
        tenantId,
      };
    });

  if (newRecords.length > 0) {
    // A concurrent generate for the same period must not fail on the (employee, period) unique index
    await db.insert(salaryRecords).values(newRecords).onConflictDoNothing();
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

app.patch('/salary-records/:id', requireRole(...HR_ADMIN_ROLES), zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);
  const scoped = and(eq(salaryRecords.id, id), inArray(salaryRecords.branchId, branchIds));

  // Get current record
  const [record] = await db
    .select(SALARY_RECORD_UPDATE_SELECT)
    .from(salaryRecords)
    .where(scoped)
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  if (record.status === 'PAID') {
    return c.json({ success: false, error: '已發放的薪資不能修改' }, 400);
  }

  // Calculate new net salary
  const baseSalary = parseFloat(record.baseSalary);
  const overtimeHours = updates.overtime_hours ?? parseFloat(record.overtimeHours || '0');
  // Records generated before hourlyRate was stored fall back to the derived rate
  const hourlyRate = record.hourlyRate !== null ? parseFloat(record.hourlyRate) : hourlyRateFor(baseSalary);
  const overtimePay = Math.round(overtimeHours * hourlyRate * OVERTIME_MULTIPLIER * 100) / 100;
  const commission = updates.commission ?? parseFloat(record.commission || '0');
  const bonus = updates.bonus ?? parseFloat(record.bonus || '0');
  const deductions = updates.deductions ?? parseFloat(record.deductions || '0');
  const netSalary = baseSalary + overtimePay + commission + bonus - deductions;

  await db
    .update(salaryRecords)
    .set({
      overtimeHours: overtimeHours.toString(),
      hourlyRate: hourlyRate.toString(),
      overtimePay: overtimePay.toString(),
      commission: commission.toString(),
      bonus: bonus.toString(),
      deductions: deductions.toString(),
      netSalary: netSalary.toString(),
      notes: updates.notes,
      updatedAt: new Date(),
    })
    .where(scoped);

  return c.json({ success: true, message: '薪資記錄已更新' });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/salary-records/:id/approve - Approve Salary Record
// -----------------------------------------------------------------------------

app.post('/salary-records/:id/approve', requireRole(...HR_ADMIN_ROLES), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  // Fast-path atomic update if in PENDING status
  const [approved] = await db
    .update(salaryRecords)
    .set({
      status: 'APPROVED',
      approvedBy: user?.employeeId || null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salaryRecords.id, id),
        eq(salaryRecords.status, 'PENDING'),
        inArray(salaryRecords.branchId, branchIds)
      )
    )
    .returning(SALARY_RECORD_ID_SELECT);

  if (approved) {
    return c.json({ success: true, message: '薪資已核准' });
  }

  // Fallback to distinguish between 404 and 400
  const [record] = await db
    .select(SALARY_RECORD_ID_SELECT)
    .from(salaryRecords)
    .where(and(eq(salaryRecords.id, id), inArray(salaryRecords.branchId, branchIds)))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  return c.json({ success: false, error: '此記錄無法核准' }, 400);
});

// -----------------------------------------------------------------------------
// POST /api/payroll/batch-approve - Batch Approve
// -----------------------------------------------------------------------------

const batchApproveSchema = z.object({
  ids: z.array(z.string().uuid()),
});

app.post('/batch-approve', requireRole(...HR_ADMIN_ROLES), zValidator('json', batchApproveSchema), async (c) => {
  const { ids } = c.req.valid('json');
  const user = c.get('user');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const approved = await db
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
        eq(salaryRecords.status, 'PENDING'),
        inArray(salaryRecords.branchId, branchIds)
      )
    )
    .returning(SALARY_RECORD_ID_SELECT);

  return c.json({
    success: true,
    data: { approved_count: approved.length },
  });
});

// -----------------------------------------------------------------------------
// POST /api/payroll/salary-records/:id/pay - Mark as Paid
// -----------------------------------------------------------------------------

app.post('/salary-records/:id/pay', requireRole(...HR_ADMIN_ROLES), async (c) => {
  const id = c.req.param('id');
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  // Fast-path atomic update if in APPROVED status
  const [paid] = await db
    .update(salaryRecords)
    .set({
      status: 'PAID',
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salaryRecords.id, id),
        eq(salaryRecords.status, 'APPROVED'),
        inArray(salaryRecords.branchId, branchIds)
      )
    )
    .returning(SALARY_RECORD_ID_SELECT);

  if (paid) {
    return c.json({ success: true, message: '已標記為已發放' });
  }

  // Fallback to distinguish between 404 and 400
  const [record] = await db
    .select(SALARY_RECORD_ID_SELECT)
    .from(salaryRecords)
    .where(and(eq(salaryRecords.id, id), inArray(salaryRecords.branchId, branchIds)))
    .limit(1);

  if (!record) {
    return c.json({ success: false, error: '找不到薪資記錄' }, 404);
  }

  return c.json({ success: false, error: '只能標記已核准的記錄為已發放' }, 400);
});

// -----------------------------------------------------------------------------
// GET /api/payroll/export - Export Salary Records
// -----------------------------------------------------------------------------

app.get('/export', async (c) => {
  const { period, branch_id, status, format = 'csv' } = c.req.query();
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const conditions = [inArray(salaryRecords.branchId, branchIds)];
  if (period) conditions.push(eq(salaryRecords.period, period));
  if (status) conditions.push(eq(salaryRecords.status, status as 'PENDING' | 'APPROVED' | 'PAID'));
  if (branch_id) conditions.push(eq(salaryRecords.branchId, branch_id));

  const records = await db
    .select(SALARY_RECORD_EXPORT_SELECT)
    .from(salaryRecords)
    .innerJoin(employees, eq(salaryRecords.employeeId, employees.id))
    .innerJoin(branches, eq(salaryRecords.branchId, branches.id))
    .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .where(and(...conditions))
    .orderBy(desc(salaryRecords.period), desc(salaryRecords.createdAt));

  // Transform data for export
  const exportData = records.map(r => ({
    employeeCode: r.employeeCode || '',
    employeeName: r.employeeName || '',
    jobTitle: r.jobTitleName || '',
    branchName: r.branchName || '',
    period: r.period,
    baseSalary: parseFloat(r.baseSalary),
    overtimeHours: parseFloat(r.overtimeHours || '0'),
    overtimePay: parseFloat(r.overtimePay || '0'),
    commission: parseFloat(r.commission || '0'),
    bonus: parseFloat(r.bonus || '0'),
    deductions: parseFloat(r.deductions || '0'),
    netSalary: parseFloat(r.netSalary),
    status: translateStatus(r.status),
  }));

  const filename = `薪資記錄_${period || new Date().toISOString().slice(0, 10)}`;

  if (format === 'xlsx' || format === 'excel') {
    const result = await generateExcel(payrollColumns, exportData, '薪資記錄');
    if (!result.success || !result.buffer) {
      return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
    }
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const result = generateCsv(payrollColumns, exportData);
  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || '匯出失敗' }, 500);
  }
  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/payroll/promotions - List Promotion Records
// -----------------------------------------------------------------------------

app.get('/promotions', async (c) => {
  const { employee_id, type, limit = '20', offset = '0' } = c.req.query();
  const branchIds = await getTenantBranchIds(c.get('tenantId')!);

  const conditions = [inArray(promotionRecords.employeeId, tenantEmployeeIds(branchIds))];
  if (employee_id) conditions.push(eq(promotionRecords.employeeId, employee_id));
  if (type) conditions.push(eq(promotionRecords.type, type as 'PROMOTION' | 'TRANSFER' | 'DEMOTION'));

  const [records, countResult] = await Promise.all([
    db
      .select(PROMOTION_RECORD_LIST_SELECT)
      .from(promotionRecords)
      .innerJoin(employees, eq(promotionRecords.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(promotionRecords.effectiveDate))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select(COUNT_SELECT)
      .from(promotionRecords)
      .where(and(...conditions)),
  ]);

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

app.post('/promotions', requireRole(...HR_ADMIN_ROLES), zValidator('json', promotionSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const tenantId = c.get('tenantId')!;
  const branchIds = await getTenantBranchIds(tenantId);

  // Get current employee data
  const [employee] = await db
    .select(EMPLOYEE_PROMOTION_SELECT)
    .from(employees)
    .where(and(eq(employees.id, data.employee_id), inArray(employees.branchId, branchIds)))
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '找不到員工' }, 404);
  }

  if (data.to_branch_id && !branchIds.includes(data.to_branch_id)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  if (data.to_job_title_id) {
    const [jobTitle] = await db
      .select(JOB_TITLE_ID_SELECT)
      .from(jobTitles)
      .where(and(eq(jobTitles.id, data.to_job_title_id), eq(jobTitles.tenantId, tenantId)))
      .limit(1);
    if (!jobTitle) {
      return c.json({ success: false, error: '無效的職稱' }, 400);
    }
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
      tenantId,
    })
    .returning(PROMOTION_RECORD_RETURNING);

  // Update employee if changes are effective today or earlier
  const today = new Date().toISOString().slice(0, 10);
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
