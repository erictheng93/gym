import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
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
    });
  });
});
