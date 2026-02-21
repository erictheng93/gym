import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateMemberTokens,
  verifyMemberAccessToken,
  verifyMemberRefreshToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  getTokenHash,
} from '../src/services/member-jwt.js';

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
      const originalDateNow = Date.now;

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
  });

  describe('verifyMemberRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyMemberRefreshToken(tokens.refreshToken);

      expect(result).not.toBeNull();
      expect(result!.memberId).toBe(mockMember.id);
      expect(result!.jti).toBeDefined();
      expect(typeof result!.jti).toBe('string');
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

  describe('generatePasswordResetToken', () => {
    it('should generate a token and hash pair', () => {
      const { token, hash } = generatePasswordResetToken('member-001');

      expect(typeof token).toBe('string');
      expect(typeof hash).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      expect(hash.length).toBe(64); // hex-encoded SHA-256 = 64 chars
    });

    it('should generate unique tokens each time', () => {
      const result1 = generatePasswordResetToken('member-001');
      const result2 = generatePasswordResetToken('member-001');

      expect(result1.token).not.toBe(result2.token);
      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('should verify a valid password reset token', () => {
      const { token } = generatePasswordResetToken('member-001');
      const result = verifyPasswordResetToken(token);

      expect(result).not.toBeNull();
      expect(result!.memberId).toBe('member-001');
      expect(result!.jti).toBeDefined();
    });

    it('should reject an expired password reset token', () => {
      const now = Date.now();
      const { token } = generatePasswordResetToken('member-001');

      // Move time forward 2 hours (past 1 hour expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

      const result = verifyPasswordResetToken(token);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject an access token as a password reset token', () => {
      const tokens = generateMemberTokens(mockMember);
      const result = verifyPasswordResetToken(tokens.accessToken);
      expect(result).toBeNull();
    });

    it('should reject a tampered token', () => {
      const { token } = generatePasswordResetToken('member-001');
      const parts = token.split('.');
      parts[1] = parts[1] + 'x';
      const tampered = parts.join('.');

      const result = verifyPasswordResetToken(tampered);
      expect(result).toBeNull();
    });
  });

  describe('getTokenHash', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = getTokenHash('test-jti-123');
      const hash2 = getTokenHash('test-jti-123');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = getTokenHash('jti-aaa');
      const hash2 = getTokenHash('jti-bbb');
      expect(hash1).not.toBe(hash2);
    });

    it('should match the hash from generatePasswordResetToken', () => {
      const { token, hash } = generatePasswordResetToken('member-001');
      const result = verifyPasswordResetToken(token);

      expect(result).not.toBeNull();
      const computedHash = getTokenHash(result!.jti);
      expect(computedHash).toBe(hash);
    });

    it('should return a 64-character hex string', () => {
      const hash = getTokenHash('any-value');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
