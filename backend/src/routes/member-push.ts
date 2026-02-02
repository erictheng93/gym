import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, pushSubscriptions } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import { pushService } from '../services/push.js';

// =============================================================================
// MEMBER PUSH NOTIFICATION ROUTES
// =============================================================================
// Push notification management for member-app
// Endpoints: /vapid-public-key, /subscribe, /unsubscribe, /preferences

const app = new Hono<{ Variables: MemberVariables }>();

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const subscribeSchema = z.object({
  endpoint: z.string().url('請提供有效的推播端點'),
  keys: z.object({
    p256dh: z.string().min(1, '請提供 p256dh key'),
    auth: z.string().min(1, '請提供 auth key'),
  }),
  userAgent: z.string().optional(),
});

const preferencesSchema = z.object({
  notifyBookingReminder: z.boolean().optional(),
  notifyClassCancelled: z.boolean().optional(),
  notifyContractExpiry: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/member/push/vapid-public-key - Get VAPID public key
// -----------------------------------------------------------------------------

app.get('/vapid-public-key', async (c) => {
  const publicKey = pushService.getPublicKey();

  if (!publicKey) {
    return c.json({
      success: false,
      error: '推播服務尚未設定',
      code: 'PUSH_NOT_CONFIGURED',
    }, 503);
  }

  return c.json({
    success: true,
    data: {
      publicKey,
    },
  });
});

// Apply auth middleware for remaining routes
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// POST /api/member/push/subscribe - Subscribe to push notifications
// -----------------------------------------------------------------------------

app.post(
  '/subscribe',
  zValidator('json', subscribeSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { endpoint, keys, userAgent } = c.req.valid('json');

    // Check if subscription already exists
    const [existingSubscription] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existingSubscription) {
      // Update existing subscription
      await db
        .update(pushSubscriptions)
        .set({
          memberId: memberInfo.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent || null,
          isActive: true,
          errorCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existingSubscription.id));

      return c.json({
        success: true,
        message: '推播訂閱已更新',
      });
    }

    // Create new subscription
    await db.insert(pushSubscriptions).values({
      memberId: memberInfo.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      isActive: true,
    });

    return c.json({
      success: true,
      message: '推播訂閱成功',
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/push/unsubscribe - Unsubscribe from push notifications
// -----------------------------------------------------------------------------

app.delete('/unsubscribe', async (c) => {
  const memberInfo = c.get('member')!;
  const endpoint = c.req.query('endpoint');

  if (endpoint) {
    // Unsubscribe specific endpoint
    await db
      .delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.memberId, memberInfo.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ));
  } else {
    // Unsubscribe all endpoints for this member
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.memberId, memberInfo.id));
  }

  return c.json({
    success: true,
    message: '已取消推播訂閱',
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/push/subscriptions - Get member's subscriptions
// -----------------------------------------------------------------------------

app.get('/subscriptions', async (c) => {
  const memberInfo = c.get('member')!;

  const subscriptions = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      isActive: pushSubscriptions.isActive,
      notifyBookingReminder: pushSubscriptions.notifyBookingReminder,
      notifyClassCancelled: pushSubscriptions.notifyClassCancelled,
      notifyContractExpiry: pushSubscriptions.notifyContractExpiry,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberInfo.id));

  return c.json({
    success: true,
    data: {
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        // Only show partial endpoint for privacy
        endpoint: sub.endpoint.substring(0, 50) + '...',
        userAgent: sub.userAgent,
        isActive: sub.isActive,
        preferences: {
          bookingReminder: sub.notifyBookingReminder,
          classCancelled: sub.notifyClassCancelled,
          contractExpiry: sub.notifyContractExpiry,
        },
        createdAt: sub.createdAt,
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// PATCH /api/member/push/preferences - Update notification preferences
// -----------------------------------------------------------------------------

app.patch(
  '/preferences',
  zValidator('json', preferencesSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const preferences = c.req.valid('json');

    // Update all subscriptions for this member
    await db
      .update(pushSubscriptions)
      .set({
        notifyBookingReminder: preferences.notifyBookingReminder,
        notifyClassCancelled: preferences.notifyClassCancelled,
        notifyContractExpiry: preferences.notifyContractExpiry,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.memberId, memberInfo.id));

    return c.json({
      success: true,
      message: '推播偏好已更新',
      data: {
        preferences: {
          bookingReminder: preferences.notifyBookingReminder,
          classCancelled: preferences.notifyClassCancelled,
          contractExpiry: preferences.notifyContractExpiry,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/push/test - Send test notification (dev only)
// -----------------------------------------------------------------------------

if (process.env.NODE_ENV === 'development') {
  app.post('/test', async (c) => {
    const memberInfo = c.get('member')!;

    const sent = await pushService.sendToMember(memberInfo.id, {
      title: '測試通知',
      body: '這是一則測試推播通知',
      icon: '/icon-192.png',
      data: {
        type: 'test',
        timestamp: Date.now(),
      },
    });

    return c.json({
      success: true,
      message: `已發送 ${sent} 則測試通知`,
    });
  });
}

export default app;
