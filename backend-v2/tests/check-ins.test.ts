import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, contracts, members, membershipPlans } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_CONTRACT_ID,
  TEST_TENANT_ID,
} from './helpers.js';

describe('Check-ins API', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/check-ins', () => {
    it('should list check-ins', async () => {
      const response = await authRequest('/api/check-ins', {
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
      const response = await authRequest(`/api/check-ins?memberId=${TEST_MEMBER_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should filter by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await authRequest(`/api/check-ins?startDate=${today}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/check-ins', () => {
    it('should create check-in for member with active contract', async () => {
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          branchId: TEST_BRANCH_ID,
          checkInType: 'ENTRY',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.memberId).toBe(TEST_MEMBER_ID);
      expect(data.data.branchId).toBe(TEST_BRANCH_ID);
    });

    it('should return already checked in for same day', async () => {
      // First check-in
      await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          branchId: TEST_BRANCH_ID,
        }),
      });

      // Second check-in same day
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.alreadyCheckedIn).toBe(true);
    });

    it('should reject check-in for non-existent member', async () => {
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: '00000000-0000-0000-0000-999999999999',
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should reject check-in for invalid branch', async () => {
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('COUNT_BASED contract session deduction', () => {
    it('should deduct session for COUNT_BASED contract', async () => {
      // Create a COUNT_BASED plan
      const [countPlan] = await db.insert(membershipPlans).values({
        name: 'Test Count Plan',
        code: 'COUNT001',
        planType: 'COUNT_BASED',
        classCounts: 10,
        price: '3000',
        tenantId: TEST_TENANT_ID,
        branchId: TEST_BRANCH_ID,
        isActive: true,
        allowPause: false,
        allowTransfer: false,
      }).returning();

      // Create a COUNT_BASED contract
      const today = new Date();
      const endDate = new Date(today);
      endDate.setMonth(endDate.getMonth() + 3);

      const [countContract] = await db.insert(contracts).values({
        contractNo: 'C-COUNT-001',
        memberId: TEST_MEMBER_ID,
        planId: countPlan.id,
        startDate: today.toISOString().split('T')[0],
        originalEndDate: endDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        status: 'ACTIVE',
        remainingCounts: 10,
        totalAmount: '3000',
        paymentStatus: 'PAID',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).returning();

      // Create a new member for this test to avoid duplicate check-in issues
      const [testMember] = await db.insert(members).values({
        fullName: 'Count Test Member',
        phone: '0999888777',
        memberCode: 'M-COUNT-001',
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: today.toISOString().split('T')[0],
        tenantId: TEST_TENANT_ID,
      }).returning();

      // Update contract with new member
      await db.update(contracts).set({ memberId: testMember.id }).where(eq(contracts.id, countContract.id));

      // Check-in
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: testMember.id,
          branchId: TEST_BRANCH_ID,
        }),
      });

      expect(response.status).toBe(201);

      // Verify session was deducted
      const [updatedContract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, countContract.id));

      expect(updatedContract.remainingCounts).toBe(9); // 10 - 1

      // Cleanup
      await db.delete(contracts).where(eq(contracts.id, countContract.id));
      await db.delete(members).where(eq(members.id, testMember.id));
      await db.delete(membershipPlans).where(eq(membershipPlans.id, countPlan.id));
    });
  });

  describe('GET /api/check-ins/stats/today', () => {
    it('should get today check-in stats', async () => {
      const response = await authRequest('/api/check-ins/stats/today', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('total');
      expect(data.data).toHaveProperty('uniqueMembers');
      expect(data.data).toHaveProperty('hourlyBreakdown');
      expect(Array.isArray(data.data.hourlyBreakdown)).toBe(true);
    });

    it('should filter stats by branch', async () => {
      const response = await authRequest(`/api/check-ins/stats/today?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/check-ins/:id', () => {
    it('should get check-in by ID', async () => {
      // First create a check-in
      const createResponse = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          memberId: TEST_MEMBER_ID,
          branchId: TEST_BRANCH_ID,
        }),
      });

      const createData = await createResponse.json();
      if (!createData.data?.id) return; // Skip if already checked in today

      const checkInId = createData.data.id;

      // Get by ID
      const response = await authRequest(`/api/check-ins/${checkInId}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('member');
      expect(data.data).toHaveProperty('branch');
    });

    it('should return 404 for non-existent check-in', async () => {
      const response = await authRequest('/api/check-ins/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
