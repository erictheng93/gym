import { randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { db, otpTokens } from '../db/index.js';
import { smsService } from './sms.js';
import { escapeHtml } from '../utils/html.js';

// =============================================================================
// OTP SERVICE
// =============================================================================
// Shared one-time-code checks for member login (routes/member-otp.ts) and
// member phone verification (routes/member-profile.ts). A code is single use,
// expires, and allows `maxAttempts` guesses; every guess is counted atomically.

export const OTP_TTL_MS = 5 * 60 * 1000;

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export function otpCodeMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * otp_tokens identifier for a phone-verification code issued to one member.
 * The member id prefix binds the code to that member, and keeps these tokens
 * apart from login tokens (whose identifier is the bare phone number).
 */
export function memberPhoneOtpIdentifier(memberId: string, phone: string): string {
  return `member:${memberId}:${phone}`;
}

/**
 * otp_tokens identifier for an email-verification code issued to one member
 * (email change). Bound to the member and the lowercased address, and apart
 * from login tokens (whose identifier is the bare address).
 */
export function memberEmailOtpIdentifier(memberId: string, email: string): string {
  return `member:${memberId}:email:${email.toLowerCase()}`;
}

/** HTML body of a one-time-code email; every interpolated value is escaped. */
export function otpEmailHtml(options: { title: string; name: string; code: string; intro?: string }): string {
  const { title, name, code, intro = '您的驗證碼是：' } = options;
  return `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${escapeHtml(title)}</h2>
            <p>親愛的 ${escapeHtml(name)}，</p>
            <p>${escapeHtml(intro)}</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px;">
              ${escapeHtml(code)}
            </p>
            <p>驗證碼將在 5 分鐘後失效。</p>
            <p>如果您沒有請求此驗證碼，請忽略此郵件。</p>
          </div>
        `;
}

export type OtpFailure =
  | { code: 'INVALID_OTP'; error: string }
  | { code: 'MAX_ATTEMPTS'; error: string }
  | { code: 'WRONG_CODE'; error: string; attemptsRemaining: number };

type Executor = Pick<typeof db, 'select' | 'update'>;

/**
 * Check `code` against the newest unexpired, unused token matching `tokenWhere`
 * and consume it on success. Counts the attempt before comparing, so the
 * attempt limit holds under concurrent requests; a code can be consumed once.
 */
export async function consumeOtp(
  tokenWhere: SQL | undefined,
  code: string,
  executor: Executor = db,
): Promise<{ ok: true } | { ok: false; failure: OtpFailure }> {
  const [otp] = await executor
    .select({
      id: otpTokens.id,
      code: otpTokens.code,
      maxAttempts: otpTokens.maxAttempts,
    })
    .from(otpTokens)
    .where(and(
      tokenWhere,
      eq(otpTokens.verified, false),
      gt(otpTokens.expiresAt, new Date()),
    ))
    .orderBy(desc(otpTokens.createdAt))
    .limit(1);

  if (!otp) {
    return { ok: false, failure: { code: 'INVALID_OTP', error: '驗證碼無效或已過期' } };
  }

  const maxAttempts = otp.maxAttempts || 3;
  const [counted] = await executor
    .update(otpTokens)
    .set({ attempts: sql`coalesce(${otpTokens.attempts}, 0) + 1` })
    .where(and(
      eq(otpTokens.id, otp.id),
      sql`coalesce(${otpTokens.attempts}, 0) < ${maxAttempts}`,
    ))
    .returning({ attempts: otpTokens.attempts });

  if (!counted) {
    return { ok: false, failure: { code: 'MAX_ATTEMPTS', error: '驗證次數過多，請重新獲取驗證碼' } };
  }

  if (!otpCodeMatches(otp.code, code)) {
    return {
      ok: false,
      failure: {
        code: 'WRONG_CODE',
        error: '驗證碼錯誤',
        attemptsRemaining: maxAttempts - (counted.attempts || 0),
      },
    };
  }

  const [consumed] = await executor
    .update(otpTokens)
    .set({ verified: true, verifiedAt: new Date() })
    .where(and(eq(otpTokens.id, otp.id), eq(otpTokens.verified, false)))
    .returning({ id: otpTokens.id });

  if (!consumed) {
    return { ok: false, failure: { code: 'INVALID_OTP', error: '驗證碼無效或已過期' } };
  }

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Phone delivery
// -----------------------------------------------------------------------------

/** development/test: codes are returned in API responses and SMS may be absent. */
export function otpDevMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

export const SMS_UNAVAILABLE_RESPONSE = {
  success: false,
  error: '簡訊服務暫時無法使用，請稍後再試或洽櫃台協助',
  code: 'SMS_UNAVAILABLE',
} as const;

export type PhoneOtpDelivery =
  | { ok: true; delivered: boolean }
  | { ok: false; reason: 'SMS_NOT_CONFIGURED' | 'SMS_SEND_FAILED' };

/**
 * Send `code` to `phone` by SMS (Mitake; the branch's account when it has one).
 * The code is never written to the application log. Without SMS credentials
 * this fails, except in development/test, where the caller returns the code in
 * its response instead (`delivered: false`).
 */
export async function deliverPhoneOtp(options: {
  phone: string;
  code: string;
  memberId?: string;
  branchId?: string;
}): Promise<PhoneOtpDelivery> {
  const { phone, code, memberId, branchId } = options;

  if (!(await smsService.isSmsAvailableForBranch(branchId))) {
    return otpDevMode() ? { ok: true, delivered: false } : { ok: false, reason: 'SMS_NOT_CONFIGURED' };
  }

  const result = await smsService.sendSms({
    phoneNumber: phone,
    type: 'otp',
    data: { code },
    memberId,
    branchId,
    referenceType: 'otp',
  });
  return result.success ? { ok: true, delivered: true } : { ok: false, reason: 'SMS_SEND_FAILED' };
}

/** otp_send_logs error text for a failed delivery (never contains the code). */
export function phoneOtpLogError(delivery: PhoneOtpDelivery): string | null {
  if (delivery.ok) return delivery.delivered ? null : 'SMS 未設定（開發模式，未發送）';
  return delivery.reason === 'SMS_NOT_CONFIGURED' ? 'SMS 未設定' : 'SMS 發送失敗';
}
