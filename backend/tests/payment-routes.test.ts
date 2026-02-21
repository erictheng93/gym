import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Constants
// =============================================================================

const TEST_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_USER = { id: 'user-1', employeeId: 'emp-1', username: 'testuser' };
const BRANCH_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTRACT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PAYMENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// =============================================================================
// Mock middleware (pass-through, sets auth context)
// =============================================================================

vi.mock('../src/middleware/index.js', () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set('user', TEST_USER);
    await next();
  }),
  requireTenant: vi.fn(async (c: any, next: any) => {
    c.set('tenantId', TEST_TENANT_ID);
    await next();
  }),
}));

// =============================================================================
// Mock DB — chainable query builder with sequential result queue
// =============================================================================

let dbResults: any[] = [];

const chainFns: Record<string, ReturnType<typeof vi.fn>> = {};
const CHAIN_METHODS = [
  'select', 'from', 'where', 'limit', 'offset',
  'leftJoin', 'orderBy',
  'insert', 'values', 'returning',
  'update', 'set',
];

let chain: any;

(function initChain() {
  chain = {};
  for (const m of CHAIN_METHODS) {
    chainFns[m] = vi.fn((..._args: any[]) => chain);
    chain[m] = chainFns[m];
  }
  // Each `await` on the chain consumes the next value from dbResults
  chain.then = function (onFulfill?: any, onReject?: any) {
    const result = dbResults.shift();
    if (result instanceof Error) {
      return Promise.reject(result).then(onFulfill, onReject);
    }
    return Promise.resolve(result).then(onFulfill, onReject);
  };
})();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: any[]) => { chainFns.select(...args); return chain; },
    insert: (...args: any[]) => { chainFns.insert(...args); return chain; },
    update: (...args: any[]) => { chainFns.update(...args); return chain; },
  },
  payments: {
    id: 'id', contractId: 'contractId', memberId: 'memberId',
    branchId: 'branchId', amount: 'amount', type: 'type',
    paymentMethod: 'paymentMethod', paymentDate: 'paymentDate',
    receiptNo: 'receiptNo', notes: 'notes', createdAt: 'createdAt',
    createdBy: 'createdBy', tenantId: 'tenantId',
  },
  contracts: {
    id: 'id', contractNo: 'contractNo', totalAmount: 'totalAmount',
    paymentStatus: 'paymentStatus', updatedAt: 'updatedAt', status: 'status',
  },
  members: {
    id: 'id', fullName: 'fullName', memberCode: 'memberCode',
  },
  branches: {
    id: 'id', tenantId: 'tenantId',
  },
}));

// =============================================================================
// Mock drizzle-orm helpers
// =============================================================================

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ _op: 'and', args })),
  sql: vi.fn((...args: any[]) => args),
  desc: vi.fn((col: any) => ({ _op: 'desc', col })),
  sum: vi.fn((col: any) => ({ _op: 'sum', col })),
  inArray: vi.fn((col: any, vals: any) => ({ _op: 'inArray', col, vals })),
}));

// =============================================================================
// Import AFTER mock setup
// =============================================================================

import app from '../src/routes/payments.js';

// =============================================================================
// TESTS
// =============================================================================

