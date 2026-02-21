import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Tenant Route Tests
// Endpoints:
//   GET /api/tenant
//   GET /api/tenant/quota
//   GET /api/tenant/quota/check/:resource
// =============================================================================

describe('Tenant Routes', () => {
  // ---------------------------------------------------------------------------
  // Auth Rejection (no DB needed)
  // ---------------------------------------------------------------------------

  describe('auth rejection', () => {
    it('GET /api/tenant should reject unauthenticated request', async () => {
      const res = await app.request('/api/tenant', { method: 'GET' });
      expect(res.status).toBe(401);
    });

    it('GET /api/tenant/quota should reject unauthenticated request', async () => {
      const res = await app.request('/api/tenant/quota', { method: 'GET' });
      expect(res.status).toBe(401);
    });

    it('GET /api/tenant/quota/check/members should reject unauthenticated request', async () => {
      const res = await app.request('/api/tenant/quota/check/members', { method: 'GET' });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Tests (DB needed)
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

    describe('GET /api/tenant', () => {
      it('should return tenant information', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('id');
        expect(data.data).toHaveProperty('name');
        expect(data.data.id).toBe(TEST_TENANT_ID);
        expect(data.data.name).toBe('Test Gym');
      });
    });

    describe('GET /api/tenant/quota', () => {
      it('should return quota usage', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant/quota', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('members');
        expect(data.data).toHaveProperty('employees');
        expect(data.data).toHaveProperty('branches');
        expect(data.data).toHaveProperty('storage');
        expect(data.data.members).toHaveProperty('current');
        expect(data.data.members).toHaveProperty('limit');
        expect(data.data.members).toHaveProperty('available');
      });
    });

    describe('GET /api/tenant/quota/check/:resource', () => {
      it('should check members quota', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant/quota/check/members', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.resource).toBe('members');
        expect(data.data).toHaveProperty('canCreate');
        expect(data.data).toHaveProperty('current');
        expect(data.data).toHaveProperty('limit');
      });

      it('should check employees quota', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant/quota/check/employees', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.resource).toBe('employees');
      });

      it('should check branches quota', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant/quota/check/branches', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.resource).toBe('branches');
      });

      it('should reject invalid resource type', async () => {
        if (!dbAvailable) return;

        const res = await app.request('/api/tenant/quota/check/invalid', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': TEST_TENANT_ID,
          },
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.success).toBe(false);
      });
    });
  });
});
