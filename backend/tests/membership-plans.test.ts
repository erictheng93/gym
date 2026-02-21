import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_PLAN_ID,
  TEST_COUNT_PLAN_ID,
  TEST_BRANCH_ID,
} from './helpers.js';

describe('Membership Plans API', () => {
  let authToken: string;
  let createdPlanId: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/membership-plans', () => {
    it('should list membership plans', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // Should have at least the 2 test plans (TIME_BASED + COUNT_BASED)
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by branchId', async () => {
      const response = await authRequest(`/api/membership-plans?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((plan: { branchId: string }) => {
        expect(plan.branchId).toBe(TEST_BRANCH_ID);
      });
    });

    it('should filter by planType', async () => {
      const response = await authRequest('/api/membership-plans?planType=TIME_BASED', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((plan: { planType: string }) => {
        expect(plan.planType).toBe('TIME_BASED');
      });
    });

    it('should filter activeOnly', async () => {
      const response = await authRequest('/api/membership-plans?activeOnly=true', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((plan: { isActive: boolean }) => {
        expect(plan.isActive).toBe(true);
      });
    });
  });

  describe('GET /api/membership-plans/:id', () => {
    it('should get a single plan with branch info', async () => {
      const response = await authRequest(`/api/membership-plans/${TEST_PLAN_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_PLAN_ID);
      expect(data.data.name).toBe('Test Monthly Plan');
      expect(data.data.planType).toBe('TIME_BASED');
      expect(data.data).toHaveProperty('branch');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await authRequest('/api/membership-plans/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/membership-plans', () => {
    it('should create a TIME_BASED plan', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'New Quarterly Plan',
          code: 'PLAN_Q1',
          planType: 'TIME_BASED',
          durationMonths: 3,
          price: 2500,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Quarterly Plan');
      expect(data.data.planType).toBe('TIME_BASED');
      expect(data.data.durationMonths).toBe(3);

      createdPlanId = data.data.id;
    });

    it('should create a COUNT_BASED plan', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'New 20-Class Pack',
          code: 'PLAN_20C',
          planType: 'COUNT_BASED',
          classCounts: 20,
          price: 4000,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.planType).toBe('COUNT_BASED');
      expect(data.data.classCounts).toBe(20);
    });

    it('should reject TIME_BASED without durationMonths', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Bad Time Plan',
          code: 'BAD_T',
          planType: 'TIME_BASED',
          price: 1000,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject COUNT_BASED without classCounts', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Bad Count Plan',
          code: 'BAD_C',
          planType: 'COUNT_BASED',
          price: 1000,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject invalid branchId', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Orphan Plan',
          code: 'ORPHAN',
          planType: 'TIME_BASED',
          durationMonths: 1,
          price: 500,
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/membership-plans', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing name, code, planType, price
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/membership-plans/:id', () => {
    it('should update a plan', async () => {
      const response = await authRequest(`/api/membership-plans/${createdPlanId}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          name: 'Updated Quarterly Plan',
          price: 2800,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Quarterly Plan');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await authRequest('/api/membership-plans/00000000-0000-0000-0000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ name: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/membership-plans/:id', () => {
    it('should soft-delete a plan (set isActive=false)', async () => {
      const response = await authRequest(`/api/membership-plans/${createdPlanId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify the plan is now inactive
      const getResponse = await authRequest(`/api/membership-plans/${createdPlanId}`, {
        method: 'GET',
        token: authToken,
      });

      const getData = await getResponse.json();
      expect(getData.data.isActive).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await authRequest('/api/membership-plans/00000000-0000-0000-0000-999999999999', {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
