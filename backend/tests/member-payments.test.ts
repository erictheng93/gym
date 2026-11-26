import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, payments, members } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  memberAuthRequest,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_CONTRACT_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_B_ID,
  TEST_CONTRACT_B_ID,
  TEST_EMPLOYEE_ID,
} from './helpers.js';

// =============================================================================
// GET /api/member/payments (member payment history)
// =============================================================================

const SAME_TENANT_OTHER_MEMBER_ID = crypto.randomUUID();
const paymentIds: string[] = [];

async function insertPayment(opts: {
  memberId: string;
  tenantId: string;
  branchId: string;
  contractId: string;
  amount: string;
  date: string;
  status?: 'PENDING' | 'COMPLETED' | 'FAILED';
  type?: 'INCOME' | 'REFUND';
  notes?: string;
}) {
  const id = crypto.randomUUID();
  paymentIds.push(id);
  await db.insert(payments).values({
    id,
    contractId: opts.contractId,
    memberId: opts.memberId,
    branchId: opts.branchId,
    tenantId: opts.tenantId,
    amount: opts.amount,
    paymentMethod: 'CASH',
    paymentDate: new Date(opts.date),
    type: opts.type ?? 'INCOME',
    status: opts.status ?? 'COMPLETED',
    notes: opts.notes ?? null,
    receiptNo: 'secret-gateway-id',
    createdBy: TEST_EMPLOYEE_ID,
  });
  return id;
}

describe('GET /api/member/payments', () => {
  let ownIds: string[] = [];

  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values({
      id: SAME_TENANT_OTHER_MEMBER_ID,
      fullName: 'Same Tenant Other',
      phone: '0911000111',
      memberCode: 'M000099',
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: '2026-01-01',
      tenantId: TEST_TENANT_ID,
    });

    const base = { memberId: TEST_MEMBER_ID, tenantId: TEST_TENANT_ID, branchId: TEST_BRANCH_ID, contractId: TEST_CONTRACT_ID };
    ownIds = [
      await insertPayment({ ...base, amount: '1000', date: '2026-01-01T00:00:00Z', notes: 'staff internal' }),
      await insertPayment({ ...base, amount: '200', date: '2026-02-01T00:00:00Z', type: 'REFUND' }),
      await insertPayment({ ...base, amount: '500', date: '2026-03-01T00:00:00Z', status: 'FAILED' }),
      await insertPayment({ ...base, amount: '300', date: '2026-04-01T00:00:00Z', status: 'PENDING' }),
    ];
    // Another member of the same tenant
    await insertPayment({ ...base, memberId: SAME_TENANT_OTHER_MEMBER_ID, amount: '7777', date: '2026-05-01T00:00:00Z' });
    // A member of another tenant
    await insertPayment({
      memberId: TEST_MEMBER_B_ID,
      tenantId: TEST_TENANT_B_ID,
      branchId: TEST_BRANCH_B_ID,
      contractId: TEST_CONTRACT_B_ID,
      amount: '8888',
      date: '2026-06-01T00:00:00Z',
    });
  });

  afterAll(async () => {
    await db.delete(payments).where(inArray(payments.id, paymentIds));
    await db.delete(members).where(inArray(members.id, [SAME_TENANT_OTHER_MEMBER_ID]));
    await cleanupTestFixtures();
  });

  it('returns 401 without a member token', async () => {
    const res = await app.request('/api/member/payments');
    expect(res.status).toBe(401);
  });

  it('returns only the authenticated member\'s payments, newest first', async () => {
    const res = await memberAuthRequest('/api/member/payments');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const list = body.data.payments;
    expect(list.map((p: { id: string }) => p.id)).toEqual([...ownIds].reverse());
    expect(body.data.pagination).toMatchObject({ total: 4, page: 1, limit: 20, totalPages: 1 });
    const amounts = list.map((p: { amount: number }) => p.amount);
    expect(amounts).not.toContain(7777);
    expect(amounts).not.toContain(8888);
  });

  it('exposes status, plan name and contract number but no staff-internal fields', async () => {
    const res = await memberAuthRequest('/api/member/payments');
    const { payments: list } = (await res.json()).data;
    expect(list.map((p: { status: string }) => p.status)).toEqual(['PENDING', 'FAILED', 'COMPLETED', 'COMPLETED']);
    expect(list[0].contractNo).toBe('C000001');
    expect(typeof list[0].planName).toBe('string');
    expect(typeof list[0].amount).toBe('number');
    for (const p of list) {
      for (const key of ['notes', 'receiptNo', 'createdBy', 'tenantId', 'branchId', 'memberId']) {
        expect(p).not.toHaveProperty(key);
      }
    }
  });

  it('summary counts COMPLETED rows only (not FAILED/PENDING)', async () => {
    const res = await memberAuthRequest('/api/member/payments');
    const { summary } = (await res.json()).data;
    expect(summary).toEqual({ totalPaid: 1000, totalRefunded: 200 });
  });

  it('paginates', async () => {
    const res = await memberAuthRequest('/api/member/payments?page=2&limit=3');
    const { payments: list, pagination } = (await res.json()).data;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(ownIds[0]);
    expect(pagination).toEqual({ total: 4, page: 2, limit: 3, totalPages: 2 });
  });

  it('rejects an out-of-range limit', async () => {
    const res = await memberAuthRequest('/api/member/payments?limit=1000');
    expect(res.status).toBe(400);
  });

  it('never shows member B (same tenant) their neighbour\'s payments', async () => {
    const token = generateMemberTokens({
      id: SAME_TENANT_OTHER_MEMBER_ID,
      memberCode: 'M000099',
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
    }).accessToken;
    const res = await memberAuthRequest('/api/member/payments', { token });
    const { payments: list } = (await res.json()).data;
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(7777);
  });

  it('never shows another tenant\'s payments, even with a mismatched token tenant', async () => {
    // Token of tenant A member id but claiming tenant B: scoped by both ids -> nothing
    const forged = generateMemberTokens({
      id: TEST_MEMBER_ID,
      memberCode: 'M000001',
      branchId: TEST_BRANCH_B_ID,
      tenantId: TEST_TENANT_B_ID,
    }).accessToken;
    const res = await memberAuthRequest('/api/member/payments', { token: forged });
    expect((await res.json()).data.payments).toEqual([]);

    const tenantBToken = generateMemberTokens({
      id: TEST_MEMBER_B_ID,
      memberCode: 'OM0001',
      branchId: TEST_BRANCH_B_ID,
      tenantId: TEST_TENANT_B_ID,
    }).accessToken;
    const resB = await memberAuthRequest('/api/member/payments', { token: tenantBToken });
    const listB = (await resB.json()).data.payments;
    expect(listB).toHaveLength(1);
    expect(listB[0].amount).toBe(8888);
  });
});
