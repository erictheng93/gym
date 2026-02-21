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
// Member Auth Route Tests
// Endpoints:
//   POST /api/member/auth/login
//   GET  /api/member/auth/has-password
//   POST /api/member/auth/set-password
//   POST /api/member/auth/change-password
//   POST /api/member/auth/forgot-password
//   POST /api/member/auth/reset-password
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';

// Generate a valid member token for auth-protected endpoint tests
function getMemberAccessToken() {
  const tokens = generateMemberTokens({
    id: TEST_MEMBER_ID,
    memberCode: 'M000001',
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
  });
  return tokens.accessToken;
}

describe('Member Auth Routes', () => {
  // ---------------------------------------------------------------------------
  // Validation Tests (no DB needed)
  // ---------------------------------------------------------------------------

  describe('POST /api/member/auth/login - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'SomePass123!',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject password shorter than 8 chars', async () => {
      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'short',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/member/auth/forgot-password - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const res = await app.request('/api/member/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad-email' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/member/auth/reset-password - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/member/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject weak password (no uppercase)', async () => {
      const res = await app.request('/api/member/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'some.fake.token',
          password: 'alllower1',
          confirmPassword: 'alllower1',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject mismatched passwords', async () => {
      const res = await app.request('/api/member/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'some.fake.token',
          password: 'ValidPass1',
          confirmPassword: 'DifferentPass1',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid reset token', async () => {
      const res = await app.request('/api/member/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid.reset.token',
          password: 'ValidPass1',
          confirmPassword: 'ValidPass1',
        }),
      });
      // Token verification fails before DB → returns 400
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_TOKEN');
    });
  });

  // ---------------------------------------------------------------------------
  // Auth Rejection Tests (no DB needed - JWT validated without DB)
  // ---------------------------------------------------------------------------

  describe('protected endpoints - auth rejection', () => {
    it('GET /has-password without token should return 401', async () => {
      const res = await app.request('/api/member/auth/has-password', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('GET /has-password with invalid token should return 401', async () => {
      const res = await app.request('/api/member/auth/has-password', {
        method: 'GET',
        headers: { [MEMBER_TOKEN_HEADER]: 'invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('POST /set-password without token should return 401', async () => {
      const res = await app.request('/api/member/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: 'ValidPass1',
          confirmPassword: 'ValidPass1',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /change-password without token should return 401', async () => {
      const res = await app.request('/api/member/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Tests (DB needed)
  // ---------------------------------------------------------------------------

  describe('integration', () => {
    const TEST_MEMBER_PASSWORD = 'MemberPass1';

    beforeAll(async () => {
      if (!dbAvailable) return;
      await createTestFixtures();

      // Create member credentials for password-based login
      const { hash } = await import('@node-rs/argon2');
      const { db, memberCredentials } = await import('../src/db/index.js');
      const passwordHash = await hash(TEST_MEMBER_PASSWORD, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        outputLen: 32,
      });
      await db.insert(memberCredentials).values({
        memberId: TEST_MEMBER_ID,
        passwordHash,
        lastPasswordChangeAt: new Date(),
      }).onConflictDoNothing();
    });

    afterAll(async () => {
      if (!dbAvailable) return;
      // Clean up member credentials first
      const { db, memberCredentials } = await import('../src/db/index.js');
      const { eq } = await import('drizzle-orm');
      await db.delete(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      await cleanupTestFixtures();
    });

    it('POST /login should authenticate with correct credentials', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'member@test.test',
          password: TEST_MEMBER_PASSWORD,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('accessToken');
      expect(data.data).toHaveProperty('refreshToken');
      expect(data.data).toHaveProperty('expiresIn');
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
    });

    it('POST /login should reject wrong password', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'member@test.test',
          password: 'WrongPass1',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('POST /login should reject non-existent member', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nobody@test.test',
          password: 'SomePass123!',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('GET /has-password should return true for member with password', async () => {
      if (!dbAvailable) return;

      const accessToken = getMemberAccessToken();
      const res = await app.request('/api/member/auth/has-password', {
        method: 'GET',
        headers: { [MEMBER_TOKEN_HEADER]: accessToken },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hasPassword).toBe(true);
    });

    it('POST /change-password should reject wrong current password', async () => {
      if (!dbAvailable) return;

      const accessToken = getMemberAccessToken();
      const res = await app.request('/api/member/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [MEMBER_TOKEN_HEADER]: accessToken,
        },
        body: JSON.stringify({
          currentPassword: 'WrongCurrent1',
          newPassword: 'NewValid123',
          confirmPassword: 'NewValid123',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('WRONG_PASSWORD');
    });

    it('POST /forgot-password should always return success (prevent enumeration)', async () => {
      if (!dbAvailable) return;

      // Non-existent email
      const res = await app.request('/api/member/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@test.test' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('POST /forgot-password should return success for existing member', async () => {
      if (!dbAvailable) return;

      const res = await app.request('/api/member/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@test.test' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
