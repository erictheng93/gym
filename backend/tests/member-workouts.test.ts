import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, workoutLogs } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Workout Route Tests
// Endpoints:
//   GET    /api/member/workouts
//   POST   /api/member/workouts
//   GET    /api/member/workouts/:id
//   PUT    /api/member/workouts/:id
//   DELETE /api/member/workouts/:id
//   GET    /api/member/workouts/stats/summary
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';
let createdWorkoutId: string;

function getMemberAccessToken() {
  return generateMemberTokens({
    id: TEST_MEMBER_ID,
    memberCode: 'M000001',
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
  }).accessToken;
}

function memberRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set(MEMBER_TOKEN_HEADER, getMemberAccessToken());
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

describe('Member Workout Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(workoutLogs).where(eq(workoutLogs.memberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/workouts');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/workouts
  // ---------------------------------------------------------------------------

  describe('POST /api/member/workouts', () => {
    it('should create a workout log', async () => {
      if (!dbAvailable) return;

      const today = new Date().toISOString().split('T')[0];
      const res = await memberRequest('/api/member/workouts', {
        method: 'POST',
        body: JSON.stringify({
          date: today,
          duration: 60,
          calories: 300,
          notes: 'Test workout session',
          exercises: [
            { name: '跑步機', category: 'CARDIO', duration: 30 },
            { name: '臥推', category: 'STRENGTH', sets: 3, reps: 10, weight: 60 },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id');
      expect(data.data.duration).toBe(60);
      expect(data.data.calories).toBe(300);

      createdWorkoutId = data.data.id;
    });

    it('should reject missing date', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts', {
        method: 'POST',
        body: JSON.stringify({
          duration: 30,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid duration', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts', {
        method: 'POST',
        body: JSON.stringify({
          date: '2024-01-15',
          duration: -10,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/workouts
  // ---------------------------------------------------------------------------

  describe('GET /api/member/workouts', () => {
    it('should return paginated workout list', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('workouts');
      expect(data.data).toHaveProperty('pagination');
      expect(Array.isArray(data.data.workouts)).toBe(true);
      expect(data.data.workouts.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination parameters', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts?page=1&limit=5');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagination.limit).toBe(5);
    });

    it('should support date filters', async () => {
      if (!dbAvailable) return;

      const today = new Date().toISOString().split('T')[0];
      const res = await memberRequest(
        `/api/member/workouts?startDate=${today}&endDate=${today}`
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/workouts/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/member/workouts/:id', () => {
    it('should return a specific workout', async () => {
      if (!dbAvailable || !createdWorkoutId) return;

      const res = await memberRequest(`/api/member/workouts/${createdWorkoutId}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(createdWorkoutId);
    });

    it('should return 404 for non-existent workout', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/workouts/00000000-0000-0000-0000-000000099999'
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/member/workouts/:id
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/workouts/:id', () => {
    it('should update a workout', async () => {
      if (!dbAvailable || !createdWorkoutId) return;

      const res = await memberRequest(`/api/member/workouts/${createdWorkoutId}`, {
        method: 'PUT',
        body: JSON.stringify({
          duration: 90,
          calories: 450,
          notes: 'Updated workout',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.duration).toBe(90);
    });

    it('should return 404 for non-existent workout', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/workouts/00000000-0000-0000-0000-000000099999',
        {
          method: 'PUT',
          body: JSON.stringify({ duration: 30 }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/workouts/stats/summary
  // ---------------------------------------------------------------------------

  describe('GET /api/member/workouts/stats/summary', () => {
    it('should return workout statistics', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts/stats/summary');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('totalWorkouts');
      expect(data.data).toHaveProperty('totalDuration');
      expect(data.data).toHaveProperty('totalCalories');
      expect(typeof data.data.totalWorkouts).toBe('number');
    });

    it('should support period parameter', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/workouts/stats/summary?period=7');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/member/workouts/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/member/workouts/:id', () => {
    it('should delete a workout', async () => {
      if (!dbAvailable || !createdWorkoutId) return;

      const res = await memberRequest(`/api/member/workouts/${createdWorkoutId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for already deleted workout', async () => {
      if (!dbAvailable || !createdWorkoutId) return;

      const res = await memberRequest(`/api/member/workouts/${createdWorkoutId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
