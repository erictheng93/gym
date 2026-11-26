import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray, or } from 'drizzle-orm';
import {
  db, employees, salaryRecords, promotionRecords, performanceReviews, kpiTemplates,
} from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_EMPLOYEE_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_JOB_TITLE_B_ID,
} from './helpers.js';

// /api/payroll and /api/performance had no tenant filter at all: generate
// created salary rows for every tenant's ACTIVE employees, and every id-based
// route read or wrote any tenant's rows.

const PERIOD = '2099-01';
const SALARY_B_ID = '00000000-0000-4000-8000-0000000000d1';
const PROMOTION_B_ID = '00000000-0000-4000-8000-0000000000d2';
const REVIEW_B_ID = '00000000-0000-4000-8000-0000000000d3';
const TEMPLATE_B_ID = '00000000-0000-4000-8000-0000000000d4';

describe('HR routes are scoped to the caller tenant', () => {
  let token: string;
  const send = (path: string, method = 'GET', body?: unknown) => authRequest(path, {
    method,
    token,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();

    await db.update(employees).set({ basicSalary: '48000' }).where(eq(employees.id, TEST_EMPLOYEE_ID));
    await db.update(employees).set({ basicSalary: '99999' }).where(eq(employees.id, TEST_EMPLOYEE_B_ID));

    await db.insert(salaryRecords).values({
      id: SALARY_B_ID,
      employeeId: TEST_EMPLOYEE_B_ID,
      branchId: TEST_BRANCH_B_ID,
      period: '2098-12',
      baseSalary: '99999',
      netSalary: '99999',
      status: 'PENDING',
      tenantId: TEST_TENANT_B_ID,
    }).onConflictDoNothing();
    await db.insert(promotionRecords).values({
      id: PROMOTION_B_ID,
      employeeId: TEST_EMPLOYEE_B_ID,
      type: 'PROMOTION',
      effectiveDate: '2098-12-01',
      tenantId: TEST_TENANT_B_ID,
    }).onConflictDoNothing();
    await db.insert(performanceReviews).values({
      id: REVIEW_B_ID,
      employeeId: TEST_EMPLOYEE_B_ID,
      reviewPeriod: '2098-Q4',
      status: 'SUBMITTED',
      overallScore: '95',
      tenantId: TEST_TENANT_B_ID,
    }).onConflictDoNothing();
    await db.insert(kpiTemplates).values({
      id: TEMPLATE_B_ID,
      name: 'B template',
      reviewType: 'QUARTERLY',
      kpis: [{ id: 'k', name: 'secret' }],
      jobTitleId: TEST_JOB_TITLE_B_ID,
      tenantId: TEST_TENANT_B_ID,
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    const ids = [TEST_EMPLOYEE_ID, TEST_EMPLOYEE_B_ID];
    await db.delete(salaryRecords).where(inArray(salaryRecords.employeeId, ids));
    await db.delete(promotionRecords).where(inArray(promotionRecords.employeeId, ids));
    await db.delete(performanceReviews).where(inArray(performanceReviews.employeeId, ids));
    await db.delete(kpiTemplates).where(or(
      inArray(kpiTemplates.tenantId, [TEST_TENANT_ID, TEST_TENANT_B_ID]),
      inArray(kpiTemplates.createdBy, ids),
    ));
    await cleanupTestFixtures();
  });

  describe('POST /api/payroll/generate', () => {
    it('rejects a branch_id of another tenant and creates nothing', async () => {
      const res = await send('/api/payroll/generate', 'POST', { period: PERIOD, branch_id: TEST_BRANCH_B_ID });
      expect(res.status).toBe(400);
      const rows = await db.select().from(salaryRecords).where(eq(salaryRecords.period, PERIOD));
      expect(rows).toHaveLength(0);
    });

    it('rejects employee_ids of another tenant and creates nothing', async () => {
      const res = await send('/api/payroll/generate', 'POST', { period: PERIOD, employee_ids: [TEST_EMPLOYEE_ID, TEST_EMPLOYEE_B_ID] });
      expect(res.status).toBe(400);
      const rows = await db.select().from(salaryRecords).where(eq(salaryRecords.period, PERIOD));
      expect(rows).toHaveLength(0);
    });

    it('without filters generates only for this tenant employees', async () => {
      const res = await send('/api/payroll/generate', 'POST', { period: PERIOD });
      expect(res.status).toBe(200);

      const rows = await db.select().from(salaryRecords).where(eq(salaryRecords.period, PERIOD));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.branchId === TEST_BRANCH_ID && r.tenantId === TEST_TENANT_ID)).toBe(true);
      expect(rows.some(r => r.employeeId === TEST_EMPLOYEE_B_ID)).toBe(false);

      const mine = rows.find(r => r.employeeId === TEST_EMPLOYEE_ID)!;
      expect(Number(mine.hourlyRate)).toBe(200); // 48000 / 240
    });

    it('computes overtime from the stored hourly rate', async () => {
      const [mine] = await db.select().from(salaryRecords).where(eq(salaryRecords.employeeId, TEST_EMPLOYEE_ID));
      const res = await send(`/api/payroll/salary-records/${mine.id}`, 'PATCH', { overtime_hours: 10 });
      expect(res.status).toBe(200);

      const [after] = await db.select().from(salaryRecords).where(eq(salaryRecords.id, mine.id));
      expect(Number(after.overtimeHours)).toBe(10);
      expect(Number(after.overtimePay)).toBe(2660); // 10 h x 200 x 1.33
      expect(Number(after.netSalary)).toBe(48000 + 2660);
    });
  });

  describe('salary records of another tenant', () => {
    it('are not listed or exported', async () => {
      const list = await (await send('/api/payroll/salary-records?limit=100')).json();
      expect(list.data.map((r: { id: string }) => r.id)).not.toContain(SALARY_B_ID);
      expect(list.data.every((r: { employee_id: string }) => r.employee_id !== TEST_EMPLOYEE_B_ID)).toBe(true);

      const csv = await (await send('/api/payroll/export')).text();
      expect(csv).not.toContain('Other Employee');
    });

    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['POST', '/approve'],
      ['POST', '/pay'],
    ])('%s /salary-records/:id%s returns the same 404 as a random id', async (method, suffix) => {
      const body = method === 'PATCH' ? { bonus: 1 } : undefined;
      const foreign = await send(`/api/payroll/salary-records/${SALARY_B_ID}${suffix}`, method, body);
      const missing = await send(`/api/payroll/salary-records/${randomUUID()}${suffix}`, method, body);
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
    });

    it('batch-approve ignores them', async () => {
      const res = await send('/api/payroll/batch-approve', 'POST', { ids: [SALARY_B_ID] });
      expect((await res.json()).data.approved_count).toBe(0);

      const [row] = await db.select().from(salaryRecords).where(eq(salaryRecords.id, SALARY_B_ID));
      expect(row.status).toBe('PENDING');
      expect(row.bonus).toBe('0.00');
    });
  });

  describe('promotions', () => {
    it('does not list another tenant promotion', async () => {
      const list = await (await send('/api/payroll/promotions?limit=100')).json();
      expect(list.data.map((r: { id: string }) => r.id)).not.toContain(PROMOTION_B_ID);
    });

    it('cannot promote another tenant employee', async () => {
      const res = await send('/api/payroll/promotions', 'POST', { employee_id: TEST_EMPLOYEE_B_ID, type: 'PROMOTION', effective_date: '2000-01-01', new_base_salary: 1 });
      expect(res.status).toBe(404);
      const [emp] = await db.select().from(employees).where(eq(employees.id, TEST_EMPLOYEE_B_ID));
      expect(emp.basicSalary).toBe('99999.00');
    });

    it('cannot transfer an employee to another tenant branch', async () => {
      const res = await send('/api/payroll/promotions', 'POST', { employee_id: TEST_EMPLOYEE_ID, type: 'TRANSFER', effective_date: '2000-01-01', to_branch_id: TEST_BRANCH_B_ID });
      expect(res.status).toBe(400);
      const [emp] = await db.select().from(employees).where(eq(employees.id, TEST_EMPLOYEE_ID));
      expect(emp.branchId).toBe(TEST_BRANCH_ID);
    });

    it('cannot assign another tenant job title', async () => {
      const res = await send('/api/payroll/promotions', 'POST', { employee_id: TEST_EMPLOYEE_ID, type: 'PROMOTION', effective_date: '2000-01-01', to_job_title_id: TEST_JOB_TITLE_B_ID });
      expect(res.status).toBe(400);
    });
  });

  describe('performance reviews', () => {
    it('does not list or count another tenant review', async () => {
      const list = await (await send('/api/performance/reviews?limit=100')).json();
      expect(list.data.map((r: { id: string }) => r.id)).not.toContain(REVIEW_B_ID);

      const dash = await (await send('/api/performance/team-dashboard')).json();
      expect(dash.data.top_performers.map((t: { id: string }) => t.id)).not.toContain(TEST_EMPLOYEE_B_ID);
      expect(dash.data.total_reviews).toBe(Number(list.meta.total));
    });

    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['POST', '/submit'],
      ['POST', '/approve'],
      ['POST', '/reject'],
    ])('%s /reviews/:id%s returns the same 404 as a random id', async (method, suffix) => {
      const body = method === 'GET' ? undefined : { comments: 'Hijacked', reason: 'x' };
      const foreign = await send(`/api/performance/reviews/${REVIEW_B_ID}${suffix}`, method, body);
      const missing = await send(`/api/performance/reviews/${randomUUID()}${suffix}`, method, body);
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
    });

    it('left the other tenant review untouched', async () => {
      const [row] = await db.select().from(performanceReviews).where(eq(performanceReviews.id, REVIEW_B_ID));
      expect(row.status).toBe('SUBMITTED');
      expect(row.reviewerComments).toBeNull();
    });

    it('cannot create a review for another tenant employee', async () => {
      const res = await send('/api/performance/reviews', 'POST', { employee_id: TEST_EMPLOYEE_B_ID, review_period: '2099-Q1', review_type: 'QUARTERLY' });
      expect(res.status).toBe(404);
    });

    it('does not copy KPIs from another tenant template', async () => {
      const res = await send('/api/performance/reviews', 'POST', { employee_id: TEST_EMPLOYEE_ID, review_period: '2099-Q1', review_type: 'QUARTERLY', template_id: TEMPLATE_B_ID });
      expect(res.status).toBe(201);
      expect((await res.json()).data.kpiData).toEqual([]);
    });
  });

  describe('KPI templates', () => {
    it('does not list another tenant template, and lists its own', async () => {
      const created = await send('/api/performance/kpi-templates', 'POST', { name: 'A template', kpis: [] });
      expect(created.status).toBe(201);
      const createdId = (await created.json()).data.id;

      const list = await (await send('/api/performance/kpi-templates')).json();
      const ids = list.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(createdId);
      expect(ids).not.toContain(TEMPLATE_B_ID);
    });

    it('cannot delete another tenant template', async () => {
      const res = await send(`/api/performance/kpi-templates/${TEMPLATE_B_ID}`, 'DELETE');
      expect(res.status).toBe(404);
      const [row] = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, TEMPLATE_B_ID));
      expect(row.isActive).toBe(true);
    });
  });
});
