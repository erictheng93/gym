import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, checkIns, contracts, members } from '../src/db/index.js';
import { eq, inArray } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  memberAuthRequest,
  getAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_PLAN_ID,
  TEST_COUNT_PLAN_ID,
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

  it('counts recent and older check-ins in the member statistics', async () => {
    const member = { memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID };
    const rows = await db.insert(checkIns).values([
      { ...member, checkInTime: new Date() },
      { ...member, checkInTime: new Date(Date.now() - 60 * 86400000) },
    ]).returning({ id: checkIns.id });
    try {
      const response = await memberAuthRequest('/api/member/check-in/stats');
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({ total: 2, thisMonth: 1, last30Days: 1 });
    } finally {
      await db.delete(checkIns).where(inArray(checkIns.id, rows.map(row => row.id)));
    }
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
          memberId: '00000000-0000-4000-8000-999999999999',
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
          branchId: '00000000-0000-4000-8000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('COUNT_BASED contract session deduction', () => {
    const createdMemberIds: string[] = [];

    /** A fresh member (so same-day check-ins don't collide) with one contract */
    async function memberWithContract(contract: {
      planId?: string;
      status?: 'ACTIVE' | 'PAUSED' | 'EXPIRED';
      remainingCounts?: number | null;
      endOffsetDays?: number;
    }) {
      const suffix = crypto.randomUUID().slice(0, 8);
      const todayStr = new Date().toISOString().split('T')[0];
      const end = new Date();
      end.setDate(end.getDate() + (contract.endOffsetDays ?? 90));
      const endStr = end.toISOString().split('T')[0];

      const [member] = await db.insert(members).values({
        fullName: `Count Test ${suffix}`,
        phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        memberCode: `MC${suffix}`,
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        joinDate: todayStr,
        tenantId: TEST_TENANT_ID,
      }).returning();
      createdMemberIds.push(member.id);

      const [row] = await db.insert(contracts).values({
        contractNo: `CC${suffix}`,
        memberId: member.id,
        planId: contract.planId ?? TEST_COUNT_PLAN_ID,
        startDate: todayStr,
        originalEndDate: endStr,
        endDate: endStr,
        status: contract.status ?? 'ACTIVE',
        remainingCounts: contract.remainingCounts === undefined ? 10 : contract.remainingCounts,
        totalAmount: '2000',
        paymentStatus: 'PAID',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).returning();
      return { member, contract: row };
    }

    function checkIn(memberId: string, extra: Record<string, unknown> = {}) {
      return authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({ memberId, branchId: TEST_BRANCH_ID, ...extra }),
      });
    }

    async function remainingCounts(contractId: string) {
      const [row] = await db.select().from(contracts).where(eq(contracts.id, contractId));
      return row.remainingCounts;
    }

    afterAll(async () => {
      if (createdMemberIds.length === 0) return;
      await db.delete(checkIns).where(inArray(checkIns.memberId, createdMemberIds));
      await db.delete(contracts).where(inArray(contracts.memberId, createdMemberIds));
      await db.delete(members).where(inArray(members.id, createdMemberIds));
    });

    it('deducts one session per check-in and not again for a same-day repeat', async () => {
      const { member, contract } = await memberWithContract({ remainingCounts: 10 });

      expect((await checkIn(member.id)).status).toBe(201);
      expect(await remainingCounts(contract.id)).toBe(9);

      const repeat = await checkIn(member.id);
      expect(repeat.status).toBe(200);
      expect((await repeat.json()).data.alreadyCheckedIn).toBe(true);
      expect(await remainingCounts(contract.id)).toBe(9);
    });

    it('does not touch remainingCounts of a TIME_BASED contract', async () => {
      const { member, contract } = await memberWithContract({ planId: TEST_PLAN_ID, remainingCounts: null });

      expect((await checkIn(member.id)).status).toBe(201);
      expect(await remainingCounts(contract.id)).toBeNull();
    });

    it('rejects a member whose only contract is PAUSED or expired', async () => {
      const paused = await memberWithContract({ status: 'PAUSED' });
      const expired = await memberWithContract({ endOffsetDays: -1 });

      for (const { member, contract } of [paused, expired]) {
        const response = await checkIn(member.id);
        expect(response.status).toBe(400);
        expect((await response.json()).data.hasActiveContract).toBe(false);
        expect(await remainingCounts(contract.id)).toBe(10);
      }
    });

    // BUG: POST /api/check-ins (src/routes/check-ins.ts) selects the active
    // contract without requiring remainingCounts > 0, so a COUNT_BASED contract
    // with no sessions left still lets the member in (the decrement is just a
    // no-op thanks to the remainingCounts > 0 guard).
    it.skip('rejects check-in when a COUNT_BASED contract has no sessions left', async () => {
      const { member, contract } = await memberWithContract({ remainingCounts: 0 });

      const response = await checkIn(member.id);

      expect(response.status).toBe(400);
      expect(await remainingCounts(contract.id)).toBe(0);
    });

    // BUG: POST /api/check-ins only requires an ACTIVE, in-date contract when no
    // contractId is sent (`if (!activeContract && !data.contractId)`). Passing the
    // id of the member's own PAUSED/EXPIRED/CANCELLED contract skips that check
    // and the check-in is created.
    it.skip('rejects check-in with an explicit contractId of a non-active contract', async () => {
      const { member, contract } = await memberWithContract({ status: 'PAUSED' });

      const response = await checkIn(member.id, { contractId: contract.id });

      expect(response.status).toBe(400);
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
      const response = await authRequest('/api/check-ins/00000000-0000-4000-8000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
