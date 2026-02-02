import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { verify, hash } from '@node-rs/argon2';
import { db, employees, branches, users, jobTitles } from '../db/index.js';
import { eq, or } from 'drizzle-orm';
import { rateLimiter, coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';
import { coachJwtService } from '../services/coach-jwt.js';

// =============================================================================
// COACH AUTH ROUTES
// =============================================================================
// Authentication endpoints for coach-app
// Uses X-Coach-Token header for auth (separate from Admin auth)

const app = new Hono<{ Variables: CoachVariables }>();

// -----------------------------------------------------------------------------
// Password Hashing Config (Argon2id)
// -----------------------------------------------------------------------------

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,
  outputLen: 32,
};

// -----------------------------------------------------------------------------
// Rate Limiters
// -----------------------------------------------------------------------------

const loginRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 10,
  keyGenerator: (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
               c.req.header('x-real-ip') || 'unknown';
    return `coach:login:${ip}`;
  },
  message: '登入嘗試過多，請 15 分鐘後再試',
});

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email().optional(),
  employee_code: z.string().optional(),
  password: z.string().min(1, '請輸入密碼'),
}).refine(data => data.email || data.employee_code, {
  message: '請提供 Email 或員工編號',
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, '請提供 refresh token'),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, '請輸入目前密碼'),
  new_password: z.string()
    .min(8, '密碼至少 8 個字元')
    .max(72, '密碼最多 72 個字元'),
});

// -----------------------------------------------------------------------------
// POST /api/coach/auth/login - Coach Login
// -----------------------------------------------------------------------------

