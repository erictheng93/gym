import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_EMPLOYEE_ID,
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
// =============================================================================

const COACH_TOKEN_HEADER = 'X-Coach-Token';

function getCoachAccessToken() {
  const tokens = generateCoachTokens({
    id: TEST_EMPLOYEE_ID,
    employeeCode: 'EMP001',
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    jobTitle: 'ADMIN',
  });
  return tokens;
}

describe('Coach Auth Routes', () => {
  // ---------------------------------------------------------------------------
  // Validation Tests (no DB needed)
  // ---------------------------------------------------------------------------

  describe('POST /api/coach/auth/login - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject request without email or employee_code', async () => {
      const res = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'SomePass123!' }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject request without password', async () => {
      const res = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'coach@test.test' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/coach/auth/refresh - validation', () => {
    it('should reject empty body', async () => {
      const res = await app.request('/api/coach/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid refresh token', async () => {
      const res = await app.request('/api/coach/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: 'invalid.refresh.token' }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('INVALID_TOKEN');
    });
  });

  // ---------------------------------------------------------------------------
  // Auth Rejection Tests (no DB needed)
  // ---------------------------------------------------------------------------

  describe('protected endpoints - auth rejection', () => {
    it('POST /change-password without token should return 401', async () => {
      const res = await app.request('/api/coach/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: 'Old123!',
          new_password: 'NewPass123!',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /change-password with invalid token should return 401', async () => {
      const res = await app.request('/api/coach/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [COACH_TOKEN_HEADER]: 'invalid-token',
        },
        body: JSON.stringify({
          current_password: 'Old123!',
          new_password: 'NewPass123!',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('GET /me without token should return 401', async () => {
      const res = await app.request('/api/coach/auth/me', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('GET /me with invalid token should return 401', async () => {
      const res = await app.request('/api/coach/auth/me', {
        method: 'GET',
        headers: { [COACH_TOKEN_HEADER]: 'garbage' },
      });
      expect(res.status).toBe(401);
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
      await cleanupTestFixtures();
    });

    describe('POST /api/coach/auth/login', () => {
      it('should login with email and password', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('access_token');
        expect(data).toHaveProperty('refresh_token');
        expect(data).toHaveProperty('expires_in');
        expect(data.coach.employee_code).toBe('EMP001');
      });

      it('should login with employee_code and password', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_code: 'EMP001',
            password: TEST_USER_PASSWORD,
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.coach.employee_code).toBe('EMP001');
      });

      it('should reject wrong password', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_USER_EMAIL,
            password: 'WrongPassword!',
          }),
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.code).toBe('INVALID_CREDENTIALS');
      });

      it('should reject non-existent employee', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'nobody@test.test',
            password: TEST_USER_PASSWORD,
          }),
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.code).toBe('INVALID_CREDENTIALS');
      });
    });

    describe('POST /api/coach/auth/refresh', () => {
      it('should refresh with valid refresh token', async () => {
        if (!dbAvailable) return;

        // Login first to get real tokens
        const loginRes = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
          }),
        });
        const loginData = await loginRes.json();
        const refreshToken = loginData.refresh_token;

        const res = await app.request('/api/coach/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('access_token');
        expect(data).toHaveProperty('refresh_token');
      });
    });

    describe('GET /api/coach/auth/me', () => {
      it('should return coach profile with valid token', async () => {
        if (!dbAvailable) return;

        // Login to get a valid token
        const loginRes = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
          }),
        });
        const loginData = await loginRes.json();

        const res = await app.request('/api/coach/auth/me', {
          method: 'GET',
          headers: { [COACH_TOKEN_HEADER]: loginData.access_token },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('employee_code');
        expect(data.data).toHaveProperty('full_name');
        expect(data.data.employee_code).toBe('EMP001');
      });
    });

    describe('POST /api/coach/auth/change-password', () => {
      it('should reject wrong current password', async () => {
        if (!dbAvailable) return;

        const { accessToken } = getCoachAccessToken();

        const res = await app.request('/api/coach/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [COACH_TOKEN_HEADER]: accessToken,
          },
          body: JSON.stringify({
            current_password: 'WrongCurrent!',
            new_password: 'BrandNew123!',
          }),
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.code).toBe('WRONG_PASSWORD');
      });
    });
  });
});
