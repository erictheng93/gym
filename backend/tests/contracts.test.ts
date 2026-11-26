import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { db, contracts, contractLogs } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_CONTRACT_ID,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_PLAN_ID,
  TEST_COUNT_PLAN_ID,
  TEST_CONTRACT_B_ID,
  TEST_MEMBER_B_ID,
  TEST_PLAN_B_ID,
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
    it('should list contracts with pagination metadata', async () => {
      const response = await authRequest('/api/contracts', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('total');
      expect(data.meta).toHaveProperty('page');
      expect(data.meta).toHaveProperty('limit');
      expect(data.meta).toHaveProperty('totalPages');
    });

    it('should include member and plan info in list items', async () => {
      const response = await authRequest('/api/contracts', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      const item = data.data[0];
      expect(item).toHaveProperty('contract');
      expect(item).toHaveProperty('member');
      expect(item).toHaveProperty('plan');
    });
  });

  describe('GET /api/contracts/:id', () => {
    it('should get contract by ID with full details', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contract.id).toBe(TEST_CONTRACT_ID);
      expect(data.data.contract.memberId).toBe(TEST_MEMBER_ID);
      expect(data.data).toHaveProperty('member');
      expect(data.data).toHaveProperty('plan');
      expect(data.data).toHaveProperty('logs');
      expect(data.data).toHaveProperty('payments');
    });

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contracts/00000000-0000-4000-8000-999999999999', {
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
      expect(data.data.status).toBe('DRAFT');
    });

    it.each([
      ['member', { memberId: TEST_MEMBER_B_ID, planId: TEST_PLAN_ID }, '會員不存在'],
      ['plan', { memberId: TEST_MEMBER_ID, planId: TEST_PLAN_B_ID }, '會籍方案不存在'],
    ])('should 404 when the %s belongs to another tenant', async (_kind, ids, error) => {
      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          ...ids,
          branchId: TEST_BRANCH_ID,
          startDate: new Date().toISOString().split('T')[0],
          totalAmount: 3000,
        }),
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe(error);
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing memberId, startDate, branchId, totalAmount
          planId: TEST_PLAN_ID,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent member', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: '00000000-0000-4000-8000-999999999999',
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: today,
          totalAmount: 1000,
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid branchId', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: '00000000-0000-4000-8000-999999999999',
          startDate: today,
          totalAmount: 1000,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent planId', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: '00000000-0000-4000-8000-999999999999',
          branchId: TEST_BRANCH_ID,
          startDate: today,
          totalAmount: 1000,
        }),
      });

      expect(response.status).toBe(404);
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

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contracts/00000000-0000-4000-8000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ notes: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/contracts/:id/activate', () => {
    it('should activate a draft contract', async () => {
      // Create a draft contract
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
      expect(createData.success).toBe(true);

      const newContractId = createData.data.id;

      // Activate it
      const response = await authRequest(`/api/contracts/${newContractId}/activate`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('ACTIVE');
    });

    it('should reject activating a non-DRAFT contract', async () => {
      // TEST_CONTRACT_ID is ACTIVE (from fixtures)
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}/activate`, {
        method: 'POST',
        token: authToken,
      });

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contracts/00000000-0000-4000-8000-999999999999/activate', {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/contracts/:id/pause', () => {
    it('should pause an active contract and extend endDate', async () => {
      // Create and activate a fresh contract for pausing
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 3);
      const endDateStr = endDate.toISOString().split('T')[0];

      // Create
      const createRes = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: todayStr,
          endDate: endDateStr,
          totalAmount: 3000,
        }),
      });
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      const contractId = createData.data.id;
      const originalEndDate = createData.data.endDate;

      // Activate
      const activateRes = await authRequest(`/api/contracts/${contractId}/activate`, {
        method: 'POST',
        token: authToken,
      });
      expect((await activateRes.json()).success).toBe(true);

      // Pause with valid startDate AND endDate
      const pauseEnd = new Date(today);
      pauseEnd.setDate(pauseEnd.getDate() + 7);

      const response = await authRequest(`/api/contracts/${contractId}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          startDate: todayStr,
          endDate: pauseEnd.toISOString().split('T')[0],
          reason: 'Vacation',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('PAUSED');
      // End date is extended by exactly the pause length
      const expectedEnd = new Date(`${originalEndDate}T00:00:00Z`);
      expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 7);
      expect(data.data.endDate).toBe(expectedEnd.toISOString().split('T')[0]);
      expect(data.data.originalEndDate).toBe(originalEndDate);

      const [log] = await db.select().from(contractLogs).where(eq(contractLogs.contractId, contractId));
      expect(log).toMatchObject({ logType: 'PAUSE', daysAffected: 7, reason: 'Vacation', branchId: TEST_BRANCH_ID });
    });

    // #117: invalid ranges must be rejected without touching the contract
    async function createActiveContract() {
      const today = new Date();
      const end = new Date(today);
      end.setMonth(end.getMonth() + 3);
      const createRes = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: today.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          totalAmount: 3000,
        }),
      });
      const { data } = await createRes.json();
      await authRequest(`/api/contracts/${data.id}/activate`, { method: 'POST', token: authToken });
      return data as { id: string; endDate: string };
    }

    it.each([
      ['endDate before startDate', '2026-12-10', '2026-12-01'],
      ['endDate equal to startDate', '2026-12-01', '2026-12-01'],
      ['non-date strings', 'abc', 'xyz'],
      ['impossible calendar date', '2026-02-30', '2026-03-05'],
    ])('should reject a pause with %s (400) and leave the contract unchanged', async (_case, startDate, endDate) => {
      const contract = await createActiveContract();

      const response = await authRequest(`/api/contracts/${contract.id}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ startDate, endDate }),
      });

      expect(response.status).toBe(400);
      const [after] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
      expect(after.status).toBe('ACTIVE');
      expect(after.endDate).toBe(contract.endDate);
      const logs = await db.select().from(contractLogs).where(eq(contractLogs.contractId, contract.id));
      expect(logs).toHaveLength(0);
    });

    it('should reject pausing a non-ACTIVE contract', async () => {
      // Create a DRAFT contract (not activated) and try to pause it
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 1);

      const createRes = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: todayStr,
          endDate: endDate.toISOString().split('T')[0],
          totalAmount: 1000,
        }),
      });
      const createData = await createRes.json();
      expect(createData.success).toBe(true);

      const response = await authRequest(`/api/contracts/${createData.data.id}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          startDate: todayStr,
          endDate: endDate.toISOString().split('T')[0],
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 404 for non-existent contract', async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await authRequest('/api/contracts/00000000-0000-4000-8000-999999999999/pause', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          startDate: today.toISOString().split('T')[0],
          endDate: tomorrow.toISOString().split('T')[0],
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/contracts/:id/resume', () => {
    it('should resume a paused contract', async () => {
      // Create a fresh contract, activate it, pause it, then resume
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 3);
      const endDateStr = endDate.toISOString().split('T')[0];

      // Create
      const createRes = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID,
          branchId: TEST_BRANCH_ID,
          startDate: todayStr,
          endDate: endDateStr,
          totalAmount: 3000,
        }),
      });
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      const contractId = createData.data.id;

      // Activate
      await authRequest(`/api/contracts/${contractId}/activate`, {
        method: 'POST',
        token: authToken,
      });

      // Pause
      const pauseEnd = new Date(today);
      pauseEnd.setDate(pauseEnd.getDate() + 7);
      await authRequest(`/api/contracts/${contractId}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          startDate: todayStr,
          endDate: pauseEnd.toISOString().split('T')[0],
          reason: 'Test pause for resume',
        }),
      });

      // Resume
      const response = await authRequest(`/api/contracts/${contractId}/resume`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('ACTIVE');
    });

    it('should reject resuming a non-paused contract', async () => {
      // TEST_CONTRACT_ID is ACTIVE (from fixtures), not PAUSED
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_ID}/resume`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contracts/00000000-0000-4000-8000-999999999999/resume', {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('TIME_BASED endDate auto-calculation', () => {
    it('should auto-calculate endDate from plan durationMonths', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Create contract without providing endDate - server should calculate from plan
      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_PLAN_ID, // TIME_BASED, 1 month
          branchId: TEST_BRANCH_ID,
          startDate: todayStr,
          totalAmount: 1000,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      // The endDate should be ~1 month after startDate
      expect(data.data.endDate).toBeTruthy();
      const endDate = new Date(data.data.endDate);
      const startDate = new Date(todayStr);
      // Should be approximately 1 month later (28-31 days)
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(28);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });

  describe('COUNT_BASED contract creation', () => {
    it('should set remainingCounts from plan classCounts', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const response = await authRequest('/api/contracts', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          planId: TEST_COUNT_PLAN_ID, // COUNT_BASED, 10 classes
          branchId: TEST_BRANCH_ID,
          startDate: todayStr,
          totalAmount: 2000,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.remainingCounts).toBe(10);
      // COUNT_BASED without endDate should default to 1 year
      expect(data.data.endDate).toBeTruthy();
      const endDate = new Date(data.data.endDate);
      const startDate = new Date(todayStr);
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(364);
      expect(diffDays).toBeLessThanOrEqual(366);
    });
  });

  describe('Tenant Isolation', () => {
    // BUG: POST /api/contracts (src/routes/contracts.ts) looks up the member and
    // the plan by id only, without a tenant filter. A staff user can create a
    // contract in their own branch for another tenant's member (or with another
    // tenant's plan); the member route and POST /api/payments both scope by tenant.
    it.skip('should reject creating a contract for a member or plan of another tenant', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      for (const ids of [
        { memberId: TEST_MEMBER_B_ID, planId: TEST_PLAN_ID },
        { memberId: TEST_MEMBER_ID, planId: TEST_PLAN_B_ID },
      ]) {
        const response = await authRequest('/api/contracts', {
          method: 'POST',
          token: authToken,
          body: JSON.stringify({ ...ids, branchId: TEST_BRANCH_ID, startDate: todayStr, totalAmount: 1000 }),
        });
        expect(response.status).toBe(404);
      }
    });

    it('should return 403 when getting a contract from another tenant', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_B_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when updating a contract from another tenant', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_B_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ notes: 'Hijacked' }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when activating a contract from another tenant', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_B_ID}/activate`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when pausing a contract from another tenant', async () => {
      // A valid range, so the request reaches the tenant check
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_B_ID}/pause`, {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ startDate: '2026-12-01', endDate: '2026-12-08' }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when resuming a contract from another tenant', async () => {
      const response = await authRequest(`/api/contracts/${TEST_CONTRACT_B_ID}/resume`, {
        method: 'POST',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Authorization', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const response = await app.request('/api/contracts');

      expect(response.status).toBe(401);
    });
  });
});
