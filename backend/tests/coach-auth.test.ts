import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_COACH_EMAIL,
  TEST_COACH_PASSWORD,
  TEST_COACH_EMPLOYEE_ID,
  TEST_TENANT_ID,
} from './helpers.js';

describe('Coach Auth API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  describe('POST /api/coach/auth/login', () => {
    it('should login successfully with valid email and password', async () => {
      const response = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_COACH_EMAIL,
          password: TEST_COACH_PASSWORD,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('登入成功');
      expect(data).toHaveProperty('access_token');
      expect(data).toHaveProperty('refresh_token');
      expect(data).toHaveProperty('expires_in');
      expect(data.coach).toBeDefined();
      expect(data.coach.id).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(data.coach.email).toBe(TEST_COACH_EMAIL);
      expect(data.coach.employee_code).toBe('COACH001');
      expect(data.coach.full_name).toBe('Test Coach');
      expect(data.branch).toBeDefined();
      expect(data.branch.id).toBeDefined();
    });

    it('should login successfully with valid employee_code', async () => {
      const response = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: 'COACH001',
          password: TEST_COACH_PASSWORD,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('access_token');
      expect(data).toHaveProperty('refresh_token');
      expect(data.coach.employee_code).toBe('COACH001');
    });

    it('should reject login with invalid email', async () => {
      const response = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@gym-nexus.test',
          password: TEST_COACH_PASSWORD,
        }),
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject login with wrong password', async () => {
      const response = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_COACH_EMAIL,
          password: 'WrongPassword123!',
        }),
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject login with empty password', async () => {
      const response = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_COACH_EMAIL,
          password: '',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/coach/auth/refresh', () => {
    it('should refresh tokens with valid refresh_token', async () => {
      // Login first to get a refresh token
      const loginResponse = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_COACH_EMAIL,
          password: TEST_COACH_PASSWORD,
        }),
      });

      const loginData = await loginResponse.json();
      const refreshToken = loginData.refresh_token;

      // Refresh
      const response = await app.request('/api/coach/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('access_token');
      expect(data).toHaveProperty('refresh_token');
      expect(data).toHaveProperty('expires_in');
    });

    it('should reject refresh with invalid token', async () => {
      const response = await app.request('/api/coach/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: 'invalid-refresh-token',
        }),
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/coach/auth/me', () => {
    it('should return current coach info with valid token', async () => {
      const token = await getCoachToken();

      const response = await app.request('/api/coach/auth/me', {
        method: 'GET',
        headers: {
          'X-Coach-Token': token,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(data.data.email).toBe(TEST_COACH_EMAIL);
      expect(data.data.employee_code).toBe('COACH001');
      expect(data.data.full_name).toBe('Test Coach');
      expect(data.data.branch_id).toBeDefined();
      expect(data.data.job_title).toBeDefined();
      expect(data.data.status).toBe('ACTIVE');
    });

    it('should reject request without token', async () => {
      const response = await app.request('/api/coach/auth/me', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await app.request('/api/coach/auth/me', {
        method: 'GET',
        headers: {
          'X-Coach-Token': 'invalid-token',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/coach/auth/change-password', () => {
    it('should change password with valid credentials', async () => {
      const token = await getCoachToken();

      const response = await app.request('/api/coach/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Coach-Token': token,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
        body: JSON.stringify({
          current_password: TEST_COACH_PASSWORD,
          new_password: 'NewCoachPass456!',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('密碼變更成功');

      // Verify new password works by logging in
      const loginResponse = await app.request('/api/coach/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_COACH_EMAIL,
          password: 'NewCoachPass456!',
        }),
      });

      expect(loginResponse.status).toBe(200);

      // Restore original password for other tests
      const newToken = await getCoachToken().catch(async () => {
        // getCoachToken uses the original password which no longer works,
        // so login with the new password instead
        const res = await app.request('/api/coach/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: TEST_COACH_EMAIL,
            password: 'NewCoachPass456!',
          }),
        });
        const d = await res.json();
        return d.access_token as string;
      });

      await app.request('/api/coach/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Coach-Token': newToken,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
        body: JSON.stringify({
          current_password: 'NewCoachPass456!',
          new_password: TEST_COACH_PASSWORD,
        }),
      });
    });

    it('should reject change password with wrong current password', async () => {
      const token = await getCoachToken();

      const response = await app.request('/api/coach/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Coach-Token': token,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
        body: JSON.stringify({
          current_password: 'WrongCurrentPass!',
          new_password: 'NewCoachPass456!',
        }),
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
