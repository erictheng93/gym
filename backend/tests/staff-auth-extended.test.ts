import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  TEST_USER_PASSWORD,
} from './helpers.js';

// =============================================================================
// Staff Auth Extended Tests
// Tests for endpoints NOT covered in auth.test.ts:
//   POST /api/auth/change-password
//   POST /api/auth/refresh
//   GET  /api/auth/me/permissions
// =============================================================================

describe('Staff Auth - Extended', () => {
  // ---------------------------------------------------------------------------
  // Auth rejection (no DB needed)
  // ---------------------------------------------------------------------------

  describe('auth rejection', () => {
    it('POST /change-password without auth should return 401', async () => {
      const res = await app.request('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /refresh without auth should return 401', async () => {
      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('GET /me/permissions without auth should return 401', async () => {
      const res = await app.request('/api/auth/me/permissions', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration tests (DB needed)
  // ---------------------------------------------------------------------------

  describe('integration', () => {
    let token: string;

    beforeAll(async () => {
      if (!dbAvailable) return;
      await createTestFixtures();
      token = await getAuthToken();
    });

    afterAll(async () => {
      if (!dbAvailable) return;
      await cleanupTestFixtures();
    });

    describe('POST /api/auth/change-password', () => {
      it('should reject wrong current password', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: 'WrongPassword123!',
            newPassword: 'BrandNew123!',
          }),
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.success).toBe(false);
      });

      it('should validate request body', async () => {
        if (!dbAvailable) return;

        // Missing newPassword
        const res = await app.request('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: TEST_USER_PASSWORD,
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should change password successfully', async () => {
        if (!dbAvailable) return;

        // Get a fresh token (previous tests may have invalidated sessions)
        const freshToken = await getAuthToken();

        const res = await app.request('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            currentPassword: TEST_USER_PASSWORD,
            newPassword: 'BrandNew123!',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh session and return new token', async () => {
        if (!dbAvailable) return;

        // Need a fresh login since change-password invalidates sessions
        const freshToken = await getAuthToken();

        const res = await app.request('/api/auth/refresh', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${freshToken}`,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('token');
        expect(data.data).toHaveProperty('expiresAt');
        expect(data.data.token).not.toBe(freshToken);
      });
    });

    describe('GET /api/auth/me/permissions', () => {
      it('should return permissions for authenticated user', async () => {
        if (!dbAvailable) return;

        const freshToken = await getAuthToken();

        const res = await app.request('/api/auth/me/permissions', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshToken}`,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('employeeStatus');
        expect(data.data).toHaveProperty('permissions');
        expect(data.data.employeeStatus).toBe('active');
      });
    });
  });
});
