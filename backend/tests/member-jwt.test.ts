import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import {
  generateMemberTokens,
  verifyMemberAccessToken,
  verifyMemberRefreshToken,
  generateRecoveryToken,
  verifyRecoveryToken,
  getRecoveryTokenHash,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  getTokenHash,
} from '../src/services/member-jwt.js';

/** Build an HS256 JWT signed with the given secret. */
function forgeJwt(secret: string, payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest().toString('base64url');
  return `${header}.${body}.${signature}`;
}

describe('Member JWT Service', () => {
  const mockMember = {
    id: 'member-001',
    memberCode: 'M001',
    branchId: 'branch-001',
    tenantId: 'tenant-001',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateMemberTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateMemberTokens(mockMember);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should set expiresIn to 3600 (1 hour)', () => {
      const tokens = generateMemberTokens(mockMember);
      expect(tokens.expiresIn).toBe(3600);
    });

    it('should generate tokens with 3 parts (header.payload.signature)', () => {
      const tokens = generateMemberTokens(mockMember);
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      expect(tokens.refreshToken.split('.')).toHaveLength(3);
    });

    it('should generate unique tokens each time', () => {
      const tokens1 = generateMemberTokens(mockMember);
      const tokens2 = generateMemberTokens(mockMember);
      // refresh tokens must differ (random jti)
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('verifyMemberAccessToken', () => {
    it('should verify a valid access token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyMemberAccessToken(tokens.accessToken);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockMember.id);
      expect(result!.memberCode).toBe(mockMember.memberCode);
      expect(result!.branchId).toBe(mockMember.branchId);
      expect(result!.tenantId).toBe(mockMember.tenantId);
    });

    it('should reject a tampered token', () => {
      const tokens = generateMemberTokens(mockMember);
      // tamper with the payload
      const parts = tokens.accessToken.split('.');
      parts[1] = parts[1] + 'x';
      const tamperedToken = parts.join('.');

      const result = verifyMemberAccessToken(tamperedToken);
      expect(result).toBeNull();
    });

    it('should reject a token with wrong number of parts', () => {
      expect(verifyMemberAccessToken('only.two')).toBeNull();
      expect(verifyMemberAccessToken('a.b.c.d')).toBeNull();
      expect(verifyMemberAccessToken('')).toBeNull();
    });

    it('should reject an expired token', () => {
      // Mock Date.now to simulate future time
      const now = Date.now();

      // Generate token normally
      const tokens = generateMemberTokens(mockMember);

      // Move time forward 2 hours (past 1 hour expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

      const result = verifyMemberAccessToken(tokens.accessToken);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject a refresh token as an access token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyMemberAccessToken(tokens.refreshToken);
      expect(result).toBeNull();
    });

    it('should reject garbage input', () => {
      expect(verifyMemberAccessToken('not-a-jwt')).toBeNull();
      expect(verifyMemberAccessToken('abc.def.ghi')).toBeNull();
    });

    it('should reject a token signed with a different secret', () => {
      const now = Math.floor(Date.now() / 1000);
      const forged = forgeJwt('not-the-member-secret', {
        type: 'member',
        sub: mockMember.id,
        memberCode: mockMember.memberCode,
        branchId: mockMember.branchId,
        tenantId: mockMember.tenantId,
        iat: now,
        exp: now + 3600,
      });

      expect(verifyMemberAccessToken(forged)).toBeNull();
    });

    it('should reject a payload edited without re-signing (tenant switch)', () => {
      const tokens = generateMemberTokens(mockMember);
      const [header, payload, signature] = tokens.accessToken.split('.');
      const edited = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      edited.tenantId = 'another-tenant';
      const forged = [header, Buffer.from(JSON.stringify(edited)).toString('base64url'), signature].join('.');

      expect(verifyMemberAccessToken(forged)).toBeNull();
    });

    it('should not accept coach tokens as member tokens', () => {
      const coachTokens = generateCoachTokens({
        id: 'employee-001',
        employeeCode: 'EMP001',
        branchId: 'branch-001',
        tenantId: 'tenant-001',
        jobTitle: 'COACH',
      });

      expect(verifyMemberAccessToken(coachTokens.accessToken)).toBeNull();
      expect(verifyMemberRefreshToken(coachTokens.refreshToken)).toBeNull();
    });
  });

  describe('verifyMemberRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyMemberRefreshToken(tokens.refreshToken);

      expect(result).not.toBeNull();
      expect(result!.memberId).toBe(mockMember.id);
      expect(result!.jti).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should reject an access token as a refresh token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyMemberRefreshToken(tokens.accessToken);
      expect(result).toBeNull();
    });

    it('should reject an expired refresh token', () => {
      const now = Date.now();
      const tokens = generateMemberTokens(mockMember);

      // Move time forward 8 days (past 7 day expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);

      const result = verifyMemberRefreshToken(tokens.refreshToken);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject a tampered refresh token', () => {
      const tokens = generateMemberTokens(mockMember);
      const parts = tokens.refreshToken.split('.');
      parts[2] = 'tampered-signature';
      const tampered = parts.join('.');

      const result = verifyMemberRefreshToken(tampered);
      expect(result).toBeNull();
    });
  });

  describe('generateRecoveryToken', () => {
    it('should generate a token and hash pair', () => {
      const { token, hash } = generateRecoveryToken('member-001');

      expect(typeof token).toBe('string');
      expect(typeof hash).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      expect(hash.length).toBe(64); // hex-encoded SHA-256 = 64 chars
    });

    it('should generate unique tokens each time', () => {
      const result1 = generateRecoveryToken('member-001');
      const result2 = generateRecoveryToken('member-001');

      expect(result1.token).not.toBe(result2.token);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('backward compatibility: generatePasswordResetToken works as alias', () => {
      const { token, hash } = generatePasswordResetToken('member-001');
      expect(typeof token).toBe('string');
      expect(typeof hash).toBe('string');
    });
  });

  describe('verifyRecoveryToken', () => {
    it('should verify a valid recovery token', () => {
      const { token } = generateRecoveryToken('member-001');
      const result = verifyRecoveryToken(token);

      expect(result).not.toBeNull();
      expect(result!.memberId).toBe('member-001');
      expect(result!.jti).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should reject an expired recovery token', () => {
      const now = Date.now();
      const { token } = generateRecoveryToken('member-001');

      // Move time forward 2 hours (past 1 hour expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

      const result = verifyRecoveryToken(token);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject an access token as a recovery token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyRecoveryToken(tokens.accessToken);
      expect(result).toBeNull();
    });

    it('should reject a tampered token', () => {
      const { token } = generateRecoveryToken('member-001');
      const parts = token.split('.');
      parts[1] = parts[1] + 'x';
      const tampered = parts.join('.');

      const result = verifyRecoveryToken(tampered);
      expect(result).toBeNull();
    });

    it('backward compatibility: verifyPasswordResetToken works as alias', () => {
      const { token } = generateRecoveryToken('member-001');
      const result = verifyPasswordResetToken(token);
      expect(result).not.toBeNull();
      expect(result!.memberId).toBe('member-001');
    });
  });

  describe('getRecoveryTokenHash', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = getRecoveryTokenHash('test-jti-123');
      const hash2 = getRecoveryTokenHash('test-jti-123');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = getRecoveryTokenHash('jti-aaa');
      const hash2 = getRecoveryTokenHash('jti-bbb');
      expect(hash1).not.toBe(hash2);
    });

    it('should match the hash from generateRecoveryToken', () => {
      const { token, hash } = generateRecoveryToken('member-001');
      const result = verifyRecoveryToken(token);

      expect(result).not.toBeNull();
      const computedHash = getRecoveryTokenHash(result!.jti);
      expect(computedHash).toBe(hash);
    });

    it('should return a 64-character hex string', () => {
      const hash = getRecoveryTokenHash('any-value');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('backward compatibility: getTokenHash works as alias', () => {
      expect(getTokenHash('test-jti')).toBe(getRecoveryTokenHash('test-jti'));
    });
  });
});
