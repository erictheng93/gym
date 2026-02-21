import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, bodyMeasurements } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Measurements Route Tests
// Endpoints:
//   GET    /api/member/measurements
//   POST   /api/member/measurements
//   DELETE /api/member/measurements/:id
//   GET    /api/member/measurements/progress
//   GET    /api/member/measurements/latest
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';
let createdMeasurementId: string;

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

describe('Member Measurements Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(bodyMeasurements).where(eq(bodyMeasurements.memberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/measurements');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/measurements
  // ---------------------------------------------------------------------------

  describe('POST /api/member/measurements', () => {
    it('should create a measurement', async () => {
      if (!dbAvailable) return;

      const today = new Date().toISOString().split('T')[0];
      const res = await memberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          date: today,
          weight: 75.5,
          bodyFat: 18.2,
          muscleMass: 35.0,
          bmi: 23.5,
          source: 'MANUAL',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.measurement).toHaveProperty('id');
      expect(data.data.measurement.source).toBe('MANUAL');

      createdMeasurementId = data.data.measurement.id;
    });

    it('should reject missing date', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          weight: 75,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid weight range', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          date: '2024-01-15',
          weight: 10, // min is 20
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid bodyFat range', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          date: '2024-01-15',
          bodyFat: 90, // max is 80
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/measurements
  // ---------------------------------------------------------------------------

  describe('GET /api/member/measurements', () => {
    it('should return paginated measurement list', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('measurements');
      expect(data.data).toHaveProperty('pagination');
      expect(Array.isArray(data.data.measurements)).toBe(true);
      expect(data.data.measurements.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination parameters', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements?page=1&limit=5');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagination.limit).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/measurements/latest
  // ---------------------------------------------------------------------------

  describe('GET /api/member/measurements/latest', () => {
    it('should return latest measurement', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements/latest');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('measurement');
      expect(data.data.measurement).not.toBeNull();
      expect(data.data.measurement).toHaveProperty('weight');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/measurements/progress
  // ---------------------------------------------------------------------------

  describe('GET /api/member/measurements/progress', () => {
    it('should return progress data for weight', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements/progress?metric=weight');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('metric');
      expect(data.data.metric).toBe('weight');
      expect(data.data).toHaveProperty('dataPoints');
      expect(data.data).toHaveProperty('trend');
    });

    it('should support period parameter', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements/progress?metric=bodyFat&period=30');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBe(30);
    });

    it('should reject invalid metric', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/measurements/progress?metric=invalid');

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/member/measurements/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/member/measurements/:id', () => {
    it('should delete a measurement', async () => {
      if (!dbAvailable || !createdMeasurementId) return;

      const res = await memberRequest(`/api/member/measurements/${createdMeasurementId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for already deleted measurement', async () => {
      if (!dbAvailable || !createdMeasurementId) return;

      const res = await memberRequest(`/api/member/measurements/${createdMeasurementId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
