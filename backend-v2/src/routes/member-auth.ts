import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { db, members, branches, memberCredentials } from '../db/index.js';
import { eq, and, gt } from 'drizzle-orm';
import { rateLimiter, memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import { memberJwtService, getTokenHash } from '../services/member-jwt.js';
import { emailService } from '../services/email.js';

// =============================================================================
// MEMBER PASSWORD AUTH ROUTES
// =============================================================================
// Password-based authentication for member-app
// Endpoints: /login, /set-password, /change-password, /has-password,
//            /forgot-password, /reset-password

const app = new Hono<{ Variables: MemberVariables }>();

// -----------------------------------------------------------------------------
// Password Hashing Config (Argon2id)
// -----------------------------------------------------------------------------

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,
  outputLen: 32,
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// -----------------------------------------------------------------------------
// Rate Limiters
// -----------------------------------------------------------------------------

const loginRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 10,
  keyGenerator: (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
               c.req.header('x-real-ip') || 'unknown';
    return `member:login:${ip}`;
  },
  message: '登入嘗試過多，請 15 分鐘後再試',
});

const passwordResetRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 100 : 3,
  keyGenerator: (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
               c.req.header('x-real-ip') || 'unknown';
    return `member:reset:${ip}`;
  },
  message: '密碼重設請求過多，請稍後再試',
});

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('請輸入有效的 Email'),
  password: z.string().min(8, '密碼至少 8 個字元'),
});

const setPasswordSchema = z.object({
  password: z.string()
    .min(8, '密碼至少 8 個字元')
    .max(72, '密碼最多 72 個字元')
    .regex(/[A-Z]/, '密碼需包含大寫字母')
    .regex(/[a-z]/, '密碼需包含小寫字母')
    .regex(/[0-9]/, '密碼需包含數字'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: '密碼確認不一致',
  path: ['confirmPassword'],
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '請輸入目前密碼'),
  newPassword: z.string()
    .min(8, '密碼至少 8 個字元')
    .max(72, '密碼最多 72 個字元')
    .regex(/[A-Z]/, '密碼需包含大寫字母')
    .regex(/[a-z]/, '密碼需包含小寫字母')
    .regex(/[0-9]/, '密碼需包含數字'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: '密碼確認不一致',
  path: ['confirmPassword'],
});

const forgotPasswordSchema = z.object({
  email: z.string().email('請輸入有效的 Email'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, '請提供重設 token'),
  password: z.string()
    .min(8, '密碼至少 8 個字元')
    .max(72, '密碼最多 72 個字元')
    .regex(/[A-Z]/, '密碼需包含大寫字母')
    .regex(/[a-z]/, '密碼需包含小寫字母')
    .regex(/[0-9]/, '密碼需包含數字'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: '密碼確認不一致',
  path: ['confirmPassword'],
});

// -----------------------------------------------------------------------------
// POST /api/member/auth/login - Email/Password Login
// -----------------------------------------------------------------------------

app.post(
  '/login',
  loginRateLimiter,
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password } = c.req.valid('json');

    // Find member by email
    const [member] = await db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        email: members.email,
        fullName: members.fullName,
        branchId: members.branchId,
        tenantId: members.tenantId,
        status: members.status,
      })
      .from(members)
      .where(eq(members.email, email))
      .limit(1);

    if (!member) {
      return c.json({
        success: false,
        error: 'Email 或密碼錯誤',
        code: 'INVALID_CREDENTIALS',
      }, 401);
    }

    if (member.status === 'BANNED') {
      return c.json({
        success: false,
        error: '帳號已停權',
        code: 'MEMBER_BANNED',
      }, 403);
    }

    // Get credentials
    const [credentials] = await db
      .select()
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, member.id))
      .limit(1);

    if (!credentials) {
      return c.json({
        success: false,
        error: '尚未設定密碼，請使用 OTP 登入',
        code: 'NO_PASSWORD_SET',
      }, 400);
    }

    // Check lockout
    if (credentials.lockedUntil && new Date(credentials.lockedUntil) > new Date()) {
      const remainingMs = new Date(credentials.lockedUntil).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return c.json({
        success: false,
        error: `帳號已鎖定，請 ${remainingMin} 分鐘後再試`,
        code: 'ACCOUNT_LOCKED',
        lockedUntil: credentials.lockedUntil,
      }, 403);
    }

    // Verify password
    const isValid = await verify(credentials.passwordHash, password, ARGON2_OPTIONS);

    if (!isValid) {
      const newFailedAttempts = (credentials.failedAttempts || 0) + 1;

      // Update failed attempts
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        await db
          .update(memberCredentials)
          .set({
            failedAttempts: newFailedAttempts,
            lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
            updatedAt: new Date(),
          })
          .where(eq(memberCredentials.id, credentials.id));

        return c.json({
          success: false,
          error: '登入失敗次數過多，帳號已鎖定 30 分鐘',
          code: 'ACCOUNT_LOCKED',
        }, 403);
      }

      await db
        .update(memberCredentials)
        .set({
          failedAttempts: newFailedAttempts,
          updatedAt: new Date(),
        })
        .where(eq(memberCredentials.id, credentials.id));

      return c.json({
        success: false,
        error: 'Email 或密碼錯誤',
        code: 'INVALID_CREDENTIALS',
        attemptsRemaining: MAX_FAILED_ATTEMPTS - newFailedAttempts,
      }, 401);
    }

    // Reset failed attempts on successful login
    await db
      .update(memberCredentials)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(memberCredentials.id, credentials.id));

    // Get branch info
    const [branch] = await db
      .select({
        id: branches.id,
        name: branches.name,
        tenantId: branches.tenantId,
      })
      .from(branches)
      .where(eq(branches.id, member.branchId))
      .limit(1);

    // Generate tokens
    const tokens = memberJwtService.generateTokens({
      id: member.id,
      memberCode: member.memberCode,
      branchId: member.branchId,
      tenantId: member.tenantId || branch?.tenantId || '',
    });

    return c.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        member: {
          id: member.id,
          memberCode: member.memberCode,
          fullName: member.fullName,
          status: member.status,
        },
        branch: branch ? {
          id: branch.id,
          name: branch.name,
        } : null,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/auth/has-password - Check if password is set
