import { randomInt, timingSafeEqual } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, otpTokens, otpSendLogs, members, branches } from '../db/index.js';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import { rateLimiter } from '../middleware/index.js';
import { memberJwtService } from '../services/member-jwt.js';
import { emailService } from '../services/email.js';

// =============================================================================
// MEMBER OTP ROUTES
// =============================================================================
// OTP-based authentication for member-app
// Endpoints: /send, /verify, /refresh

type OtpVariables = {
  otpRateKey: string;
};

const app = new Hono<{ Variables: OtpVariables }>();

const OTP_VERIFY_SELECT = {
  id: otpTokens.id,
  code: otpTokens.code,
  attempts: otpTokens.attempts,
  maxAttempts: otpTokens.maxAttempts,
};

const MEMBER_OTP_AUTH_SELECT = {
  id: members.id,
  memberCode: members.memberCode,
  branchId: members.branchId,
  tenantId: members.tenantId,
  fullName: members.fullName,
  status: members.status,
};

const BRANCH_OTP_AUTH_SELECT = {
  id: branches.id,
  name: branches.name,
  tenantId: branches.tenantId,
};

const OTP_MEMBER_SELECT = {
  id: members.id,
  phone: members.phone,
  email: members.email,
  fullName: members.fullName,
  status: members.status,
};

const OTP_REFRESH_MEMBER_JOIN_SELECT = {
  id: members.id,
  memberCode: members.memberCode,
  branchId: members.branchId,
  tenantId: members.tenantId,
  status: members.status,
  branchTenantId: branches.tenantId,
};

// -----------------------------------------------------------------------------
// Rate Limiters
// -----------------------------------------------------------------------------

// 1 request per minute per identifier
const otpSendRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 100 : 1,
  keyGenerator: (c) => `otp:send:${c.get('otpRateKey')}`,
  message: '發送過於頻繁，請 1 分鐘後再試',
});

// 5 requests per hour per identifier
const otpSendHourlyRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  keyGenerator: (c) => `otp:send:hourly:${c.get('otpRateKey')}`,
  message: '今日發送次數已達上限，請稍後再試',
});

// 5 verify attempts per 15 minutes per identifier
const otpVerifyRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  keyGenerator: (c) => `otp:verify:${c.get('otpRateKey')}`,
  message: '驗證次數過多，請 15 分鐘後再試',
});

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const otpIdentifierSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('phone'),
    identifier: z.string().trim().regex(/^09\d{2}[- ]?\d{3}[- ]?\d{3}$/, '請輸入有效的手機號碼')
      .transform(phone => phone.replace(/[- ]/g, '')),
  }),
  z.object({
    type: z.literal('email'),
    identifier: z.string().min(1, '請輸入手機號碼或 Email'),
  }),
]);

const setOtpRateKey: MiddlewareHandler<
  { Variables: OtpVariables }, string, { out: { json: z.infer<typeof otpIdentifierSchema> } }
> = async (c, next) => {
  const { type, identifier } = c.req.valid('json');
  c.set('otpRateKey', `${type}:${identifier}`);
  await next();
};

const verifyOtpSchema = otpIdentifierSchema.and(z.object({
  code: z.string().length(6, 'OTP 必須是 6 位數'),
}));

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '請提供 refresh token'),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

function otpCodeMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
         c.req.header('x-real-ip');
  return ip || undefined;
}

function memberIdentifierMatches(type: 'phone' | 'email', identifier: string) {
  return type === 'phone'
    ? eq(sql`translate(${members.phone}, '- ', '')`, identifier)
    : eq(members.email, identifier);
}

function tokenIdentifierMatches(type: 'phone' | 'email', identifier: string) {
  // Pending phone tokens issued before normalization may still contain separators.
  return type === 'phone'
    ? eq(sql`translate(${otpTokens.identifier}, '- ', '')`, identifier)
    : eq(otpTokens.identifier, identifier);
}

// -----------------------------------------------------------------------------
// POST /api/member/otp/send - Send OTP
// -----------------------------------------------------------------------------

app.post(
  '/send',
  zValidator('json', otpIdentifierSchema),
  setOtpRateKey,
  otpSendRateLimiter,
  otpSendHourlyRateLimiter,
  async (c) => {
    const { identifier, type } = c.req.valid('json');
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent') || '';

    // Find member by phone or email
    const [member] = await db
      .select(OTP_MEMBER_SELECT)
      .from(members)
      .where(memberIdentifierMatches(type, identifier))
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

    // Delete any existing OTP for this identifier (both raw and normalized)
    await db
      .delete(otpTokens)
      .where(and(
        tokenIdentifierMatches(type, identifier),
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
      // In development/test, return code for testing and frontend display
      ...((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && {
        _devCode: code,
        data: {
          otp: code,
          expiresIn: 300,
        },
      }),
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/otp/verify - Verify OTP and get tokens
// -----------------------------------------------------------------------------

app.post(
  '/verify',
  zValidator('json', verifyOtpSchema),
  setOtpRateKey,
  otpVerifyRateLimiter,
  async (c) => {
    const { identifier, type, code } = c.req.valid('json');

    // Find valid OTP
    const [otp] = await db
      .select(OTP_VERIFY_SELECT)
      .from(otpTokens)
      .where(and(
        tokenIdentifierMatches(type, identifier),
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

    // Atomically count this attempt; fails once max attempts is reached
    const maxAttempts = otp.maxAttempts || 3;
    const [counted] = await db
      .update(otpTokens)
      .set({ attempts: sql`coalesce(${otpTokens.attempts}, 0) + 1` })
      .where(and(
        eq(otpTokens.id, otp.id),
        sql`coalesce(${otpTokens.attempts}, 0) < ${maxAttempts}`,
      ))
      .returning({ attempts: otpTokens.attempts });

    if (!counted) {
      return c.json({
        success: false,
        error: '驗證次數過多，請重新獲取驗證碼',
        code: 'MAX_ATTEMPTS',
      }, 400);
    }

    // Verify code (constant-time)
    if (!otpCodeMatches(otp.code, code)) {
      return c.json({
        success: false,
        error: '驗證碼錯誤',
        code: 'WRONG_CODE',
        attemptsRemaining: maxAttempts - (counted.attempts || 0),
      }, 400);
    }

    // Consume the OTP atomically so concurrent requests cannot reuse it
    const [consumed] = await db
      .update(otpTokens)
      .set({
        verified: true,
        verifiedAt: new Date(),
      })
      .where(and(eq(otpTokens.id, otp.id), eq(otpTokens.verified, false)))
      .returning({ id: otpTokens.id });

    if (!consumed) {
      return c.json({
        success: false,
        error: '驗證碼無效或已過期',
        code: 'INVALID_OTP',
      }, 400);
    }

    // Find member
    const [member] = await db
      .select(MEMBER_OTP_AUTH_SELECT)
      .from(members)
      .where(memberIdentifierMatches(type, identifier))
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
      .select(BRANCH_OTP_AUTH_SELECT)
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

    // Get member with branch in single query
    const [member] = await db
      .select(OTP_REFRESH_MEMBER_JOIN_SELECT)
      .from(members)
      .leftJoin(branches, eq(members.branchId, branches.id))
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

    // Generate new tokens
    const tokens = memberJwtService.generateTokens({
      id: member.id,
      memberCode: member.memberCode,
      branchId: member.branchId,
      tenantId: member.tenantId || member.branchTenantId || '',
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
