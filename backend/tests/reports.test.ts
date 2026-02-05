import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
} from './helpers.js';

// =============================================================================
// REPORTS API INTEGRATION TESTS
// =============================================================================

describe('Reports API', () => {
  let token: string;

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication Tests
  // ---------------------------------------------------------------------------
  describe('Authentication', () => {
    it('should reject unauthenticated requests to branch-performance', async () => {
      const response = await app.request('/api/reports/branch-performance', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to coach-performance', async () => {
      const response = await app.request('/api/reports/coach-performance', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reports/branch-performance
  // ---------------------------------------------------------------------------
  describe('GET /api/reports/branch-performance', () => {
    it('should return branch performance report with default period', async () => {
      const response = await authRequest('/api/reports/branch-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.period).toBeDefined();
      expect(data.period.current).toHaveProperty('start');
      expect(data.period.current).toHaveProperty('end');
      expect(data.period.previous).toHaveProperty('start');
      expect(data.period.previous).toHaveProperty('end');
      expect(data.summary).toBeDefined();
      expect(data.summary).toHaveProperty('total_revenue');
      expect(data.summary).toHaveProperty('total_revenue_growth');
      expect(data.summary).toHaveProperty('total_new_members');
      expect(data.summary).toHaveProperty('total_check_ins');
      expect(data.summary).toHaveProperty('total_active_contracts');
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.ranking).toBeDefined();
      expect(data.ranking).toHaveProperty('by_revenue');
      expect(data.ranking).toHaveProperty('by_growth');
      expect(data.ranking).toHaveProperty('by_check_ins');
    });

    it('should support week period parameter', async () => {
      const response = await authRequest('/api/reports/branch-performance?period=week', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.period).toBeDefined();

      // Check period is approximately 7 days
      const start = new Date(data.period.current.start);
      const end = new Date(data.period.current.end);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeLessThanOrEqual(8);
    });

    it('should support month period parameter', async () => {
      const response = await authRequest('/api/reports/branch-performance?period=month', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should support year period parameter', async () => {
      const response = await authRequest('/api/reports/branch-performance?period=year', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should support branchId filter', async () => {
      const response = await authRequest(`/api/reports/branch-performance?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // Should only contain data for the specified branch
      if (data.data.length > 0) {
        data.data.forEach((branch: any) => {
          expect(branch.branch_id).toBe(TEST_BRANCH_ID);
        });
      }
    });

    it('should support branch_id filter (alternative param name)', async () => {
      const response = await authRequest(`/api/reports/branch-performance?branch_id=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return data with rankings for each branch', async () => {
      const response = await authRequest('/api/reports/branch-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Check ranking arrays
      expect(Array.isArray(data.ranking.by_revenue)).toBe(true);
      expect(Array.isArray(data.ranking.by_growth)).toBe(true);
      expect(Array.isArray(data.ranking.by_check_ins)).toBe(true);

      // Each ranking item should have required fields
      data.ranking.by_revenue.forEach((item: any) => {
        expect(item).toHaveProperty('branch_id');
        expect(item).toHaveProperty('branch_name');
        expect(item).toHaveProperty('value');
        expect(item).toHaveProperty('rank');
      });
    });

    it('should include growth calculations in response', async () => {
      const response = await authRequest('/api/reports/branch-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Check that branch data includes growth info
      if (data.data.length > 0) {
        const branch = data.data[0];
        expect(branch).toHaveProperty('current_period');
        expect(branch).toHaveProperty('previous_period');
        expect(branch).toHaveProperty('growth');
        expect(branch.growth).toHaveProperty('revenue_change');
        expect(branch.growth).toHaveProperty('members_change');
        expect(branch.growth).toHaveProperty('check_ins_change');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reports/branch-performance/export
  // ---------------------------------------------------------------------------
  describe('GET /api/reports/branch-performance/export', () => {
    it('should export branch performance as CSV by default', async () => {
      const response = await authRequest('/api/reports/branch-performance/export', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('.csv');
    });

    it('should export branch performance as Excel when format=xlsx', async () => {
      const response = await authRequest('/api/reports/branch-performance/export?format=xlsx', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('spreadsheetml');
      expect(response.headers.get('content-disposition')).toContain('.xlsx');
    });

    it('should export branch performance as Excel when format=excel', async () => {
      const response = await authRequest('/api/reports/branch-performance/export?format=excel', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('spreadsheetml');
    });

    it('should support period parameter in export', async () => {
      const response = await authRequest('/api/reports/branch-performance/export?period=week', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
    });

    it('should support branchId filter in export', async () => {
      const response = await authRequest(`/api/reports/branch-performance/export?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reports/coach-performance
  // ---------------------------------------------------------------------------
  describe('GET /api/reports/coach-performance', () => {
    it('should return coach performance report with default period', async () => {
      const response = await authRequest('/api/reports/coach-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.period).toBeDefined();
      expect(data.period).toHaveProperty('start_date');
      expect(data.period).toHaveProperty('end_date');
      expect(data.summary).toBeDefined();
      expect(data.summary).toHaveProperty('total_coaches');
      expect(data.summary).toHaveProperty('total_classes_taught');
      expect(data.summary).toHaveProperty('total_students');
      expect(data.summary).toHaveProperty('average_satisfaction');
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should support month period parameter', async () => {
      const response = await authRequest('/api/reports/coach-performance?period=month', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should support quarter period parameter', async () => {
      const response = await authRequest('/api/reports/coach-performance?period=quarter', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Check period is approximately 3 months
      const start = new Date(data.period.start_date);
      const end = new Date(data.period.end_date);
      const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      expect(diffMonths).toBeGreaterThanOrEqual(2);
      expect(diffMonths).toBeLessThanOrEqual(4);
    });

    it('should support year period parameter', async () => {
      const response = await authRequest('/api/reports/coach-performance?period=year', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should support branchId filter', async () => {
      const response = await authRequest(`/api/reports/coach-performance?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should support branch_id filter (alternative param name)', async () => {
      const response = await authRequest(`/api/reports/coach-performance?branch_id=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should include coach metrics in response data', async () => {
      const response = await authRequest('/api/reports/coach-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // If there are coaches, check their structure
      if (data.data.length > 0) {
        const coach = data.data[0];
        expect(coach).toHaveProperty('coach_id');
        expect(coach).toHaveProperty('coach_name');
        expect(coach).toHaveProperty('coach_code');
        expect(coach).toHaveProperty('branch_id');
        expect(coach).toHaveProperty('branch_name');
        expect(coach).toHaveProperty('job_title');
        expect(coach).toHaveProperty('metrics');
        expect(coach.metrics).toHaveProperty('classes_taught');
        expect(coach.metrics).toHaveProperty('total_students');
        expect(coach.metrics).toHaveProperty('satisfaction_rating');
        expect(coach.metrics).toHaveProperty('review_count');
        expect(coach.metrics).toHaveProperty('attendance_rate');
        expect(coach.metrics).toHaveProperty('notes_created');
        expect(coach.metrics).toHaveProperty('lesson_plans_created');
        expect(coach).toHaveProperty('details');
        expect(coach.details).toHaveProperty('classes_by_category');
      }
    });

    it('should return numeric values for summary fields', async () => {
      const response = await authRequest('/api/reports/coach-performance', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      expect(typeof data.summary.total_coaches).toBe('number');
      expect(typeof data.summary.total_classes_taught).toBe('number');
      expect(typeof data.summary.total_students).toBe('number');
      expect(typeof data.summary.average_satisfaction).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reports/coach-performance/export
  // ---------------------------------------------------------------------------
  describe('GET /api/reports/coach-performance/export', () => {
    it('should export coach performance as CSV by default', async () => {
      const response = await authRequest('/api/reports/coach-performance/export', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('.csv');
    });

    it('should export coach performance as Excel when format=xlsx', async () => {
      const response = await authRequest('/api/reports/coach-performance/export?format=xlsx', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('spreadsheetml');
      expect(response.headers.get('content-disposition')).toContain('.xlsx');
    });

    it('should export coach performance as Excel when format=excel', async () => {
      const response = await authRequest('/api/reports/coach-performance/export?format=excel', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('spreadsheetml');
    });

    it('should support period parameter in export', async () => {
      const response = await authRequest('/api/reports/coach-performance/export?period=quarter', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
    });

    it('should support branchId filter in export', async () => {
      const response = await authRequest(`/api/reports/coach-performance/export?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Existing Report Endpoints (Revenue, Member Growth, etc.)
  // ---------------------------------------------------------------------------
  describe('GET /api/reports/revenue', () => {
    it('should return revenue report', async () => {
      const response = await authRequest('/api/reports/revenue', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data).toHaveProperty('total');
      expect(data.data).toHaveProperty('byBranch');
      expect(data.data).toHaveProperty('byDay');
    });

    it('should support date range parameters', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const response = await authRequest(`/api/reports/revenue?start_date=${startDate}&end_date=${endDate}`, {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/reports/member-growth', () => {
    it('should return member growth report', async () => {
      const response = await authRequest('/api/reports/member-growth', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data).toHaveProperty('total');
      expect(data.data).toHaveProperty('byMonth');
    });

    it('should support months parameter', async () => {
      const response = await authRequest('/api/reports/member-growth?months=12', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/reports/contract-expiry', () => {
    it('should return contract expiry report', async () => {
      const response = await authRequest('/api/reports/contract-expiry', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should support days parameter', async () => {
      const response = await authRequest('/api/reports/contract-expiry?days=60', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/reports/member-activity', () => {
    it('should return member activity report', async () => {
      const response = await authRequest('/api/reports/member-activity', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should support days parameter', async () => {
      const response = await authRequest('/api/reports/member-activity?days=7', {
        method: 'GET',
        token,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
