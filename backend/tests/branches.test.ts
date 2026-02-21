import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
} from './helpers.js';

describe('Branches API', () => {
  let authToken: string;
  let createdBranchId: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/branches', () => {
    it('should list branches with stats', async () => {
      const response = await authRequest('/api/branches', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      // Each branch should have stats
      const branch = data.data[0];
      expect(branch).toHaveProperty('stats');
      expect(branch.stats).toHaveProperty('employeeCount');
      expect(branch.stats).toHaveProperty('memberCount');
    });
  });

  describe('GET /api/branches/:id', () => {
    it('should get branch with employees and stats', async () => {
      const response = await authRequest(`/api/branches/${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_BRANCH_ID);
      expect(data.data.name).toBe('Test Branch');
      expect(data.data.type).toBe('HEADQUARTER');
      expect(data.data).toHaveProperty('employees');
      expect(data.data).toHaveProperty('stats');
      expect(Array.isArray(data.data.employees)).toBe(true);
    });

    it('should return 404 for non-existent branch', async () => {
      const response = await authRequest('/api/branches/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/branches', () => {
    it('should create a new branch with auto-generated code', async () => {
      const response = await authRequest('/api/branches', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'New Branch',
          type: 'BRANCH',
          address: '123 Test Street',
          phone: '0911222333',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Branch');
      expect(data.data.type).toBe('BRANCH');
      expect(data.data.code).toBeTruthy(); // Auto-generated

      createdBranchId = data.data.id;
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/branches', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing name, type
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/branches/:id', () => {
    it('should update branch', async () => {
      const response = await authRequest(`/api/branches/${createdBranchId}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          name: 'Updated Branch Name',
          phone: '0999888777',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Branch Name');
      expect(data.data.phone).toBe('0999888777');
    });

    it('should return 404 for non-existent branch', async () => {
      const response = await authRequest('/api/branches/00000000-0000-0000-0000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ name: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/branches/:id', () => {
    it('should soft-delete a branch (set status=archived)', async () => {
      const response = await authRequest(`/api/branches/${createdBranchId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should prevent deleting HEADQUARTER branch', async () => {
      const response = await authRequest(`/api/branches/${TEST_BRANCH_ID}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should prevent deleting branch with employees', async () => {
      // The TEST_BRANCH_ID has employees, and is HEADQUARTER (already tested above).
      // Create a new branch, add an employee, then try to delete it.
      const createRes = await authRequest('/api/branches', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Branch With Staff',
          type: 'BRANCH',
        }),
      });
      const createData = await createRes.json();
      const branchWithStaffId = createData.data.id;

      // Create an employee in the new branch
      await authRequest('/api/employees', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          fullName: 'Branch Employee',
          branchId: branchWithStaffId,
          jobTitleId: (await authRequest('/api/job-titles', { method: 'GET', token: authToken }).then(r => r.json())).data[0].id,
          employmentType: 'FULL_TIME',
        }),
      });

      // Try to delete
      const deleteRes = await authRequest(`/api/branches/${branchWithStaffId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(deleteRes.status).toBe(400);

      const deleteData = await deleteRes.json();
      expect(deleteData.success).toBe(false);
    });

    it('should return 404 for non-existent branch', async () => {
      const response = await authRequest('/api/branches/00000000-0000-0000-0000-999999999999', {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Tenant Isolation', () => {
    it('should return 403 when getting a branch from another tenant', async () => {
      const response = await authRequest(`/api/branches/${TEST_BRANCH_B_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when updating a branch from another tenant', async () => {
      const response = await authRequest(`/api/branches/${TEST_BRANCH_B_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ name: 'Hijacked' }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when deleting a branch from another tenant', async () => {
      const response = await authRequest(`/api/branches/${TEST_BRANCH_B_ID}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });
  });
});
