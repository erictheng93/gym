import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, notifications, pushSubscriptions, members, memberSocialAccounts } from '../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER NOTIFICATIONS ROUTES
// =============================================================================
// Notification preferences and history for member-app
// Endpoints: /preferences (GET, PUT), /channels, /history, /:id/read

const app = new Hono<{ Variables: MemberVariables }>();

// -----------------------------------------------------------------------------
// Hoisted Query Projections
// -----------------------------------------------------------------------------

const MEMBER_TAGS_SELECT = {
  id: members.id,
  tags: members.tags,
};

const MEMBER_CONTACT_SELECT = {
  email: members.email,
  phone: members.phone,
};

const PUSH_SUB_ID_SELECT = {
  id: pushSubscriptions.id,
};

const SOCIAL_DISPLAY_NAME_SELECT = {
  displayName: memberSocialAccounts.displayName,
};

const COUNT_SELECT = {
  count: sql<number>`count(*)`,
};

const NOTIFICATION_HISTORY_SELECT = {
  id: notifications.id,
  type: notifications.notificationType,
  title: notifications.title,
  message: notifications.message,
  data: notifications.data,
  isRead: notifications.isRead,
  readAt: notifications.readAt,
  priority: notifications.priority,
  createdAt: notifications.createdAt,
  referenceType: notifications.referenceType,
  referenceId: notifications.referenceId,
};

const NOTIFICATION_ID_RETURNING = {
  id: notifications.id,
};

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type NotificationChannel = 'push' | 'email' | 'line' | 'sms';
// Notification type used in preferences
type NotificationType = 'booking_reminder' | 'contract_expiry' | 'class_cancelled' | 'promotions' | 'system';
void (0 as unknown as NotificationType); // prevent unused warning

interface NotificationPreferences {
  channels: {
    push: boolean;
    email: boolean;
    line: boolean;
    sms: boolean;
  };
  types: {
    booking_reminder: boolean;
    contract_expiry: boolean;
    class_cancelled: boolean;
    promotions: boolean;
    system: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;   // HH:mm
  };
}