app.post(
  '/login',
  loginRateLimiter,
  zValidator('json', loginSchema),
  async (c) => {
    const { email, employee_code, password } = c.req.valid('json');

    // Find employee by email or employee_code
    const conditions = [];
    if (email) {
      conditions.push(eq(employees.email, email));
    }
    if (employee_code) {
      conditions.push(eq(employees.employeeCode, employee_code));
    }

    const [employee] = await db
      .select({
        id: employees.id,
        userId: employees.userId,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        email: employees.email,
        branchId: employees.branchId,
        jobTitleId: employees.jobTitleId,
        status: employees.status,
        tenantId: employees.tenantId,
      })
      .from(employees)
      .where(or(...conditions))
      .limit(1);

    if (!employee) {
      return c.json({
        success: false,
        message: '帳號或密碼錯誤',
        code: 'INVALID_CREDENTIALS',
      }, 401);
    }

    if (employee.status !== 'ACTIVE') {
      return c.json({
        success: false,
        message: '帳號已停用',
        code: 'ACCOUNT_INACTIVE',
      }, 403);
    }

    // Get user record for password verification
    if (!employee.userId) {
      return c.json({
        success: false,
        message: '帳號未設定，請聯繫管理員',
        code: 'NO_USER_ACCOUNT',
      }, 400);
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, employee.userId))
      .limit(1);

    if (!user || !user.passwordHash) {
      return c.json({
        success: false,
        message: '帳號未設定密碼，請聯繫管理員',
        code: 'NO_PASSWORD_SET',
      }, 400);
    }

    if (!user.isActive) {
      return c.json({
        success: false,
        message: '帳號已停用',
        code: 'ACCOUNT_INACTIVE',
      }, 403);
    }

    // Verify password
    const isValid = await verify(user.passwordHash, password, ARGON2_OPTIONS);

    if (!isValid) {
      return c.json({
        success: false,
        message: '帳號或密碼錯誤',
        code: 'INVALID_CREDENTIALS',
      }, 401);
    }

    // Get job title
    const [jobTitle] = await db
      .select({
        id: jobTitles.id,
        name: jobTitles.name,
        code: jobTitles.code,
      })
      .from(jobTitles)
      .where(eq(jobTitles.id, employee.jobTitleId))
      .limit(1);

    // Get branch info
    const [branch] = await db
      .select({
        id: branches.id,
        name: branches.name,
        tenantId: branches.tenantId,
      })
      .from(branches)
      .where(eq(branches.id, employee.branchId))
      .limit(1);

    // Generate tokens
    const tokens = coachJwtService.generateTokens({
      id: employee.id,
      employeeCode: employee.employeeCode,
      branchId: employee.branchId,
      tenantId: employee.tenantId || branch?.tenantId || '',
      jobTitle: jobTitle?.code || 'COACH',
    });

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    return c.json({
      success: true,
      message: '登入成功',
      coach: {
        id: employee.id,
        employee_code: employee.employeeCode,
        full_name: employee.fullName,
        email: employee.email,
        branch_id: employee.branchId,
        job_title: jobTitle?.name || 'Coach',
      },
      branch: branch ? {
        id: branch.id,
        name: branch.name,
      } : null,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/coach/auth/refresh - Refresh Access Token
// -----------------------------------------------------------------------------

app.post(
  '/refresh',
  zValidator('json', refreshSchema),
  async (c) => {
    const { refresh_token } = c.req.valid('json');

    // Verify refresh token
    const tokenData = coachJwtService.verifyRefreshToken(refresh_token);

    if (!tokenData) {
      return c.json({
        success: false,
        message: 'Token 已過期，請重新登入',
        code: 'INVALID_TOKEN',
      }, 401);
    }

    // Get employee info
    const [employee] = await db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        email: employees.email,
        branchId: employees.branchId,
        jobTitleId: employees.jobTitleId,
        status: employees.status,
        tenantId: employees.tenantId,
      })
      .from(employees)
      .where(eq(employees.id, tokenData.employeeId))
      .limit(1);

    if (!employee || employee.status !== 'ACTIVE') {
      return c.json({
        success: false,
        message: '帳號已停用',
        code: 'ACCOUNT_INACTIVE',
      }, 403);
    }

    // Get job title
    const [jobTitle] = await db
      .select({ code: jobTitles.code })
      .from(jobTitles)
      .where(eq(jobTitles.id, employee.jobTitleId))
      .limit(1);

    // Generate new tokens
    const tokens = coachJwtService.generateTokens({
      id: employee.id,
      employeeCode: employee.employeeCode,
      branchId: employee.branchId,
      tenantId: employee.tenantId || '',
      jobTitle: jobTitle?.code || 'COACH',
    });

    return c.json({
      success: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/coach/auth/change-password - Change Password
// -----------------------------------------------------------------------------

app.post(
  '/change-password',
  coachAuthMiddleware,
  requireCoach,
  zValidator('json', changePasswordSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { current_password, new_password } = c.req.valid('json');

    // Get employee and user
    const [employee] = await db
      .select({
        id: employees.id,
        userId: employees.userId,
      })
      .from(employees)
      .where(eq(employees.id, coach.id))
      .limit(1);

    if (!employee?.userId) {
      return c.json({
        success: false,
        message: '帳號設定錯誤',
        code: 'ACCOUNT_ERROR',
      }, 400);
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, employee.userId))
      .limit(1);

    if (!user?.passwordHash) {
      return c.json({
        success: false,
        message: '帳號未設定密碼',
        code: 'NO_PASSWORD_SET',
      }, 400);
    }

    // Verify current password
    const isValid = await verify(user.passwordHash, current_password, ARGON2_OPTIONS);

    if (!isValid) {
      return c.json({
        success: false,
        message: '目前密碼錯誤',
        code: 'WRONG_PASSWORD',
      }, 401);
    }

    // Hash and update new password
    const newPasswordHash = await hash(new_password, ARGON2_OPTIONS);

    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return c.json({
      success: true,
      message: '密碼變更成功',
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/coach/me - Get Current Coach Info
// -----------------------------------------------------------------------------

app.get(
  '/me',
  coachAuthMiddleware,
  requireCoach,
  async (c) => {
    const coach = c.get('coach')!;

    // Get full employee info
    const [employee] = await db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        email: employees.email,
        phone: employees.phone,
        branchId: employees.branchId,
        jobTitleId: employees.jobTitleId,
        status: employees.status,
        tenantId: employees.tenantId,
      })
      .from(employees)
      .where(eq(employees.id, coach.id))
      .limit(1);

    if (!employee) {
      return c.json({
        success: false,
        error: '找不到教練資料',
        code: 'NOT_FOUND',
      }, 404);
    }

    // Get job title
    const [jobTitle] = await db
      .select({
        id: jobTitles.id,
        name: jobTitles.name,
        code: jobTitles.code,
      })
      .from(jobTitles)
      .where(eq(jobTitles.id, employee.jobTitleId))
      .limit(1);

    // Get branch info
    const [branch] = await db
      .select({
        id: branches.id,
        name: branches.name,
      })
      .from(branches)
      .where(eq(branches.id, employee.branchId))
      .limit(1);

    return c.json({
      success: true,
      data: {
        id: employee.id,
        employee_code: employee.employeeCode,
        full_name: employee.fullName,
        email: employee.email,
        phone: employee.phone,
        branch_id: employee.branchId,
        branch_name: branch?.name,
        job_title: jobTitle?.name,
        job_title_code: jobTitle?.code,
        status: employee.status,
      },
    });
  }
);

export default app;
