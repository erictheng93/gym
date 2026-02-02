import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, employees, branches, jobTitles, users, attendances } from '../db/index.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createEmployeeSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元'),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  branchId: z.string().uuid(),
  jobTitleId: z.string().uuid().optional().nullable(),
  employmentStatus: z.enum(['ACTIVE', 'RESIGNED', 'SUSPENDED']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  basicSalary: z.coerce.number().optional().nullable(),
});

const updateEmployeeSchema = createEmployeeSchema.partial();

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const branchId = c.req.query('branchId');

  const tenantBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  let condition = inArray(employees.branchId, branchIds);

  if (branchId) {
    condition = and(condition, eq(employees.branchId, branchId))!;
  }

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

  const [employee] = await db
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
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, employee.employee.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限存取此員工' }, 403);
  }

  const recentAttendances = await db
    .select()
    .from(attendances)
    .where(eq(attendances.employeeId, id))
    .orderBy(desc(attendances.createdAt))
    .limit(30);

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

app.post('/', requireRole('super_admin', 'admin', 'manager'), zValidator('json', createEmployeeSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(branches.tenantId, tenantId));

  const employeeCount = Number(countResult?.count || 0);
  const employeeCode = `E${String(employeeCount + 1).padStart(5, '0')}`;

  const [newEmployee] = await db.insert(employees).values({
    ...data,
    employeeCode,
    hireDate: data.hireDate || new Date().toISOString().split('T')[0],
    basicSalary: data.basicSalary ? String(data.basicSalary) : null,
    tenantId,
  }).returning();

  return c.json({ success: true, data: newEmployee }, 201);
});

app.patch('/:id', requireRole('super_admin', 'admin', 'manager'), zValidator('json', updateEmployeeSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, employee.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限修改此員工' }, 403);
  }

  if (data.branchId) {
    const [newBranch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, data.branchId), eq(branches.tenantId, tenantId)))
      .limit(1);

    if (!newBranch) {
      return c.json({ success: false, error: '無效的分店' }, 400);
    }
  }

  const [updatedEmployee] = await db
    .update(employees)
    .set({
      ...data,
      basicSalary: data.basicSalary ? String(data.basicSalary) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id))
    .returning();

  return c.json({ success: true, data: updatedEmployee });
});

app.delete('/:id', requireRole('super_admin', 'admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  if (!employee) {
    return c.json({ success: false, error: '員工不存在' }, 404);
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, employee.branchId!), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '無權限刪除此員工' }, 403);
  }

  await db
    .update(employees)
    .set({
      status: 'archived',
      employmentStatus: 'RESIGNED',
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));

  if (employee.userId) {
    await db.update(users).set({
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(users.id, employee.userId));
  }

  return c.json({ success: true, message: '員工已封存' });
});

export default app;
