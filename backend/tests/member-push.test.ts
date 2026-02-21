import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, pushSubscriptions } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Push Notification Route Tests
// Endpoints:
//   GET    /api/member/push/vapid-public-key  (public)
//   POST   /api/member/push/subscribe
//   DELETE /api/member/push/unsubscribe
//   GET    /api/member/push/subscriptions
//   PATCH  /api/member/push/preferences
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

describe('Member Push Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.memberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/push/vapid-public-key (public endpoint)
  // ---------------------------------------------------------------------------

  describe('GET /api/member/push/vapid-public-key', () => {
    it('should return VAPID public key without auth', async () => {
      const res = await app.request('/api/member/push/vapid-public-key');
      // May return 200 with key, 500 or 503 if VAPID not configured
      expect([200, 500, 503]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('publicKey');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Auth validation
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 for subscribe without token', async () => {
      const res = await app.request('/api/member/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://push.example.com/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        }),
      });
      expect(res.status).toBe(401);
    });

    it('should return 401 for subscriptions without token', async () => {
      const res = await app.request('/api/member/push/subscriptions');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/push/subscribe
  // ---------------------------------------------------------------------------

  describe('POST /api/member/push/subscribe', () => {
    it('should reject missing endpoint', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          keys: { p256dh: 'test', auth: 'test' },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing keys', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'https://push.example.com/test',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should subscribe successfully with valid data', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'https://push.example.com/test-endpoint-1',
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8unFWVg',
            auth: 'tBHItJI5svbpC7htR-Ew_A',
          },
          userAgent: 'Test/1.0',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/push/subscriptions
  // ---------------------------------------------------------------------------

  describe('GET /api/member/push/subscriptions', () => {
    it('should return member subscriptions', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/push/subscriptions');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('subscriptions');
      expect(Array.isArray(data.data.subscriptions)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/member/push/preferences
  // ---------------------------------------------------------------------------

  describe('PATCH /api/member/push/preferences', () => {
    it('should update notification preferences', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/push/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          notifyBookingReminder: false,
          notifyClassCancelled: true,
          notifyContractExpiry: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/member/push/unsubscribe
  // ---------------------------------------------------------------------------

  describe('DELETE /api/member/push/unsubscribe', () => {
    it('should unsubscribe specific endpoint', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/push/unsubscribe?endpoint=https://push.example.com/test-endpoint-1',
        { method: 'DELETE' }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
