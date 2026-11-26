import { randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { db, otpTokens } from '../db/index.js';

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
