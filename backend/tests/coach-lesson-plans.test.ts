import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_LESSON_PLAN_ID,
  TEST_TENANT_ID,
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

let coachToken: string;
let createdPlanId: string;

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

describe('Coach Lesson Plans API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();
    coachToken = await getCoachToken();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // GET /api/coach/lesson-plans - List Plans
  // ===========================================================================

  describe('GET /api/coach/lesson-plans', () => {
    it('should list lesson plans and include test plan', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans');

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('total');
      expect(data.meta).toHaveProperty('limit');
      expect(data.meta).toHaveProperty('offset');

      // Should include the test lesson plan created in fixtures
      const testPlan = data.data.find(
        (p: { id: string }) => p.id === TEST_LESSON_PLAN_ID
      );
      expect(testPlan).toBeDefined();
      expect(testPlan.title).toBe('上肢力量訓練');
    });

    it('should filter by is_template=true', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans?is_template=true');

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // All returned plans should be templates
      for (const plan of data.data) {
        expect(plan.is_template).toBe(true);
      }
    });

    it('should return 401 without token', async () => {
      const res = await app.request('/api/coach/lesson-plans');

      expect(res.status).toBe(401);
    });
  });

  // ===========================================================================
  // GET /api/coach/lesson-plans/templates - List Templates
  // ===========================================================================

  describe('GET /api/coach/lesson-plans/templates', () => {
    it('should return templates with categories', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans/templates');

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('categories');
      expect(Array.isArray(data.categories)).toBe(true);
    });
  });

  // ===========================================================================
  // GET /api/coach/lesson-plans/:id - Plan Detail
  // ===========================================================================

  describe('GET /api/coach/lesson-plans/:id', () => {
    it('should return plan detail for existing plan', async () => {
      const res = await makeCoachRequest(
        `/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}`
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id');
      expect(data.data.id).toBe(TEST_LESSON_PLAN_ID);
      expect(data.data).toHaveProperty('title');
      expect(data.data).toHaveProperty('session');
      expect(data.data).toHaveProperty('is_own');
      expect(data.data.is_own).toBe(true);
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(
        '/api/coach/lesson-plans/00000000-0000-0000-0000-999999999999'
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  // ===========================================================================
  // POST /api/coach/lesson-plans - Create Plan
  // ===========================================================================

  describe('POST /api/coach/lesson-plans', () => {
    it('should create a lesson plan with valid data', async () => {
      const res = await makeCoachRequest('/api/coach/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: '下肢力量訓練',
          objectives: ['增強腿部力量', '改善平衡'],
          warmup_exercises: [
            { name: '動態伸展', duration: '5min' },
          ],
          main_exercises: [
            { name: '深蹲', sets: 4, reps: '8-10', weight: '60kg' },
            { name: '硬舉', sets: 3, reps: '6-8', weight: '80kg' },
          ],
          cooldown_exercises: [
            { name: '靜態伸展', duration: '5min' },
          ],
          notes: '注意膝蓋不超過腳尖',
          difficulty: 'INTERMEDIATE',
          duration_minutes: 60,
        }),
      });

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('message');
      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('title');
      expect(data.data.title).toBe('下肢力量訓練');

      // Store the created plan ID for later tests
      createdPlanId = data.data.id;
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
  });

  // ===========================================================================
  // PATCH /api/coach/lesson-plans/:id - Update Plan
  // ===========================================================================

  describe('PATCH /api/coach/lesson-plans/:id', () => {
    it('should update an existing plan', async () => {
      expect(createdPlanId).toBeDefined();

      const res = await makeCoachRequest(
        `/api/coach/lesson-plans/${createdPlanId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: '下肢力量訓練（進階版）',
            difficulty: 'ADVANCED',
            notes: '進階訓練，注意安全',
          }),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('message');
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(
        '/api/coach/lesson-plans/00000000-0000-0000-0000-999999999999',
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: '不存在的教案',
          }),
        }
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  // ===========================================================================
  // POST /api/coach/lesson-plans/:id/copy - Copy Plan
  // ===========================================================================

  describe('POST /api/coach/lesson-plans/:id/copy', () => {
    it('should copy a plan with default title containing (副本)', async () => {
      const res = await makeCoachRequest(
        `/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}/copy`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('message');
      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('title');
      expect(data.data.title).toContain('(副本)');
    });

    it('should copy a plan with a custom title', async () => {
      const res = await makeCoachRequest(
        `/api/coach/lesson-plans/${TEST_LESSON_PLAN_ID}/copy`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: '自訂複製教案標題',
          }),
        }
      );

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id');
      expect(data.data.title).toBe('自訂複製教案標題');
    });
  });

  // ===========================================================================
  // DELETE /api/coach/lesson-plans/:id - Delete Plan
  // ===========================================================================

  describe('DELETE /api/coach/lesson-plans/:id', () => {
    it('should delete the created plan', async () => {
      expect(createdPlanId).toBeDefined();

      const res = await makeCoachRequest(
        `/api/coach/lesson-plans/${createdPlanId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('message');
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await makeCoachRequest(
        '/api/coach/lesson-plans/00000000-0000-0000-0000-999999999999',
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });
});
