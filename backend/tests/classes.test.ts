import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_BRANCH_ID,
  TEST_CLASS_ID,
  TEST_SESSION_ID,
  TEST_EMPLOYEE_ID,
} from './helpers.js';

describe('Classes API', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  // =========================================================================
  // GET /api/classes
  // =========================================================================

  describe('GET /api/classes', () => {
    it('should list classes', async () => {
      const response = await authRequest('/api/classes', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      const testClass = data.data.find((c: { id: string }) => c.id === TEST_CLASS_ID);
      expect(testClass).toBeDefined();
      expect(testClass.name).toBe('Test Yoga');
    });

    it('should filter by branchId', async () => {
      const response = await authRequest(`/api/classes?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.every((c: { branchId: string }) => c.branchId === TEST_BRANCH_ID)).toBe(true);
    });
  });

  // =========================================================================
  // GET /api/classes/:id
  // =========================================================================

  describe('GET /api/classes/:id', () => {
    it('should get class details with schedules', async () => {
      const response = await authRequest(`/api/classes/${TEST_CLASS_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_CLASS_ID);
      expect(data.data.name).toBe('Test Yoga');
      expect(Array.isArray(data.data.schedules)).toBe(true);
    });

    it('should return 404 for non-existent class', async () => {
      const response = await authRequest('/api/classes/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/classes
  // =========================================================================

  describe('POST /api/classes', () => {
    it('should create a class', async () => {
      const response = await authRequest('/api/classes', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'New Cardio Class',
          branchId: TEST_BRANCH_ID,
          category: 'CARDIO',
          difficultyLevel: 'INTERMEDIATE',
          durationMinutes: 45,
          maxCapacity: 15,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Cardio Class');
      expect(data.data.category).toBe('CARDIO');
      expect(data.data.durationMinutes).toBe(45);
    });

    it('should reject invalid branch', async () => {
      const response = await authRequest('/api/classes', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Bad Class',
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/classes', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
          // missing name
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // PATCH /api/classes/:id
  // =========================================================================

  describe('PATCH /api/classes/:id', () => {
    it('should update class', async () => {
      const response = await authRequest(`/api/classes/${TEST_CLASS_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          description: 'Updated description',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.description).toBe('Updated description');
    });

    it('should return 404 for non-existent class', async () => {
      const response = await authRequest('/api/classes/00000000-0000-0000-0000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          description: 'nope',
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/classes/:id/sessions
  // =========================================================================

  describe('GET /api/classes/:id/sessions', () => {
    it('should list sessions for a class', async () => {
      const response = await authRequest(`/api/classes/${TEST_CLASS_ID}/sessions`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // =========================================================================
  // POST /api/classes/schedules
  // =========================================================================

  describe('POST /api/classes/schedules', () => {
    it('should create a schedule', async () => {
      const response = await authRequest('/api/classes/schedules', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          classId: TEST_CLASS_ID,
          branchId: TEST_BRANCH_ID,
          instructorId: TEST_EMPLOYEE_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.dayOfWeek).toBe(1);
    });

    it('should reject invalid classId', async () => {
      const response = await authRequest('/api/classes/schedules', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          classId: '00000000-0000-0000-0000-999999999999',
          branchId: TEST_BRANCH_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
