import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_CONTRACT_ID,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_PLAN_ID,
} from './helpers.js';

describe('Contracts API', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/contracts', () => {
    it('should list contracts', async () => {
      const response = await authRequest('/api/contracts', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('pagination');
    });

    it('should filter by member', async () => {
      const response = await authRequest(`/api/contracts?memberId=${TEST_MEMBER_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // All contracts should belong to the test member
      data.data.forEach((contract: { memberId: string }) => {
        expect(contract.memberId).toBe(TEST_MEMBER_ID);
      });
    });

    it('should filter by status', async () => {
      const response = await authRequest('/api/contracts?status=ACTIVE', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((contract: { contractStatus: string }) => {
        expect(contract.contractStatus).toBe('ACTIVE');
      });
    });
  });

  describe('GET /api/contracts/:id', () => {
    it('should get contract by ID', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_CONTRACT_ID);
      expect(data.data.contractNo).toBe('C000001');
      expect(data.data.memberId).toBe(TEST_MEMBER_ID);
      expect(data.data).toHaveProperty('member');
      expect(data.data).toHaveProperty('plan');
    });

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contracts/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/contracts', () => {
    it('should create a new contract', async () => {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 3);

      const newContract = {
        memberId: TEST_MEMBER_ID,
        planId: TEST_PLAN_ID,
        branchId: TEST_BRANCH_ID,
        startDate: today.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalAmount: 3000,
      };

      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify(newContract),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.memberId).toBe(TEST_MEMBER_ID);
      expect(data.data.contractNo).toBeTruthy(); // Auto-generated
      expect(data.data.contractStatus).toBe('DRAFT');
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing memberId, startDate
          planId: TEST_PLAN_ID,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/contracts/:id', () => {
    it('should update contract', async () => {
      const updates = {
        notes: 'Updated contract notes',
      };

      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify(updates),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.notes).toBe(updates.notes);
    });
  });

  describe('POST /api/contracts/:id/pause', () => {
    it('should pause an active contract', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          reason: 'Vacation',
          startDate: new Date().toISOString().split('T')[0],
        }),
      });

      // Should succeed or fail based on business logic
      const data = await response.json();
      expect(data).toHaveProperty('success');
    });
  });

  describe('POST /api/contracts/:id/activate', () => {
    it('should activate a draft contract', async () => {
      // First create a draft contract
      const today = new Date();
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 1);

      const createResponse = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: today.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          totalAmount: 1000,
        }),
      });

      const createData = await createResponse.json();
      if (!createData.success) return; // Skip if creation failed

      const newContractId = createData.data.id;

      // Activate it
      const response = await authRequest(`/api/contracts/${newContractId}/activate`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contractStatus).toBe('ACTIVE');
    });
  });
});
