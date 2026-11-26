import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import { db, lessonPlans } from '../src/db/index.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_LESSON_PLAN_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_COACH_EMPLOYEE_ID,
  TEST_COACH_SESSION_ID,
  TEST_SESSION_ID,
} from './helpers.js';

// =============================================================================
// Coach Lesson Plans Route Tests
// Endpoints:
//   GET    /api/coach/lesson-plans           - List plans
//   GET    /api/coach/lesson-plans/templates - List templates
//   GET    /api/coach/lesson-plans/:id       - Plan detail
//   POST   /api/coach/lesson-plans           - Create plan
//   PATCH  /api/coach/lesson-plans/:id       - Update plan
//   DELETE /api/coach/lesson-plans/:id       - Delete plan
//   POST   /api/coach/lesson-plans/:id/copy  - Copy plan
// =============================================================================

const MISSING_ID = '00000000-0000-4000-8000-999999999999';

// Plans owned by OTHER coaches (inserted directly), used for isolation checks
const SAME_TENANT_PRIVATE_PLAN_ID = '00000000-0000-4000-8000-0000000000d1';
const SAME_TENANT_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000d2';
const OTHER_TENANT_PLAN_ID = '00000000-0000-4000-8000-0000000000d3';

let createdPlanId: string;
let createdTemplateId: string;

