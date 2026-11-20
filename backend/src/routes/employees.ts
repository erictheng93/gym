import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, employees, branches, jobTitles, users, attendances } from '../db/index.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createEmployeeSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元'),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  branchId: z.string().uuid(),
  jobTitleId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'RESIGNED', 'LEAVE']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'FREELANCE']),
  hireDate: z.string().optional().nullable(),
  basicSalary: z.coerce.number().optional().nullable(),
});

const updateEmployeeSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元').optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  branchId: z.string().uuid().optional(),
  jobTitleId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'RESIGNED', 'LEAVE']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'FREELANCE']).optional(),
  hireDate: z.string().optional().nullable(),
  basicSalary: z.coerce.number().optional().nullable(),
});

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  if (branchId && !branchIds.includes(branchId)) {
    return c.json({ success: true, data: [] });
  }

  const condition = branchId
    ? eq(employees.branchId, branchId)
    : inArray(employees.branchId, branchIds);

  const result = await db
    .select({
      employee: employees,
      jobTitle: {
        id: jobTitles.id,
        name: jobTitles.name,
      },
      branch: {
        id: branches.id,
        name: branches.name,
      },
    })
    .from(employees)
    .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(condition)
    .orderBy(employees.fullName);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.employee,
      jobTitle: r.jobTitle,
      branch: r.branch,
    })),
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[employee], branchIds, recentAttendances] = await Promise.all([
    db
      .select({
        employee: employees,
        jobTitle: {
          id: jobTitles.id,
          name: jobTitles.name,
          permissionsConfig: jobTitles.permissionsConfig,
        },
        branch: {
          id: branches.id,
          name: branches.name,
        },
      })
      .from(employees)
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(employees.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select({
        id: attendances.id,
        createdAt: attendances.createdAt,
        employeeId: attendances.employeeId,
        checkIn: attendances.checkIn,
        checkOut: attendances.checkOut,
        workHours: attendances.workHours,
        branchId: attendances.branchId,
      })
      .from(attendances)
      .where(eq(attendances.employeeId, id))
      .orderBy(desc(attendances.createdAt))
      .limit(30)
      .catch(() => []),
  ]);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }

  if (!employee.employee.branchId || !branchIds.includes(employee.employee.branchId)) {
    return c.json({ success: false, error: '無權限存取此員工' }, 403);
  }

  return c.json({
    success: true,
    data: {
      ...employee.employee,
      jobTitle: employee.jobTitle,
      branch: employee.branch,
      recentAttendances,
    },
  });
});

const EMPLOYEE_RETURNING = {
  id: employees.id,
  userId: employees.userId,
  branchId: employees.branchId,
  jobTitleId: employees.jobTitleId,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  phone: employees.phone,
  email: employees.email,
  status: employees.status,
  employmentType: employees.employmentType,
  hireDate: employees.hireDate,
  resignDate: employees.resignDate,
  basicSalary: employees.basicSalary,
  customPermissions: employees.customPermissions,
  createdAt: employees.createdAt,
  updatedAt: employees.updatedAt,
  tenantId: employees.tenantId,
};

app.post('/', requireRole('super_admin', 'admin', 'manager'), zValidator('json', createEmployeeSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);

  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(inArray(employees.branchId, branchIds));

  const employeeCount = Number(countResult?.count || 0);
  const employeeCode = `E${String(employeeCount + 1).padStart(5, '0')}`;

  const [newEmployee] = await db.insert(employees).values({
    ...data,
    employeeCode,
    hireDate: data.hireDate || new Date().toISOString().split('T')[0],
    basicSalary: data.basicSalary ? String(data.basicSalary) : null,
    tenantId,
  }).returning(EMPLOYEE_RETURNING);

  return c.json({ success: true, data: newEmployee }, 201);
});

app.patch('/:id', requireRole('super_admin', 'admin', 'manager'), zValidator('json', updateEmployeeSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '無權限修改此員工' }, 403);
  }

  if (data.branchId && !branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  // Build update data, excluding null values for non-nullable fields
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.branchId !== undefined) updateData.branchId = data.branchId;
  if (data.jobTitleId !== undefined) updateData.jobTitleId = data.jobTitleId;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.employmentType !== undefined) updateData.employmentType = data.employmentType;
  if (data.hireDate !== undefined && data.hireDate !== null) updateData.hireDate = data.hireDate;
  if (data.basicSalary !== undefined) updateData.basicSalary = data.basicSalary ? String(data.basicSalary) : null;

  const [updatedEmployee] = await db
    .update(employees)
    .set(updateData)
    .where(and(eq(employees.id, id), inArray(employees.branchId, branchIds)))
    .returning(EMPLOYEE_RETURNING);

  if (!updatedEmployee) {
    const [existingEmployee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);

    if (!existingEmployee) {
      return c.json({ success: false, error: '員工不存在' }, 404);
    }
    return c.json({ success: false, error: '無權限修改此員工' }, 403);
  }

  return c.json({ success: true, data: updatedEmployee });
});

app.delete('/:id', requireRole('super_admin', 'admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '無權限刪除此員工' }, 403);
  }

  const [resignedEmployee] = await db
    .update(employees)
    .set({
      status: 'RESIGNED',
      updatedAt: new Date(),
    })
    .where(and(eq(employees.id, id), inArray(employees.branchId, branchIds)))
    .returning({ id: employees.id, userId: employees.userId });

  if (!resignedEmployee) {
    const [existingEmployee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);

    if (!existingEmployee) {
      return c.json({ success: false, error: '員工不存在' }, 404);
    }
    return c.json({ success: false, error: '無權限刪除此員工' }, 403);
  }

  if (resignedEmployee.userId) {
    await db.update(users).set({
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(users.id, resignedEmployee.userId));
  }

  return c.json({ success: true, message: '員工已封存' });
});

export default app;
