import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// =============================================================================
// COACH JWT SERVICE
// =============================================================================
// Custom JWT implementation for coach authentication
// Tokens include: type='coach', employeeId, employeeCode, branchId, tenantId
// Access token: 24 hours, Refresh token: 7 days

const JWT_SECRET = process.env.COACH_JWT_SECRET || process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export interface CoachTokenPayload {
  type: 'coach';
  sub: string; // employee ID
  employeeCode: string;
  branchId: string;
  tenantId: string;
  jobTitle: string;
  iat: number;
  exp: number;
}

export interface CoachRefreshTokenPayload {
  type: 'coach_refresh';
  sub: string;
  jti: string; // unique token ID for revocation
  iat: number;
  exp: number;
}

// Base64url encoding/decoding
function base64urlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

// Sign JWT
function signJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = createHmac('sha256', JWT_SECRET)
    .update(signatureInput)
    .digest();
  return `${signatureInput}.${base64urlEncode(signature)}`;
}

// Verify JWT signature and decode
function verifyJwt<T extends Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    // Verify signature
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(signatureInput)
      .digest();
    const actualSignature = Buffer.from(
      signatureEncoded.replace(/-/g, '+').replace(/_/g, '/') + '==',
      'base64'
    );

    if (!timingSafeEqual(expectedSignature, actualSignature)) {
      return null;
    }

    // Decode and return payload
    const payload = JSON.parse(base64urlDecode(payloadEncoded)) as T;

    // Check expiration
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface CoachInfo {
  id: string;
  employeeCode: string;
  branchId: string;
  tenantId: string;
  jobTitle: string;
}

export interface CoachTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate access and refresh tokens for a coach
 */
export function generateCoachTokens(coach: CoachInfo): CoachTokenPair {
  const now = Math.floor(Date.now() / 1000);

  const accessPayload = {
    type: 'coach' as const,
    sub: coach.id,
    employeeCode: coach.employeeCode,
    branchId: coach.branchId,
    tenantId: coach.tenantId,
    jobTitle: coach.jobTitle,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };

  const refreshPayload = {
    type: 'coach_refresh' as const,
    sub: coach.id,
    jti: randomBytes(16).toString('hex'),
    iat: now,
    exp: now + REFRESH_TOKEN_EXPIRY,
  };

  return {
    accessToken: signJwt(accessPayload),
    refreshToken: signJwt(refreshPayload),
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Verify an access token and return the coach info
 */
export function verifyCoachAccessToken(token: string): CoachInfo | null {
  const payload = verifyJwt<Record<string, unknown>>(token);

  if (!payload || payload.type !== 'coach') {
    return null;
  }

  return {
    id: payload.sub as string,
    employeeCode: payload.employeeCode as string,
    branchId: payload.branchId as string,
    tenantId: payload.tenantId as string,
    jobTitle: payload.jobTitle as string,
  };
}

/**
 * Verify a refresh token and return employee ID
 */
export function verifyCoachRefreshToken(token: string): { employeeId: string; jti: string } | null {
  const payload = verifyJwt<Record<string, unknown>>(token);

  if (!payload || payload.type !== 'coach_refresh') {
    return null;
  }

  return {
    employeeId: payload.sub as string,
    jti: payload.jti as string,
  };
}

export const coachJwtService = {
  generateTokens: generateCoachTokens,
  verifyAccessToken: verifyCoachAccessToken,
  verifyRefreshToken: verifyCoachRefreshToken,
};