describe('Payment Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbResults = [];
  });

  // Helper to POST a payment
  function postPayment(body: Record<string, any>) {
    return app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const validBody = {
    contractId: CONTRACT_ID,
    memberId: MEMBER_ID,
    amount: 5000,
    paymentMethod: 'CASH' as const,
    branchId: BRANCH_ID,
  };

  // ---------------------------------------------------------------------------
  // GET / — List payments
  // ---------------------------------------------------------------------------

  describe('GET /', () => {
    it('沒有分店時應該返回空陣列', async () => {
      dbResults.push([]); // tenant branches → empty

      const res = await app.request('/', { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
    });

    it('應該返回分頁的付款列表', async () => {
      dbResults.push([{ id: BRANCH_ID }]);   // tenant branches
      dbResults.push([{ count: 1 }]);         // count
      dbResults.push([{                        // payments list
        payment: { id: PAYMENT_ID, amount: '5000', type: 'INCOME' },
        member: { id: MEMBER_ID, fullName: 'Test User', memberCode: 'M001' },
        contract: { id: CONTRACT_ID, contractNo: 'C001' },
      }]);

      const res = await app.request('/', { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(PAYMENT_ID);
      expect(json.data[0].member.fullName).toBe('Test User');
      expect(json.data[0].contract.contractNo).toBe('C001');
      expect(json.meta).toEqual({
        total: 1, page: 1, limit: 20, totalPages: 1,
      });
    });

    it('應該支援 branchId、memberId、contractId 篩選', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ count: 0 }]);
      dbResults.push([]);

      const res = await app.request(
        `/?branchId=${BRANCH_ID}&memberId=${MEMBER_ID}&contractId=${CONTRACT_ID}`,
        { method: 'GET' },
      );

      expect(res.status).toBe(200);
    });

    it('應該遵循 page 和 limit 參數', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ count: 100 }]);
      dbResults.push([]);

      const res = await app.request('/?page=3&limit=10', { method: 'GET' });
      const json = await res.json() as any;

      expect(json.meta.page).toBe(3);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.totalPages).toBe(10);
    });

    it('limit 應該上限為 100', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ count: 0 }]);
      dbResults.push([]);

      const res = await app.request('/?limit=999', { method: 'GET' });
      const json = await res.json() as any;

      expect(json.meta.limit).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /summary
  // ---------------------------------------------------------------------------

  describe('GET /summary', () => {
    it('沒有分店時應該返回全零', async () => {
      dbResults.push([]);

      const res = await app.request('/summary', { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data).toEqual({
        totalIncome: 0, totalRefund: 0, netIncome: 0, paymentCount: 0,
      });
    });

    it('應該正確計算收支摘要', async () => {
      dbResults.push([{ id: BRANCH_ID }]);  // branches
      dbResults.push([{ total: '50000' }]); // income
      dbResults.push([{ total: '5000' }]);  // refund
      dbResults.push([{ count: 10 }]);      // count

      const res = await app.request('/summary', { method: 'GET' });
      const json = await res.json() as any;

      expect(json.data.totalIncome).toBe(50000);
      expect(json.data.totalRefund).toBe(5000);
      expect(json.data.netIncome).toBe(45000);
      expect(json.data.paymentCount).toBe(10);
    });

    it('sum 為 null 時應該視為 0', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ total: null }]);
      dbResults.push([{ total: null }]);
      dbResults.push([{ count: 0 }]);

      const res = await app.request('/summary', { method: 'GET' });
      const json = await res.json() as any;

      expect(json.data.totalIncome).toBe(0);
      expect(json.data.totalRefund).toBe(0);
      expect(json.data.netIncome).toBe(0);
    });

    it('應該支援日期區間篩選', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ total: '10000' }]);
      dbResults.push([{ total: '0' }]);
      dbResults.push([{ count: 3 }]);

      const res = await app.request(
        '/summary?startDate=2024-01-01&endDate=2024-01-31',
        { method: 'GET' },
      );

      expect(res.status).toBe(200);
      expect((await res.json() as any).data.totalIncome).toBe(10000);
    });

    it('應該支援 branchId 篩選', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ total: '8000' }]);
      dbResults.push([{ total: '1000' }]);
      dbResults.push([{ count: 5 }]);

      const res = await app.request(`/summary?branchId=${BRANCH_ID}`, {
        method: 'GET',
      });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data.netIncome).toBe(7000);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id — Payment detail
  // ---------------------------------------------------------------------------

  describe('GET /:id', () => {
    it('應該返回付款詳情含 member 和 contract', async () => {
      dbResults.push([{
        payment: { id: PAYMENT_ID, amount: '5000', type: 'INCOME', branchId: BRANCH_ID },
        member: { id: MEMBER_ID, fullName: 'Test User' },
        contract: { id: CONTRACT_ID, contractNo: 'C001' },
      }]);
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);

      const res = await app.request(`/${PAYMENT_ID}`, { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(PAYMENT_ID);
      expect(json.data.member.fullName).toBe('Test User');
      expect(json.data.contract.contractNo).toBe('C001');
    });

    it('找不到付款記錄應該返回 404', async () => {
      dbResults.push([]);

      const res = await app.request(`/${PAYMENT_ID}`, { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(404);
      expect(json.error).toBe('付款紀錄不存在');
    });

    it('分店不在租戶內應該返回 403', async () => {
      dbResults.push([{
        payment: { id: PAYMENT_ID, branchId: BRANCH_ID },
        member: null,
        contract: null,
      }]);
      dbResults.push([]); // branch not in tenant

      const res = await app.request(`/${PAYMENT_ID}`, { method: 'GET' });
      const json = await res.json() as any;

      expect(res.status).toBe(403);
      expect(json.error).toBe('無權限存取此付款紀錄');
    });
  });

  // ---------------------------------------------------------------------------
  // POST / — Create payment
  // ---------------------------------------------------------------------------

  describe('POST /', () => {
    it('應該成功建立付款並返回 201', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]); // branch
      dbResults.push([{ id: MEMBER_ID }]);                            // member
      dbResults.push([{ id: PAYMENT_ID, amount: '5000' }]);          // insert
      dbResults.push([{ total: '5000' }]);                            // sum INCOME
      dbResults.push([{ id: CONTRACT_ID, totalAmount: '10000' }]);   // contract
      dbResults.push(undefined);                                       // update

      const res = await postPayment(validBody);
      const json = await res.json() as any;

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(PAYMENT_ID);
    });

    it('無效的分店應該返回 400', async () => {
      dbResults.push([]); // branch not found

      const res = await postPayment(validBody);
      const json = await res.json() as any;

      expect(res.status).toBe(400);
      expect(json.error).toBe('無效的分店');
    });

    it('會員不存在應該返回 404', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([]);

      const res = await postPayment(validBody);
      const json = await res.json() as any;

      expect(res.status).toBe(404);
      expect(json.error).toBe('會員不存在');
    });

    it('缺少 contractId 應該返回 400', async () => {
      dbResults.push([{ id: BRANCH_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);

      const res = await postPayment({ ...validBody, contractId: null });
      const json = await res.json() as any;

      expect(res.status).toBe(400);
      expect(json.error).toBe('必須指定合約');
    });

    it('全額付清應該更新 contract 為 PAID', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID }]);
      dbResults.push([{ total: '10000' }]);                          // total paid = totalAmount
      dbResults.push([{ id: CONTRACT_ID, totalAmount: '10000' }]);
      dbResults.push(undefined);

      await postPayment(validBody);

      expect(chainFns.set).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PAID' }),
      );
    });

    it('部分付款應該更新 contract 為 PARTIAL', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID }]);
      dbResults.push([{ total: '3000' }]);                          // partial
      dbResults.push([{ id: CONTRACT_ID, totalAmount: '10000' }]);
      dbResults.push(undefined);

      await postPayment({ ...validBody, amount: 3000 });

      expect(chainFns.set).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PARTIAL' }),
      );
    });

    it('未付款應該 status 為 UNPAID', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID }]);
      dbResults.push([{ total: null }]);                              // no paid
      dbResults.push([{ id: CONTRACT_ID, totalAmount: '10000' }]);
      dbResults.push(undefined);

      await postPayment(validBody);

      expect(chainFns.set).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'UNPAID' }),
      );
    });

    it('找不到合約時不應該更新 status', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID }]);
      dbResults.push([{ total: '5000' }]);
      dbResults.push([]); // contract not found

      const res = await postPayment(validBody);

      expect(res.status).toBe(201);
      expect(chainFns.update).not.toHaveBeenCalled();
    });

    it('缺少必要欄位應該返回 400', async () => {
      const res = await postPayment({ amount: 100 });

      expect(res.status).toBe(400);
    });

    it('無效的 paymentMethod 應該返回 400', async () => {
      const res = await postPayment({
        ...validBody,
        paymentMethod: 'BITCOIN',
      });

      expect(res.status).toBe(400);
    });

    it('amount 為負數應該返回 400', async () => {
      const res = await postPayment({
        ...validBody,
        amount: -100,
      });

      expect(res.status).toBe(400);
    });

    it('合約 totalAmount 為 null 時應視為 0 → PAID', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID }]);
      dbResults.push([{ total: '0' }]);
      dbResults.push([{ id: CONTRACT_ID, totalAmount: null }]); // null totalAmount → 0
      dbResults.push(undefined);

      await postPayment(validBody);

      expect(chainFns.set).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PAID' }),
      );
    });

    it('支援 REFUND 類型', async () => {
      dbResults.push([{ id: BRANCH_ID, tenantId: TEST_TENANT_ID }]);
      dbResults.push([{ id: MEMBER_ID }]);
      dbResults.push([{ id: PAYMENT_ID, type: 'REFUND' }]);
      dbResults.push([{ total: '5000' }]);
      dbResults.push([{ id: CONTRACT_ID, totalAmount: '10000' }]);
      dbResults.push(undefined);

      const res = await postPayment({
        ...validBody,
        paymentType: 'REFUND',
      });

      expect(res.status).toBe(201);
    });
  });
});
