import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member OTP Route Tests
// Endpoints:
//   POST /api/member/otp/send
//   POST /api/member/otp/verify
//   POST /api/member/otp/refresh
// =============================================================================

describe('Member OTP Routes', () => {
  // ---------------------------------------------------------------------------
  // Validation Tests (no DB needed)
  // ---------------------------------------------------------------------------

  describe('POST /api/member/otp/send - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing type', async () => {
      const res = await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '0912345678' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid type value', async () => {
      const res = await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '0912345678', type: 'sms' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/member/otp/verify - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject code with wrong length', async () => {
      const res = await app.request('/api/member/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'test@test.com',
          type: 'email',
          code: '12345', // 5 digits instead of 6
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing identifier', async () => {
      const res = await app.request('/api/member/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          code: '123456',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/member/otp/refresh - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/otp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid refresh token', async () => {
      const res = await app.request('/api/member/otp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'invalid.token.here' }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject an access token used as refresh token', async () => {
      // An access token has a different "type" claim, so verifyRefreshToken rejects it
      const tokens = generateMemberTokens({
        id: TEST_MEMBER_ID,
        memberCode: 'M000001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });

      const res = await app.request('/api/member/otp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.accessToken }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Tests (DB needed)
  // ---------------------------------------------------------------------------

  describe('integration', () => {
    beforeAll(async () => {
      if (!dbAvailable) return;
      await createTestFixtures();
    });

    afterAll(async () => {
      if (!dbAvailable) return;
      // Clean up OTP tokens
      const { db, otpTokens } = await import('../src/db/index.js');
      const { eq } = await import('drizzle-orm');
      await db.delete(otpTokens).where(eq(otpTokens.identifier, '0912345678'));
      await db.delete(otpTokens).where(eq(otpTokens.identifier, 'member@test.test'));
      await cleanupTestFixtures();
    });

    it('POST /send should accept valid phone OTP request', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '0912345678',
          type: 'phone',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('POST /send should accept valid email OTP request', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'member@test.test',
          type: 'email',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('POST /verify should reject wrong code', async () => {
      if (!dbAvailable) return;

      // Send OTP first
      await app.request('/api/member/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '0912345678',
          type: 'phone',
        }),
      });

      // Try to verify with wrong code
      const res = await app.request('/api/member/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '0912345678',
          type: 'phone',
          code: '000000',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('POST /refresh should reject token for non-existent member', async () => {
      if (!dbAvailable) return;

      const tokens = generateMemberTokens({
        id: '00000000-0000-0000-0000-ffffffffffff',
        memberCode: 'GHOST',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });

      const res = await app.request('/api/member/otp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('MEMBER_NOT_FOUND');
    });

    it('POST /refresh should succeed with valid refresh token for existing member', async () => {
      if (!dbAvailable) return;

      const tokens = generateMemberTokens({
        id: TEST_MEMBER_ID,
        memberCode: 'M000001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });

      const res = await app.request('/api/member/otp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('accessToken');
      expect(data.data).toHaveProperty('refreshToken');
    });
  });
});
