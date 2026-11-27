import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// =============================================================================
// SIGNED CHECK-IN QR TOKENS (docs/product-decisions.md row 6)
// =============================================================================
// token = base64url(payload) "." base64url(HMAC-SHA256(base64url(payload), secret))
// payload = { v: 1, mid: memberId, tid: tenantId, iat, exp: iat + 30s, jti }
// The member app fetches one from GET /api/member/check-in/qr-token and shows it as the QR;
// the front desk sends the scanned string to POST /api/check-ins, which verifies it here.

const DEV_FALLBACK_SECRET = 'dev-checkin-qr-secret-change-in-production';
const KNOWN_DEFAULT_SECRETS = [DEV_FALLBACK_SECRET, 'dev-secret-change-in-production', 'change-me-in-production'];
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export const CHECKIN_QR_TTL_SECONDS = 30;

function resolveSecret(): string {
  const secret = process.env.CHECKIN_QR_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('CHECKIN_QR_SECRET must be set in production');
    }
    if (KNOWN_DEFAULT_SECRETS.includes(secret) || secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `CHECKIN_QR_SECRET must be a non-default secret of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
      );
    }
    // A shared key would let any other signed token double as a check-in QR
    for (const other of ['MEMBER_JWT_SECRET', 'COACH_JWT_SECRET', 'SESSION_SECRET', 'JWT_SECRET']) {
      if (secret === process.env[other]) {
        throw new Error(`CHECKIN_QR_SECRET must differ from ${other} in production`);
      }
    }
    return secret;
  }
  return secret || DEV_FALLBACK_SECRET;
}

const SECRET = resolveSecret();

export interface CheckInQrPayload {
  v: 1;
  mid: string;
  tid: string;
  iat: number;
  exp: number;
  jti: string;
}

export type CheckInQrFailure = 'INVALID_QR' | 'QR_EXPIRED';

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

const sign = (payloadEncoded: string) => createHmac('sha256', SECRET).update(payloadEncoded).digest();

export function signCheckInQrToken(
  member: { memberId: string; tenantId: string },
  nowMs = Date.now(),
): { token: string; expiresAt: Date } {
  const iat = Math.floor(nowMs / 1000);
  const payload: CheckInQrPayload = {
    v: 1,
    mid: member.memberId,
    tid: member.tenantId,
    iat,
    exp: iat + CHECKIN_QR_TTL_SECONDS,
    jti: randomBytes(12).toString('hex'),
  };
  const payloadEncoded = b64url(JSON.stringify(payload));
  return {
    token: `${payloadEncoded}.${b64url(sign(payloadEncoded))}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifyCheckInQrToken(
  token: string,
  nowMs = Date.now(),
): { ok: true; payload: CheckInQrPayload } | { ok: false; code: CheckInQrFailure } {
  const invalid = { ok: false, code: 'INVALID_QR' } as const;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;
  const [payloadEncoded, signatureEncoded] = parts;

  const expected = sign(payloadEncoded);
  const actual = Buffer.from(signatureEncoded, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return invalid;

  let payload: CheckInQrPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
  } catch {
    return invalid;
  }
  if (
    !payload || payload.v !== 1 ||
    typeof payload.mid !== 'string' || typeof payload.tid !== 'string' ||
    typeof payload.jti !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number'
  ) {
    return invalid;
  }

  const nowSec = nowMs / 1000;
  if (payload.exp < nowSec) return { ok: false, code: 'QR_EXPIRED' };
  // iat in the future (beyond a little clock skew) is never issued by us
  if (payload.iat > nowSec + 5) return invalid;
  return { ok: true, payload };
}

// -----------------------------------------------------------------------------
// One-time use
// -----------------------------------------------------------------------------
// ponytail: in-memory jti store with TTL; each API instance has its own, so with several
// instances a replay landing on a different instance is only stopped by the same-day
// duplicate check in POST /api/check-ins. Move to Redis/DB if the gate ever goes multi-instance.
const MAX_USED_JTI = 10_000;
const usedJti = new Map<string, number>(); // jti -> expiry (ms)

function pruneUsedJti(nowMs: number) {
  for (const [jti, expiresAt] of usedJti) {
    if (expiresAt <= nowMs) usedJti.delete(jti);
  }
  // Still full of live entries: drop the oldest (Map keeps insertion order)
  while (usedJti.size >= MAX_USED_JTI) {
    const oldest = usedJti.keys().next().value;
    if (oldest === undefined) break;
    usedJti.delete(oldest);
  }
}

/** Reserves a jti; false when it was already used. Release it if the entry was not recorded. */
export function reserveCheckInQrJti(payload: CheckInQrPayload, nowMs = Date.now()): boolean {
  if (usedJti.size >= MAX_USED_JTI) pruneUsedJti(nowMs);
  if ((usedJti.get(payload.jti) ?? 0) > nowMs) return false;
  usedJti.set(payload.jti, payload.exp * 1000 + 5_000);
  return true;
}

export function releaseCheckInQrJti(payload: CheckInQrPayload): void {
  usedJti.delete(payload.jti);
}

export function resetCheckInQrJtiStoreForTests(): void {
  usedJti.clear();
}
