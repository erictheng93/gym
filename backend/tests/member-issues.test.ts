import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, issueReports } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Issues Route Tests
// Endpoints:
//   GET  /api/member/issues
//   POST /api/member/issues
//   GET  /api/member/issues/:id
//   PUT  /api/member/issues/:id
//   GET  /api/member/issues/types/list
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';
let createdIssueId: string;

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

describe('Member Issues Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(issueReports).where(eq(issueReports.memberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/issues');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/issues/types/list
  // ---------------------------------------------------------------------------

  describe('GET /api/member/issues/types/list', () => {
    it('should return available issue types', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues/types/list');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('issueTypes');
      expect(Array.isArray(data.data.issueTypes)).toBe(true);
      expect(data.data.issueTypes.length).toBe(4);
      expect(data.data.issueTypes[0]).toHaveProperty('value');
      expect(data.data.issueTypes[0]).toHaveProperty('label');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/issues
  // ---------------------------------------------------------------------------

  describe('POST /api/member/issues', () => {
    it('should create an issue', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
          type: 'EQUIPMENT',
          title: '跑步機故障',
          content: '三樓的跑步機編號 A3 無法正常運作，螢幕沒有反應，已經嘗試重新啟動但無效',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.issue).toHaveProperty('id');
      expect(data.data.issue.type).toBe('EQUIPMENT');
      expect(data.data.issue.status).toBe('SUBMITTED');

      createdIssueId = data.data.issue.id;
    });

    it('should reject missing branchId', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          type: 'EQUIPMENT',
          title: 'Test issue',
          content: 'This is a test issue with enough detail to pass validation',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing title', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
          type: 'EQUIPMENT',
          content: 'This is a test issue with enough detail to pass validation',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject content too short', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
          type: 'EQUIPMENT',
          title: 'Test',
          content: 'Short',  // min 10 chars
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid issue type', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          branchId: TEST_BRANCH_ID,
          type: 'INVALID_TYPE',
          title: 'Test issue',
          content: 'This is a test issue with enough detail to pass validation',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject non-existent branch', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues', {
        method: 'POST',
        body: JSON.stringify({
          branchId: '00000000-0000-0000-0000-000000099999',
          type: 'EQUIPMENT',
          title: 'Test issue',
          content: 'This is a test issue with enough detail to pass validation',
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/issues
  // ---------------------------------------------------------------------------

  describe('GET /api/member/issues', () => {
    it('should return paginated issue list', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('issues');
      expect(data.data).toHaveProperty('pagination');
      expect(Array.isArray(data.data.issues)).toBe(true);
      expect(data.data.issues.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination parameters', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues?page=1&limit=5');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagination.limit).toBe(5);
    });

    it('should support status filter', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/issues?status=SUBMITTED');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/issues/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/member/issues/:id', () => {
    it('should return a specific issue with details', async () => {
      if (!dbAvailable || !createdIssueId) return;

      const res = await memberRequest(`/api/member/issues/${createdIssueId}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.issue.id).toBe(createdIssueId);
      expect(data.data.issue).toHaveProperty('branch');
      expect(data.data.issue).toHaveProperty('canEdit');
      expect(data.data.issue.canEdit).toBe(true); // SUBMITTED status
    });

    it('should return 404 for non-existent issue', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/issues/00000000-0000-0000-0000-000000099999'
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/member/issues/:id
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/issues/:id', () => {
    it('should update an issue in SUBMITTED status', async () => {
      if (!dbAvailable || !createdIssueId) return;

      const res = await memberRequest(`/api/member/issues/${createdIssueId}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: '更新的問題描述：三樓的跑步機編號 A3 無法正常運作，螢幕完全黑屏',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent issue', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/issues/00000000-0000-0000-0000-000000099999',
        {
          method: 'PUT',
          body: JSON.stringify({ content: '更新問題描述內容，需要至少十個字' }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject edit when status is not SUBMITTED', async () => {
      if (!dbAvailable || !createdIssueId) return;

      // Manually update status to IN_PROGRESS to test the restriction
      await db.update(issueReports).set({
        status: 'IN_PROGRESS',
      }).where(eq(issueReports.id, createdIssueId));

      const res = await memberRequest(`/api/member/issues/${createdIssueId}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: '嘗試修改已在處理中的問題回報，這應該被拒絕',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('CANNOT_EDIT');
    });
  });
});
