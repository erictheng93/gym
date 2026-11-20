import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
} from './helpers.js';

describe('Dashboard API', () => {
  let token: string;

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests to /api/dashboard/overview', async () => {
      const response = await app.request('/api/dashboard/overview', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to /api/dashboard/revenue-trend', async () => {
      const response = await app.request('/api/dashboard/revenue-trend', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/dashboard/overview', () => {
    it('should return overview stats with aggregated member, contract, revenue, and check-in counts', async () => {
      const response = await authRequest('/api/dashboard/overview', {
        method: 'GET',
        token,
      });

      const data = await response.json();
      expect(data.error).toBeUndefined();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();

      // Members stats
      expect(data.data.members).toBeDefined();
      expect(typeof data.data.members.total).toBe('number');
      expect(typeof data.data.members.active).toBe('number');
      expect(typeof data.data.members.newThisMonth).toBe('number');

      // Contracts stats
      expect(data.data.contracts).toBeDefined();
      expect(typeof data.data.contracts.active).toBe('number');
      expect(typeof data.data.contracts.expiringSoon).toBe('number');

      // Revenue stats
      expect(data.data.revenue).toBeDefined();
      expect(typeof data.data.revenue.thisMonth).toBe('number');
      expect(typeof data.data.revenue.lastMonth).toBe('number');
      expect(typeof data.data.revenue.growth).toBe('number');

      // Check-ins stats
      expect(data.data.checkIns).toBeDefined();
      expect(typeof data.data.checkIns.today).toBe('number');
      expect(typeof data.data.checkIns.thisMonth).toBe('number');
    });

    it('should support filtering by branchId', async () => {
      const response = await authRequest(`/api/dashboard/overview?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.members).toBeDefined();
    });
  });

  describe('GET /api/dashboard/revenue-trend', () => {
    it('should return revenue trend with daily period by default', async () => {
      const response = await authRequest('/api/dashboard/revenue-trend', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should return revenue trend with monthly period', async () => {
      const response = await authRequest('/api/dashboard/revenue-trend?period=monthly', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
