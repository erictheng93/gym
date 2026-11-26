import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, members, contracts, checkIns } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  memberAuthRequest,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_PLAN_ID,
  TEST_CONTRACT_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_B_ID,
  TEST_CONTRACT_B_ID,
} from './helpers.js';

// =============================================================================
// GET /api/member/contracts
// GET /api/member/check-in/history, GET /api/member/check-in/:id
// =============================================================================

const OTHER_MEMBER_ID = crypto.randomUUID();
const OTHER_CONTRACT_ID = crypto.randomUUID();
const ownCheckInIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const otherMemberCheckInId = crypto.randomUUID();
const tenantBCheckInId = crypto.randomUUID();

function tokenFor(id: string, branchId: string, tenantId: string, code: string) {
  return generateMemberTokens({ id, memberCode: code, branchId, tenantId }).accessToken;
}

describe('member contracts + check-in history/detail', () => {
  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values({
      id: OTHER_MEMBER_ID,
      fullName: 'Same Tenant Other',
      phone: '0911000222',
      memberCode: 'M000098',
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: '2026-01-01',
      tenantId: TEST_TENANT_ID,
    });
    await db.insert(contracts).values({
      id: OTHER_CONTRACT_ID,
      contractNo: 'OTHER-1',
      memberId: OTHER_MEMBER_ID,
      planId: TEST_PLAN_ID,
      startDate: '2026-01-01',
      originalEndDate: '2026-02-01',
      endDate: '2026-02-01',
      status: 'ACTIVE',
      totalAmount: '999',
      paidAmount: '999',
      paymentStatus: 'PAID',
      termsAccepted: true,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
    });
    await db.insert(checkIns).values([
      { id: ownCheckInIds[0], memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, contractId: TEST_CONTRACT_ID, checkInTime: new Date('2026-03-01T10:00:00Z'), checkInType: 'ENTRY', checkInMethod: 'QR_CODE', notes: 'staff only note' },
      { id: ownCheckInIds[1], memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, checkInTime: new Date('2026-03-02T10:00:00Z'), checkInType: 'ENTRY', checkInMethod: 'MANUAL' },
      { id: ownCheckInIds[2], memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, checkInTime: new Date('2026-03-03T10:00:00Z'), checkInType: 'FACILITY', checkInMethod: 'CARD' },
      { id: otherMemberCheckInId, memberId: OTHER_MEMBER_ID, branchId: TEST_BRANCH_ID, checkInTime: new Date('2026-03-04T10:00:00Z'), checkInType: 'ENTRY', checkInMethod: 'QR_CODE' },
      { id: tenantBCheckInId, memberId: TEST_MEMBER_B_ID, branchId: TEST_BRANCH_B_ID, contractId: TEST_CONTRACT_B_ID, checkInTime: new Date('2026-03-05T10:00:00Z'), checkInType: 'ENTRY', checkInMethod: 'QR_CODE' },
    ]);
  });

  afterAll(async () => {
    await db.delete(checkIns).where(inArray(checkIns.id, [...ownCheckInIds, otherMemberCheckInId, tenantBCheckInId]));
    await db.delete(contracts).where(inArray(contracts.id, [OTHER_CONTRACT_ID]));
    await db.delete(members).where(inArray(members.id, [OTHER_MEMBER_ID]));
    await cleanupTestFixtures();
  });

  describe('GET /api/member/contracts', () => {
    it('returns 401 without a token', async () => {
      const res = await app.request('/api/member/contracts');
      expect(res.status).toBe(401);
    });

    it('returns only the member\'s own contracts with a field whitelist', async () => {
      const res = await memberAuthRequest('/api/member/contracts');
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.contracts).toHaveLength(1);
      const c = data.contracts[0];
      expect(c).toMatchObject({ id: TEST_CONTRACT_ID, contractNo: 'C000001', status: 'ACTIVE', paymentStatus: 'PAID' });
      expect(typeof c.planName).toBe('string');
      expect(['TIME_BASED', 'COUNT_BASED']).toContain(c.planType);
      expect(typeof c.totalAmount).toBe('number');
      for (const key of ['notes', 'tenantId', 'branchId', 'memberId', 'createdBy']) {
        expect(c).not.toHaveProperty(key);
      }
      expect(data.pagination).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('does not show a same-tenant neighbour\'s or another tenant\'s contracts', async () => {
      const neighbour = await memberAuthRequest('/api/member/contracts', {
        token: tokenFor(OTHER_MEMBER_ID, TEST_BRANCH_ID, TEST_TENANT_ID, 'M000098'),
      });
      const nContracts = (await neighbour.json()).data.contracts;
      expect(nContracts.map((c: { id: string }) => c.id)).toEqual([OTHER_CONTRACT_ID]);

      const forged = await memberAuthRequest('/api/member/contracts', {
        token: tokenFor(TEST_MEMBER_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID, 'M000001'),
      });
      expect((await forged.json()).data.contracts).toEqual([]);

      const tenantB = await memberAuthRequest('/api/member/contracts', {
        token: tokenFor(TEST_MEMBER_B_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID, 'OM0001'),
      });
      expect((await tenantB.json()).data.contracts.map((c: { id: string }) => c.id)).toEqual([TEST_CONTRACT_B_ID]);
    });

    it('has no member self-service pause/resume routes', async () => {
      const pause = await memberAuthRequest(`/api/member/contracts/${TEST_CONTRACT_ID}/pause`, { method: 'POST', body: '{}' });
      expect(pause.status).toBe(404);
    });
  });

  describe('GET /api/member/check-in/history', () => {
    it('returns only own check-ins, newest first, with isCrossBranch', async () => {
      const res = await memberAuthRequest('/api/member/check-in/history');
      const { data } = await res.json();
      expect(data.checkIns.map((c: { id: string }) => c.id)).toEqual([...ownCheckInIds].reverse());
      expect(data.checkIns[0].isCrossBranch).toBe(false);
      expect(data.pagination.total).toBe(3);
    });

    it('is scoped by tenant as well as member', async () => {
      const res = await memberAuthRequest('/api/member/check-in/history', {
        token: tokenFor(TEST_MEMBER_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID, 'M000001'),
      });
      expect((await res.json()).data.checkIns).toEqual([]);
    });
  });

  describe('GET /api/member/check-in/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await app.request(`/api/member/check-in/${ownCheckInIds[0]}`);
      expect(res.status).toBe(401);
    });

    it('returns own check-in detail without staff-internal fields', async () => {
      const res = await memberAuthRequest(`/api/member/check-in/${ownCheckInIds[0]}`);
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toMatchObject({
        id: ownCheckInIds[0],
        checkInType: 'ENTRY',
        checkInMethod: 'QR_CODE',
        isCrossBranch: false,
        branch: { id: TEST_BRANCH_ID, name: 'Test Branch' },
        contract: { id: TEST_CONTRACT_ID, contractNo: 'C000001' },
      });
      for (const key of ['notes', 'processedById', 'locationIp', 'memberId']) {
        expect(data).not.toHaveProperty(key);
      }
    });

    it('returns null contract when the check-in has none', async () => {
      const res = await memberAuthRequest(`/api/member/check-in/${ownCheckInIds[1]}`);
      expect((await res.json()).data.contract).toBeNull();
    });

    it('404s for another member\'s check-in (same tenant) and another tenant\'s', async () => {
      const sameTenant = await memberAuthRequest(`/api/member/check-in/${otherMemberCheckInId}`);
      expect(sameTenant.status).toBe(404);
      const otherTenant = await memberAuthRequest(`/api/member/check-in/${tenantBCheckInId}`);
      expect(otherTenant.status).toBe(404);
      const forged = await memberAuthRequest(`/api/member/check-in/${ownCheckInIds[0]}`, {
        token: tokenFor(TEST_MEMBER_ID, TEST_BRANCH_B_ID, TEST_TENANT_B_ID, 'M000001'),
      });
      expect(forged.status).toBe(404);
    });

    it('400s on a malformed id and does not shadow /today', async () => {
      expect((await memberAuthRequest('/api/member/check-in/not-a-uuid')).status).toBe(400);
      expect((await memberAuthRequest('/api/member/check-in/today')).status).toBe(200);
    });
  });
});
