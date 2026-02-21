import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { dbAvailable } from './setup.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { db, notifications } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member Notification Route Tests
// Endpoints:
//   GET  /api/member/notifications/preferences
//   PUT  /api/member/notifications/preferences
//   GET  /api/member/notifications/channels
//   GET  /api/member/notifications/history
//   GET  /api/member/notifications/unread-count
//   POST /api/member/notifications/:id/read
//   POST /api/member/notifications/read-all
// =============================================================================

const MEMBER_TOKEN_HEADER = 'X-Member-Token';
let testNotificationId: string;

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

describe('Member Notification Routes', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await createTestFixtures();

    // Create a test notification
    const [notif] = await db.insert(notifications).values({
      title: 'Test Notification',
      message: 'Test notification body',
      type: 'SYSTEM',
      notificationType: 'system',
      targetMemberId: TEST_MEMBER_ID,
      recipientType: 'member',
      recipientId: TEST_MEMBER_ID,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
      isRead: false,
      readStatus: false,
    }).returning();
    testNotificationId = notif.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(notifications).where(eq(notifications.targetMemberId, TEST_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/member/notifications/preferences');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/notifications/preferences
  // ---------------------------------------------------------------------------

  describe('GET /api/member/notifications/preferences', () => {
    it('should return notification preferences', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/preferences');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('preferences');
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/member/notifications/preferences
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/notifications/preferences', () => {
    it('should update notification preferences', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          channels: {
            push: true,
            email: true,
            line: false,
            sms: false,
          },
          types: {
            booking_reminder: true,
            contract_expiry: true,
            class_cancelled: true,
            promotions: false,
            system: true,
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/notifications/channels
  // ---------------------------------------------------------------------------

  describe('GET /api/member/notifications/channels', () => {
    it('should return available channels', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/channels');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('channels');
      expect(Array.isArray(data.data.channels)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/notifications/history
  // ---------------------------------------------------------------------------

  describe('GET /api/member/notifications/history', () => {
    it('should return notification history with pagination', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/history');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('notifications');
      expect(data.data).toHaveProperty('pagination');
      expect(Array.isArray(data.data.notifications)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/history?page=1&limit=5');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagination.limit).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/member/notifications/unread-count
  // ---------------------------------------------------------------------------

  describe('GET /api/member/notifications/unread-count', () => {
    it('should return unread count', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/unread-count');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('unreadCount');
      expect(typeof data.data.unreadCount).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/notifications/:id/read
  // ---------------------------------------------------------------------------

  describe('POST /api/member/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(`/api/member/notifications/${testNotificationId}/read`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest(
        '/api/member/notifications/00000000-0000-0000-0000-000000099999/read',
        { method: 'POST' }
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/member/notifications/read-all
  // ---------------------------------------------------------------------------

  describe('POST /api/member/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      if (!dbAvailable) return;

      const res = await memberRequest('/api/member/notifications/read-all', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
