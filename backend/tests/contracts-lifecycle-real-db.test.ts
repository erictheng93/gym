import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, contracts, contractLogs, payments } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
  TEST_PLAN_ID,
  TEST_EMPLOYEE_ID,
  TEST_CONTRACT_B_ID,
  TEST_MEMBER_B_ID,
} from './helpers.js';

// =============================================================================
// CONTRACT LIFECYCLE AGAINST A REAL DATABASE
// =============================================================================
// POST /:id/cancel (with refund), /:id/extend and /:id/resume run in one
// transaction each; these tests check the rows Postgres actually holds
// afterwards, including a rollback when the last step of a cancel fails.

// Lets one test make the final step of the cancel transaction throw.
const failRecalculate = vi.hoisted(() => ({ on: false }));
vi.mock('../src/services/contract-payment.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/contract-payment.js')>();
  return {
    ...actual,
    recalculateContractPayment: async (...args: Parameters<typeof actual.recalculateContractPayment>) => {
      if (failRecalculate.on) throw new Error('injected failure after the refund insert');
      return actual.recalculateContractPayment(...args);
    },
  };
});

const createdContractIds: string[] = [];

type Status = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';

async function createContract(opts: { status?: Status; totalAmount?: string; endDate?: string; contractNo?: string } = {}) {
  const id = crypto.randomUUID();
  await db.insert(contracts).values({
    id,
    contractNo: opts.contractNo ?? `LC${id.slice(0, 8)}`,
    memberId: TEST_MEMBER_ID,
    planId: TEST_PLAN_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    salesPersonId: TEST_EMPLOYEE_ID,
    startDate: '2026-01-01',
    originalEndDate: opts.endDate ?? '2026-12-31',
    endDate: opts.endDate ?? '2026-12-31',
    status: opts.status ?? 'ACTIVE',
    totalAmount: opts.totalAmount ?? '3000',
    paidAmount: '0',
    paymentStatus: 'UNPAID',
  });
  createdContractIds.push(id);
  return id;
}

async function addPayment(contractId: string, amount: string, type: 'INCOME' | 'REFUND' = 'INCOME') {
  await db.insert(payments).values({
    contractId,
    memberId: TEST_MEMBER_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    amount,
    paymentMethod: 'CASH',
    type,
    status: 'COMPLETED',
  });
}

async function getContract(id: string) {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  return row!;
}

const logsOf = (contractId: string) => db.select().from(contractLogs).where(eq(contractLogs.contractId, contractId));
const paymentsOf = (contractId: string) => db.select().from(payments).where(eq(payments.contractId, contractId));

