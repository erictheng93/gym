import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { lucia } from '../auth/lucia.js';
import { db, users, employees, branches, jobTitles } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, authRateLimiter } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

// Helper to fetch employee with relations
async function getEmployeeWithRelations(employeeId: string) {
  const [result] = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      phone: employees.phone,
      branchId: employees.branchId,
      branchName: branches.name,
      jobTitleId: employees.jobTitleId,
      jobTitleName: jobTitles.name,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return result || null;
}

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(6, '密碼至少 6 個字元'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '請輸入目前密碼'),
  newPassword: z.string().min(8, '新密碼至少 8 個字元'),
});

app.post('/login', authRateLimiter, zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
    .limit(1);

  if (!user || !user.passwordHash) {
    return c.json({ success: false, error: '電子郵件或密碼錯誤' }, 401);
  }

  const validPassword = await verify(user.passwordHash, password);
  if (!validPassword) {
    return c.json({ success: false, error: '電子郵件或密碼錯誤' }, 401);
  }

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  c.header('Set-Cookie', sessionCookie.serialize());

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const employee = user.employeeId
    ? await getEmployeeWithRelations(user.employeeId)
    : null;

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        tenantId: user.tenantId,
      },
      employee: employee ? {
        id: employee.id,
        fullName: employee.fullName,
        employeeCode: employee.employeeCode,
        branchId: employee.branchId,
        branchName: employee.branchName,
        jobTitleId: employee.jobTitleId,
        jobTitleName: employee.jobTitleName,
      } : null,
    },
  });
});

app.post('/logout', async (c) => {
  const session = c.get('session');

  if (session) {
    await lucia.invalidateSession(session.id);
  }

  const blankSessionCookie = lucia.createBlankSessionCookie();
  c.header('Set-Cookie', blankSessionCookie.serialize());

  return c.json({ success: true, message: '已登出' });
});

app.get('/me', requireAuth, async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ success: false, error: '未授權' }, 401);
  }

  const employee = user.employeeId
    ? await getEmployeeWithRelations(user.employeeId)
    : null;

  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      tenantId: user.tenantId,
      isActive: user.isActive,
      employee: employee ? {
        id: employee.id,
        fullName: employee.fullName,
        employeeCode: employee.employeeCode,
        phone: employee.phone,
        branchId: employee.branchId,
        branchName: employee.branchName,
        jobTitleId: employee.jobTitleId,
        jobTitleName: employee.jobTitleName,
      } : null,
    },
  });
});

app.post('/change-password', requireAuth, zValidator('json', changePasswordSchema), async (c) => {
  const user = c.get('user');
  const { currentPassword, newPassword } = c.req.valid('json');

  if (!user) {
    return c.json({ success: false, error: '未授權' }, 401);
  }

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser?.passwordHash) {
    return c.json({ success: false, error: '無法變更密碼' }, 400);
  }

  const validPassword = await verify(dbUser.passwordHash, currentPassword);
  if (!validPassword) {
    return c.json({ success: false, error: '目前密碼錯誤' }, 401);
  }

  const newPasswordHash = await hash(newPassword, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  await db.update(users).set({
    passwordHash: newPasswordHash,
    dateUpdated: new Date(),
  }).where(eq(users.id, user.id));

  await lucia.invalidateUserSessions(user.id);

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  c.header('Set-Cookie', sessionCookie.serialize());

  return c.json({ success: true, message: '密碼已變更' });
});

app.post('/refresh', async (c) => {
  const session = c.get('session');
  const user = c.get('user');

  if (!session || !user) {
    return c.json({ success: false, error: '未授權' }, 401);
  }

  const newSession = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(newSession.id);
  c.header('Set-Cookie', sessionCookie.serialize());

  await lucia.invalidateSession(session.id);

  return c.json({
    success: true,
    data: {
      expiresAt: newSession.expiresAt,
    },
  });
});

export default app;
