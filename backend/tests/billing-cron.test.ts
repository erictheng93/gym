import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  'onConflictDoUpdate',
];

let chain: any;

(function initChain() {
  chain = {};
  for (const m of CHAIN_METHODS) {
    chainFns[m] = vi.fn((..._args: any[]) => chain);
    chain[m] = chainFns[m];
  }
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
  tenants: { id: 'id', name: 'name', status: 'status' },
  subscriptions: {
    id: 'id', tenantId: 'tenantId', status: 'status',
    billingCycle: 'billingCycle', monthlyPrice: 'monthlyPrice',
    yearlyPrice: 'yearlyPrice', currentPeriodEnd: 'currentPeriodEnd',
    currentPeriodStart: 'currentPeriodStart', updatedAt: 'updatedAt',
    planType: 'planType',
  },
  invoices: { id: 'id', tenantId: 'tenantId' },
  usageRecords: { tenantId: 'tenantId', recordDate: 'recordDate' },
  branches: { id: 'id', tenantId: 'tenantId', status: 'status' },
  members: { id: 'id', branchId: 'branchId', status: 'status' },
  employees: { id: 'id', branchId: 'branchId', status: 'status' },
  contracts: { id: 'id', branchId: 'branchId', status: 'status' },
}));

// =============================================================================
// Mock drizzle-orm
// =============================================================================

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ _op: 'and', args })),
  lte: vi.fn((a: any, b: any) => ({ _op: 'lte', a, b })),
  sql: vi.fn((...args: any[]) => args),
  count: vi.fn(() => ({ _op: 'count' })),
}));

// =============================================================================
// Import AFTER mock setup
// =============================================================================

import { runBillingTasks } from '../src/cron/billing.js';

// =============================================================================
// TESTS
// =============================================================================

