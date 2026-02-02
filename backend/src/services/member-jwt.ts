import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// =============================================================================
// MEMBER JWT SERVICE
// =============================================================================
// Custom JWT implementation for member authentication
// Tokens include: type='member', memberId, memberCode, branchId
// Access token: 1 hour, Refresh token: 7 days

const JWT_SECRET = process.env.MEMBER_JWT_SECRET || process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export interface MemberTokenPayload {
  type: 'member';
  sub: string; // member ID
  memberCode: string;
  branchId: string;
  tenantId: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  type: 'member_refresh';
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

export interface MemberInfo {
  id: string;
  memberCode: string;
  branchId: string;
  tenantId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate access and refresh tokens for a member
 */
export function generateMemberTokens(member: MemberInfo): TokenPair {
  const now = Math.floor(Date.now() / 1000);

  const accessPayload = {
    type: 'member' as const,
    sub: member.id,
    memberCode: member.memberCode,
    branchId: member.branchId,
    tenantId: member.tenantId,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };

  const refreshPayload = {
    type: 'member_refresh' as const,
    sub: member.id,
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
 * Verify an access token and return the member info
 */
export function verifyMemberAccessToken(token: string): MemberInfo | null {
  const payload = verifyJwt<Record<string, unknown>>(token);

  if (!payload || payload.type !== 'member') {
    return null;
  }

  return {
    id: payload.sub as string,
    memberCode: payload.memberCode as string,
    branchId: payload.branchId as string,
    tenantId: payload.tenantId as string,
  };
}

/**
 * Verify a refresh token and return member ID
 */
export function verifyMemberRefreshToken(token: string): { memberId: string; jti: string } | null {
  const payload = verifyJwt<Record<string, unknown>>(token);

  if (!payload || payload.type !== 'member_refresh') {
    return null;
  }

  return {
    memberId: payload.sub as string,
    jti: payload.jti as string,
  };
}

/**
 * Generate a password reset token (1 hour expiry)
 */
export function generatePasswordResetToken(memberId: string): { token: string; hash: string } {
  const now = Math.floor(Date.now() / 1000);
  const tokenId = randomBytes(32).toString('hex');

  const payload = {
    type: 'password_reset',
    sub: memberId,
    jti: tokenId,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const token = signJwt(payload);

  // Create hash for storage
  const hash = createHmac('sha256', JWT_SECRET)
    .update(tokenId)
    .digest('hex');

  return { token, hash };
}

/**
 * Verify a password reset token
 */
export function verifyPasswordResetToken(token: string): { memberId: string; jti: string } | null {
  const payload = verifyJwt<{ type: string; sub: string; jti: string }>(token);

  if (!payload || payload.type !== 'password_reset') {
    return null;
  }

  return {
    memberId: payload.sub,
    jti: payload.jti,
  };
}

/**
 * Get token hash for verification against stored hash
 */
export function getTokenHash(jti: string): string {
  return createHmac('sha256', JWT_SECRET)
    .update(jti)
    .digest('hex');
}

export const memberJwtService = {
  generateTokens: generateMemberTokens,
  verifyAccessToken: verifyMemberAccessToken,
  verifyRefreshToken: verifyMemberRefreshToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  getTokenHash,
};
