import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, jobTitles } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_JOB_TITLE_ID,
  TEST_JOB_TITLE_B_ID,
} from './helpers.js';

describe('Job Titles API', () => {
  let authToken: string;
  let createdJobTitleId: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/job-titles', () => {
    it('should list all job titles for tenant', async () => {
      const response = await authRequest('/api/job-titles', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      const ids = data.data.map((j: { id: string }) => j.id);
      expect(ids).toContain(TEST_JOB_TITLE_ID);
      expect(ids).not.toContain(TEST_JOB_TITLE_B_ID);
    });
  });

  describe('GET /api/job-titles/:id', () => {
    it('should get a single job title', async () => {
      const response = await authRequest(`/api/job-titles/${TEST_JOB_TITLE_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_JOB_TITLE_ID);
      expect(data.data.name).toBe('Admin');
      expect(data.data.code).toBe('ADMIN');
    });

    it('should return 404 for non-existent job title', async () => {
      const response = await authRequest('/api/job-titles/00000000-0000-4000-8000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/job-titles', () => {
    it('should create a job title', async () => {
      const response = await authRequest('/api/job-titles', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Coach',
          code: 'COACH',
          description: 'Fitness coach',
          level: 3,
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Coach');
      expect(data.data.code).toBe('COACH');
      expect(data.data.level).toBe(3);

      createdJobTitleId = data.data.id;
    });

    it('should create a job title with permissionsConfig', async () => {
      const response = await authRequest('/api/job-titles', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          name: 'Receptionist',
          code: 'RECEPT',
          permissionsConfig: { canManageMembers: true, canViewReports: false },
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Receptionist');
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/job-titles', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing name, code
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/job-titles/:id', () => {
    it('should update a job title', async () => {
      const response = await authRequest(`/api/job-titles/${createdJobTitleId}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          name: 'Senior Coach',
          level: 5,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Senior Coach');
      expect(data.data.level).toBe(5);
    });

    it('should return 404 for non-existent job title', async () => {
      const response = await authRequest('/api/job-titles/00000000-0000-4000-8000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ name: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/job-titles/:id', () => {
    it('should hard-delete a job title', async () => {
      const response = await authRequest(`/api/job-titles/${createdJobTitleId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify it's actually gone (hard delete)
      const getResponse = await authRequest(`/api/job-titles/${createdJobTitleId}`, {
        method: 'GET',
        token: authToken,
      });

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent job title', async () => {
      const response = await authRequest('/api/job-titles/00000000-0000-4000-8000-999999999999', {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Tenant Isolation', () => {
    it('should return 404 when getting a job title from another tenant', async () => {
      const response = await authRequest(`/api/job-titles/${TEST_JOB_TITLE_B_ID}`, { token: authToken });
      expect(response.status).toBe(404);
    });

    it('should return 404 when updating a job title from another tenant', async () => {
      const response = await authRequest(`/api/job-titles/${TEST_JOB_TITLE_B_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ name: 'Hijacked' }),
      });
      expect(response.status).toBe(404);
    });

    it('should return 404 and keep the row when deleting a job title from another tenant', async () => {
      const response = await authRequest(`/api/job-titles/${TEST_JOB_TITLE_B_ID}`, {
        method: 'DELETE',
        token: authToken,
      });
      expect(response.status).toBe(404);

      const [row] = await db.select().from(jobTitles).where(eq(jobTitles.id, TEST_JOB_TITLE_B_ID));
      expect(row).toBeDefined();
      expect(row.name).not.toBe('Hijacked');
    });
  });
});
