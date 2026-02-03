import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, otpTokens, otpSendLogs, members, branches } from '../db/index.js';
import { eq, and, gt, desc } from 'drizzle-orm';
import { rateLimiter } from '../middleware/index.js';
import { memberJwtService } from '../services/member-jwt.js';
import { emailService } from '../services/email.js';

// =============================================================================
// MEMBER OTP ROUTES
// =============================================================================
// OTP-based authentication for member-app
// Endpoints: /send, /verify, /refresh

type OtpVariables = {
  requestBody?: { identifier?: string };
};

const app = new Hono<{ Variables: OtpVariables }>();

// -----------------------------------------------------------------------------
// Rate Limiters
// -----------------------------------------------------------------------------

// 1 request per minute per identifier
const otpSendRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 100 : 1,
  keyGenerator: (c) => {
    const body = c.get('requestBody') as { identifier?: string } | undefined;
    return `otp:send:${body?.identifier || 'unknown'}`;
  },
  message: '發送過於頻繁，請 1 分鐘後再試',
});

// 5 requests per hour per identifier
const otpSendHourlyRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  keyGenerator: (c) => {
    const body = c.get('requestBody') as { identifier?: string } | undefined;
    return `otp:send:hourly:${body?.identifier || 'unknown'}`;
  },
  message: '今日發送次數已達上限，請稍後再試',
});

// 5 verify attempts per 15 minutes per identifier
const otpVerifyRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  keyGenerator: (c) => {
    const body = c.get('requestBody') as { identifier?: string } | undefined;
    return `otp:verify:${body?.identifier || 'unknown'}`;
  },
  message: '驗證次數過多，請 15 分鐘後再試',
});

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const sendOtpSchema = z.object({
  identifier: z.string().min(1, '請輸入手機號碼或 Email'),
  type: z.enum(['phone', 'email']),
});

const verifyOtpSchema = z.object({
  identifier: z.string().min(1, '請輸入手機號碼或 Email'),
  type: z.enum(['phone', 'email']),
  code: z.string().length(6, 'OTP 必須是 6 位數'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '請提供 refresh token'),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
         c.req.header('x-real-ip') ||
         'unknown';
}

// Store request body for rate limiter
app.use('*', async (c, next) => {
  if (c.req.method === 'POST') {
    try {
      const body = await c.req.json();
      c.set('requestBody', body);
      // Reset request body for validators
      c.req.raw = new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: JSON.stringify(body),
      });
    } catch {
      // Body parsing failed, continue
    }
  }
  return next();
});

// -----------------------------------------------------------------------------
// POST /api/member/otp/send - Send OTP
// -----------------------------------------------------------------------------

