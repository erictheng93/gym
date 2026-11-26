import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import app from '../src/app.js';
import { db, members, memberCredentials } from '../src/db/index.js';
import { generateMemberTokens, generateRecoveryToken } from '../src/services/member-jwt.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
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

// Must match the route's hashing options so test-created hashes verify there
const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

/** Build an HS256 JWT signed with an arbitrary secret. */
function forgeJwt(secret: string, payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest().toString('base64url');
  return `${header}.${body}.${signature}`;
}

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

    it('rejects expired, wrong-secret, refresh and coach tokens on a protected route', async () => {
      const identity = {
        id: TEST_MEMBER_ID,
        memberCode: 'M000001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      };

      const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 2 * 60 * 60 * 1000);
      const expired = generateMemberTokens(identity).accessToken;
      spy.mockRestore();

      const now = Math.floor(Date.now() / 1000);
      const wrongSecret = forgeJwt('some-other-secret', {
        type: 'member',
        sub: TEST_MEMBER_ID,
        memberCode: 'M000001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
        iat: now,
        exp: now + 3600,
      });
      const refresh = generateMemberTokens(identity).refreshToken;
      const coach = generateCoachTokens({
        id: TEST_MEMBER_ID,
        employeeCode: 'EMP001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
        jobTitle: 'COACH',
      }).accessToken;

      for (const token of [expired, wrongSecret, refresh, coach]) {
        const res = await app.request('/api/member/auth/has-password', {
          headers: { [MEMBER_TOKEN_HEADER]: token },
        });
        expect(res.status).toBe(401);
      }
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
      await createTestFixtures();

      // Create member credentials for password-based login
      const passwordHash = await hash(TEST_MEMBER_PASSWORD, ARGON2_OPTIONS);
      await db.insert(memberCredentials).values({
        memberId: TEST_MEMBER_ID,
        passwordHash,
        lastPasswordChangeAt: new Date(),
      }).onConflictDoNothing();
    });

    afterAll(async () => {
      // Clean up member credentials first
      await db.delete(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      await cleanupTestFixtures();
    });

    it('POST /login should authenticate with correct credentials', async () => {

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

    it('POST /login should succeed with phone number and valid password', async () => {

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '0912345678',
          password: TEST_MEMBER_PASSWORD,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
    });

    it('POST /login should succeed with formatted dashed phone number', async () => {

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: '0912-345-678',
          password: TEST_MEMBER_PASSWORD,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
    });

    it('POST /login should succeed with member code and valid password', async () => {

      const res = await app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: 'M000001',
          password: TEST_MEMBER_PASSWORD,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
    });

    it('POST /login should reject wrong password', async () => {

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

    function login(body: Record<string, unknown>) {
      return app.request('/api/member/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    async function resetMemberPassword(memberId: string, password: string) {
      const passwordHash = await hash(password, ARGON2_OPTIONS);
      await db.update(memberCredentials)
        .set({
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        })
        .where(eq(memberCredentials.memberId, memberId));
    }

    async function createMemberWithoutPassword(memberCode: string, email: string, phone: string) {
      const [member] = await db.insert(members).values({
        fullName: `Member ${memberCode}`,
        phone,
        email,
        memberCode,
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: new Date().toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();
      return member;
    }

    it('POST /forgot-password stores a reset token for an existing member and keeps the password', async () => {
      const res = await app.request('/api/member/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@test.test' }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      expect(row.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.passwordResetExpiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(await verify(row.passwordHash, TEST_MEMBER_PASSWORD, ARGON2_OPTIONS)).toBe(true);
    });

    it('POST /login rejects a banned member with 403 MEMBER_BANNED', async () => {
      await db.update(members).set({ status: 'BANNED' }).where(eq(members.id, TEST_MEMBER_ID));
      try {
        const res = await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD });

        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('MEMBER_BANNED');
      } finally {
        await db.update(members).set({ status: 'ACTIVE' }).where(eq(members.id, TEST_MEMBER_ID));
      }
    });

    it('POST /login for a member without a password returns 400 NO_PASSWORD_SET', async () => {
      const member = await createMemberWithoutPassword('M-NOPW-01', 'nopw@test.test', '0911222333');

      const res = await login({ email: member.email, password: 'SomePass123!' });

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('NO_PASSWORD_SET');
    });

    it('POST /login locks the account after 5 failed attempts, even for the right password', async () => {
      // Earlier tests in this file leave failed attempts behind; start from a clean counter
      await db.update(memberCredentials)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      try {
        for (let attempt = 1; attempt <= 4; attempt++) {
          const res = await login({ email: 'member@test.test', password: 'WrongPass1' });
          expect(res.status).toBe(401);
          expect((await res.json()).attemptsRemaining).toBe(5 - attempt);
        }

        const fifth = await login({ email: 'member@test.test', password: 'WrongPass1' });
        expect(fifth.status).toBe(403);
        expect((await fifth.json()).code).toBe('ACCOUNT_LOCKED');

        const correct = await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD });
        expect(correct.status).toBe(403);
        expect((await correct.json()).code).toBe('ACCOUNT_LOCKED');

        const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
        expect(row.failedAttempts).toBe(5);
        expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      } finally {
        await db.update(memberCredentials)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      }
    });

    it('POST /login resets the failed-attempt counter after a successful login', async () => {
      await login({ email: 'member@test.test', password: 'WrongPass1' });
      await login({ email: 'member@test.test', password: 'WrongPass1' });

      const ok = await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD });
      expect(ok.status).toBe(200);

      const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
      expect(row.failedAttempts).toBe(0);
    });

    it('POST /set-password creates a password once, then refuses with PASSWORD_ALREADY_SET', async () => {
      const member = await createMemberWithoutPassword('M-SETPW-01', 'setpw@test.test', '0911333444');
      const token = generateMemberTokens({
        id: member.id,
        memberCode: member.memberCode,
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).accessToken;

      const hasBefore = await app.request('/api/member/auth/has-password', {
        headers: { [MEMBER_TOKEN_HEADER]: token },
      });
      expect((await hasBefore.json()).data.hasPassword).toBe(false);

      const body = JSON.stringify({ password: 'FreshPass1', confirmPassword: 'FreshPass1' });
      const first = await app.request('/api/member/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [MEMBER_TOKEN_HEADER]: token },
        body,
      });
      expect(first.status).toBe(200);

      expect((await login({ email: member.email, password: 'FreshPass1' })).status).toBe(200);

      const second = await app.request('/api/member/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [MEMBER_TOKEN_HEADER]: token },
        body,
      });
      expect(second.status).toBe(400);
      expect((await second.json()).code).toBe('PASSWORD_ALREADY_SET');
    });

    it('POST /set-password rejects weak and mismatched passwords with 400', async () => {
      const token = getMemberAccessToken();

      for (const body of [
        { password: 'alllower1', confirmPassword: 'alllower1' },
        { password: 'ValidPass1', confirmPassword: 'Different1' },
      ]) {
        const res = await app.request('/api/member/auth/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [MEMBER_TOKEN_HEADER]: token },
          body: JSON.stringify(body),
        });
        expect(res.status).toBe(400);
      }
    });

    it('POST /change-password changes the password: new one works, old one does not', async () => {
      const token = getMemberAccessToken();
      try {
        const res = await app.request('/api/member/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [MEMBER_TOKEN_HEADER]: token },
          body: JSON.stringify({
            currentPassword: TEST_MEMBER_PASSWORD,
            newPassword: 'ChangedPass1',
            confirmPassword: 'ChangedPass1',
          }),
        });
        expect(res.status).toBe(200);

        expect((await login({ email: 'member@test.test', password: 'ChangedPass1' })).status).toBe(200);
        expect((await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD })).status).toBe(401);
      } finally {
        await resetMemberPassword(TEST_MEMBER_ID, TEST_MEMBER_PASSWORD);
      }
    });

    describe('POST /reset-password with a recovery token', () => {
      async function storeRecoveryToken(expiresAt: Date) {
        const { token, hash: tokenHash } = generateRecoveryToken(TEST_MEMBER_ID);
        await db.update(memberCredentials)
          .set({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt })
          .where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
        return token;
      }

      function reset(token: string, password = 'ResetPass1') {
        return app.request('/api/member/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password, confirmPassword: password }),
        });
      }

      it('sets the new password, clears lockout and cannot be replayed', async () => {
        await db.update(memberCredentials)
          .set({ failedAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) })
          .where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
        const token = await storeRecoveryToken(new Date(Date.now() + 60 * 60 * 1000));

        try {
          const res = await reset(token);
          expect(res.status).toBe(200);
          expect((await res.json()).success).toBe(true);

          const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.memberId, TEST_MEMBER_ID));
          expect(row.failedAttempts).toBe(0);
          expect(row.lockedUntil).toBeNull();
          expect(row.passwordResetTokenHash).toBeNull();

          expect((await login({ email: 'member@test.test', password: 'ResetPass1' })).status).toBe(200);
          expect((await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD })).status).toBe(401);

          // Single use: the same token must not work twice
          const replay = await reset(token, 'AnotherPass1');
          expect(replay.status).toBe(400);
          expect((await replay.json()).code).toBe('INVALID_TOKEN');
        } finally {
          await resetMemberPassword(TEST_MEMBER_ID, TEST_MEMBER_PASSWORD);
        }
      });

      it('rejects a token whose stored expiry has passed', async () => {
        const token = await storeRecoveryToken(new Date(Date.now() - 1000));

        const res = await reset(token);

        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('INVALID_TOKEN');
        expect((await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD })).status).toBe(200);
      });

      it('rejects a validly signed token that does not match the stored hash', async () => {
        await storeRecoveryToken(new Date(Date.now() + 60 * 60 * 1000));
        const { token: otherToken } = generateRecoveryToken(TEST_MEMBER_ID);

        const res = await reset(otherToken);

        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('INVALID_TOKEN');
        expect((await login({ email: 'member@test.test', password: TEST_MEMBER_PASSWORD })).status).toBe(200);
      });

      it('rejects an access token used as a recovery token', async () => {
        await storeRecoveryToken(new Date(Date.now() + 60 * 60 * 1000));

        const res = await reset(getMemberAccessToken());

        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('INVALID_TOKEN');
      });
    });
  });
});
