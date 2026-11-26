import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, bodyMeasurements } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_B_ID,
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
    await createTestFixtures();
  });

  afterAll(async () => {
    await db.delete(bodyMeasurements).where(eq(bodyMeasurements.memberId, TEST_MEMBER_ID));
    await db.delete(bodyMeasurements).where(eq(bodyMeasurements.memberId, TEST_MEMBER_B_ID));
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

      const res = await memberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          weight: 75,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid weight range', async () => {

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

      const res = await memberRequest('/api/member/measurements/progress?metric=bodyFat&period=30');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBe(30);
    });

    it('should reject invalid metric', async () => {

      const res = await memberRequest('/api/member/measurements/progress?metric=invalid');

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/member/measurements/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/member/measurements/:id', () => {
    it('should delete a measurement', async () => {
      if (!createdMeasurementId) throw new Error('createdMeasurementId not set: earlier create test failed');

      const res = await memberRequest(`/api/member/measurements/${createdMeasurementId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for already deleted measurement', async () => {
      if (!createdMeasurementId) throw new Error('createdMeasurementId not set: earlier create test failed');

      const res = await memberRequest(`/api/member/measurements/${createdMeasurementId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-member isolation
  // ---------------------------------------------------------------------------

  describe('Cross-member isolation', () => {
    let otherMeasurementId: string;

    function otherMemberRequest(path: string, options: RequestInit = {}) {
      const headers = new Headers(options.headers);
      headers.set(MEMBER_TOKEN_HEADER, generateMemberTokens({
        id: TEST_MEMBER_B_ID,
        memberCode: 'OM0001',
        branchId: TEST_BRANCH_B_ID,
        tenantId: TEST_TENANT_B_ID,
      }).accessToken);
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      return app.request(path, { ...options, headers });
    }

    beforeAll(async () => {
      const res = await otherMemberRequest('/api/member/measurements', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          weight: 123.4,
          source: 'MANUAL',
        }),
      });
      expect(res.status).toBe(201);
      otherMeasurementId = (await res.json()).data.measurement.id;
    });

    it("should not include another member's measurements in the list", async () => {
      const data = await (await memberRequest('/api/member/measurements')).json();

      expect(data.data.measurements.map((m: { id: string }) => m.id)).not.toContain(otherMeasurementId);

      const theirs = await (await otherMemberRequest('/api/member/measurements')).json();
      expect(theirs.data.measurements.map((m: { id: string }) => m.id)).toEqual([otherMeasurementId]);
    });

    it("should not return another member's measurement as latest", async () => {
      const mine = await (await memberRequest('/api/member/measurements/latest')).json();
      const theirs = await (await otherMemberRequest('/api/member/measurements/latest')).json();

      expect(mine.data.measurement?.id).not.toBe(otherMeasurementId);
      expect(theirs.data.measurement.id).toBe(otherMeasurementId);
    });

    it("should not delete another member's measurement", async () => {
      const res = await memberRequest(`/api/member/measurements/${otherMeasurementId}`, { method: 'DELETE' });

      expect(res.status).toBe(404);
      const rows = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, otherMeasurementId));
      expect(rows).toHaveLength(1);
    });
  });
});
