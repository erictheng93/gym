import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateCoachTokens,
  verifyCoachAccessToken,
  verifyCoachRefreshToken,
} from '../src/services/coach-jwt.js';

describe('Coach JWT Service', () => {
  const mockCoach = {
    id: 'employee-001',
    employeeCode: 'EMP001',
    branchId: 'branch-001',
    tenantId: 'tenant-001',
    jobTitle: 'COACH',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateCoachTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateCoachTokens(mockCoach);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should set expiresIn to 86400 (24 hours)', () => {
      const tokens = generateCoachTokens(mockCoach);
      expect(tokens.expiresIn).toBe(86400);
    });

    it('should generate tokens with 3 parts', () => {
      const tokens = generateCoachTokens(mockCoach);
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      expect(tokens.refreshToken.split('.')).toHaveLength(3);
    });

    it('should generate unique refresh tokens each time', () => {
      const tokens1 = generateCoachTokens(mockCoach);
      const tokens2 = generateCoachTokens(mockCoach);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('verifyCoachAccessToken', () => {
    it('should verify a valid access token and return coach info', () => {
      const tokens = generateCoachTokens(mockCoach);
      const result = verifyCoachAccessToken(tokens.accessToken);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockCoach.id);
      expect(result!.employeeCode).toBe(mockCoach.employeeCode);
      expect(result!.branchId).toBe(mockCoach.branchId);
      expect(result!.tenantId).toBe(mockCoach.tenantId);
      expect(result!.jobTitle).toBe(mockCoach.jobTitle);
    });

    it('should reject a tampered token', () => {
      const tokens = generateCoachTokens(mockCoach);
      const parts = tokens.accessToken.split('.');
      parts[1] = parts[1] + 'x';
      const tampered = parts.join('.');

      expect(verifyCoachAccessToken(tampered)).toBeNull();
    });

    it('should reject malformed tokens', () => {
      expect(verifyCoachAccessToken('only.two')).toBeNull();
      expect(verifyCoachAccessToken('')).toBeNull();
      expect(verifyCoachAccessToken('not-a-jwt')).toBeNull();
    });

    it('should reject an expired token', () => {
      const now = Date.now();
      const tokens = generateCoachTokens(mockCoach);

      // Move time forward 25 hours (past 24 hour expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);

      expect(verifyCoachAccessToken(tokens.accessToken)).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject a refresh token used as access token', () => {
      const tokens = generateCoachTokens(mockCoach);
      expect(verifyCoachAccessToken(tokens.refreshToken)).toBeNull();
    });
  });

  describe('verifyCoachRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const tokens = generateCoachTokens(mockCoach);
      const result = verifyCoachRefreshToken(tokens.refreshToken);

      expect(result).not.toBeNull();
      expect(result!.employeeId).toBe(mockCoach.id);
      expect(result!.jti).toBeDefined();
      expect(typeof result!.jti).toBe('string');
    });

    it('should reject an access token used as refresh token', () => {
      const tokens = generateCoachTokens(mockCoach);
      expect(verifyCoachRefreshToken(tokens.accessToken)).toBeNull();
    });

    it('should reject an expired refresh token', () => {
      const now = Date.now();
      const tokens = generateCoachTokens(mockCoach);

      // Move time forward 8 days (past 7 day expiry)
      vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);

      expect(verifyCoachRefreshToken(tokens.refreshToken)).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject a tampered refresh token', () => {
      const tokens = generateCoachTokens(mockCoach);
      const parts = tokens.refreshToken.split('.');
      parts[2] = 'tampered';
      const tampered = parts.join('.');

      expect(verifyCoachRefreshToken(tampered)).toBeNull();
    });
  });

  describe('cross-service token isolation', () => {
    it('should not accept member tokens as coach tokens', async () => {
      const { generateMemberTokens } = await import('../src/services/member-jwt.js');
      const memberTokens = generateMemberTokens({
        id: 'member-001',
        memberCode: 'M001',
        branchId: 'branch-001',
        tenantId: 'tenant-001',
      });

      // Coach service should reject member access tokens
      expect(verifyCoachAccessToken(memberTokens.accessToken)).toBeNull();
      expect(verifyCoachRefreshToken(memberTokens.refreshToken)).toBeNull();
    });
  });
});
