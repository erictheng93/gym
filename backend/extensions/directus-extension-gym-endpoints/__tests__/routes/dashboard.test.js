/**
 * Dashboard Routes Tests
 * /gym/dashboard/* API 端點測試
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockDatabase,
  mockDatabaseRaw,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
  createDbResult,
  mockGetCachedReport,
  mockSetCachedReport,
  testData,
} from '../setup.js';
import { registerDashboardRoutes } from '../../src/routes/dashboard.js';

// ============================================
// Test Data Factories
// ============================================
const dashboardTestData = {
  kpiRevenue: (overrides = {}) => ({
    today_revenue: '50000',
    period_revenue: '150000',
    mtd_revenue: '500000',
    ytd_revenue: '2000000',
    today_transactions: '15',
    period_transactions: '45',
    ...overrides,
  }),

  kpiMembers: (overrides = {}) => ({
    total_members: '500',
    active_members: '350',
    new_members: '25',
    churned_members: '10',
    male_count: '280',
    female_count: '220',
    ...overrides,
  }),

  kpiContracts: (overrides = {}) => ({
    active_contracts: '320',
    expiring_7: '15',
    expiring_30: '45',
    expiring_90: '80',
    avg_contract_value: '12500',
    ...overrides,
  }),

  kpiOperations: (overrides = {}) => ({
    today_checkins: '89',
    period_checkins: '650',
    ...overrides,
  }),

  branchRevenue: (overrides = {}) => ({
    branch_id: 'branch-uuid-1',
    branch_name: '台北店',
    revenue: '80000',
    transactions: '25',
    ...overrides,
  }),

  branchMember: (overrides = {}) => ({
    branch_id: 'branch-uuid-1',
    branch_name: '台北店',
    total: '200',
    active: '150',
    ...overrides,
  }),

  contractAlert: (overrides = {}) => ({
    contract_id: 'contract-uuid-1',
    contract_no: 'C2024-001',
    end_date: '2024-02-01',
    status: 'ACTIVE',
    total_amount: '12000',
    paid_amount: '12000',
    days_until_expiry: 5,
    member_id: 'member-uuid-1',
    member_name: '王小明',
    member_phone: '0912345678',
    member_email: 'test@example.com',
    branch_name: '台北店',
    plan_name: '年費會員',
    sales_person_name: '李業務',
    ...overrides,
  }),

  revenueTarget: (overrides = {}) => ({
    id: 'target-uuid-1',
    branch_id: 'branch-uuid-1',
    branch_name: '台北店',
    year: 2024,
    month: 1,
    target_amount: '100000',
    ...overrides,
  }),
};

// ============================================
// Mock Router
// ============================================
function createMockRouter() {
  const routes = {
    get: {},
    post: {},
  };

  return {
    get: vi.fn((path, handler) => {
      routes.get[path] = handler;
    }),
    post: vi.fn((path, handler) => {
      routes.post[path] = handler;
    }),
    routes,
  };
}

// ============================================
// Tests
// ============================================
describe('Dashboard Routes', () => {
  let router;
  let routes;

  beforeEach(() => {
    router = createMockRouter();
    registerDashboardRoutes(router, mockDirectusContext);
    routes = router.routes;
  });

  // ============================================
  // GET /dashboard/kpis
  // ============================================
  describe('GET /dashboard/kpis', () => {
    it('should return KPI data with default period (today)', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      // Mock database responses
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([dashboardTestData.kpiRevenue()])) // revenue query
        .mockResolvedValueOnce(createDbResult([{ previous_revenue: '45000' }])) // previous period
        .mockResolvedValueOnce(createDbResult([{ payment_method: 'CASH', amount: '30000', count: '10' }])) // payment methods
        .mockResolvedValueOnce(createDbResult([dashboardTestData.branchRevenue()])) // branch revenue
        .mockResolvedValueOnce(createDbResult([dashboardTestData.kpiMembers()])) // members
        .mockResolvedValueOnce(createDbResult([dashboardTestData.branchMember()])) // branch members
        .mockResolvedValueOnce(createDbResult([{ age_group: '20-29', count: '100' }])) // age distribution
        .mockResolvedValueOnce(createDbResult([dashboardTestData.kpiContracts()])) // contracts
        .mockResolvedValueOnce(createDbResult([{ contract_type: 'TIME_BASED', plan_name: '年費', count: '200', total_value: '2400000' }])) // contract types
        .mockResolvedValueOnce(createDbResult([{ expired_count: '50', renewed_count: '40' }])) // renewal
        .mockResolvedValueOnce(createDbResult([dashboardTestData.kpiOperations()])) // checkins
        .mockResolvedValueOnce(createDbResult([{ hour: 10, count: '25' }])) // hourly
        .mockResolvedValueOnce(createDbResult([{ branch_id: 'branch-uuid-1', branch_name: '台北店', today_checkins: '45', period_checkins: '300' }])) // branch checkins
        .mockResolvedValueOnce(createDbResult([{ completed: '100', no_show: '10', total: '110' }])); // class attendance

      await routes.get['/dashboard/kpis'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.period.type).toBe('today');
      expect(res._jsonData.revenue).toBeDefined();
      expect(res._jsonData.members).toBeDefined();
      expect(res._jsonData.contracts).toBeDefined();
      expect(res._jsonData.operations).toBeDefined();
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1', period: 'month' },
      });
      const res = createMockResponse();

      // Mock all database calls
      mockDatabaseRaw.mockResolvedValue(createDbResult([{}]));

      await routes.get['/dashboard/kpis'](req, res);

      // Verify branch_id was included in queries
      const calls = mockDatabaseRaw.mock.calls;
      const hasbranchFilter = calls.some(call =>
        call[1]?.includes('branch-uuid-1')
      );
      expect(hasbranchFilter).toBe(true);
    });

    it('should return cached data when available', async () => {
      const cachedData = {
        success: true,
        period: { type: 'today' },
        revenue: { today: 50000 },
        members: { total: 500 },
        contracts: { active: 320 },
        operations: { today_checkins: 89 },
      };

      mockGetCachedReport.mockResolvedValueOnce(cachedData);

      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/dashboard/kpis'](req, res);

      expect(res._jsonData).toEqual(cachedData);
      expect(mockDatabaseRaw).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/dashboard/kpis'](req, res);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData.error_code).toBe('UNAUTHORIZED');
    });

    it('should handle different periods correctly', async () => {
      const periods = ['today', 'week', 'month', 'year'];

      for (const period of periods) {
        const req = createMockRequest({
          accountability: { user: 'user-uuid-1' },
          query: { period },
        });
        const res = createMockResponse();

        mockDatabaseRaw.mockResolvedValue(createDbResult([{}]));
        mockGetCachedReport.mockResolvedValueOnce(null);

        await routes.get['/dashboard/kpis'](req, res);

        expect(res._jsonData.period?.type || res._jsonData.success).toBeDefined();
      }
    });

    it('should calculate revenue change correctly', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { period: 'today' },
      });
      const res = createMockResponse();

      // Current period: 100000, Previous: 80000 => 25% change
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([{ ...dashboardTestData.kpiRevenue(), period_revenue: '100000' }]))
        .mockResolvedValueOnce(createDbResult([{ previous_revenue: '80000' }]))
        .mockResolvedValue(createDbResult([{}]));

      await routes.get['/dashboard/kpis'](req, res);

      expect(res._jsonData.revenue?.change).toBe(25);
    });

    it('should handle database errors gracefully', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockRejectedValueOnce(new Error('Database connection failed'));

      await routes.get['/dashboard/kpis'](req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
    });

    it('should cache results after successful fetch', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { period: 'today' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([dashboardTestData.kpiRevenue()]));

      await routes.get['/dashboard/kpis'](req, res);

      expect(mockSetCachedReport).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /dashboard/contract-alerts
  // ============================================
  describe('GET /dashboard/contract-alerts', () => {
    it('should return contract alerts grouped by urgency', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { days_ahead: '30' },
      });
      const res = createMockResponse();

      const alerts = [
        dashboardTestData.contractAlert({ days_until_expiry: 3 }), // urgent
        dashboardTestData.contractAlert({ days_until_expiry: 15, contract_id: 'c2' }), // soon
        dashboardTestData.contractAlert({ days_until_expiry: 45, contract_id: 'c3' }), // upcoming
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(alerts));

      await routes.get['/dashboard/contract-alerts'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.summary.urgent).toBe(1);
      expect(res._jsonData.summary.soon).toBe(1);
      expect(res._jsonData.summary.upcoming).toBe(1);
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/contract-alerts'](req, res);

      const queryCall = mockDatabaseRaw.mock.calls[0];
      expect(queryCall[1]).toContain('branch-uuid-1');
    });

    it('should use default values when not provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/contract-alerts'](req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('should limit results to max 200', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { limit: '500' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/contract-alerts'](req, res);

      const queryCall = mockDatabaseRaw.mock.calls[0];
      // Check that limit is capped at 200
      expect(queryCall[1]).toContain(200);
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/dashboard/contract-alerts'](req, res);

      expect(res._statusCode).toBe(401);
    });
  });

  // ============================================
  // GET /dashboard/revenue-targets
  // ============================================
  describe('GET /dashboard/revenue-targets', () => {
    it('should return revenue targets for specified year', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { year: '2024' },
      });
      const res = createMockResponse();

      const targets = [
        dashboardTestData.revenueTarget({ month: 1 }),
        dashboardTestData.revenueTarget({ month: 2, id: 'target-2' }),
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(targets));

      await routes.get['/dashboard/revenue-targets'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.year).toBe(2024);
      expect(res._jsonData.targets).toHaveLength(2);
    });

    it('should use current year as default', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/revenue-targets'](req, res);

      expect(res._jsonData.year).toBe(new Date().getFullYear());
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/revenue-targets'](req, res);

      const queryCall = mockDatabaseRaw.mock.calls[0];
      expect(queryCall[1]).toContain('branch-uuid-1');
    });
  });

  // ============================================
  // POST /dashboard/revenue-targets
  // ============================================
  describe('POST /dashboard/revenue-targets', () => {
    it('should create a new revenue target', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1', admin: true },
        body: {
          branch_id: 'branch-uuid-1',
          year: 2024,
          month: 1,
          target_amount: 100000,
        },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([dashboardTestData.revenueTarget()]));

      await routes.post['/dashboard/revenue-targets'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.target).toBeDefined();
    });

    it('should require admin permission', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1', admin: false },
        body: {
          branch_id: 'branch-uuid-1',
          year: 2024,
          month: 1,
          target_amount: 100000,
        },
      });
      const res = createMockResponse();

      await routes.post['/dashboard/revenue-targets'](req, res);

      expect(res._statusCode).toBe(403);
      expect(res._jsonData.error_code).toBe('FORBIDDEN');
    });

    it('should validate required fields', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1', admin: true },
        body: {
          branch_id: 'branch-uuid-1',
          // missing year, month, target_amount
        },
      });
      const res = createMockResponse();

      await routes.post['/dashboard/revenue-targets'](req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.error_code).toBe('INVALID_PAYLOAD');
    });

    it('should upsert existing target', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1', admin: true },
        body: {
          branch_id: 'branch-uuid-1',
          year: 2024,
          month: 1,
          target_amount: 150000, // updated amount
        },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([{
        ...dashboardTestData.revenueTarget(),
        target_amount: '150000',
      }]));

      await routes.post['/dashboard/revenue-targets'](req, res);

      expect(res._jsonData.target.target_amount).toBe('150000');
    });
  });

  // ============================================
  // GET /dashboard/export
  // ============================================
  describe('GET /dashboard/export', () => {
    it('should export member analytics as CSV', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'member-analytics', format: 'csv', days: '30' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      const members = [
        { id: 'm1', full_name: '王小明', email: 'wang@test.com', status: 'ACTIVE' },
        { id: 'm2', full_name: '李小美', email: 'li@test.com', status: 'ACTIVE' },
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(members));

      await routes.get['/dashboard/export'](req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.send).toHaveBeenCalled();
    });

    it('should export as JSON when format=json', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'revenue', format: 'json', days: '30' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();

      const payments = [
        { id: 'p1', amount: '5000', payment_method: 'CASH' },
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(payments));

      await routes.get['/dashboard/export'](req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(1);
    });

    it('should export contracts data', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'contracts', format: 'csv' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([
        { id: 'c1', contract_no: 'C001', status: 'ACTIVE' },
      ]));

      await routes.get['/dashboard/export'](req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('contracts-')
      );
    });

    it('should export checkins data', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'checkins', format: 'csv' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([
        { id: 'a1', check_in: '2024-01-15 10:00:00', person_name: '王小明' },
      ]));

      await routes.get['/dashboard/export'](req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('checkins-')
      );
    });

    it('should return error for invalid export type', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'invalid-type' },
      });
      const res = createMockResponse();

      await routes.get['/dashboard/export'](req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.error_code).toBe('INVALID_EXPORT_TYPE');
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'revenue', branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/export'](req, res);

      const queryCall = mockDatabaseRaw.mock.calls[0];
      expect(queryCall[1]).toContain('branch-uuid-1');
    });

    it('should handle empty data gracefully', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'revenue', format: 'csv' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/dashboard/export'](req, res);

      expect(res.send).toHaveBeenCalledWith('No data available');
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: { type: 'revenue' },
      });
      const res = createMockResponse();

      await routes.get['/dashboard/export'](req, res);

      expect(res._statusCode).toBe(401);
    });

    it('should properly escape CSV values with special characters', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { type: 'member-analytics', format: 'csv' },
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.send = vi.fn();

      const membersWithSpecialChars = [
        { id: 'm1', full_name: 'Wang, "Bob" Jr.', email: 'test@example.com' },
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(membersWithSpecialChars));

      await routes.get['/dashboard/export'](req, res);

      const csvOutput = res.send.mock.calls[0][0];
      expect(csvOutput).toContain('"Wang, ""Bob"" Jr."');
    });
  });

  // ============================================
  // GET /dashboard/live (SSE)
  // ============================================
  describe('GET /dashboard/live', () => {
    it('should set correct SSE headers', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
        on: vi.fn(),
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.write = vi.fn();

      mockDatabaseRaw.mockResolvedValue(createDbResult([{ count: '50' }]));

      // Don't await - SSE keeps connection open
      routes.get['/dashboard/live'](req, res);

      // Wait for initial data
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('should send connected event on initial connection', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
        on: vi.fn(),
      });
      const res = createMockResponse();
      res.setHeader = vi.fn();
      res.write = vi.fn();

      mockDatabaseRaw.mockResolvedValue(createDbResult([{ count: '50' }]));

      routes.get['/dashboard/live'](req, res);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: connected'));
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/dashboard/live'](req, res);

      expect(res._statusCode).toBe(401);
    });
  });
});