app.post(
  '/send',
  otpSendRateLimiter,
  otpSendHourlyRateLimiter,
  zValidator('json', sendOtpSchema),
  async (c) => {
    const { identifier, type } = c.req.valid('json');
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent') || '';

    // Find member by phone or email
    const whereClause = type === 'phone'
      ? eq(members.phone, identifier)
      : eq(members.email, identifier);

    const [member] = await db
      .select({
        id: members.id,
        phone: members.phone,
        email: members.email,
        fullName: members.fullName,
        status: members.status,
      })
      .from(members)
      .where(whereClause)
      .limit(1);

    // Always return success to prevent enumeration
    // But only send OTP if member exists and is active
    if (!member || member.status === 'BANNED') {
      // Log failed attempt
      await db.insert(otpSendLogs).values({
        identifier,
        identifierType: type,
        ipAddress,
        success: false,
        errorMessage: !member ? '會員不存在' : '會員已停權',
      });

      return c.json({
        success: true,
        message: '如果此帳號存在，驗證碼已發送',
      });
    }

    // Generate OTP
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete any existing OTP for this identifier
    await db
      .delete(otpTokens)
      .where(and(
        eq(otpTokens.identifier, identifier),
        eq(otpTokens.identifierType, type),
      ));

    // Create new OTP
    await db.insert(otpTokens).values({
      identifier,
      identifierType: type,
      code,
      expiresAt,
      ipAddress,
      userAgent,
    });

    // Send OTP via appropriate channel
    let sendSuccess = false;

    if (type === 'email' && member.email) {
      sendSuccess = await emailService.send({
        to: member.email,
        subject: '您的登入驗證碼',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>登入驗證碼</h2>
            <p>親愛的 ${member.fullName}，</p>
            <p>您的驗證碼是：</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px;">
              ${code}
            </p>
            <p>驗證碼將在 5 分鐘後失效。</p>
            <p>如果您沒有請求此驗證碼，請忽略此郵件。</p>
          </div>
        `,
      });
    } else if (type === 'phone') {
      // TODO: Integrate SMS provider (e.g., Twilio, AWS SNS)
      console.log(`[SMS] OTP for ${identifier}: ${code}`);
      sendSuccess = true; // Assume success for now
    }

    // Log send attempt
    await db.insert(otpSendLogs).values({
      identifier,
      identifierType: type,
      ipAddress,
      success: sendSuccess,
      errorMessage: sendSuccess ? null : '發送失敗',
    });

    return c.json({
      success: true,
      message: '如果此帳號存在，驗證碼已發送',
      // In development, return code for testing
      ...(process.env.NODE_ENV === 'development' && { _devCode: code }),
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/otp/verify - Verify OTP and get tokens
// -----------------------------------------------------------------------------

app.post(
  '/verify',
  otpVerifyRateLimiter,
  zValidator('json', verifyOtpSchema),
  async (c) => {
    const { identifier, type, code } = c.req.valid('json');

    // Find valid OTP
    const [otp] = await db
      .select()
      .from(otpTokens)
      .where(and(
        eq(otpTokens.identifier, identifier),
        eq(otpTokens.identifierType, type),
        eq(otpTokens.verified, false),
        gt(otpTokens.expiresAt, new Date()),
      ))
      .orderBy(desc(otpTokens.createdAt))
      .limit(1);

    if (!otp) {
      return c.json({
        success: false,
        error: '驗證碼無效或已過期',
        code: 'INVALID_OTP',
      }, 400);
    }

    // Check attempts
    if ((otp.attempts || 0) >= (otp.maxAttempts || 3)) {
      return c.json({
        success: false,
        error: '驗證次數過多，請重新獲取驗證碼',
        code: 'MAX_ATTEMPTS',
      }, 400);
    }

    // Increment attempts
    await db
      .update(otpTokens)
      .set({ attempts: (otp.attempts || 0) + 1 })
      .where(eq(otpTokens.id, otp.id));

    // Verify code
    if (otp.code !== code) {
      return c.json({
        success: false,
        error: '驗證碼錯誤',
        code: 'WRONG_CODE',
        attemptsRemaining: (otp.maxAttempts || 3) - (otp.attempts || 0) - 1,
      }, 400);
    }

    // Mark as verified
    await db
      .update(otpTokens)
      .set({
        verified: true,
        verifiedAt: new Date(),
      })
      .where(eq(otpTokens.id, otp.id));

    // Find member
    const whereClause = type === 'phone'
      ? eq(members.phone, identifier)
      : eq(members.email, identifier);

    const [member] = await db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        branchId: members.branchId,
        tenantId: members.tenantId,
        fullName: members.fullName,
        status: members.status,
      })
      .from(members)
      .where(whereClause)
      .limit(1);

    if (!member) {
      return c.json({
        success: false,
        error: '會員不存在',
        code: 'MEMBER_NOT_FOUND',
      }, 404);
    }

    if (member.status === 'BANNED') {
      return c.json({
        success: false,
        error: '帳號已停權',
        code: 'MEMBER_BANNED',
      }, 403);
    }

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
// POST /api/member/otp/refresh - Refresh tokens
// -----------------------------------------------------------------------------

app.post(
  '/refresh',
  rateLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100 : 10,
    message: '刷新過於頻繁',
  }),
  zValidator('json', refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid('json');

    // Verify refresh token
    const tokenData = memberJwtService.verifyRefreshToken(refreshToken);

    if (!tokenData) {
      return c.json({
        success: false,
        error: 'Refresh token 無效或已過期',
        code: 'INVALID_REFRESH_TOKEN',
      }, 401);
    }

    // Get member
    const [member] = await db
      .select({
        id: members.id,
        memberCode: members.memberCode,
        branchId: members.branchId,
        tenantId: members.tenantId,
        status: members.status,
      })
      .from(members)
      .where(eq(members.id, tokenData.memberId))
      .limit(1);

    if (!member) {
      return c.json({
        success: false,
        error: '會員不存在',
        code: 'MEMBER_NOT_FOUND',
      }, 404);
    }

    if (member.status === 'BANNED') {
      return c.json({
        success: false,
        error: '帳號已停權',
        code: 'MEMBER_BANNED',
      }, 403);
    }

    // Get branch for tenantId
    const [branch] = await db
      .select({ tenantId: branches.tenantId })
      .from(branches)
      .where(eq(branches.id, member.branchId))
      .limit(1);

    // Generate new tokens
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
      },
    });
  }
);

export default app;
