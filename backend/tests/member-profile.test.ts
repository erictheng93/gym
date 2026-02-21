import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Profile Route Tests
// Endpoints:
//   GET  /api/member/me
//   PUT  /api/member/me
//   POST /api/member/complete-profile
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';

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

describe('Member Profile Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Auth validation (no DB needed)
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.request('/api/member/me', {
        headers: { [MEMBER_TOKEN_HEADER]: 'invalid-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/me
  // ---------------------------------------------------------------------------

  describe('GET /api/member/me', () => {
    it('should return member profile', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('member');
      expect(data.data.member.id).toBe(TEST_MEMBER_ID);
      expect(data.data.member).toHaveProperty('fullName');
      expect(data.data.member).toHaveProperty('phone');
      expect(data.data.member).toHaveProperty('email');
      expect(data.data.member).toHaveProperty('memberCode');
    });

    it('should include branch information', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me');
      const data = await res.json();

      expect(data.data).toHaveProperty('branch');
      expect(data.data.branch.id).toBe(TEST_BRANCH_ID);
      expect(data.data.branch).toHaveProperty('name');
    });

    it('should include contracts array', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me');
      const data = await res.json();

      expect(data.data).toHaveProperty('contracts');
      expect(Array.isArray(data.data.contracts)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/member/me
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/me', () => {
    it('should update member profile', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Updated Name',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject invalid phone format', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me', {
        method: 'PUT',
        body: JSON.stringify({
          phone: '12345',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me', {
        method: 'PUT',
        body: JSON.stringify({
          email: 'not-an-email',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid profile update fields', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: 'Test Member',
          gender: 'MALE',
          height: 175,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/complete-profile
  // ---------------------------------------------------------------------------

  describe('POST /api/member/complete-profile', () => {
    it('should reject without required phone', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/complete-profile', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid phone format', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/complete-profile', {
        method: 'POST',
        body: JSON.stringify({ phone: '12345' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
