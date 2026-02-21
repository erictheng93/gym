import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, memberGoals } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Goals Route Tests
// Endpoints:
//   GET    /api/member/goals
//   POST   /api/member/goals
//   GET    /api/member/goals/:id
//   PUT    /api/member/goals/:id
//   DELETE /api/member/goals/:id
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';
let createdGoalId: string;

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

describe('Member Goals Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(memberGoals).where(eq(memberGoals.memberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/goals');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/goals
  // ---------------------------------------------------------------------------

  describe('POST /api/member/goals', () => {
    it('should create a goal', async () => {
      if (!dbAvailable) return;

      const today = new Date().toISOString().split('T')[0];
      const res = await memberRequest('/api/member/goals', {
        method: 'POST',
        body: JSON.stringify({
          goalType: 'WEIGHT_LOSS',
          targetValue: { value: 70, unit: 'kg' },
          currentValue: { value: 80, unit: 'kg' },
          startDate: today,
          notes: 'Test goal',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.goal).toHaveProperty('id');
      expect(data.data.goal.goalType).toBe('WEIGHT_LOSS');
      expect(data.data.goal.status).toBe('IN_PROGRESS');

      createdGoalId = data.data.goal.id;
    });

    it('should reject missing goalType', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals', {
        method: 'POST',
        body: JSON.stringify({
          targetValue: { value: 70 },
          startDate: '2024-01-15',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing startDate', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals', {
        method: 'POST',
        body: JSON.stringify({
          goalType: 'MUSCLE_GAIN',
          targetValue: { value: 50 },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid goalType', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals', {
        method: 'POST',
        body: JSON.stringify({
          goalType: 'INVALID_TYPE',
          targetValue: { value: 70 },
          startDate: '2024-01-15',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/goals
  // ---------------------------------------------------------------------------

  describe('GET /api/member/goals', () => {
    it('should return paginated goal list', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('goals');
      expect(data.data).toHaveProperty('pagination');
      expect(Array.isArray(data.data.goals)).toBe(true);
      expect(data.data.goals.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination parameters', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals?page=1&limit=5');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagination.limit).toBe(5);
    });

    it('should support status filter', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/goals?status=IN_PROGRESS');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.goals.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/goals/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/member/goals/:id', () => {
    it('should return a specific goal', async () => {
      if (!dbAvailable || !createdGoalId) return;

      const res = await memberRequest(`/api/member/goals/${createdGoalId}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.goal.id).toBe(createdGoalId);
    });

    it('should return 404 for non-existent goal', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/goals/00000000-0000-0000-0000-000000099999'
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/member/goals/:id
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/goals/:id', () => {
    it('should update a goal', async () => {
      if (!dbAvailable || !createdGoalId) return;

      const res = await memberRequest(`/api/member/goals/${createdGoalId}`, {
        method: 'PUT',
        body: JSON.stringify({
          currentValue: { value: 75, unit: 'kg' },
          notes: 'Updated goal progress',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should update goal status to ACHIEVED', async () => {
      if (!dbAvailable || !createdGoalId) return;

      const res = await memberRequest(`/api/member/goals/${createdGoalId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'ACHIEVED',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.goal.status).toBe('ACHIEVED');
    });

    it('should return 404 for non-existent goal', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/goals/00000000-0000-0000-0000-000000099999',
        {
          method: 'PUT',
          body: JSON.stringify({ notes: 'test' }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/member/goals/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/member/goals/:id', () => {
    it('should delete a goal', async () => {
      if (!dbAvailable || !createdGoalId) return;

      const res = await memberRequest(`/api/member/goals/${createdGoalId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for already deleted goal', async () => {
      if (!dbAvailable || !createdGoalId) return;

      const res = await memberRequest(`/api/member/goals/${createdGoalId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
