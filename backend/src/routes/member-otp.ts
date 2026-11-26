import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, otpTokens, otpSendLogs, members, branches, tenants } from '../db/index.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { rateLimiter, getClientIp } from '../middleware/index.js';
import { memberJwtService } from '../services/member-jwt.js';
import { emailService } from '../services/email.js';
import { smsService } from '../services/sms.js';
import {
  generateOtp,
  consumeOtp,
  deliverPhoneOtp,
  otpDevMode,
  phoneOtpLogError,
  OTP_TTL_MS,
  SMS_UNAVAILABLE_RESPONSE,
} from '../services/otp.js';

// =============================================================================
// MEMBER OTP ROUTES
// =============================================================================
// OTP-based authentication for member-app
// Endpoints: /send, /verify, /refresh
//
// Tenant scope: one phone/email can belong to members of several gyms
// (tenants). The member-app is deployed per gym and sends that gym's
// `tenantSlug`; the lookup is then limited to that tenant. Without it, a
// login that matches more than one member is refused (MULTIPLE_ACCOUNTS)
// rather than logging into an arbitrary gym. That answer is only given after
// the code is verified, so an unverified caller learns nothing about which
// gyms a number belongs to.

type OtpVariables = {
  otpRateKey: string;
};

const app = new Hono<{ Variables: OtpVariables }>();

const LOGIN_MEMBER_SELECT = {
  id: members.id,
  memberCode: members.memberCode,
  branchId: members.branchId,
  tenantId: members.tenantId,
  fullName: members.fullName,
  email: members.email,
  status: members.status,
};

const BRANCH_OTP_AUTH_SELECT = {
  id: branches.id,
  name: branches.name,
};

/** More rows than this are never needed: any count above 1 is "ambiguous". */
const LOGIN_MEMBER_LOOKUP_LIMIT = 10;

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

/** The gym the member-app is deployed for (tenants.slug); see the header note. */
const loginScopeSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(100).optional(),
});

const sendOtpSchema = otpIdentifierSchema.and(loginScopeSchema);

