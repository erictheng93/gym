import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
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
    it('should reject unauthenticated requests to overview', async () => {
      const response = await app.request('/api/dashboard/overview', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/dashboard/overview', () => {
    it('should return overview metrics with consolidated structure', async () => {
      const response = await authRequest('/api/dashboard/overview', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();

      // Check members stats
      expect(data.data.members).toBeDefined();
      expect(typeof data.data.members.total).toBe('number');
      expect(typeof data.data.members.active).toBe('number');
      expect(typeof data.data.members.newThisMonth).toBe('number');

      // Check contracts stats
      expect(data.data.contracts).toBeDefined();
      expect(typeof data.data.contracts.active).toBe('number');
      expect(typeof data.data.contracts.expiringSoon).toBe('number');

      // Check revenue stats
      expect(data.data.revenue).toBeDefined();
      expect(typeof data.data.revenue.thisMonth).toBe('number');
      expect(typeof data.data.revenue.lastMonth).toBe('number');
      expect(typeof data.data.revenue.growth).toBe('number');

      // Check check-ins stats
      expect(data.data.checkIns).toBeDefined();
      expect(typeof data.data.checkIns.today).toBe('number');
      expect(typeof data.data.checkIns.thisMonth).toBe('number');
    });
  });
});
