/**
 * Notifications Hooks
 * Handles push notification queue processing and scheduled notifications
 */

import { db, bookings, classSessions, classes, pushSubscriptions, notifications } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  data?: Record<string, any>;
}

/**
 * Build notification payload based on type
 */
export function buildNotificationPayload(
  type: string,
  data: Record<string, any>
): PushPayload {
  switch (type) {
    case 'booking_reminder':
      return {
        title: '課程提醒',
        body: `您的 ${data.className} 課程即將開始`,
        icon: '/icons/class.png',
        url: `/bookings/${data.bookingId}`,
        data: { type, ...data },
      };

    case 'class_cancelled':
      return {
        title: '課程取消通知',
        body: `抱歉，${data.className} 課程已取消`,
        icon: '/icons/cancelled.png',
        url: '/schedule',
        data: { type, ...data },
      };

    case 'contract_expiry':
      return {
        title: '合約即將到期',
        body: `您的合約將在 ${data.daysRemaining} 天後到期，請及時續約`,
        icon: '/icons/contract.png',
        url: '/contracts',
        data: { type, ...data },
      };

    case 'payment_reminder':
      return {
        title: '付款提醒',
        body: `您有 ${data.amount} 元待繳款項`,
        icon: '/icons/payment.png',
        url: `/payments/${data.paymentId}`,
        data: { type, ...data },
      };

    default:
      return {
        title: data.title || '通知',
        body: data.message || '',
        icon: '/icons/notification.png',
        data: { type, ...data },
      };
  }
}

/**
 * Queue booking reminders for a class session
 * Called when a booking is confirmed
 */
export async function queueBookingReminders(sessionId: string): Promise<void> {
  try {
    // Try to use the atomic SQL function
    await db.execute(
      sql`SELECT queue_booking_reminders(${sessionId}::uuid)`
    );
    console.log(`[NotificationHook] Queued booking reminders for session ${sessionId}`);
  } catch (error) {
    console.error('[NotificationHook] Failed to queue booking reminders:', error);
    // Fallback logic could be implemented here if needed
  }
}

/**
 * Queue contract expiry reminders
 * Called daily by cron job
 */
export async function queueContractExpiryReminders(): Promise<void> {
  try {
    await db.execute(sql`SELECT queue_contract_expiry_reminders()`);
    console.log('[NotificationHook] Queued contract expiry reminders');
  } catch (error) {
    console.error('[NotificationHook] Failed to queue contract expiry reminders:', error);
  }
}

/**
 * Handle class session cancellation
 * Notifies all booked members
 */
export async function onClassSessionCancelled(sessionId: string): Promise<void> {
  try {
    // Get session and class info
    const [session] = await db
      .select({
        className: classes.name,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
      })
      .from(classSessions)
      .leftJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(classSessions.id, sessionId));

    if (!session) return;

    // Get all bookings for this session
    const confirmedBookings = await db
      .select({
        id: bookings.id,
        memberId: bookings.memberId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.sessionId, sessionId),
          sql`${bookings.bookingStatus} IN ('CONFIRMED', 'WAITLISTED')`,
          eq(bookings.status, 'active')
        )
      );

    if (confirmedBookings.length === 0) return;

    // Queue cancellation notifications for each booking
    for (const booking of confirmedBookings) {
      const [subscription] = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.memberId, booking.memberId),
            eq(pushSubscriptions.isActive, true),
            eq(pushSubscriptions.notifyClassCancelled, true)
          )
        )
        .limit(1);

      if (!subscription) continue;

      const payload = buildNotificationPayload('class_cancelled', {
        className: session.className,
        sessionId,
      });

      // Insert into notification queue with dedup key
      await db.execute(
        sql`INSERT INTO notification_queue
            (subscription_id, notification_type, scheduled_at, payload, dedup_key)
            VALUES (${subscription.id}, 'class_cancelled', NOW(), ${JSON.stringify(payload)}, ${`cancel_${sessionId}_${booking.memberId}`})
            ON CONFLICT (dedup_key) DO NOTHING`
      );
    }

    console.log(`[NotificationHook] Queued cancellation notifications for ${confirmedBookings.length} bookings`);
  } catch (error) {
    console.error('[NotificationHook] Failed to queue cancellation notifications:', error);
  }
}

/**
 * Create in-app notification
 */
export async function createNotification(data: {
  recipientType: 'member' | 'employee';
  recipientId: string;
  title: string;
  message: string;
  type: string;
  notificationData?: Record<string, any>;
  tenantId: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      title: data.title,
      message: data.message,
      type: data.type,
      data: data.notificationData ? JSON.stringify(data.notificationData) : null,
      readStatus: false,
      tenantId: data.tenantId,
    });
  } catch (error) {
    console.error('[NotificationHook] Failed to create notification:', error);
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({
      readStatus: true,
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, notificationId));
}

/**
 * Mark all notifications as read for a recipient
 */
export async function markAllNotificationsAsRead(
  recipientType: 'member' | 'employee',
  recipientId: string
): Promise<void> {
  await db
    .update(notifications)
    .set({
      readStatus: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notifications.recipientType, recipientType),
        eq(notifications.recipientId, recipientId),
        eq(notifications.readStatus, false)
      )
    );
}
