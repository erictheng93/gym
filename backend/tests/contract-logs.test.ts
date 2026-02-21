import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_CONTRACT_ID,
  TEST_MEMBER_ID,
} from './helpers.js';

describe('Contract Logs API', () => {
  let authToken: string;
  let createdLogId: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('POST /api/contract-logs', () => {
    it('should create a contract log', async () => {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      const endDateStr = endDate.toISOString().split('T')[0];

      const response = await authRequest('/api/contract-logs', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          contractId: TEST_CONTRACT_ID,
          logType: 'PAUSE',
          startDate: today,
          endDate: endDateStr,
          days: 7,
          reason: 'Vacation',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.contractId).toBe(TEST_CONTRACT_ID);
      expect(data.data.logType).toBe('PAUSE');
      expect(data.data.days).toBe(7);
      expect(data.data.reason).toBe('Vacation');

      createdLogId = data.data.id;
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/contract-logs', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing contractId, logType, startDate, endDate
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for invalid contractId', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await authRequest('/api/contract-logs', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          contractId: '00000000-0000-0000-0000-999999999999',
          logType: 'EXTEND',
          startDate: today,
          endDate: today,
          days: 0,
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should create a log with optional fields', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await authRequest('/api/contract-logs', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          contractId: TEST_CONTRACT_ID,
          logType: 'TRANSFER',
          startDate: today,
          endDate: today,
          days: 0,
          reason: 'Transfer to another member',
          originalMemberId: TEST_MEMBER_ID,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.logType).toBe('TRANSFER');
      expect(data.data.originalMemberId).toBe(TEST_MEMBER_ID);
    });
  });

  describe('GET /api/contract-logs', () => {
    it('should list contract logs with pagination', async () => {
      const response = await authRequest('/api/contract-logs', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('pagination');
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by contractId', async () => {
      const response = await authRequest(`/api/contract-logs?contractId=${TEST_CONTRACT_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((log: { contractId: string }) => {
        expect(log.contractId).toBe(TEST_CONTRACT_ID);
      });
    });

    it('should filter by logType', async () => {
      const response = await authRequest('/api/contract-logs?logType=PAUSE', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((log: { logType: string }) => {
        expect(log.logType).toBe('PAUSE');
      });
    });
  });

  describe('GET /api/contract-logs/contract/:contractId', () => {
    it('should get logs for a specific contract', async () => {
      const response = await authRequest(`/api/contract-logs/contract/${TEST_CONTRACT_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for non-existent contract', async () => {
      const response = await authRequest('/api/contract-logs/contract/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/contract-logs/:id', () => {
    it('should get a single log with joined data', async () => {
      const response = await authRequest(`/api/contract-logs/${createdLogId}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(createdLogId);
      expect(data.data).toHaveProperty('contract');
      expect(data.data).toHaveProperty('member');
      expect(data.data.contract.id).toBe(TEST_CONTRACT_ID);
    });

    it('should return 404 for non-existent log', async () => {
      const response = await authRequest('/api/contract-logs/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
