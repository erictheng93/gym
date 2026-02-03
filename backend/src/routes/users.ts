import { Hono, Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import { db, users, employees, branches, jobTitles, sessions } from '../db/index.js';
import { eq, and, desc, sql, like } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { lucia } from '../auth/lucia.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

// Require admin role for all user management operations
const requireAdmin = async (c: Context<{ Variables: AuthVariables & TenantVariables }>, next: Next) => {
  const user = c.get('user');
  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return c.json({ success: false, error: '需要管理員權限' }, 403);
  }
  return next();
};

app.use('*', requireAdmin);

const createUserSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(8, '密碼至少 8 個字元'),
  role: z.enum(['admin', 'manager', 'coach', 'staff']),
  employeeId: z.string().uuid().optional().nullable(),
});

const updateUserSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件').optional(),
  role: z.enum(['admin', 'manager', 'coach', 'staff']).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.string().uuid().optional().nullable(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, '密碼至少 8 個字元'),
});

// Get available employees (not linked to any user) - MUST be before /:id route
app.get('/available-employees', async (c) => {
  const tenantId = c.get('tenantId')!;

  const result = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      email: employees.email,
    })
    .from(employees)
    .where(and(
      eq(employees.tenantId, tenantId),
      eq(employees.status, 'ACTIVE'),
      sql`${employees.userId} IS NULL`
    ))
    .orderBy(employees.fullName);

  return c.json({ success: true, data: result });
});

// List users
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;
  const search = c.req.query('search');
  const roleFilter = c.req.query('role');
  const activeFilter = c.req.query('isActive');

  const conditions = [eq(users.tenantId, tenantId)];

  if (search) {
    conditions.push(like(users.email, `%${search}%`));
  }

  if (roleFilter && ['super_admin', 'admin', 'manager', 'coach', 'staff'].includes(roleFilter)) {
    conditions.push(eq(users.role, roleFilter as 'super_admin' | 'admin' | 'manager' | 'coach' | 'staff'));
  }

  if (activeFilter !== undefined) {
    conditions.push(eq(users.isActive, activeFilter === 'true'));
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(...conditions));

  const total = Number(countResult?.count || 0);

  const result = await db
    .select({
      user: {
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        employeeId: users.employeeId,
      },
      employee: {
        id: employees.id,
        fullName: employees.fullName,
        employeeCode: employees.employeeCode,
      },
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.user,
      employee: r.employee,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get user by ID
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      user: users,
      employee: {
        id: employees.id,
        fullName: employees.fullName,
        employeeCode: employees.employeeCode,
        phone: employees.phone,
        branchId: employees.branchId,
        jobTitleId: employees.jobTitleId,
      },
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '使用者不存在' }, 404);
  }

  // Get employee's branch and job title info if linked
  let branch = null;
  let jobTitle = null;
  if (result.employee?.branchId) {
    [branch] = await db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.id, result.employee.branchId))
      .limit(1);
  }
  if (result.employee?.jobTitleId) {
    [jobTitle] = await db
      .select({ id: jobTitles.id, name: jobTitles.name })
      .from(jobTitles)
      .where(eq(jobTitles.id, result.employee.jobTitleId))
      .limit(1);
  }

  // Exclude password hash
  const { passwordHash: _passwordHash, ...userWithoutPassword } = result.user;

  return c.json({
    success: true,
    data: {
      ...userWithoutPassword,
      employee: result.employee ? {
        ...result.employee,
        branch,
        jobTitle,
      } : null,
    },
  });
});

