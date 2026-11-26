import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { db, employees, users } from '../src/db/index.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_COACH_EMAIL,
  TEST_COACH_PASSWORD,
  TEST_COACH_EMPLOYEE_ID,
  TEST_COACH_USER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Coach Auth Route Tests
// Endpoints:
//   POST /api/coach/auth/login
//   POST /api/coach/auth/refresh
//   POST /api/coach/auth/change-password
//   GET  /api/coach/auth/me
// Token-level behavior (signature, expiry, token type) is unit-tested in
// coach-jwt.test.ts; here we only check that the routes enforce it.
// =============================================================================

const COACH_TOKEN_HEADER = 'X-Coach-Token';

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function login(body: Record<string, unknown>) {
  return postJson('/api/coach/auth/login', body);
}

function base64url(data: string | Buffer) {
  return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build an HS256 JWT signed with an arbitrary secret. */
function forgeJwt(secret: string, payload: Record<string, unknown>) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${base64url(signature)}`;
}

const coachIdentity = {
  id: TEST_COACH_EMPLOYEE_ID,
  employeeCode: 'COACH001',
  branchId: TEST_BRANCH_ID,
  tenantId: TEST_TENANT_ID,
  jobTitle: 'COACH',
};

describe('Coach Auth API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  describe('POST /api/coach/auth/login', () => {
    it('logs in with email and password and returns coach, branch and tokens', async () => {
      const response = await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('登入成功');
      expect(data.coach).toEqual({
        id: TEST_COACH_EMPLOYEE_ID,
        employee_code: 'COACH001',
        full_name: 'Test Coach',
        email: TEST_COACH_EMAIL,
        branch_id: TEST_BRANCH_ID,
        job_title: '教練',
      });
      expect(data.branch.id).toBe(TEST_BRANCH_ID);
      expect(data.expires_in).toBe(86400);
      expect(data.access_token.split('.')).toHaveLength(3);
      expect(data.refresh_token.split('.')).toHaveLength(3);

      // The issued access token carries the coach's identity and tenant
      const me = await app.request('/api/coach/auth/me', {
        headers: { [COACH_TOKEN_HEADER]: data.access_token },
      });
      expect(me.status).toBe(200);
    });

    it('logs in with employee_code and password', async () => {
      const response = await login({ employee_code: 'COACH001', password: TEST_COACH_PASSWORD });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.coach.employee_code).toBe('COACH001');
      expect(data.coach.id).toBe(TEST_COACH_EMPLOYEE_ID);
    });

    it('records the last login time', async () => {
      const before = Date.now();
      await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD });

      const [user] = await db.select().from(users).where(eq(users.id, TEST_COACH_USER_ID));
      expect(user.lastLoginAt).not.toBeNull();
      expect(user.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('rejects an unknown email with INVALID_CREDENTIALS', async () => {
      const response = await login({ email: 'nonexistent@gym-nexus.test', password: TEST_COACH_PASSWORD });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects a wrong password with the same INVALID_CREDENTIALS error (no account enumeration)', async () => {
      const response = await login({ email: TEST_COACH_EMAIL, password: 'WrongPassword123!' });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_CREDENTIALS');

      const unknown = await (await login({ email: 'nobody@gym-nexus.test', password: 'x' })).json();
      expect(unknown.message).toBe(data.message);
    });

    it('rejects an empty password, an empty body and a missing identifier with 400', async () => {
      expect((await login({ email: TEST_COACH_EMAIL, password: '' })).status).toBe(400);
      expect((await login({})).status).toBe(400);
      expect((await login({ password: 'SomePass123!' })).status).toBe(400);
      expect((await login({ email: TEST_COACH_EMAIL })).status).toBe(400);
    });

    it('rejects a resigned employee with 403 ACCOUNT_INACTIVE', async () => {
      await db.update(employees).set({ status: 'RESIGNED' }).where(eq(employees.id, TEST_COACH_EMPLOYEE_ID));
      try {
        const response = await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD });

        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('ACCOUNT_INACTIVE');
      } finally {
        await db.update(employees).set({ status: 'ACTIVE' }).where(eq(employees.id, TEST_COACH_EMPLOYEE_ID));
      }
    });

    it('rejects a deactivated user account with 403 ACCOUNT_INACTIVE', async () => {
      await db.update(users).set({ isActive: false }).where(eq(users.id, TEST_COACH_USER_ID));
      try {
        const response = await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD });

        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('ACCOUNT_INACTIVE');
      } finally {
        await db.update(users).set({ isActive: true }).where(eq(users.id, TEST_COACH_USER_ID));
      }
    });
  });

  describe('POST /api/coach/auth/refresh', () => {
    it('issues a new working token pair for a valid refresh_token', async () => {
      const loginData = await (await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD })).json();

      const response = await postJson('/api/coach/auth/refresh', { refresh_token: loginData.refresh_token });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.expires_in).toBe(86400);
      expect(data.refresh_token).not.toBe(loginData.refresh_token);

      const me = await app.request('/api/coach/auth/me', {
        headers: { [COACH_TOKEN_HEADER]: data.access_token },
      });
      expect(me.status).toBe(200);
      expect((await me.json()).data.id).toBe(TEST_COACH_EMPLOYEE_ID);
    });

    it('rejects an invalid refresh token with INVALID_TOKEN', async () => {
      const response = await postJson('/api/coach/auth/refresh', { refresh_token: 'invalid.refresh.token' });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_TOKEN');
    });

    it('rejects an access token used as refresh token', async () => {
      const { accessToken } = generateCoachTokens(coachIdentity);

      const response = await postJson('/api/coach/auth/refresh', { refresh_token: accessToken });

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('INVALID_TOKEN');
    });

    it('rejects an expired refresh token', async () => {
      const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const { refreshToken } = generateCoachTokens(coachIdentity);
      spy.mockRestore();

      const response = await postJson('/api/coach/auth/refresh', { refresh_token: refreshToken });

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('INVALID_TOKEN');
    });

    it('rejects a missing refresh_token with 400', async () => {
      const response = await postJson('/api/coach/auth/refresh', {});

      expect(response.status).toBe(400);
    });

    it('refuses to refresh for a resigned employee with 403', async () => {
      const { refreshToken } = generateCoachTokens(coachIdentity);

      await db.update(employees).set({ status: 'RESIGNED' }).where(eq(employees.id, TEST_COACH_EMPLOYEE_ID));
      try {
        const response = await postJson('/api/coach/auth/refresh', { refresh_token: refreshToken });

        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('ACCOUNT_INACTIVE');
      } finally {
        await db.update(employees).set({ status: 'ACTIVE' }).where(eq(employees.id, TEST_COACH_EMPLOYEE_ID));
      }
    });
  });

  describe('GET /api/coach/auth/me', () => {
    it('returns the current coach info with a valid token', async () => {
      const token = await getCoachToken();

      const response = await app.request('/api/coach/auth/me', {
        method: 'GET',
        headers: { [COACH_TOKEN_HEADER]: token, 'X-Tenant-Id': TEST_TENANT_ID },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: TEST_COACH_EMPLOYEE_ID,
        email: TEST_COACH_EMAIL,
        employee_code: 'COACH001',
        full_name: 'Test Coach',
        branch_id: TEST_BRANCH_ID,
        status: 'ACTIVE',
      });
    });

    it('rejects a request without a token', async () => {
      const response = await app.request('/api/coach/auth/me', { method: 'GET' });

      expect(response.status).toBe(401);
    });

    it('rejects garbage tokens', async () => {
      for (const token of ['invalid-token', 'garbage', 'a.b.c']) {
        const response = await app.request('/api/coach/auth/me', {
          headers: { [COACH_TOKEN_HEADER]: token },
        });
        expect(response.status).toBe(401);
      }
    });

    it('rejects an expired access token', async () => {
      const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 25 * 60 * 60 * 1000);
      const { accessToken } = generateCoachTokens(coachIdentity);
      spy.mockRestore();

      const response = await app.request('/api/coach/auth/me', {
        headers: { [COACH_TOKEN_HEADER]: accessToken },
      });

      expect(response.status).toBe(401);
    });

    it('rejects an access token signed with the wrong secret', async () => {
      const now = Math.floor(Date.now() / 1000);
      const forged = forgeJwt('some-other-secret', {
        type: 'coach',
        sub: TEST_COACH_EMPLOYEE_ID,
        employeeCode: 'COACH001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
        jobTitle: 'COACH',
        iat: now,
        exp: now + 3600,
      });

      const response = await app.request('/api/coach/auth/me', {
        headers: { [COACH_TOKEN_HEADER]: forged },
      });

      expect(response.status).toBe(401);
    });

    it('rejects a refresh token and a member token used as an access token', async () => {
      const { refreshToken } = generateCoachTokens(coachIdentity);
      const memberToken = generateMemberTokens({
        id: TEST_COACH_EMPLOYEE_ID,
        memberCode: 'M000001',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).accessToken;

      for (const token of [refreshToken, memberToken]) {
        const response = await app.request('/api/coach/auth/me', {
          headers: { [COACH_TOKEN_HEADER]: token },
        });
        expect(response.status).toBe(401);
      }
    });
  });

  describe('POST /api/coach/auth/change-password', () => {
    it('changes the password: new one works, old one stops working', async () => {
      const token = await getCoachToken();
      const newPassword = 'NewCoachPass456!';

      try {
        const response = await postJson(
          '/api/coach/auth/change-password',
          { current_password: TEST_COACH_PASSWORD, new_password: newPassword },
          { [COACH_TOKEN_HEADER]: token, 'X-Tenant-Id': TEST_TENANT_ID }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.message).toBe('密碼變更成功');

        expect((await login({ email: TEST_COACH_EMAIL, password: newPassword })).status).toBe(200);
        expect((await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD })).status).toBe(401);
      } finally {
        // Restore the original password for the other tests, whatever happened above
        const restoreToken = await login({ email: TEST_COACH_EMAIL, password: newPassword })
          .then(r => r.json())
          .then(d => d.access_token as string | undefined);
        if (restoreToken) {
          await postJson(
            '/api/coach/auth/change-password',
            { current_password: newPassword, new_password: TEST_COACH_PASSWORD },
            { [COACH_TOKEN_HEADER]: restoreToken }
          );
        }
      }

      expect((await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD })).status).toBe(200);
    });

    it('rejects a wrong current password with WRONG_PASSWORD and keeps the old password', async () => {
      const token = await getCoachToken();

      const response = await postJson(
        '/api/coach/auth/change-password',
        { current_password: 'WrongCurrentPass!', new_password: 'NewCoachPass456!' },
        { [COACH_TOKEN_HEADER]: token }
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('WRONG_PASSWORD');

      expect((await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD })).status).toBe(200);
    });

    it('rejects a new password shorter than 8 characters with 400', async () => {
      const token = await getCoachToken();

      const response = await postJson(
        '/api/coach/auth/change-password',
        { current_password: TEST_COACH_PASSWORD, new_password: 'short' },
        { [COACH_TOKEN_HEADER]: token }
      );

      expect(response.status).toBe(400);
      expect((await login({ email: TEST_COACH_EMAIL, password: TEST_COACH_PASSWORD })).status).toBe(200);
    });

    it('requires a valid coach token', async () => {
      const body = { current_password: 'Old123!', new_password: 'NewPass123!' };

      expect((await postJson('/api/coach/auth/change-password', body)).status).toBe(401);
      expect(
        (await postJson('/api/coach/auth/change-password', body, { [COACH_TOKEN_HEADER]: 'invalid-token' })).status
      ).toBe(401);
    });
  });
});
