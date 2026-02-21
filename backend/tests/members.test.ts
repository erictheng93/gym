import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_MEMBER_B_ID,
} from './helpers.js';

describe('Members API', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/members', () => {
    it('should list members', async () => {
      const response = await authRequest('/api/members', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('pagination');
    });

    it('should filter members by branch', async () => {
      const response = await authRequest(`/api/members?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // All returned members should belong to the specified branch
      data.data.forEach((member: { branchId: string }) => {
        expect(member.branchId).toBe(TEST_BRANCH_ID);
      });
    });

    it('should paginate results', async () => {
      const response = await authRequest('/api/members?page=1&limit=5', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/members/:id', () => {
    it('should get member by ID', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_MEMBER_ID);
      expect(data.data.fullName).toBe('Test Member');
      expect(data.data.memberCode).toBe('M000001');
    });

    it('should return 404 for non-existent member', async () => {
      const response = await authRequest('/api/members/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/members', () => {
    it('should create a new member', async () => {
      const newMember = {
        fullName: 'New Test Member',
        phone: '0987654321',
        email: 'newmember@test.test',
        branchId: TEST_BRANCH_ID,
        memberStatus: 'ACTIVE',
        gender: 'MALE',
      };

      const response = await authRequest('/api/members', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify(newMember),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.fullName).toBe(newMember.fullName);
      expect(data.data.phone).toBe(newMember.phone);
      expect(data.data.memberCode).toBeTruthy(); // Auto-generated
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/members', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing fullName
          phone: '0912345678',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid branchId', async () => {
      const response = await authRequest('/api/members', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          fullName: 'Bad Branch Member',
          phone: '0912345678',
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/members/:id', () => {
    it('should update member', async () => {
      const updates = {
        fullName: 'Updated Member Name',
        phone: '0911111111',
      };

      const response = await authRequest(`/api/members/${TEST_MEMBER_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify(updates),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.fullName).toBe(updates.fullName);
      expect(data.data.phone).toBe(updates.phone);
    });

    it('should update member branch (transfer)', async () => {
      // Transfer member to same branch (valid branchId for tenant)
      const response = await authRequest(`/api/members/${TEST_MEMBER_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.branchId).toBe(TEST_BRANCH_ID);
    });

    it('should return 400 when transferring to invalid branch', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent member', async () => {
      const response = await authRequest('/api/members/00000000-0000-0000-0000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ fullName: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 when updating a member from another tenant', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_B_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ fullName: 'Hijacked' }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/members/:id/contracts', () => {
    it('should get member contracts', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_ID}/contracts`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // Should have at least the test contract
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      // Each contract should have plan info
      expect(data.data[0]).toHaveProperty('plan');
    });

    it('should return 404 for non-existent member', async () => {
      const response = await authRequest('/api/members/00000000-0000-0000-0000-999999999999/contracts', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/members (search & filters)', () => {
    it('should search members by name', async () => {
      const response = await authRequest('/api/members?search=Test', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by status', async () => {
      const response = await authRequest('/api/members?status=ACTIVE', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((member: { status: string }) => {
        expect(member.status).toBe('ACTIVE');
      });
    });

    it('should sort by fullName ascending', async () => {
      const response = await authRequest('/api/members?sortBy=fullName&sortOrder=asc', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // Verify sorted order
      for (let i = 1; i < data.data.length; i++) {
        expect(data.data[i].fullName.localeCompare(data.data[i - 1].fullName)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('DELETE /api/members/:id', () => {
    it('should soft-delete a member (set status=SUSPENDED)', async () => {
      // Create a member to delete (don't delete the fixture member)
      const createRes = await authRequest('/api/members', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          fullName: 'Member To Delete',
          phone: '0977888999',
          branchId: TEST_BRANCH_ID,
        }),
      });
      const createData = await createRes.json();
      const deleteMemberId = createData.data.id;

      const response = await authRequest(`/api/members/${deleteMemberId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify the member status is SUSPENDED
      const getRes = await authRequest(`/api/members/${deleteMemberId}`, {
        method: 'GET',
        token: authToken,
      });

      const getData = await getRes.json();
      expect(getData.data.status).toBe('SUSPENDED');
    });

    it('should return 404 when deleting non-existent member', async () => {
      const response = await authRequest('/api/members/00000000-0000-0000-0000-999999999999', {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Tenant Isolation', () => {
    it('should return 403 when getting a member from another tenant', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_B_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when deleting a member from another tenant', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_B_ID}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when getting contracts for a member from another tenant', async () => {
      const response = await authRequest(`/api/members/${TEST_MEMBER_B_ID}/contracts`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Authorization', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const response = await app.request('/api/members');

      expect(response.status).toBe(401);
    });
  });
});