// -----------------------------------------------------------------------------

app.get(
  '/has-password',
  memberAuthMiddleware,
  requireMember,
  async (c) => {
    const member = c.get('member')!;

    const [credentials] = await db
      .select({ id: memberCredentials.id })
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, member.id))
      .limit(1);

    return c.json({
      success: true,
      data: {
        hasPassword: !!credentials,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/auth/set-password - Set password (first time)
// -----------------------------------------------------------------------------

app.post(
  '/set-password',
  memberAuthMiddleware,
  requireMember,
  zValidator('json', setPasswordSchema),
  async (c) => {
    const member = c.get('member')!;
    const { password } = c.req.valid('json');

    // Check if password already set
    const [existingCredentials] = await db
      .select({ id: memberCredentials.id })
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, member.id))
      .limit(1);

    if (existingCredentials) {
      return c.json({
        success: false,
        error: '密碼已設定，請使用變更密碼功能',
        code: 'PASSWORD_ALREADY_SET',
      }, 400);
    }

    // Hash and store password
    const passwordHash = await hash(password, ARGON2_OPTIONS);

    await db.insert(memberCredentials).values({
      memberId: member.id,
      passwordHash,
      lastPasswordChangeAt: new Date(),
    });

    return c.json({
      success: true,
      message: '密碼設定成功',
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/auth/change-password - Change password
// -----------------------------------------------------------------------------

app.post(
  '/change-password',
  memberAuthMiddleware,
  requireMember,
  zValidator('json', changePasswordSchema),
  async (c) => {
    const member = c.get('member')!;
    const { currentPassword, newPassword } = c.req.valid('json');

    // Get current credentials
    const [credentials] = await db
      .select()
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, member.id))
      .limit(1);

    if (!credentials) {
      return c.json({
        success: false,
        error: '尚未設定密碼',
        code: 'NO_PASSWORD_SET',
      }, 400);
    }

    // Verify current password
    const isValid = await verify(credentials.passwordHash, currentPassword, ARGON2_OPTIONS);

    if (!isValid) {
      return c.json({
        success: false,
        error: '目前密碼錯誤',
        code: 'WRONG_PASSWORD',
      }, 401);
    }

    // Hash and update password
    const newPasswordHash = await hash(newPassword, ARGON2_OPTIONS);

    await db
      .update(memberCredentials)
      .set({
        passwordHash: newPasswordHash,
        lastPasswordChangeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(memberCredentials.id, credentials.id));

    return c.json({
      success: true,
      message: '密碼變更成功',
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/auth/forgot-password - Request password reset
// -----------------------------------------------------------------------------

app.post(
  '/forgot-password',
  passwordResetRateLimiter,
  zValidator('json', forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid('json');

    // Find member (always return success to prevent enumeration)
    const [member] = await db
      .select({
        id: members.id,
        fullName: members.fullName,
        email: members.email,
        status: members.status,
      })
      .from(members)
      .where(eq(members.email, email))
      .limit(1);

    // Only send if member exists and not banned
    if (member && member.status !== 'BANNED') {
      // Generate reset token
      const { token, hash: tokenHash } = memberJwtService.generatePasswordResetToken(member.id);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save token hash to database
      const [credentials] = await db
        .select({ id: memberCredentials.id })
        .from(memberCredentials)
        .where(eq(memberCredentials.memberId, member.id))
        .limit(1);

      if (credentials) {
        await db
          .update(memberCredentials)
          .set({
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(memberCredentials.id, credentials.id));
      } else {
        // Create credentials entry for reset token
        await db.insert(memberCredentials).values({
          memberId: member.id,
          passwordHash: '', // No password yet
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
        });
      }

      // Send reset email
      const resetUrl = `${process.env.MEMBER_APP_URL || 'http://localhost:3000'}/auth/reset-password?token=${token}`;

      await emailService.send({
        to: member.email!,
        subject: '密碼重設請求',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>密碼重設</h2>
            <p>親愛的 ${member.fullName}，</p>
            <p>我們收到了您的密碼重設請求。請點擊下方按鈕重設密碼：</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #333; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                重設密碼
              </a>
            </div>
            <p>此連結將在 1 小時後失效。</p>
            <p>如果您沒有請求重設密碼，請忽略此郵件。</p>
          </div>
        `,
      });
    }

    return c.json({
      success: true,
      message: '如果此 Email 已註冊，您將收到密碼重設郵件',
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/auth/reset-password - Reset password with token
// -----------------------------------------------------------------------------

app.post(
  '/reset-password',
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid('json');

    // Verify token
    const tokenData = memberJwtService.verifyPasswordResetToken(token);

    if (!tokenData) {
      return c.json({
        success: false,
        error: '重設連結無效或已過期',
        code: 'INVALID_TOKEN',
      }, 400);
    }

    // Get member credentials
    const [credentials] = await db
      .select()
      .from(memberCredentials)
      .where(and(
        eq(memberCredentials.memberId, tokenData.memberId),
        gt(memberCredentials.passwordResetExpiresAt, new Date()),
      ))
      .limit(1);

    if (!credentials) {
      return c.json({
        success: false,
        error: '重設連結無效或已過期',
        code: 'INVALID_TOKEN',
      }, 400);
    }

    // Verify token hash matches
    const expectedHash = getTokenHash(tokenData.jti);
    if (credentials.passwordResetTokenHash !== expectedHash) {
      return c.json({
        success: false,
        error: '重設連結無效或已過期',
        code: 'INVALID_TOKEN',
      }, 400);
    }

    // Hash and update password
    const passwordHash = await hash(password, ARGON2_OPTIONS);

    await db
      .update(memberCredentials)
      .set({
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        lastPasswordChangeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(memberCredentials.id, credentials.id));

    return c.json({
      success: true,
      message: '密碼已重設成功',
    });
  }
);

export default app;