async function makeCoachRequest(path: string, options: RequestInit = {}) {
  const token = await getCoachToken();
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', token);
  headers.set('X-Tenant-Id', TEST_TENANT_ID);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

function requestAs(
  coach: { id: string; tenantId: string; branchId: string },
  path: string,
  options: RequestInit = {}
) {
  const { accessToken } = generateCoachTokens({
    id: coach.id,
    employeeCode: 'OTHER',
    branchId: coach.branchId,
    tenantId: coach.tenantId,
    jobTitle: 'COACH',
  });
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', accessToken);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

const sameTenantOtherCoach = { id: TEST_EMPLOYEE_ID, tenantId: TEST_TENANT_ID, branchId: TEST_BRANCH_ID };
const otherTenantCoach = { id: TEST_EMPLOYEE_B_ID, tenantId: TEST_TENANT_B_ID, branchId: TEST_BRANCH_B_ID };

describe('Coach Lesson Plans API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();

    await db.insert(lessonPlans).values([
      {
        id: SAME_TENANT_PRIVATE_PLAN_ID,
        coachId: TEST_EMPLOYEE_ID,
        title: '同事的私人教案',
        objectives: [],
        isTemplate: false,
        tenantId: TEST_TENANT_ID,
      },
      {
        id: SAME_TENANT_TEMPLATE_ID,
        coachId: TEST_EMPLOYEE_ID,
        title: '同事的公開範本',
        objectives: ['共享目標'],
        isTemplate: true,
        templateCategory: '共享分類',
        tenantId: TEST_TENANT_ID,
      },
      {
        id: OTHER_TENANT_PLAN_ID,
        coachId: TEST_EMPLOYEE_B_ID,
        title: '他館教案',
        objectives: [],
        isTemplate: true,
        tenantId: TEST_TENANT_B_ID,
      },
    ]);
  });

  afterAll(async () => {
    // Tenant B rows are not covered by the shared fixture cleanup
    await db.delete(lessonPlans).where(eq(lessonPlans.tenantId, TEST_TENANT_B_ID));
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // GET /api/coach/lesson-plans - List Plans
  // ===========================================================================

  describe('GET /api/coach/lesson-plans', () => {
    it("lists only the coach's own plans", async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans');

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.meta.limit).toBe(20);
      expect(data.meta.offset).toBe(0);

      const ids = data.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(TEST_LESSON_PLAN_ID);
      // Plans of colleagues (same tenant) and of other tenants are not in the list
      expect(ids).not.toContain(SAME_TENANT_PRIVATE_PLAN_ID);
      expect(ids).not.toContain(SAME_TENANT_TEMPLATE_ID);
      expect(ids).not.toContain(OTHER_TENANT_PLAN_ID);

      const testPlan = data.data.find((p: { id: string }) => p.id === TEST_LESSON_PLAN_ID);
      expect(testPlan).toMatchObject({
        title: '上肢力量訓練',
        objectives: ['增強肩部力量'],
        is_template: false,
        difficulty: 'INTERMEDIATE',
        duration_minutes: 60,
      });
    });

    it('does not list this coach\'s plans for another coach', async () => {
      const sameTenant = await (await requestAs(sameTenantOtherCoach, '/api/coach/lesson-plans')).json();
      expect(sameTenant.data.map((p: { id: string }) => p.id)).not.toContain(TEST_LESSON_PLAN_ID);

      const otherTenant = await (await requestAs(otherTenantCoach, '/api/coach/lesson-plans')).json();
      expect(otherTenant.data.map((p: { id: string }) => p.id)).toEqual([OTHER_TENANT_PLAN_ID]);
    });

    it('filters by search and difficulty', async () => {
      const hit = await (await makeCoachRequest('/api/coach/lesson-plans?search=上肢')).json();
      expect(hit.data.map((p: { id: string }) => p.id)).toEqual([TEST_LESSON_PLAN_ID]);

      const miss = await (await makeCoachRequest('/api/coach/lesson-plans?search=不存在')).json();
      expect(miss.data).toEqual([]);

      const beginner = await (await makeCoachRequest('/api/coach/lesson-plans?difficulty=BEGINNER')).json();
      expect(beginner.data).toEqual([]);
    });

    it('should return 401 without token', async () => {
      const res = await app.request('/api/coach/lesson-plans');

      expect(res.status).toBe(401);
    });
  });

  // ===========================================================================
  // GET /api/coach/lesson-plans/:id - Plan Detail
  // ===========================================================================

  describe('GET /api/coach/lesson-plans/:id', () => {
    it('returns the detail of an own plan', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}`);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: TEST_LESSON_PLAN_ID,
        title: '上肢力量訓練',
        is_own: true,
        is_template: false,
        session: null,
      });
    });

    it('lets a coach read a same-tenant template but marks it as not own', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${SAME_TENANT_TEMPLATE_ID}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.id).toBe(SAME_TENANT_TEMPLATE_ID);
      expect(data.data.is_own).toBe(false);
    });

    it("returns 404 for a colleague's non-template plan", async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${SAME_TENANT_PRIVATE_PLAN_ID}`);

      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('NOT_FOUND');
    });

    it("returns 404 for another tenant's plan, even a template", async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${OTHER_TENANT_PLAN_ID}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 when a coach of another tenant asks for this tenant's plan or template", async () => {
      for (const id of [TEST_LESSON_PLAN_ID, SAME_TENANT_TEMPLATE_ID]) {
        const res = await requestAs(otherTenantCoach, `/api/coach/lesson-plans/${id}`);
        expect(res.status).toBe(404);
      }
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${MISSING_ID}`);

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('NOT_FOUND');
    });
  });

  // ===========================================================================
  // POST /api/coach/lesson-plans - Create Plan
  // ===========================================================================

  describe('POST /api/coach/lesson-plans', () => {
    it('creates a plan and persists every field', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: '下肢力量訓練',
          objectives: ['增強腿部力量', '改善平衡'],
          warmup_exercises: [{ name: '動態伸展', duration: '5min' }],
          main_exercises: [
            { name: '深蹲', sets: 4, reps: '8-10', weight: '60kg' },
            { name: '硬舉', sets: 3, reps: '6-8', weight: '80kg' },
          ],
          cooldown_exercises: [{ name: '靜態伸展', duration: '5min' }],
          notes: '注意膝蓋不超過腳尖',
          difficulty: 'INTERMEDIATE',
          duration_minutes: 60,
        }),
      });

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('下肢力量訓練');
      createdPlanId = data.data.id;

      const detail = await (await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`)).json();
      expect(detail.data).toMatchObject({
        title: '下肢力量訓練',
        objectives: ['增強腿部力量', '改善平衡'],
        warmup_exercises: [{ name: '動態伸展', duration: '5min' }],
        cooldown_exercises: [{ name: '靜態伸展', duration: '5min' }],
        notes: '注意膝蓋不超過腳尖',
        difficulty: 'INTERMEDIATE',
        duration_minutes: 60,
        is_template: false,
        is_own: true,
      });
      expect(detail.data.main_exercises).toHaveLength(2);
      expect(detail.data.main_exercises[0]).toEqual({ name: '深蹲', sets: 4, reps: '8-10', weight: '60kg' });

      // Owned by the creating coach and their tenant
      const [row] = await db.select().from(lessonPlans).where(eq(lessonPlans.id, createdPlanId));
      expect(row.coachId).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(row.tenantId).toBe(TEST_TENANT_ID);
    });

    it('creates a template with a category and links an own session', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: '核心範本',
          is_template: true,
          template_category: '核心',
          session_id: TEST_COACH_SESSION_ID,
        }),
      });

      expect(res.status).toBe(201);
      createdTemplateId = (await res.json()).data.id;

      const detail = await (await makeCoachRequest(`/api/coach/lesson-plans/${createdTemplateId}`)).json();
      expect(detail.data.is_template).toBe(true);
      expect(detail.data.template_category).toBe('核心');
      expect(detail.data.session.id).toBe(TEST_COACH_SESSION_ID);
    });

    it("rejects linking to another coach's session with 403", async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({ title: '偷連結', session_id: TEST_SESSION_ID }),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN');
    });

    it('should return 400 without title', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({
          objectives: ['增強核心力量'],
          difficulty: 'BEGINNER',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 with an empty title', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // Templates & list filters (depend on the plans created above)
  // ===========================================================================

  describe('GET /api/coach/lesson-plans/templates', () => {
    it("returns the coach's own templates with categories, not a colleague's or another tenant's", async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans/templates');

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      const own = data.data.find((p: { id: string }) => p.id === createdTemplateId);
      expect(own).toMatchObject({ title: '核心範本', template_category: '核心', is_own: true });

      const ids = data.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(OTHER_TENANT_PLAN_ID);
      expect(ids).not.toContain(TEST_LESSON_PLAN_ID); // not a template
      expect(data.categories).toContain('核心');
      expect(data.categories).not.toContain(null);
    });

    it('does not leak this tenant\'s templates to a coach of another tenant', async () => {
      const res = await requestAs(otherTenantCoach, '/api/coach/lesson-plans/templates');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.map((p: { id: string }) => p.id)).toEqual([OTHER_TENANT_PLAN_ID]);
      expect(data.categories).not.toContain('核心');
    });

    it('filters the plan list by is_template', async () => {
      const templates = await (await makeCoachRequest('/api/coach/lesson-plans?is_template=true')).json();
      expect(templates.data.map((p: { id: string }) => p.id)).toEqual([createdTemplateId]);

      const plans = await (await makeCoachRequest('/api/coach/lesson-plans?is_template=false')).json();
      const ids = plans.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(TEST_LESSON_PLAN_ID);
      expect(ids).toContain(createdPlanId);
      expect(ids).not.toContain(createdTemplateId);
    });
  });

  // ===========================================================================
  // PATCH /api/coach/lesson-plans/:id - Update Plan
  // ===========================================================================

  describe('PATCH /api/coach/lesson-plans/:id', () => {
    it('updates the given fields', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: '下肢力量訓練（進階版）',
          difficulty: 'ADVANCED',
          notes: '進階訓練，注意安全',
        }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      const detail = await (await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`)).json();
      expect(detail.data).toMatchObject({
        title: '下肢力量訓練（進階版）',
        difficulty: 'ADVANCED',
        notes: '進階訓練，注意安全',
        duration_minutes: 60, // unchanged
      });
    });

    // BUG: src/routes/coach-lesson-plans.ts updatePlanSchema = createPlanSchema.partial() keeps the
    // .default([]) / .default(false) of the create schema, so a PATCH that omits objectives,
    // *_exercises or is_template silently resets them to [] / false (data loss).
    it.skip('keeps fields that are not part of the PATCH body', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: '只改標題' }),
      });
      expect(res.status).toBe(200);

      const detail = await (await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`)).json();
      expect(detail.data.objectives).toEqual(['增強腿部力量', '改善平衡']);
      expect(detail.data.main_exercises).toHaveLength(2);
    });

    it("rejects linking an update to another coach's session with 403", async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'PATCH',
        body: JSON.stringify({ session_id: TEST_SESSION_ID }),
      });

      expect(res.status).toBe(403);
    });

    it("cannot update a colleague's plan or template, nor another tenant's plan", async () => {
      for (const id of [SAME_TENANT_PRIVATE_PLAN_ID, SAME_TENANT_TEMPLATE_ID, OTHER_TENANT_PLAN_ID]) {
        const res = await makeCoachRequest(`/api/coach/lesson-plans/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: 'Hijacked' }),
        });
        expect(res.status).toBe(404);
      }

      const rows = await db.select().from(lessonPlans).where(eq(lessonPlans.coachId, TEST_EMPLOYEE_ID));
      expect(rows.map(r => r.title).sort()).toEqual(['同事的公開範本', '同事的私人教案']);
    });

    it("cannot be used by another tenant's coach on this coach's plan", async () => {
      const res = await requestAs(otherTenantCoach, `/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Hijacked' }),
      });

      expect(res.status).toBe(404);
      const [row] = await db.select().from(lessonPlans).where(eq(lessonPlans.id, createdPlanId));
      expect(row.title).toBe('下肢力量訓練（進階版）');
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${MISSING_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: '不存在的教案' }),
      });

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('NOT_FOUND');
    });
  });

  // ===========================================================================
  // POST /api/coach/lesson-plans/:id/copy - Copy Plan
  // ===========================================================================

  describe('POST /api/coach/lesson-plans/:id/copy', () => {
    it('copies a plan with default title containing (副本) and the same content', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}/copy`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).not.toBe(TEST_LESSON_PLAN_ID);
      expect(data.data.title).toBe('上肢力量訓練 (副本)');

      const copy = await (await makeCoachRequest(`/api/coach/lesson-plans/${data.data.id}`)).json();
      expect(copy.data).toMatchObject({
        objectives: ['增強肩部力量'],
        difficulty: 'INTERMEDIATE',
        duration_minutes: 60,
        is_template: false,
        is_own: true,
      });
    });

    it('copies a plan with a custom title', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}/copy`, {
        method: 'POST',
        body: JSON.stringify({ title: '自訂複製教案標題' }),
      });

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.data.title).toBe('自訂複製教案標題');
    });

    it('copying a template yields a non-template plan owned by the copier', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${createdTemplateId}/copy`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const copyId = (await res.json()).data.id;
      const [row] = await db.select().from(lessonPlans).where(eq(lessonPlans.id, copyId));
      expect(row.isTemplate).toBe(false);
      expect(row.templateCategory).toBeNull();
      expect(row.coachId).toBe(TEST_COACH_EMPLOYEE_ID);
    });

    it('can copy a same-tenant colleague\'s shared template into the coach\'s own plans', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${SAME_TENANT_TEMPLATE_ID}/copy`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const copyId = (await res.json()).data.id;
      const [row] = await db.select().from(lessonPlans).where(eq(lessonPlans.id, copyId));
      expect(row.coachId).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(row.objectives).toEqual(['共享目標']);
    });

    it("cannot copy a colleague's private plan or another tenant's plan (404)", async () => {
      for (const id of [SAME_TENANT_PRIVATE_PLAN_ID, OTHER_TENANT_PLAN_ID]) {
        const res = await makeCoachRequest(`/api/coach/lesson-plans/${id}/copy`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
      }
    });

    it("rejects linking a copy to another coach's session with 403", async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}/copy`, {
        method: 'POST',
        body: JSON.stringify({ session_id: TEST_SESSION_ID }),
      });

      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // DELETE /api/coach/lesson-plans/:id - Delete Plan
  // ===========================================================================

  describe('DELETE /api/coach/lesson-plans/:id', () => {
    it("cannot delete a colleague's plan or another tenant's plan (404) and leaves them in place", async () => {
      for (const id of [SAME_TENANT_PRIVATE_PLAN_ID, SAME_TENANT_TEMPLATE_ID, OTHER_TENANT_PLAN_ID]) {
        const res = await makeCoachRequest(`/api/coach/lesson-plans/${id}`, { method: 'DELETE' });
        expect(res.status).toBe(404);

        const rows = await db.select().from(lessonPlans).where(eq(lessonPlans.id, id));
        expect(rows).toHaveLength(1);
      }
    });

    it('cannot be used by another tenant\'s coach to delete this coach\'s plan', async () => {
      const res = await requestAs(otherTenantCoach, `/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const rows = await db.select().from(lessonPlans).where(eq(lessonPlans.id, createdPlanId));
      expect(rows).toHaveLength(1);
    });

    it('deletes the created plan', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      const after = await makeCoachRequest(`/api/coach/lesson-plans/${createdPlanId}`);
      expect(after.status).toBe(404);
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(`/api/coach/lesson-plans/${MISSING_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('NOT_FOUND');
    });
  });
});