describe('Contract lifecycle (real DB)', () => {
  let token: string;

  const post = (path: string, body?: unknown) => authRequest(path, {
    method: 'POST',
    token,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
  });

  afterEach(() => {
    failRecalculate.on = false;
  });

  afterAll(async () => {
    if (createdContractIds.length > 0) {
      await db.delete(payments).where(inArray(payments.contractId, createdContractIds));
      await db.delete(contractLogs).where(inArray(contractLogs.contractId, createdContractIds));
      await db.delete(contracts).where(inArray(contracts.id, createdContractIds));
    }
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/cancel', () => {
    it('cancels an ACTIVE contract and writes the CANCEL log, without a payment when no refund is given', async () => {
      const id = await createContract();

      const res = await post(`/api/contracts/${id}/cancel`, { reason: '會員搬家' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contract.status).toBe('CANCELLED');
      expect(body.data.refund).toBeNull();

      expect((await getContract(id)).status).toBe('CANCELLED');
      const logs = await logsOf(id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        logType: 'CANCEL',
        reason: '會員搬家',
        createdByEmployee: TEST_EMPLOYEE_ID,
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      expect(await paymentsOf(id)).toHaveLength(0);
    });

    it('records the refund as a positive COMPLETED REFUND payment in the same transaction', async () => {
      const id = await createContract({ totalAmount: '3000' });
      await addPayment(id, '3000');

      const res = await post(`/api/contracts/${id}/cancel`, {
        reason: '提前解約',
        refund: { amount: 1200, paymentMethod: 'BANK_TRANSFER' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.refund).toMatchObject({ amount: '1200.00', type: 'REFUND', status: 'COMPLETED' });

      const refunds = (await paymentsOf(id)).filter(p => p.type === 'REFUND');
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({
        amount: '1200.00',
        status: 'COMPLETED',
        paymentMethod: 'BANK_TRANSFER',
        memberId: TEST_MEMBER_ID,
        branchId: TEST_BRANCH_ID,
        createdBy: TEST_EMPLOYEE_ID,
      });

      // recalculateContractPayment ran: paidAmount counts COMPLETED INCOME only
      const contract = await getContract(id);
      expect(contract.status).toBe('CANCELLED');
      expect(contract.paidAmount).toBe('3000.00');
      expect(contract.paymentStatus).toBe('PAID');
      expect((await logsOf(id)).map(l => l.logType)).toEqual(['CANCEL']);
    });

    it('rejects a refund larger than the money still held and changes nothing', async () => {
      const id = await createContract({ totalAmount: '3000' });
      await addPayment(id, '3000');
      await addPayment(id, '2500', 'REFUND'); // 500 left to refund

      const res = await post(`/api/contracts/${id}/cancel`, {
        refund: { amount: 501, paymentMethod: 'CASH' },
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('500.00');
      expect((await getContract(id)).status).toBe('ACTIVE');
      expect(await logsOf(id)).toHaveLength(0);
      expect((await paymentsOf(id)).filter(p => p.type === 'REFUND')).toHaveLength(1);
    });

    it('rolls back the status change, the log and the refund when a later step fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const id = await createContract({ totalAmount: '3000' });
      await addPayment(id, '3000');
      failRecalculate.on = true;

      const res = await post(`/api/contracts/${id}/cancel`, {
        reason: 'should not stick',
        refund: { amount: 1000, paymentMethod: 'CASH' },
      });

      expect(res.status).toBe(500);
      expect((await getContract(id)).status).toBe('ACTIVE');
      expect(await logsOf(id)).toHaveLength(0);
      expect((await paymentsOf(id)).filter(p => p.type === 'REFUND')).toHaveLength(0);
    });

    it.each(['CANCELLED', 'EXPIRED'] as const)('refuses to cancel a %s contract', async (status) => {
      const id = await createContract({ status });

      const res = await post(`/api/contracts/${id}/cancel`, {});

      expect(res.status).toBe(400);
      expect((await getContract(id)).status).toBe(status);
      expect(await logsOf(id)).toHaveLength(0);
    });

    it.each(['DRAFT', 'PAUSED'] as const)('cancels a %s contract', async (status) => {
      const id = await createContract({ status });
      expect((await post(`/api/contracts/${id}/cancel`, {})).status).toBe(200);
      expect((await getContract(id)).status).toBe('CANCELLED');
    });

    it("returns 404 for another tenant's contract and leaves it untouched", async () => {
      const res = await post(`/api/contracts/${TEST_CONTRACT_B_ID}/cancel`, {
        refund: { amount: 1, paymentMethod: 'CASH' },
      });

      expect(res.status).toBe(404);
      expect((await getContract(TEST_CONTRACT_B_ID)).status).toBe('ACTIVE');
      expect(await paymentsOf(TEST_CONTRACT_B_ID)).toHaveLength(0);
    });

    it('validates the refund body', async () => {
      const id = await createContract();
      expect((await post(`/api/contracts/${id}/cancel`, { refund: { amount: 0, paymentMethod: 'CASH' } })).status).toBe(400);
      expect((await post(`/api/contracts/${id}/cancel`, { refund: { amount: 10, paymentMethod: 'GOLD' } })).status).toBe(400);
      expect((await getContract(id)).status).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/extend', () => {
    it('moves endDate by the given days, keeps originalEndDate and logs EXTEND', async () => {
      const id = await createContract({ endDate: '2026-12-25' });

      const res = await post(`/api/contracts/${id}/extend`, { days: 10, reason: '設備維修補償' });

      expect(res.status).toBe(200);
      expect((await res.json()).data.endDate).toBe('2027-01-04');
      const contract = await getContract(id);
      expect(contract.endDate).toBe('2027-01-04');
      expect(contract.originalEndDate).toBe('2026-12-25');
      const logs = await logsOf(id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        logType: 'EXTEND',
        startDate: '2026-12-25',
        endDate: '2027-01-04',
        daysAffected: 10,
        reason: '設備維修補償',
        createdByEmployee: TEST_EMPLOYEE_ID,
      });
    });

    it('refuses DRAFT and CANCELLED contracts', async () => {
      for (const status of ['DRAFT', 'CANCELLED'] as const) {
        const id = await createContract({ status, endDate: '2026-12-25' });
        expect((await post(`/api/contracts/${id}/extend`, { days: 5 })).status).toBe(400);
        expect((await getContract(id)).endDate).toBe('2026-12-25');
      }
    });

    it('rejects non-positive or fractional days', async () => {
      const id = await createContract();
      for (const days of [0, -3, 1.5]) {
        expect((await post(`/api/contracts/${id}/extend`, { days })).status).toBe(400);
      }
    });

    it("returns 404 for another tenant's contract", async () => {
      const before = await getContract(TEST_CONTRACT_B_ID);
      expect((await post(`/api/contracts/${TEST_CONTRACT_B_ID}/extend`, { days: 5 })).status).toBe(404);
      expect((await getContract(TEST_CONTRACT_B_ID)).endDate).toBe(before.endDate);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/resume', () => {
    it('sets ACTIVE and writes one RESUME log with operator and branch', async () => {
      const id = await createContract({ status: 'PAUSED' });

      expect((await post(`/api/contracts/${id}/resume`)).status).toBe(200);
      expect((await getContract(id)).status).toBe('ACTIVE');
      const logs = await logsOf(id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ logType: 'RESUME', createdByEmployee: TEST_EMPLOYEE_ID, branchId: TEST_BRANCH_ID });

      // A second resume finds the contract ACTIVE and writes nothing
      expect((await post(`/api/contracts/${id}/resume`)).status).toBe(400);
      expect(await logsOf(id)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/contracts filters', () => {
    const list = async (query: string) => {
      const res = await authRequest(`/api/contracts?${query}`, { method: 'GET', token });
      return { status: res.status, body: await res.json() };
    };

    it('filters by memberId, branchId, status and search (contract no.)', async () => {
      const id = await createContract({ status: 'DRAFT', contractNo: `FLT-${crypto.randomUUID().slice(0, 6)}` });
      const { contractNo } = await getContract(id);

      const byMember = await list(`memberId=${TEST_MEMBER_ID}&limit=100`);
      expect(byMember.status).toBe(200);
      expect(byMember.body.data.length).toBeGreaterThan(0);
      expect(byMember.body.data.every((r: { contract: { memberId: string } }) => r.contract.memberId === TEST_MEMBER_ID)).toBe(true);

      const otherMember = await list(`memberId=${TEST_MEMBER_B_ID}`);
      expect(otherMember.body.data).toEqual([]); // another tenant's member: nothing leaks

      const bySearch = await list(`search=${contractNo}`);
      expect(bySearch.body.data.map((r: { contract: { id: string } }) => r.contract.id)).toEqual([id]);
      expect(bySearch.body.pagination.total).toBe(1);

      const bySearchName = await list(`search=Test%20Member&status=DRAFT&branchId=${TEST_BRANCH_ID}&limit=100`);
      expect(bySearchName.body.data.map((r: { contract: { id: string } }) => r.contract.id)).toContain(id);
      expect(bySearchName.body.data.every((r: { contract: { status: string } }) => r.contract.status === 'DRAFT')).toBe(true);
    });

    it('rejects malformed memberId / branchId with 400', async () => {
      expect((await list('memberId=not-a-uuid')).status).toBe(400);
      expect((await list('branchId=nope')).status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/contracts/:id', () => {
    it('returns the plan flags, branch, sales person and log operator the detail page needs', async () => {
      const id = await createContract({ endDate: '2026-12-25' });
      await post(`/api/contracts/${id}/extend`, { days: 1 });

      const res = await authRequest(`/api/contracts/${id}`, { method: 'GET', token });
      const { data } = await res.json();

      expect(data.plan).toMatchObject({ id: TEST_PLAN_ID, durationMonths: 1, allowPause: true, allowTransfer: false });
      expect(data.branch).toMatchObject({ id: TEST_BRANCH_ID, name: 'Test Branch' });
      expect(data.salesPerson).toMatchObject({ id: TEST_EMPLOYEE_ID, fullName: 'Test Admin' });
      expect(data.logs[0]).toMatchObject({ logType: 'EXTEND', daysAffected: 1, createdByName: 'Test Admin' });
    });
  });
});