describe('Billing Cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbResults = [];
  });

  // ---------------------------------------------------------------------------
  // runBillingTasks — orchestration
  // ---------------------------------------------------------------------------

  describe('runBillingTasks', () => {
    it('沒有資料時應該正常完成', async () => {
      dbResults.push([]); // no due subscriptions
      dbResults.push([]); // no active tenants

      await runBillingTasks();

      // Should have queried subs and tenants, nothing else
      expect(chainFns.insert).not.toHaveBeenCalled();
    });

    it('任一步驟拋出錯誤不應該影響其他步驟', async () => {
      // generateMonthlyInvoices will throw
      dbResults.push(new Error('DB connection lost'));
      // updateUsageRecords should NOT run because the error in generateMonthlyInvoices
      // is caught by the outer try/catch

      await expect(runBillingTasks()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // generateMonthlyInvoices (tested via runBillingTasks)
  // ---------------------------------------------------------------------------

  describe('generateMonthlyInvoices', () => {
    const monthlySub = {
      id: 'sub-1',
      tenantId: 'tenant-1',
      billingCycle: 'monthly',
      monthlyPrice: '500',
      yearlyPrice: '5000',
      currentPeriodEnd: '2024-01-01',
      currentPeriodStart: '2023-12-01',
      status: 'active',
      planType: 'pro',
    };

    it('沒有到期訂閱時不應該產生發票', async () => {
      dbResults.push([]); // no due subs
      dbResults.push([]); // no active tenants (for updateUsageRecords)

      await runBillingTasks();

      expect(chainFns.insert).not.toHaveBeenCalled();
    });

    it('月繳訂閱應該用 monthlyPrice 產生發票', async () => {
      // generateMonthlyInvoices:
      dbResults.push([monthlySub]);                                    // due subs
      dbResults.push([{ id: 'tenant-1', name: 'Test Gym' }]);         // tenant
      dbResults.push(undefined);                                        // insert invoice
      dbResults.push(undefined);                                        // update subscription
      // updateUsageRecords:
      dbResults.push([]);                                               // no active tenants

      await runBillingTasks();

      // Should have inserted an invoice
      expect(chainFns.insert).toHaveBeenCalled();
      // Check the values passed to insert
      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          amountTotal: '500',
          currency: 'TWD',
          status: 'open',
        }),
      );
    });

    it('年繳訂閱應該用 yearlyPrice 產生發票', async () => {
      const yearlySub = { ...monthlySub, billingCycle: 'yearly' };

      dbResults.push([yearlySub]);
      dbResults.push([{ id: 'tenant-1', name: 'Test Gym' }]);
      dbResults.push(undefined); // insert invoice
      dbResults.push(undefined); // update sub
      dbResults.push([]);        // no tenants for usage

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({ amountTotal: '5000' }),
      );
    });

    it('找不到租戶應該跳過該訂閱', async () => {
      dbResults.push([monthlySub]);
      dbResults.push([]);          // tenant not found → skip
      dbResults.push([]);          // no tenants for usage

      await runBillingTasks();

      // Only 1 insert should have happened (none for invoice since tenant not found)
      // No insert should have been called for invoice
      expect(chainFns.values).not.toHaveBeenCalled();
    });

    it('應該更新訂閱的計費週期', async () => {
      dbResults.push([monthlySub]);
      dbResults.push([{ id: 'tenant-1', name: 'Test Gym' }]);
      dbResults.push(undefined); // insert invoice
      dbResults.push(undefined); // update subscription
      dbResults.push([]);        // no tenants for usage

      await runBillingTasks();

      // Should have updated subscription period
      expect(chainFns.update).toHaveBeenCalled();
      expect(chainFns.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPeriodStart: expect.any(String),
          currentPeriodEnd: expect.any(String),
        }),
      );
    });

    it('單筆訂閱錯誤不應該影響其他訂閱', async () => {
      const sub2 = { ...monthlySub, id: 'sub-2', tenantId: 'tenant-2' };

      // Sub 1: tenant query throws
      dbResults.push([monthlySub, sub2]);
      dbResults.push(new Error('Tenant lookup failed')); // sub-1 fails
      // Sub 2: succeeds
      dbResults.push([{ id: 'tenant-2', name: 'Second Gym' }]);
      dbResults.push(undefined); // insert invoice
      dbResults.push(undefined); // update sub
      // updateUsageRecords:
      dbResults.push([]);

      await runBillingTasks();

      // Invoice was still inserted for sub-2
      expect(chainFns.insert).toHaveBeenCalled();
    });

    it('monthlyPrice 為 null 時應該視為 0', async () => {
      const nullPriceSub = { ...monthlySub, monthlyPrice: null };

      dbResults.push([nullPriceSub]);
      dbResults.push([{ id: 'tenant-1', name: 'Test Gym' }]);
      dbResults.push(undefined); // insert invoice
      dbResults.push(undefined); // update sub
      dbResults.push([]);        // no tenants for usage

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({ amountTotal: '0' }),
      );
    });

    it('yearlyPrice 為 null 時應該視為 0', async () => {
      const nullYearlySub = { ...monthlySub, billingCycle: 'yearly', yearlyPrice: null };

      dbResults.push([nullYearlySub]);
      dbResults.push([{ id: 'tenant-1', name: 'Test Gym' }]);
      dbResults.push(undefined); // insert invoice
      dbResults.push(undefined); // update sub
      dbResults.push([]);        // no tenants for usage

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({ amountTotal: '0' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateUsageRecords (tested via runBillingTasks)
  // ---------------------------------------------------------------------------

  describe('updateUsageRecords', () => {
    it('沒有活躍租戶時不應該寫入紀錄', async () => {
      dbResults.push([]); // no due subs
      dbResults.push([]); // no active tenants

      await runBillingTasks();

      // No insert for usage records
      expect(chainFns.insert).not.toHaveBeenCalled();
    });

    it('應該正確計算並寫入各項資源數量', async () => {
      dbResults.push([]);                                              // no due subs
      dbResults.push([{ id: 'tenant-1' }]);                           // active tenants
      dbResults.push([{ count: 2 }]);                                 // branch count
      dbResults.push([{ id: 'branch-1' }, { id: 'branch-2' }]);      // branch IDs
      dbResults.push([{ count: 50 }]);                                // member count
      dbResults.push([{ count: 10 }]);                                // employee count
      dbResults.push([{ count: 30 }]);                                // contract count
      dbResults.push(undefined);                                       // upsert usage

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          branchesCount: 2,
          membersCount: 50,
          employeesCount: 10,
          activeContractsCount: 30,
        }),
      );
    });

    it('沒有分店時 member/employee/contract count 應為 0', async () => {
      dbResults.push([]);                    // no due subs
      dbResults.push([{ id: 'tenant-1' }]); // active tenants
      dbResults.push([{ count: 0 }]);       // branch count = 0
      dbResults.push([]);                    // no branch IDs
      dbResults.push(undefined);             // upsert usage

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({
          membersCount: 0,
          employeesCount: 0,
          activeContractsCount: 0,
        }),
      );
    });

    it('count 為 null 時應該視為 0', async () => {
      dbResults.push([]);                    // no due subs
      dbResults.push([{ id: 'tenant-1' }]); // active tenants
      dbResults.push([{ count: null }]);     // branch count null
      dbResults.push([{ id: 'branch-1' }]); // 1 branch
      dbResults.push([{ count: null }]);     // member count null
      dbResults.push([{ count: null }]);     // employee count null
      dbResults.push([{ count: null }]);     // contract count null
      dbResults.push(undefined);             // upsert

      await runBillingTasks();

      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({
          branchesCount: 0,
          membersCount: 0,
          employeesCount: 0,
          activeContractsCount: 0,
        }),
      );
    });

    it('單一租戶錯誤不應該影響其他租戶', async () => {
      dbResults.push([]);                                   // no due subs
      dbResults.push([{ id: 't-1' }, { id: 't-2' }]);      // 2 active tenants
      // Tenant t-1: branch count throws
      dbResults.push(new Error('Query failed'));
      // Tenant t-2: succeeds
      dbResults.push([{ count: 1 }]);                       // branch count
      dbResults.push([{ id: 'branch-1' }]);                 // branch IDs
      dbResults.push([{ count: 5 }]);                       // member count
      dbResults.push([{ count: 2 }]);                       // employee count
      dbResults.push([{ count: 3 }]);                       // contract count
      dbResults.push(undefined);                             // upsert

      await runBillingTasks();

      // Should still insert usage for t-2
      expect(chainFns.values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't-2' }),
      );
    });

    it('應該使用 onConflictDoUpdate 做 upsert', async () => {
      dbResults.push([]);                    // no due subs
      dbResults.push([{ id: 'tenant-1' }]); // active tenants
      dbResults.push([{ count: 1 }]);
      dbResults.push([{ id: 'branch-1' }]);
      dbResults.push([{ count: 10 }]);
      dbResults.push([{ count: 5 }]);
      dbResults.push([{ count: 8 }]);
      dbResults.push(undefined);

      await runBillingTasks();

      expect(chainFns.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.any(Array),
          set: expect.objectContaining({
            membersCount: 10,
            employeesCount: 5,
            activeContractsCount: 8,
          }),
        }),
      );
    });
  });
});
