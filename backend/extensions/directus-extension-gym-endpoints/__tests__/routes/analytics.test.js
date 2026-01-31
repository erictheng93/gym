/**
 * Analytics Routes Tests
 * /gym/analytics/* API 端點測試
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
} from '../setup.js';
import { registerAnalyticsRoutes } from '../../src/routes/analytics.js';

// ============================================
// Test Data Factories
// ============================================
const analyticsTestData = {
  memberDemographics: {
    statusDistribution: (overrides = {}) => ({
      status: 'ACTIVE',
      count: '350',
      ...overrides,
    }),

    genderDistribution: (overrides = {}) => ({
      gender: 'M',
      count: '280',
      ...overrides,
    }),

    ageDistribution: (overrides = {}) => ({
      age_group: '20-29',
      count: '120',
      ...overrides,
    }),
  },

  contractAnalytics: {
    typeDistribution: (overrides = {}) => ({
      contract_type: 'TIME_BASED',
      count: '250',
      percentage: '78.1',
      ...overrides,
    }),

    planStats: (overrides = {}) => ({
      plan_id: 'plan-uuid-1',
      plan_name: '年費會員',
      contract_count: '150',
      total_value: '1800000',
      percentage: '46.9',
      ...overrides,
    }),

    statusDistribution: (overrides = {}) => ({
      status: 'ACTIVE',
      count: '320',
      ...overrides,
    }),
  },

  checkinHeatmap: (overrides = {}) => ({
    day_of_week: 1, // Monday
    hour_of_day: 10,
    checkin_count: '45',
    ...overrides,
  }),

  revenueBreakdown: {
    byBranch: (overrides = {}) => ({
      branch_id: 'branch-uuid-1',
      branch_name: '台北店',
      revenue: '500000',
      transaction_count: '150',
      ...overrides,
    }),

    byPlan: (overrides = {}) => ({
      plan_id: 'plan-uuid-1',
      plan_name: '年費會員',
      revenue: '300000',
      percentage: '60',
      ...overrides,
    }),

    byPaymentMethod: (overrides = {}) => ({
      payment_method: 'CREDIT_CARD',
      revenue: '400000',
      percentage: '80',
      ...overrides,
    }),

    byMonth: (overrides = {}) => ({
      year: 2024,
      month: 1,
      revenue: '500000',
      transaction_count: '150',
      ...overrides,
    }),
  },
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
describe('Analytics Routes', () => {
  let router;
  let routes;

  beforeEach(() => {
    router = createMockRouter();
    registerAnalyticsRoutes(router, mockDirectusContext);
    routes = router.routes;
  });

  // ============================================
  // GET /analytics/member-demographics
  // ============================================
  describe('GET /analytics/member-demographics', () => {
    it('should return member demographics data', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { days: '30' },
      });
      const res = createMockResponse();

      // The route makes 4 database calls: status, gender, age, join_trend
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.memberDemographics.statusDistribution(),
          analyticsTestData.memberDemographics.statusDistribution({ status: 'INACTIVE', count: '100' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.memberDemographics.genderDistribution(),
          analyticsTestData.memberDemographics.genderDistribution({ gender: 'F', count: '220' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.memberDemographics.ageDistribution(),
          analyticsTestData.memberDemographics.ageDistribution({ age_group: '30-39', count: '100' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          { month: '2024-01-01', count: '10' },
          { month: '2024-02-01', count: '15' },
        ]));

      await routes.get['/analytics/member-demographics'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.by_status).toHaveLength(2);
      expect(res._jsonData.data.by_gender).toHaveLength(2);
      expect(res._jsonData.data.by_age).toHaveLength(2);
      expect(res._jsonData.data.join_trend).toHaveLength(2);
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/member-demographics'](req, res);

      const calls = mockDatabaseRaw.mock.calls;
      const hasBranchFilter = calls.some(call =>
        call[0]?.includes('branch_id') || call[1]?.includes('branch-uuid-1')
      );
      expect(hasBranchFilter).toBe(true);
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/analytics/member-demographics'](req, res);

      expect(res._statusCode).toBe(401);
    });

    it('should use default days (30) when not provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/member-demographics'](req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockRejectedValueOnce(new Error('Database error'));

      await routes.get['/analytics/member-demographics'](req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // GET /analytics/contract-analytics
  // ============================================
  describe('GET /analytics/contract-analytics', () => {
    it('should return contract analytics data', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { period: '12m' },
      });
      const res = createMockResponse();

      // The route makes 5 database calls: status, type, trend, renewal, valueStats
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.contractAnalytics.statusDistribution(),
        ]))
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.contractAnalytics.typeDistribution(),
          analyticsTestData.contractAnalytics.typeDistribution({ contract_type: 'COUNT_BASED', count: '70' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          { month: '2024-01-01', new_contracts: '10', total_value: '120000' },
          { month: '2024-02-01', new_contracts: '15', total_value: '180000' },
        ]))
        .mockResolvedValueOnce(createDbResult([{ expired_count: '50', renewed_count: '35' }]))
        .mockResolvedValueOnce(createDbResult([{ avg_value: '12500', min_value: '3000', max_value: '36000', total_value: '1500000', count: '120' }]));

      await routes.get['/analytics/contract-analytics'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.by_status).toBeDefined();
      expect(res._jsonData.data.by_type).toBeDefined();
      expect(res._jsonData.data.monthly_trend).toBeDefined();
      expect(res._jsonData.data.renewal).toBeDefined();
      expect(res._jsonData.data.value_stats).toBeDefined();
    });

    it('should calculate renewal rate correctly', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      // 50 expired, 40 renewed = 80% renewal rate
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([{ expired_count: '50', renewed_count: '40' }]))
        .mockResolvedValueOnce(createDbResult([{ avg_value: '12500' }]));

      await routes.get['/analytics/contract-analytics'](req, res);

      expect(res._jsonData.data.renewal.rate).toBe(80);
    });

    it('should handle zero expired contracts for renewal rate', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([{ expired_count: '0', renewed_count: '0' }]))
        .mockResolvedValueOnce(createDbResult([{ avg_value: '0' }]));

      await routes.get['/analytics/contract-analytics'](req, res);

      expect(res._jsonData.data.renewal.rate).toBe(0);
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/contract-analytics'](req, res);

      const calls = mockDatabaseRaw.mock.calls;
      const hasBranchFilter = calls.some(call =>
        call[1]?.includes('branch-uuid-1')
      );
      expect(hasBranchFilter).toBe(true);
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/analytics/contract-analytics'](req, res);

      expect(res._statusCode).toBe(401);
    });
  });

  // ============================================
  // GET /analytics/checkin-heatmap
  // ============================================
  describe('GET /analytics/checkin-heatmap', () => {
    it('should return a 7x24 heatmap matrix', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { weeks: '4' },
      });
      const res = createMockResponse();

      // Generate sample heatmap data
      const heatmapData = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 6; hour < 22; hour++) {
          heatmapData.push(analyticsTestData.checkinHeatmap({
            day_of_week: day,
            hour_of_day: hour,
            checkin_count: String(Math.floor(Math.random() * 50)),
          }));
        }
      }

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(heatmapData));

      await routes.get['/analytics/checkin-heatmap'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.heatmap).toBeDefined();
      expect(res._jsonData.data.heatmap).toHaveLength(7); // 7 days
      expect(res._jsonData.data.heatmap[0]).toHaveLength(24); // 24 hours
    });

    it('should identify peak hours', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      // Peak at Monday 10:00 with 100 checkins
      const heatmapData = [
        analyticsTestData.checkinHeatmap({ day_of_week: 1, hour_of_day: 10, checkin_count: '100' }),
        analyticsTestData.checkinHeatmap({ day_of_week: 1, hour_of_day: 18, checkin_count: '80' }),
      ];

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(heatmapData));

      await routes.get['/analytics/checkin-heatmap'](req, res);

      expect(res._jsonData.data.peak).toBeDefined();
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/analytics/checkin-heatmap'](req, res);

      const queryCall = mockDatabaseRaw.mock.calls[0];
      expect(queryCall[1]).toContain('branch-uuid-1');
    });

    it('should use default weeks (4) when not provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/analytics/checkin-heatmap'](req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('should return empty matrix when no data', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      await routes.get['/analytics/checkin-heatmap'](req, res);

      expect(res._jsonData.data.heatmap).toBeDefined();
      // Each row should have 24 zeros
      res._jsonData.data.heatmap.forEach(row => {
        expect(row.every(val => val === 0)).toBe(true);
      });
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/analytics/checkin-heatmap'](req, res);

      expect(res._statusCode).toBe(401);
    });
  });

  // ============================================
  // GET /analytics/revenue-breakdown
  // ============================================
  describe('GET /analytics/revenue-breakdown', () => {
    it('should return revenue breakdown by all dimensions', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { year: '2024' },
      });
      const res = createMockResponse();

      // The route makes 5 database calls: branch, plan, monthly, yoy, payment_method
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.revenueBreakdown.byBranch(),
          analyticsTestData.revenueBreakdown.byBranch({ branch_id: 'b2', branch_name: '台中店', revenue: '300000' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.revenueBreakdown.byPlan(),
          analyticsTestData.revenueBreakdown.byPlan({ plan_id: 'p2', plan_name: '月費', revenue: '200000' }),
        ]))
        .mockResolvedValueOnce(createDbResult([
          { month: 1, revenue: '400000', transactions: '50' },
          { month: 2, revenue: '450000', transactions: '55' },
        ]))
        .mockResolvedValueOnce(createDbResult([
          { year: 2024, total_revenue: '1000000', transaction_count: '120' },
          { year: 2023, total_revenue: '800000', transaction_count: '100' },
        ]))
        .mockResolvedValueOnce(createDbResult([
          analyticsTestData.revenueBreakdown.byPaymentMethod(),
        ]));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      expect(res._statusCode).toBe(200);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.by_branch).toBeDefined();
      expect(res._jsonData.data.by_plan).toBeDefined();
      expect(res._jsonData.data.by_payment_method).toBeDefined();
      expect(res._jsonData.data.monthly).toBeDefined();
      expect(res._jsonData.data.yoy).toBeDefined();
    });

    it('should calculate YoY comparison', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { year: '2024' },
      });
      const res = createMockResponse();

      // Current year: 1,000,000, Last year: 800,000 = 25% growth
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([
          { year: 2024, total_revenue: '1000000', transaction_count: '100' },
          { year: 2023, total_revenue: '800000', transaction_count: '80' },
        ]))
        .mockResolvedValueOnce(createDbResult([]));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      expect(res._jsonData.data.yoy).toBeDefined();
      expect(res._jsonData.data.yoy.current_year).toBe(1000000);
      expect(res._jsonData.data.yoy.last_year).toBe(800000);
      expect(res._jsonData.data.yoy.change_percent).toBe(25);
    });

    it('should filter by branch_id when provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: 'branch-uuid-1' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      const calls = mockDatabaseRaw.mock.calls;
      const hasBranchFilter = calls.some(call =>
        call[1]?.includes('branch-uuid-1')
      );
      expect(hasBranchFilter).toBe(true);
    });

    it('should use current year as default when year not provided', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      const currentYear = new Date().getFullYear();
      expect(res._jsonData.year).toBe(currentYear);
    });

    it('should require authentication', async () => {
      const req = createMockRequest({
        accountability: null,
        query: {},
      });
      const res = createMockResponse();

      await routes.get['/analytics/revenue-breakdown'](req, res);

      expect(res._statusCode).toBe(401);
    });

    it('should handle database errors gracefully', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: {},
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockRejectedValueOnce(new Error('Database error'));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // Edge Cases & Error Handling
  // ============================================
  describe('Edge Cases & Error Handling', () => {
    it('should handle invalid days parameter gracefully', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { days: 'invalid' },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/member-demographics'](req, res);

      // Should use default value and not error
      expect(res._jsonData.success).toBe(true);
    });

    it('should handle very large date ranges', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { days: '3650' }, // 10 years
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/revenue-breakdown'](req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('should handle special characters in branch_id', async () => {
      const req = createMockRequest({
        accountability: { user: 'user-uuid-1' },
        query: { branch_id: "'; DROP TABLE branches; --" },
      });
      const res = createMockResponse();

      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      await routes.get['/analytics/member-demographics'](req, res);

      // Should not cause SQL injection - parameterized queries
      expect(res._statusCode).toBe(200);
    });
  });
});