// Default preferences stored as member metadata
const DEFAULT_PREFERENCES: NotificationPreferences = {
  channels: {
    push: true,
    email: true,
    line: true,
    sms: false,
  },
  types: {
    booking_reminder: true,
    contract_expiry: true,
    class_cancelled: true,
    promotions: false,
    system: true,
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const preferencesSchema = z.object({
  channels: z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    line: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  types: z.object({
    booking_reminder: z.boolean().optional(),
    contract_expiry: z.boolean().optional(),
    class_cancelled: z.boolean().optional(),
    promotions: z.boolean().optional(),
    system: z.boolean().optional(),
  }).optional(),
  quietHours: z.object({
    enabled: z.boolean().optional(),
    start: z.string().regex(/^\d{2}:\d{2}$/, '時間格式: HH:mm').optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/, '時間格式: HH:mm').optional(),
  }).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).optional(),
  type: z.string().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/member/notifications/preferences - Get notification preferences
// -----------------------------------------------------------------------------

app.get('/preferences', async (c) => {
  const memberInfo = c.get('member')!;

  // Get member with preferences from tags/notes or dedicated column
  const [member] = await db
    .select(MEMBER_TAGS_SELECT)
    .from(members)
    .where(eq(members.id, memberInfo.id))
    .limit(1);

  // Extract preferences from member data
  let preferences = DEFAULT_PREFERENCES;
  if (member?.tags && typeof member.tags === 'object') {
    const tags = member.tags as { notificationPreferences?: NotificationPreferences };
    if (tags.notificationPreferences) {
      preferences = {
        ...DEFAULT_PREFERENCES,
        ...tags.notificationPreferences,
        channels: { ...DEFAULT_PREFERENCES.channels, ...tags.notificationPreferences.channels },
        types: { ...DEFAULT_PREFERENCES.types, ...tags.notificationPreferences.types },
        quietHours: { ...DEFAULT_PREFERENCES.quietHours, ...tags.notificationPreferences.quietHours },
      };
    }
  }

  return c.json({
    success: true,
    data: {
      preferences,
    },
  });
});

// -----------------------------------------------------------------------------
// PUT /api/member/notifications/preferences - Update notification preferences
// -----------------------------------------------------------------------------

app.put(
  '/preferences',
  zValidator('json', preferencesSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const updates = c.req.valid('json');

    // Get current member data
    const [member] = await db
      .select(MEMBER_TAGS_SELECT)
      .from(members)
      .where(eq(members.id, memberInfo.id))
      .limit(1);

    // Merge with existing preferences
    const currentTags = (member?.tags || {}) as { notificationPreferences?: NotificationPreferences };
    const currentPreferences = currentTags.notificationPreferences || DEFAULT_PREFERENCES;

    const newPreferences: NotificationPreferences = {
      channels: { ...currentPreferences.channels, ...updates.channels },
      types: { ...currentPreferences.types, ...updates.types },
      quietHours: { ...currentPreferences.quietHours, ...updates.quietHours },
    };

    // Update member tags with new preferences
    const newTags = {
      ...currentTags,
      notificationPreferences: newPreferences,
    };

    const updatePromises: Promise<unknown>[] = [
      db
        .update(members)
        .set({
          tags: newTags,
          updatedAt: new Date(),
        })
        .where(eq(members.id, memberInfo.id)),
    ];

    // Also update push subscription preferences if push settings changed
    if (updates.types) {
      updatePromises.push(
        db
          .update(pushSubscriptions)
          .set({
            notifyBookingReminder: newPreferences.types.booking_reminder,
            notifyClassCancelled: newPreferences.types.class_cancelled,
            notifyContractExpiry: newPreferences.types.contract_expiry,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptions.memberId, memberInfo.id))
      );
    }

    await Promise.all(updatePromises);

    return c.json({
      success: true,
      message: '通知偏好已更新',
      data: {
        preferences: newPreferences,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/notifications/channels - Get connected notification channels
// -----------------------------------------------------------------------------

app.get('/channels', async (c) => {
  const memberInfo = c.get('member')!;

  // Concurrently fetch member info, push subscriptions, and LINE connection
  const [[member], pushSubs, lineSocial] = await Promise.all([
    db
      .select(MEMBER_CONTACT_SELECT)
      .from(members)
      .where(eq(members.id, memberInfo.id))
      .limit(1),
    db
      .select(PUSH_SUB_ID_SELECT)
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.memberId, memberInfo.id),
        eq(pushSubscriptions.isActive, true),
      ))
      .limit(1),
    db
      .select(SOCIAL_DISPLAY_NAME_SELECT)
      .from(memberSocialAccounts)
      .where(and(
        eq(memberSocialAccounts.memberId, memberInfo.id),
        eq(memberSocialAccounts.provider, 'line'),
      ))
      .limit(1),
  ]);

  const channels = [
    {
      channel: 'push' as NotificationChannel,
      connected: pushSubs.length > 0,
      details: pushSubs.length > 0 ? { devices: pushSubs.length } : null,
    },
    {
      channel: 'email' as NotificationChannel,
      connected: !!member?.email,
      details: member?.email ? { email: member.email.replace(/(.{3}).*(@.*)/, '$1***$2') } : null,
    },
    {
      channel: 'line' as NotificationChannel,
      connected: lineSocial.length > 0,
      details: lineSocial[0] ? { displayName: lineSocial[0].displayName } : null,
    },
    {
      channel: 'sms' as NotificationChannel,
      connected: !!member?.phone,
      details: member?.phone ? { phone: member.phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1***$3') } : null,
    },
  ];

  return c.json({
    success: true,
    data: {
      channels,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/notifications/history - Get notification history
// -----------------------------------------------------------------------------

app.get(
  '/history',
  zValidator('query', historyQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit, unreadOnly, type } = c.req.valid('query');

    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(notifications.targetMemberId, memberInfo.id)];

    if (unreadOnly === 'true') {
      conditions.push(eq(notifications.isRead, false));
    }

    if (type) {
      conditions.push(eq(notifications.notificationType, type));
    }

    // Concurrently get total count and notifications
    const [[{ count }], notificationList] = await Promise.all([
      db
        .select(COUNT_SELECT)
        .from(notifications)
        .where(and(...conditions)),
      db
        .select(NOTIFICATION_HISTORY_SELECT)
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    return c.json({
      success: true,
      data: {
        notifications: notificationList.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          data: n.data ? JSON.parse(n.data) : null,
          isRead: n.isRead,
          readAt: n.readAt,
          priority: n.priority,
          createdAt: n.createdAt,
          reference: n.referenceType && n.referenceId ? {
            type: n.referenceType,
            id: n.referenceId,
          } : null,
        })),
        pagination: {
          total: Number(count),
          page,
          limit,
          totalPages: Math.ceil(Number(count) / limit),
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/notifications/unread-count - Get unread count
// -----------------------------------------------------------------------------

app.get('/unread-count', async (c) => {
  const memberInfo = c.get('member')!;

  const [{ count }] = await db
    .select(COUNT_SELECT)
    .from(notifications)
    .where(and(
      eq(notifications.targetMemberId, memberInfo.id),
      eq(notifications.isRead, false),
    ));

  return c.json({
    success: true,
    data: {
      unreadCount: Number(count),
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/member/notifications/:id/read - Mark notification as read
// -----------------------------------------------------------------------------

app.post('/:id/read', async (c) => {
  const memberInfo = c.get('member')!;
  const notificationId = c.req.param('id');

  // Update notification
  const [updated] = await db
    .update(notifications)
    .set({
      isRead: true,
      readStatus: true,
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.targetMemberId, memberInfo.id),
    ))
    .returning(NOTIFICATION_ID_RETURNING);

  if (!updated) {
    return c.json({
      success: false,
      error: '通知不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  return c.json({
    success: true,
    message: '已標記為已讀',
  });
});

// -----------------------------------------------------------------------------
// POST /api/member/notifications/read-all - Mark all as read
// -----------------------------------------------------------------------------

app.post('/read-all', async (c) => {
  const memberInfo = c.get('member')!;

  await db
    .update(notifications)
    .set({
      isRead: true,
      readStatus: true,
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(notifications.targetMemberId, memberInfo.id),
      eq(notifications.isRead, false),
    ));

  return c.json({
    success: true,
    message: '已全部標記為已讀',
  });
});

export default app;