// Create user
app.post('/', zValidator('json', createUserSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Check if email already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    return c.json({ success: false, error: '此電子郵件已被使用' }, 400);
  }

  // Verify employee belongs to tenant if provided
  if (data.employeeId) {
    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
      .limit(1);

    if (!employee) {
      return c.json({ success: false, error: '員工不存在' }, 400);
    }

    // Check if employee already has a user account
    const [existingEmployeeUser] = await db
      .select()
      .from(users)
      .where(eq(users.employeeId, data.employeeId))
      .limit(1);

    if (existingEmployeeUser) {
      return c.json({ success: false, error: '此員工已有帳號' }, 400);
    }
  }

  const passwordHash = await hash(data.password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  const [newUser] = await db.insert(users).values({
    email: data.email.toLowerCase(),
    passwordHash,
    role: data.role,
    employeeId: data.employeeId,
    tenantId,
    isActive: true,
    emailVerified: false,
  }).returning();

  // Update employee with userId if linked
  if (data.employeeId) {
    await db.update(employees).set({
      userId: newUser.id,
      updatedAt: new Date(),
    }).where(eq(employees.id, data.employeeId));
  }

  const { passwordHash: _passwordHash, ...userWithoutPassword } = newUser;

  return c.json({ success: true, data: userWithoutPassword }, 201);
});

// Update user
app.patch('/:id', zValidator('json', updateUserSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const currentUser = c.get('user')!;
  const data = c.req.valid('json');

  // Prevent self-deactivation
  if (id === currentUser.id && data.isActive === false) {
    return c.json({ success: false, error: '無法停用自己的帳號' }, 400);
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!existingUser) {
    return c.json({ success: false, error: '使用者不存在' }, 404);
  }

  // Check email uniqueness if changing
  if (data.email && data.email.toLowerCase() !== existingUser.email) {
    const [emailExists] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (emailExists) {
      return c.json({ success: false, error: '此電子郵件已被使用' }, 400);
    }
  }

  // Handle employee linking/unlinking
  if (data.employeeId !== undefined) {
    // Unlink old employee if any
    if (existingUser.employeeId && existingUser.employeeId !== data.employeeId) {
      await db.update(employees).set({
        userId: null,
        updatedAt: new Date(),
      }).where(eq(employees.id, existingUser.employeeId));
    }

    // Link new employee if provided
    if (data.employeeId) {
      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
        .limit(1);

      if (!employee) {
        return c.json({ success: false, error: '員工不存在' }, 400);
      }

      // Check if employee already has another user
      if (employee.userId && employee.userId !== id) {
        return c.json({ success: false, error: '此員工已有其他帳號' }, 400);
      }

      await db.update(employees).set({
        userId: id,
        updatedAt: new Date(),
      }).where(eq(employees.id, data.employeeId));
    }
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      ...(data.email && { email: data.email.toLowerCase() }),
      ...(data.role && { role: data.role }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.employeeId !== undefined && { employeeId: data.employeeId }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  // Invalidate sessions if user is deactivated
  if (data.isActive === false) {
    await lucia.invalidateUserSessions(id);
  }

  const { passwordHash: _passwordHash, ...userWithoutPassword } = updatedUser;

  return c.json({ success: true, data: userWithoutPassword });
});

// Reset user password (admin action)
app.post('/:id/reset-password', zValidator('json', changePasswordSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const { newPassword } = c.req.valid('json');

  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!existingUser) {
    return c.json({ success: false, error: '使用者不存在' }, 404);
  }

  const passwordHash = await hash(newPassword, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  await db.update(users).set({
    passwordHash,
    updatedAt: new Date(),
  }).where(eq(users.id, id));

  // Invalidate all sessions for security
  await lucia.invalidateUserSessions(id);

  return c.json({ success: true, message: '密碼已重設' });
});

// Delete user
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const currentUser = c.get('user')!;

  // Prevent self-deletion
  if (id === currentUser.id) {
    return c.json({ success: false, error: '無法刪除自己的帳號' }, 400);
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!existingUser) {
    return c.json({ success: false, error: '使用者不存在' }, 404);
  }

  // Unlink employee if any
  if (existingUser.employeeId) {
    await db.update(employees).set({
      userId: null,
      updatedAt: new Date(),
    }).where(eq(employees.id, existingUser.employeeId));
  }

  // Delete sessions first
  await db.delete(sessions).where(eq(sessions.userId, id));

  // Delete user
  await db.delete(users).where(eq(users.id, id));

  return c.json({ success: true, message: '使用者已刪除' });
});

export default app;