const verifyOtpSchema = otpIdentifierSchema.and(loginScopeSchema).and(z.object({
  code: z.string().length(6, 'OTP 必須是 6 位數'),
}));

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '請提供 refresh token'),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Client address for the OTP logs (TRUST_PROXY-aware); undefined when unknown. */
function otpClientIp(c: Context): string | undefined {
  const ip = getClientIp(c);
  return ip === 'unknown' ? undefined : ip;
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

/**
 * Members a login identifier can mean: matching phone/email, within the
 * tenant named by `tenantSlug` when given. Deterministic order.
 */
async function findLoginMembers(type: 'phone' | 'email', identifier: string, tenantSlug?: string) {
  const query = db.select(LOGIN_MEMBER_SELECT).from(members);
  const scoped = tenantSlug
    ? query
      .innerJoin(tenants, eq(tenants.id, members.tenantId))
      .where(and(memberIdentifierMatches(type, identifier), eq(tenants.slug, tenantSlug)))
    : query.where(memberIdentifierMatches(type, identifier));
  return scoped
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(LOGIN_MEMBER_LOOKUP_LIMIT);
}

const SEND_ACCEPTED_RESPONSE = {
  success: true,
  message: '如果此帳號存在，驗證碼已發送',
} as const;

// -----------------------------------------------------------------------------
// POST /api/member/otp/send - Send OTP
// -----------------------------------------------------------------------------

app.post(
  '/send',
  zValidator('json', sendOtpSchema),
  setOtpRateKey,
  otpSendRateLimiter,
  otpSendHourlyRateLimiter,
  async (c) => {
    const { identifier, type, tenantSlug } = c.req.valid('json');
    const ipAddress = otpClientIp(c);
    const userAgent = c.req.header('user-agent') || '';

    // No SMS account at all: refuse every phone request alike (before the
    // member lookup, so the answer does not reveal whether the number exists)
    if (type === 'phone' && !otpDevMode() && !(await smsService.isAnySmsConfigured())) {
      await db.insert(otpSendLogs).values({
        identifier,
        identifierType: type,
        ipAddress,
        success: false,
        errorMessage: 'SMS 未設定',
      });
      return c.json(SMS_UNAVAILABLE_RESPONSE, 503);
    }

    const candidates = (await findLoginMembers(type, identifier, tenantSlug))
      .filter(m => m.status !== 'BANNED');

    // Always return success to prevent enumeration
    // But only send OTP if a usable member exists
    if (candidates.length === 0) {
      await db.insert(otpSendLogs).values({
        identifier,
        identifierType: type,
        ipAddress,
        success: false,
        errorMessage: '會員不存在或已停權',
      });

      return c.json(SEND_ACCEPTED_RESPONSE);
    }
    // Several gyms may match; /verify decides. Name/branch only for a single match.
    const member = candidates[0];
    const singleMatch = candidates.length === 1;

    // Generate OTP
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

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
    let sendError: string | null = '發送失敗';
    let smsUnavailable = false;

    if (type === 'email') {
      sendSuccess = await emailService.send({
        to: identifier,
        subject: '您的登入驗證碼',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>登入驗證碼</h2>
            <p>親愛的 ${singleMatch ? member.fullName : '會員'}，</p>
            <p>您的驗證碼是：</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px;">
              ${code}
            </p>
            <p>驗證碼將在 5 分鐘後失效。</p>
            <p>如果您沒有請求此驗證碼，請忽略此郵件。</p>
          </div>
        `,
      });
      if (sendSuccess) sendError = null;
    } else {
      const delivery = await deliverPhoneOtp({
        phone: identifier,
        code,
        memberId: singleMatch ? member.id : undefined,
        branchId: member.branchId,
      });
      sendSuccess = delivery.ok && delivery.delivered;
      sendError = phoneOtpLogError(delivery);
      smsUnavailable = !delivery.ok;
    }

    // Log send attempt
    await db.insert(otpSendLogs).values({
      identifier,
      identifierType: type,
      ipAddress,
      success: sendSuccess,
      errorMessage: sendError,
    });

    if (smsUnavailable) {
      // The code never reached the phone: drop it and say so
      await db.delete(otpTokens).where(and(
        eq(otpTokens.identifier, identifier),
        eq(otpTokens.identifierType, type),
        eq(otpTokens.code, code),
      ));
      return c.json(SMS_UNAVAILABLE_RESPONSE, 503);
    }

    return c.json({
      ...SEND_ACCEPTED_RESPONSE,
      // In development/test, return code for testing and frontend display
      ...(otpDevMode() && {
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
    const { identifier, type, code, tenantSlug } = c.req.valid('json');

    const result = await consumeOtp(
      and(tokenIdentifierMatches(type, identifier), eq(otpTokens.identifierType, type)),
      code,
    );

    if (!result.ok) {
      return c.json({ success: false, ...result.failure }, 400);
    }

    // The caller has now proven the phone/email; decide which member it means
    const matches = await findLoginMembers(type, identifier, tenantSlug);
    const candidates = matches.filter(m => m.status !== 'BANNED');

    if (candidates.length === 0) {
      return matches.length > 0
        ? c.json({ success: false, error: '帳號已停權', code: 'MEMBER_BANNED' }, 403)
        : c.json({ success: false, error: '會員不存在', code: 'MEMBER_NOT_FOUND' }, 404);
    }

    if (candidates.length > 1) {
      return c.json({
        success: false,
        error: type === 'phone'
          ? '此手機號碼在多個場館都有會員資料，請使用您所屬場館的會員 App 登入，或洽櫃台協助'
          : '此 Email 在多個場館都有會員資料，請使用您所屬場館的會員 App 登入，或洽櫃台協助',
        code: 'MULTIPLE_ACCOUNTS',
      }, 409);
    }

    const member = candidates[0];

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
      tenantId: member.tenantId,
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
