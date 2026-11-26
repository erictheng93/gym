import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, or } from 'drizzle-orm';
import app from '../src/app.js';
import { db, payments, members, checkIns } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_MEMBER_ID,
  TEST_MEMBER_B_ID,
  TEST_CONTRACT_ID,
  TEST_CONTRACT_B_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

// =============================================================================
// REPORTS API INTEGRATION TESTS
// =============================================================================

describe('Reports API', () => {
  let token: string;

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
    // generateExcel lazy-loads exceljs on first use. That cold load (hundreds of
    // modules) takes ~1s on an idle machine but has exceeded the 30s test timeout
    // under heavy load, so pay it here instead of inside the first xlsx test.
    await import('exceljs');
  }, 120_000);

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
      expect(data.data.map((branch: any) => branch.branch_id)).toEqual([TEST_BRANCH_ID]);
    });

    it("sums only this tenant's INCOME payments into branch revenue", async () => {
      const common = { paymentMethod: 'CASH' as const, paymentDate: new Date() };
      await db.insert(payments).values([
        { ...common, contractId: TEST_CONTRACT_ID, memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID, amount: '1200.50', type: 'INCOME' },
        { ...common, contractId: TEST_CONTRACT_ID, memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID, amount: '-200.00', type: 'REFUND' },
        { ...common, contractId: TEST_CONTRACT_B_ID, memberId: TEST_MEMBER_B_ID, branchId: TEST_BRANCH_B_ID, tenantId: TEST_TENANT_B_ID, amount: '9999.00', type: 'INCOME' },
      ]);

      try {
        const response = await authRequest('/api/reports/branch-performance', { method: 'GET', token });
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.data.map((b: any) => b.branch_id)).toEqual([TEST_BRANCH_ID]);
        expect(data.data[0].current_period.revenue).toBe(1200.5);
        expect(data.summary.total_revenue).toBe(1200.5);
      } finally {
        await db.delete(payments).where(or(eq(payments.branchId, TEST_BRANCH_ID), eq(payments.branchId, TEST_BRANCH_B_ID)));
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
      expect(data.data.length).toBeGreaterThan(0);
      {
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
      // .xlsx is a zip archive
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
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
      // .xlsx is a zip archive
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
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

    // Payments stored at Taiwan noon (as payments.ts does for back-dated rows):
    // the whole end day must count, and the day after must not.
    it('includes payments made during the end day and excludes the next day', async () => {
      const common = { paymentMethod: 'CASH' as const, contractId: TEST_CONTRACT_ID, memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID, type: 'INCOME' as const };
      await db.insert(payments).values([
        { ...common, amount: '100', paymentDate: new Date('2025-03-01T12:00:00+08:00') },
        { ...common, amount: '250', paymentDate: new Date('2025-03-10T12:00:00+08:00') },
        { ...common, amount: '999', paymentDate: new Date('2025-03-11T12:00:00+08:00') },
      ]);

      try {
        const response = await authRequest('/api/reports/revenue?startDate=2025-03-01&endDate=2025-03-10', { method: 'GET', token });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.data.total).toBe(350);

        // A single-day window (the dashboard "today" card) is not empty
        const oneDay = await authRequest('/api/reports/revenue?startDate=2025-03-10&endDate=2025-03-10', { method: 'GET', token });
        expect((await oneDay.json()).data.total).toBe(250);

        const exportRes = await authRequest('/api/reports/revenue/export?startDate=2025-03-10&endDate=2025-03-10', { method: 'GET', token });
        expect(exportRes.status).toBe(200);
        expect(await exportRes.text()).toContain('250');
      } finally {
        await db.delete(payments).where(eq(payments.branchId, TEST_BRANCH_ID));
      }
    });

    it('rejects a malformed date with 400', async () => {
      const response = await authRequest('/api/reports/revenue?startDate=yesterday&endDate=2025-03-10', { method: 'GET', token });
      expect(response.status).toBe(400);
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

    it('counts members created inside a startDate/endDate window as newMembers (end day inclusive)', async () => {
      const base = { branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID, status: 'ACTIVE' as const, joinDate: '2025-03-01' };
      const inserted = await db.insert(members).values([
        { ...base, fullName: 'Growth A', phone: '0911000001', memberCode: 'M-GROWTH-A', createdAt: new Date('2025-03-01T09:00:00+08:00') },
        { ...base, fullName: 'Growth B', phone: '0911000002', memberCode: 'M-GROWTH-B', createdAt: new Date('2025-03-10T20:00:00+08:00') },
        { ...base, fullName: 'Growth C', phone: '0911000003', memberCode: 'M-GROWTH-C', createdAt: new Date('2025-03-11T12:00:00+08:00') },
      ]).returning({ id: members.id });

      try {
        const response = await authRequest(`/api/reports/member-growth?branchId=${TEST_BRANCH_ID}&startDate=2025-03-01&endDate=2025-03-10`, { method: 'GET', token });
        expect(response.status).toBe(200);
        expect((await response.json()).data.newMembers).toBe(2);

        // Without a window newMembers is null (not a misleading 0)
        const noWindow = await authRequest('/api/reports/member-growth', { method: 'GET', token });
        expect((await noWindow.json()).data.newMembers).toBeNull();

        const half = await authRequest('/api/reports/member-growth?startDate=2025-03-01', { method: 'GET', token });
        expect(half.status).toBe(400);
      } finally {
        await db.delete(members).where(or(...inserted.map(m => eq(members.id, m.id))));
      }
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

    it('uses a startDate/endDate window instead of days when given (end day inclusive)', async () => {
      const base = { memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID };
      const inserted = await db.insert(checkIns).values([
        { ...base, checkInTime: new Date('2025-03-01T12:00:00+08:00') },
        { ...base, checkInTime: new Date('2025-03-10T18:00:00+08:00') },
        { ...base, checkInTime: new Date('2025-03-11T12:00:00+08:00') },
      ]).returning({ id: checkIns.id });

      try {
        const response = await authRequest(`/api/reports/member-activity?branchId=${TEST_BRANCH_ID}&startDate=2025-03-01&endDate=2025-03-10`, { method: 'GET', token });
        expect(response.status).toBe(200);
        expect((await response.json()).data.totalCheckIns).toBe(2);

        const bad = await authRequest('/api/reports/member-activity?startDate=2025-03-01&endDate=soon', { method: 'GET', token });
        expect(bad.status).toBe(400);
      } finally {
        await db.delete(checkIns).where(or(...inserted.map(r => eq(checkIns.id, r.id))));
      }
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
