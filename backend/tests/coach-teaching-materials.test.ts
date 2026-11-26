import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import { db, teachingMaterials } from '../src/db/index.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_MATERIAL_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_COACH_EMPLOYEE_ID,
} from './helpers.js';

// =============================================================================
// Helper: Make coach-authenticated request
// =============================================================================

const MISSING_ID = '00000000-0000-4000-8000-999999999999';
const OTHER_TENANT_MATERIAL_ID = '00000000-0000-4000-8000-0000000000e1';

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

/** Request as a coach of ANOTHER tenant. */
function otherTenantRequest(path: string, options: RequestInit = {}) {
  const { accessToken } = generateCoachTokens({
    id: TEST_EMPLOYEE_B_ID,
    employeeCode: 'OEMP01',
    branchId: TEST_BRANCH_B_ID,
    tenantId: TEST_TENANT_B_ID,
    jobTitle: 'COACH',
  });
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', accessToken);
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

    // A material that belongs to another tenant, with values unique to it
    await db.insert(teachingMaterials).values({
      id: OTHER_TENANT_MATERIAL_ID,
      type: 'EXERCISE',
      category: '他館分類',
      name: '他館啞鈴課',
      tenantId: TEST_TENANT_B_ID,
      createdBy: TEST_EMPLOYEE_B_ID,
      muscleGroups: ['other_tenant_muscle'],
      equipment: ['other_tenant_equipment'],
      difficulty: 'BEGINNER',
      instructions: [],
      tips: [],
      commonMistakes: [],
    });
  });

  afterAll(async () => {
    // Tenant B rows are not covered by the shared fixture cleanup
    await db.delete(teachingMaterials).where(eq(teachingMaterials.tenantId, TEST_TENANT_B_ID));
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // 1. List Materials - GET /api/coach/teaching-materials
  // ===========================================================================

  describe('GET /api/coach/teaching-materials', () => {
    it('lists the tenant materials and includes the test material with its values', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.meta).toEqual({ total: 1, limit: 20, offset: 0 });

      expect(json.data).toHaveLength(1);
      expect(json.data[0]).toMatchObject({
        id: TEST_MATERIAL_ID,
        name: '啞鈴肩推',
        type: 'EXERCISE',
        category: '力量訓練',
        muscle_groups: ['shoulders'],
        equipment: ['dumbbell'],
        difficulty: 'INTERMEDIATE',
      });
    });

    it('does not show materials of another tenant (and vice versa)', async () => {
      const mine = await (await makeCoachRequest('/api/coach/teaching-materials')).json();
      expect(mine.data.map((m: { id: string }) => m.id)).not.toContain(OTHER_TENANT_MATERIAL_ID);

      const theirs = await (await otherTenantRequest('/api/coach/teaching-materials')).json();
      expect(theirs.data.map((m: { id: string }) => m.id)).toEqual([OTHER_TENANT_MATERIAL_ID]);
    });

    it('filters by type, category, difficulty and search', async () => {
      const exercises = await (await makeCoachRequest('/api/coach/teaching-materials?type=EXERCISE')).json();
      expect(exercises.data.map((m: { id: string }) => m.id)).toEqual([TEST_MATERIAL_ID]);

      const videos = await (await makeCoachRequest('/api/coach/teaching-materials?type=VIDEO')).json();
      expect(videos.data).toEqual([]);
      expect(videos.meta.total).toBe(0);

      const byCategory = await (await makeCoachRequest(
        `/api/coach/teaching-materials?category=${encodeURIComponent('力量訓練')}`
      )).json();
      expect(byCategory.data).toHaveLength(1);

      const wrongDifficulty = await (await makeCoachRequest('/api/coach/teaching-materials?difficulty=BEGINNER')).json();
      expect(wrongDifficulty.data).toEqual([]);

      const bySearch = await (await makeCoachRequest(
        `/api/coach/teaching-materials?search=${encodeURIComponent('肩推')}`
      )).json();
      expect(bySearch.data.map((m: { id: string }) => m.id)).toEqual([TEST_MATERIAL_ID]);
    });

    it('filters by muscle_groups and equipment', async () => {
      const hit = await (await makeCoachRequest('/api/coach/teaching-materials?muscle_groups=shoulders,legs')).json();
      expect(hit.data.map((m: { id: string }) => m.id)).toEqual([TEST_MATERIAL_ID]);

      const miss = await (await makeCoachRequest('/api/coach/teaching-materials?muscle_groups=legs')).json();
      expect(miss.data).toEqual([]);

      const equipHit = await (await makeCoachRequest('/api/coach/teaching-materials?equipment=dumbbell')).json();
      expect(equipHit.data).toHaveLength(1);

      const equipMiss = await (await makeCoachRequest('/api/coach/teaching-materials?equipment=barbell')).json();
      expect(equipMiss.data).toEqual([]);
    });

    it('supports pagination', async () => {
      const page = await (await makeCoachRequest('/api/coach/teaching-materials?limit=1&offset=1')).json();

      expect(page.data).toEqual([]);
      expect(page.meta).toEqual({ total: 1, limit: 1, offset: 1 });
    });

    it('should return 401 without authentication token', async () => {
      const response = await app.request('/api/coach/teaching-materials', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 with an invalid token', async () => {
      const response = await app.request('/api/coach/teaching-materials', {
        headers: { 'X-Coach-Token': 'not-a-token' },
      });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // 2. Categories - GET /api/coach/teaching-materials/categories
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/categories', () => {
    it('returns categories grouped by type with counts, only for the own tenant', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/categories');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        EXERCISE: [{ category: '力量訓練', count: 1 }],
      });
    });
  });

  // ===========================================================================
  // 3. Muscle Groups - GET /api/coach/teaching-materials/muscle-groups
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/muscle-groups', () => {
    it('returns the tenant muscle groups only', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/muscle-groups');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(['shoulders']);
    });
  });

  // ===========================================================================
  // 4. Equipment - GET /api/coach/teaching-materials/equipment
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/equipment', () => {
    it('returns the tenant equipment only', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/equipment');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual(['dumbbell']);
    });
  });

  // ===========================================================================
  // 5. Search - GET /api/coach/teaching-materials/search
  // ===========================================================================

  describe('GET /api/coach/teaching-materials/search', () => {
    it('finds the test material by searching for 啞鈴 but not the other tenant\'s 啞鈴 material', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials/search?q=啞鈴');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0]).toMatchObject({ id: TEST_MATERIAL_ID, name: '啞鈴肩推' });
    });

    it('applies difficulty, type and muscle group filters', async () => {
      const hit = await (await makeCoachRequest(
        '/api/coach/teaching-materials/search?difficulty=INTERMEDIATE&types=EXERCISE,VIDEO&muscle_groups=shoulders'
      )).json();
      expect(hit.data.map((m: { id: string }) => m.id)).toEqual([TEST_MATERIAL_ID]);

      const miss = await (await makeCoachRequest('/api/coach/teaching-materials/search?types=VIDEO')).json();
      expect(miss.data).toEqual([]);
    });

    it('does not return another tenant\'s material to this tenant, nor this tenant\'s to the other', async () => {
      const theirs = await (await otherTenantRequest('/api/coach/teaching-materials/search?q=啞鈴')).json();

      expect(theirs.data.map((m: { id: string }) => m.id)).toEqual([OTHER_TENANT_MATERIAL_ID]);
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
      expect(json.data).toMatchObject({
        id: TEST_MATERIAL_ID,
        name: '啞鈴肩推',
        type: 'EXERCISE',
        category: '力量訓練',
        muscle_groups: ['shoulders'],
        equipment: ['dumbbell'],
        difficulty: 'INTERMEDIATE',
        instructions: ['坐姿挺胸'],
        tips: ['保持穩定'],
        common_mistakes: ['聳肩'],
        is_active: true,
        file: null,
        related: [],
      });
    });

    it('should return 404 for non-existent material', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${MISSING_ID}`);

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a material of another tenant, in both directions', async () => {
      const mine = await makeCoachRequest(`/api/coach/teaching-materials/${OTHER_TENANT_MATERIAL_ID}`);
      expect(mine.status).toBe(404);

      const theirs = await otherTenantRequest(`/api/coach/teaching-materials/${TEST_MATERIAL_ID}`);
      expect(theirs.status).toBe(404);
      expect(JSON.stringify(await theirs.json())).not.toContain('啞鈴肩推');
    });
  });

  // ===========================================================================
  // 7. Create - POST /api/coach/teaching-materials
  // ===========================================================================

  describe('POST /api/coach/teaching-materials', () => {
    it('creates a material and persists the submitted values', async () => {
      const response = await makeCoachRequest('/api/coach/teaching-materials', {
        method: 'POST',
        body: JSON.stringify({
          type: 'EXERCISE',
          category: '有氧訓練',
          name: '波比跳',
          description: '全身性有氧運動',
          muscle_groups: ['shoulders', 'full_body'],
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
      expect(json.data.type).toBe('EXERCISE');
      expect(json.data.name).toBe('波比跳');
      createdMaterialId = json.data.id;

      const [row] = await db.select().from(teachingMaterials).where(eq(teachingMaterials.id, createdMaterialId));
      expect(row.tenantId).toBe(TEST_TENANT_ID);
      expect(row.createdBy).toBe(TEST_COACH_EMPLOYEE_ID);
      expect(row.isActive).toBe(true);

      const detail = await (await makeCoachRequest(`/api/coach/teaching-materials/${createdMaterialId}`)).json();
      expect(detail.data).toMatchObject({
        category: '有氧訓練',
        description: '全身性有氧運動',
        muscle_groups: ['shoulders', 'full_body'],
        equipment: ['none'],
        difficulty: 'ADVANCED',
        tips: ['保持核心穩定'],
        common_mistakes: ['腰部下塌'],
      });
      expect(detail.data.instructions).toHaveLength(6);
      // Shares the "shoulders" muscle group with the seeded material
      expect(detail.data.related.map((r: { id: string }) => r.id)).toEqual([TEST_MATERIAL_ID]);
    });

    it('returns the new material in the tenant lists but not to another tenant', async () => {
      const mine = await (await makeCoachRequest('/api/coach/teaching-materials')).json();
      expect(mine.data.map((m: { id: string }) => m.id)).toContain(createdMaterialId);

      const theirs = await (await otherTenantRequest('/api/coach/teaching-materials')).json();
      expect(theirs.data.map((m: { id: string }) => m.id)).not.toContain(createdMaterialId);
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

    it('should return 400 for an unknown type or an invalid video_url', async () => {
      const badType = await makeCoachRequest('/api/coach/teaching-materials', {
        method: 'POST',
        body: JSON.stringify({ type: 'PODCAST', category: 'x', name: 'y' }),
      });
      expect(badType.status).toBe(400);

      const badUrl = await makeCoachRequest('/api/coach/teaching-materials', {
        method: 'POST',
        body: JSON.stringify({ type: 'VIDEO', category: 'x', name: 'y', video_url: 'not a url' }),
      });
      expect(badUrl.status).toBe(400);
    });
  });

  // ===========================================================================
  // 8. Update - PATCH /api/coach/teaching-materials/:id
  // ===========================================================================

  describe('PATCH /api/coach/teaching-materials/:id', () => {
    it('updates the given fields and keeps the others', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${createdMaterialId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: '波比跳（進階版）',
          tips: ['保持核心穩定', '落地時膝蓋微彎'],
        }),
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const detail = await (await makeCoachRequest(`/api/coach/teaching-materials/${createdMaterialId}`)).json();
      expect(detail.data).toMatchObject({
        name: '波比跳（進階版）',
        tips: ['保持核心穩定', '落地時膝蓋微彎'],
        category: '有氧訓練', // unchanged
        difficulty: 'ADVANCED', // unchanged
        common_mistakes: ['腰部下塌'], // unchanged
      });
    });

    it('should return 404 when updating non-existent material', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${MISSING_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: '不存在的資源' }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('NOT_FOUND');
    });

    it("cannot update another tenant's material, in either direction", async () => {
      const mine = await makeCoachRequest(`/api/coach/teaching-materials/${OTHER_TENANT_MATERIAL_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Hijacked' }),
      });
      expect(mine.status).toBe(404);

      const theirs = await otherTenantRequest(`/api/coach/teaching-materials/${createdMaterialId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Hijacked' }),
      });
      expect(theirs.status).toBe(404);

      const [own] = await db.select().from(teachingMaterials).where(eq(teachingMaterials.id, createdMaterialId));
      expect(own.name).toBe('波比跳（進階版）');
      const [other] = await db.select().from(teachingMaterials).where(eq(teachingMaterials.id, OTHER_TENANT_MATERIAL_ID));
      expect(other.name).toBe('他館啞鈴課');
    });
  });

  // ===========================================================================
  // 9. Delete (Soft) - DELETE /api/coach/teaching-materials/:id
  // ===========================================================================

  describe('DELETE /api/coach/teaching-materials/:id', () => {
    it("cannot delete another tenant's material, in either direction", async () => {
      const mine = await makeCoachRequest(`/api/coach/teaching-materials/${OTHER_TENANT_MATERIAL_ID}`, {
        method: 'DELETE',
      });
      expect(mine.status).toBe(404);

      const theirs = await otherTenantRequest(`/api/coach/teaching-materials/${createdMaterialId}`, {
        method: 'DELETE',
      });
      expect(theirs.status).toBe(404);

      const rows = await db.select().from(teachingMaterials);
      const active = rows.filter(r => [createdMaterialId, OTHER_TENANT_MATERIAL_ID].includes(r.id));
      expect(active.map(r => r.isActive)).toEqual([true, true]);
    });

    it('soft-deletes an existing material and hides it from lists and search', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${createdMaterialId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      // Row is kept but deactivated
      const [row] = await db.select().from(teachingMaterials).where(eq(teachingMaterials.id, createdMaterialId));
      expect(row.isActive).toBe(false);

      const list = await (await makeCoachRequest('/api/coach/teaching-materials')).json();
      expect(list.data.map((m: { id: string }) => m.id)).not.toContain(createdMaterialId);
      expect(list.meta.total).toBe(1);

      const search = await (await makeCoachRequest(
        `/api/coach/teaching-materials/search?q=${encodeURIComponent('波比跳')}`
      )).json();
      expect(search.data).toEqual([]);
    });

    it('returns 404 when deleting an already soft-deleted material', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${createdMaterialId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 when deleting non-existent material', async () => {
      const response = await makeCoachRequest(`/api/coach/teaching-materials/${MISSING_ID}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });
});
