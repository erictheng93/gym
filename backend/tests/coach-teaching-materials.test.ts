import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_MATERIAL_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Helper: Make coach-authenticated request
// =============================================================================

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

// =============================================================================
// COACH TEACHING MATERIALS API TESTS
// =============================================================================

describe('Coach Teaching Materials API', () => {
  // Track IDs created during POST tests for use in PATCH/DELETE tests
  let createdMaterialId: string;

  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // 1. List Materials - GET /api/coach/teaching-materials
  // ===========================================================================

  describe('GET /api/coach/teaching-materials', () => {
    it('should list materials and include the test material', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json).toHaveProperty('meta');
      expect(json.meta).toHaveProperty('total');
      expect(json.meta).toHaveProperty('limit');
      expect(json.meta).toHaveProperty('offset');

      // The seeded test material should be present
      const testMaterial = json.data.find((m: { id: string }) => m.id === TEST_MATERIAL_ID);
      expect(testMaterial).toBeDefined();
      expect(testMaterial.name).toBe('啞鈴肩推');
      expect(testMaterial.type).toBe('EXERCISE');
    });

    it('should filter by type=EXERCISE', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials?type=EXERCISE');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // All returned items must be of type EXERCISE
      for (const item of json.data) {
        expect(item.type).toBe('EXERCISE');
      }
    });

    it('should return 401 without authentication token', async () => {
      const response = await app.request('/api/coach/teaching-materials', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // 2. Categories - GET /api/coach/teaching-materials/categories
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/categories', () => {
    it('should return categories grouped by type', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/categories');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      // The seeded material is type EXERCISE, so we expect that key to exist
      expect(json.data).toHaveProperty('EXERCISE');
      expect(Array.isArray(json.data.EXERCISE)).toBe(true);
      expect(json.data.EXERCISE.length).toBeGreaterThanOrEqual(1);

      // Each entry should have category and count
      const entry = json.data.EXERCISE[0];
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('count');
    });
  });

  // ===========================================================================
  // 3. Muscle Groups - GET /api/coach/teaching-materials/muscle-groups
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/muscle-groups', () => {
    it('should return muscle groups including shoulders', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/muscle-groups');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // The seeded material has muscleGroups: ['shoulders']
      expect(json.data).toContain('shoulders');
    });
  });

  // ===========================================================================
  // 4. Equipment - GET /api/coach/teaching-materials/equipment
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/equipment', () => {
    it('should return equipment including dumbbell', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/equipment');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // The seeded material has equipment: ['dumbbell']
      expect(json.data).toContain('dumbbell');
    });
  });

  // ===========================================================================
  // 5. Search - GET /api/coach/teaching-materials/search
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/search', () => {
    it('should find test material by searching for 啞鈴', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/search?q=啞鈴');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      // The seeded material name is '啞鈴肩推', so it should match
      const found = json.data.find((m: { id: string }) => m.id === TEST_MATERIAL_ID);
      expect(found).toBeDefined();
      expect(found.name).toBe('啞鈴肩推');
    });
  });

  // ===========================================================================
  // 6. Detail - GET /api/coach/teaching-materials/:id
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/:id', () => {
    it('should return full detail for the test material', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${TEST_MATERIAL_ID}`);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.id).toBe(TEST_MATERIAL_ID);
      expect(json.data.name).toBe('啞鈴肩推');
      expect(json.data.type).toBe('EXERCISE');
      expect(json.data.category).toBe('力量訓練');
      expect(json.data.muscle_groups).toContain('shoulders');
      expect(json.data.equipment).toContain('dumbbell');
      expect(json.data.difficulty).toBe('INTERMEDIATE');
      expect(json.data.instructions).toBeDefined();
      expect(json.data.tips).toBeDefined();
      expect(json.data.common_mistakes).toBeDefined();
      expect(json.data).toHaveProperty('related');
      expect(Array.isArray(json.data.related)).toBe(true);
    });

    it('should return 404 for non-existent material', async () => {
      const response = await makeCoachRequest(
        '/api/coach/teaching-materials/00000000-0000-0000-0000-999999999999'
      );

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  // ===========================================================================
  // 7. Create - POST /api/coach/teaching-materials
  // ===========================================================================

  describe('POST /api/coach/teaching-materials', () => {
    it('should create a new material with valid data', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials', {
        method: 'POST',
        body: JSON.stringify({
          type: 'EXERCISE',
          category: '有氧訓練',
          name: '波比跳',
          description: '全身性有氧運動',
          muscle_groups: ['full_body'],
          equipment: ['none'],
          difficulty: 'ADVANCED',
          instructions: ['站姿開始', '蹲下雙手撐地', '跳回棒式', '做一下伏地挺身', '跳回蹲姿', '跳起'],
          tips: ['保持核心穩定'],
          common_mistakes: ['腰部下塌'],
        }),
      });

      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toBeDefined();
      expect(json.data).toBeDefined();
      expect(json.data.id).toBeDefined();
      expect(json.data.type).toBe('EXERCISE');
      expect(json.data.name).toBe('波比跳');

      // Store ID for subsequent PATCH / DELETE tests
      createdMaterialId = json.data.id;
    });

    it('should return 400 when name is missing', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials', {
        method: 'POST',
        body: JSON.stringify({
          type: 'EXERCISE',
          category: '有氧訓練',
          // name is intentionally omitted
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // ===========================================================================
  // 8. Update - PATCH /api/coach/teaching-materials/:id
  // ===========================================================================

  describe('PATCH /api/coach/teaching-materials/:id', () => {
    it('should update an existing material', async () => {
      // Use the material created in the POST test
      const response = await makeCoachRequest(
        `/api/coach/teaching-materials/${createdMaterialId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: '波比跳（進階版）',
            difficulty: 'ADVANCED',
            tips: ['保持核心穩定', '落地時膝蓋微彎'],
          }),
        }
      );

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toBeDefined();
    });

    it('should return 404 when updating non-existent material', async () => {
      const response = await makeCoachRequest(
        '/api/coach/teaching-materials/00000000-0000-0000-0000-999999999999',
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: '不存在的資源',
          }),
        }
      );

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  // ===========================================================================
  // 9. Delete (Soft) - DELETE /api/coach/teaching-materials/:id
  // ===========================================================================

  describe('DELETE /api/coach/teaching-materials/:id', () => {
    it('should soft-delete an existing material', async () => {
      // Use the material created in the POST test
      const response = await makeCoachRequest(
        `/api/coach/teaching-materials/${createdMaterialId}`,
        {
          method: 'DELETE',
        }
      );

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toBeDefined();

      // Verify the material is no longer visible in the list (soft-deleted, isActive=false)
      const listResponse = await makeCoachRequest('/api/coach/teaching-materials');
      const listJson = await listResponse.json();
      const deleted = listJson.data.find((m: { id: string }) => m.id === createdMaterialId);
      expect(deleted).toBeUndefined();
    });

    it('should return 404 when deleting non-existent material', async () => {
      const response = await makeCoachRequest(
        '/api/coach/teaching-materials/00000000-0000-0000-0000-999999999999',
        {
          method: 'DELETE',
        }
      );

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });
});
