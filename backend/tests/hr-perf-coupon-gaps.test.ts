import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  db, branches, employees, salaryRecords, performanceReviews, coupons, couponUsages, jobTitles,
} from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_EMPLOYEE_ID,
  TEST_JOB_TITLE_ID,
  TEST_BRANCH_B_ID,
} from './helpers.js';

const BRANCH_2_ID = '00000000-0000-4000-8000-0000000000c1';
const EMPLOYEE_2_ID = '00000000-0000-4000-8000-0000000000c2';
const REVIEW_1_ID = '00000000-0000-4000-8000-0000000000c3';
const REVIEW_2_ID = '00000000-0000-4000-8000-0000000000c4';
const SALARY_ID = '00000000-0000-4000-8000-0000000000c5';
const COUPON_USED_ID = '00000000-0000-4000-8000-0000000000c6';
const COUPON_FREE_ID = '00000000-0000-4000-8000-0000000000c7';
const PERIOD = '2097-Q1';

describe('HR performance / payroll / coupon follow-up gaps', () => {
  let token: string;
  const send = (path: string, method = 'GET', body?: unknown) => authRequest(path, {
    method,
    token,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const createdReviewIds: string[] = [];

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
    const today = new Date().toISOString().slice(0, 10);

    await db.insert(branches).values({
      id: BRANCH_2_ID, name: 'Second branch', code: 'PF2', tenantId: TEST_TENANT_ID,
    } as typeof branches.$inferInsert).onConflictDoNothing();
    await db.insert(employees).values({
      id: EMPLOYEE_2_ID,
      fullName: 'Branch Two Employee',
      email: 'pf2@gym-nexus.test',
      branchId: BRANCH_2_ID,
      jobTitleId: TEST_JOB_TITLE_ID,
      employeeCode: 'PF2-001',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      hireDate: today,
      tenantId: TEST_TENANT_ID,
    }).onConflictDoNothing();
    await db.insert(performanceReviews).values([
      { id: REVIEW_1_ID, employeeId: TEST_EMPLOYEE_ID, reviewPeriod: PERIOD, status: 'APPROVED', overallScore: '80', tenantId: TEST_TENANT_ID },
      { id: REVIEW_2_ID, employeeId: EMPLOYEE_2_ID, reviewPeriod: PERIOD, status: 'APPROVED', overallScore: '95', tenantId: TEST_TENANT_ID },
    ]).onConflictDoNothing();
    await db.insert(salaryRecords).values({
      id: SALARY_ID,
      employeeId: TEST_EMPLOYEE_ID,
      branchId: TEST_BRANCH_ID,
      period: '2097-01',
      baseSalary: '40000',
      netSalary: '40000',
      status: 'PENDING',
      tenantId: TEST_TENANT_ID,
    }).onConflictDoNothing();
    await db.insert(coupons).values([COUPON_USED_ID, COUPON_FREE_ID].map((id, i) => ({
      id,
      tenantId: TEST_TENANT_ID,
      code: `PFC${i}`,
      name: `pf coupon ${i}`,
      discountType: 'FIXED' as const,
      discountValue: '100',
      validFrom: today,
      validUntil: today,
    }))).onConflictDoNothing();
    await db.insert(couponUsages).values({ couponId: COUPON_USED_ID, discountAmount: '100' });
  });

  afterAll(async () => {
    await db.delete(couponUsages).where(inArray(couponUsages.couponId, [COUPON_USED_ID, COUPON_FREE_ID]));
    await db.delete(coupons).where(inArray(coupons.id, [COUPON_USED_ID, COUPON_FREE_ID]));
    await db.delete(salaryRecords).where(eq(salaryRecords.id, SALARY_ID));
    await db.delete(performanceReviews).where(inArray(performanceReviews.id, [REVIEW_1_ID, REVIEW_2_ID, ...createdReviewIds]));
    await db.delete(employees).where(eq(employees.id, EMPLOYEE_2_ID));
    await db.delete(branches).where(eq(branches.id, BRANCH_2_ID));
    await cleanupTestFixtures();
  });

  describe('performance review creation', () => {
    it('sets the reviewer to the creating user employee', async () => {
      const res = await send('/api/performance/reviews', 'POST', {
        employee_id: EMPLOYEE_2_ID, review_period: '2097-Q2', review_type: 'QUARTERLY',
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      createdReviewIds.push(body.data.id);
      expect(body.data.reviewerId).toBe(TEST_EMPLOYEE_ID);
    });

    it('stores a score of 100 and rejects out-of-range scores', async () => {
      const ok = await send('/api/performance/reviews', 'POST', {
        employee_id: EMPLOYEE_2_ID, review_period: '2097-Q3', review_type: 'QUARTERLY', score: 100,
      });
      expect(ok.status).toBe(201);
      const okBody = await ok.json();
      createdReviewIds.push(okBody.data.id);
      expect(Number(okBody.data.overallScore)).toBe(100);

      for (const score of [101, -1, 'abc']) {
        const bad = await send('/api/performance/reviews', 'POST', {
          employee_id: EMPLOYEE_2_ID, review_period: '2097-Q4', review_type: 'QUARTERLY', score,
        });
        expect(bad.status).toBe(400);
      }
      const patchBad = await send(`/api/performance/reviews/${REVIEW_1_ID}`, 'PATCH', { score: 100.5 });
      expect(patchBad.status).toBe(400);
      const patchOk = await send(`/api/performance/reviews/${REVIEW_1_ID}`, 'PATCH', { score: 100 });
      expect(patchOk.status).toBe(200);
      await db.update(performanceReviews).set({ overallScore: '80' }).where(eq(performanceReviews.id, REVIEW_1_ID));
    });
  });

  describe('team dashboard branch filter', () => {
    it('limits the dashboard to the requested branch', async () => {
      const res = await send(`/api/performance/team-dashboard?period=${PERIOD}&branch_id=${BRANCH_2_ID}`);
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.total_reviews).toBe(1);
      expect(data.top_performers.map((t: { id: string }) => t.id)).toEqual([EMPLOYEE_2_ID]);

      const all = await (await send(`/api/performance/team-dashboard?period=${PERIOD}`)).json();
      expect(all.data.total_reviews).toBe(2);
    });

    it('treats a foreign-tenant branch as missing', async () => {
      const res = await send(`/api/performance/team-dashboard?branch_id=${TEST_BRANCH_B_ID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('salary record detail', () => {
    it('includes job title and branch', async () => {
      const res = await send(`/api/payroll/salary-records/${SALARY_ID}`);
      expect(res.status).toBe(200);
      const { data } = await res.json();
      const [title] = await db.select({ name: jobTitles.name }).from(jobTitles).where(eq(jobTitles.id, TEST_JOB_TITLE_ID));
      const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, TEST_BRANCH_ID));
      expect(data.branch_id).toBe(TEST_BRANCH_ID);
      expect(data.branch_name).toBe(branch.name);
      expect(data.job_title).toBe(title.name);
      expect(data.employee.job_title).toBe(title.name);
    });
  });

  describe('coupon delete', () => {
    it('refuses to delete a used coupon with 409 and keeps it', async () => {
      const res = await send(`/api/coupons/${COUPON_USED_ID}`, 'DELETE');
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('已使用的優惠券無法刪除，請改為停用');
      const rows = await db.select().from(coupons).where(eq(coupons.id, COUPON_USED_ID));
      expect(rows).toHaveLength(1);
      const usages = await db.select().from(couponUsages).where(eq(couponUsages.couponId, COUPON_USED_ID));
      expect(usages).toHaveLength(1);
    });

    it('still deletes an unused coupon', async () => {
      const res = await send(`/api/coupons/${COUPON_FREE_ID}`, 'DELETE');
      expect(res.status).toBe(200);
    });

    it('returns 404 for a missing coupon', async () => {
      const res = await send('/api/coupons/00000000-0000-4000-8000-0000000000ff', 'DELETE');
      expect(res.status).toBe(404);
    });
  });
});
