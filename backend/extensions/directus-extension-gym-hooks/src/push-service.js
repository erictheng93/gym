/**
 * Push Notification Service
 *
 * Web Push integration using the web-push library
 * Handles VAPID configuration and notification delivery
 */

import webpush from 'web-push';

let initialized = false;
let vapidConfigured = false;

/**
 * Initialize the push service with VAPID credentials
 * @param {Object} env - Environment variables
 * @returns {boolean} - Whether initialization was successful
 */
export function initPushService(env) {
  if (initialized) {
    return vapidConfigured;
  }

  initialized = true;

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.warn('[PushService] VAPID keys not configured. Push notifications disabled.');
    console.warn('[PushService] Generate keys with: npx web-push generate-vapid-keys');
    return false;
  }

  try {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT || 'mailto:admin@gym-nexus.com',
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    vapidConfigured = true;
    console.log('[PushService] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[PushService] Failed to initialize:', error.message);
    return false;
  }
}

/**
 * Check if push service is ready
 * @returns {boolean}
 */
export function isPushEnabled() {
  return vapidConfigured;
}

/**
 * Send a push notification to a subscription
 * @param {Object} subscription - Push subscription object
 * @param {string} subscription.endpoint - Push service endpoint
 * @param {string} subscription.p256dh - Public key
 * @param {string} subscription.auth - Auth secret
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} [payload.icon] - Icon URL
 * @param {string} [payload.badge] - Badge URL
 * @param {Object} [payload.data] - Additional data
 * @returns {Promise<{success: boolean, error?: string, statusCode?: number}>}
 */
export async function sendNotification(subscription, payload) {
  if (!vapidConfigured) {
    return { success: false, error: 'Push service not initialized' };
  }

  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const notificationPayload = JSON.stringify({
      title: payload.title || 'Gym Nexus',
      body: payload.body || '',
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/badge-72x72.png',
      data: payload.data || {},
      timestamp: Date.now(),
    });

    await webpush.sendNotification(pushSubscription, notificationPayload);

    return { success: true };
  } catch (error) {
    console.error('[PushService] Send error:', error.message);

    // Handle specific error cases
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription has expired or is no longer valid
      return {
        success: false,
        error: 'Subscription expired',
        statusCode: error.statusCode,
        shouldRemove: true,
      };
    }

    if (error.statusCode === 429) {
      // Rate limited
      return {
        success: false,
        error: 'Rate limited',
        statusCode: 429,
      };
    }

    return {
      success: false,
      error: error.message,
      statusCode: error.statusCode,
    };
  }
}

/**
 * Send notifications to multiple subscriptions
 * @param {Array} subscriptions - Array of subscription objects
 * @param {Object} payload - Notification payload
 * @returns {Promise<{sent: number, failed: number, expired: string[]}>}
 */
export async function sendBulkNotifications(subscriptions, payload) {
  const results = {
    sent: 0,
    failed: 0,
    expired: [],
  };

  const promises = subscriptions.map(async (sub) => {
    const result = await sendNotification(sub, payload);

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      if (result.shouldRemove) {
        results.expired.push(sub.id);
      }
    }

    return result;
  });

  await Promise.all(promises);

  return results;
}

/**
 * Build notification payload for different types
 * @param {string} type - Notification type
 * @param {Object} data - Data for the notification
 * @returns {Object} - Notification payload
 */
export function buildNotificationPayload(type, data) {
  const payloads = {
    booking_reminder_24h: {
      title: '課程提醒',
      body: `明天 ${data.time || ''} 有 ${data.className || '課程'}，記得準時出席！`,
      data: { type, sessionId: data.sessionId },
    },
    booking_reminder_2h: {
      title: '課程即將開始',
      body: `${data.className || '課程'} 將在 2 小時後開始，請做好準備！`,
      data: { type, sessionId: data.sessionId },
    },
    contract_expiry_7d: {
      title: '會籍即將到期',
      body: '您的會籍將在 7 天後到期，請儘早續約享受優惠！',
      data: { type, contractId: data.contractId },
    },
    contract_expiry_3d: {
      title: '會籍到期提醒',
      body: '您的會籍將在 3 天後到期，請把握時間續約！',
      data: { type, contractId: data.contractId },
    },
    contract_expiry_1d: {
      title: '會籍明天到期',
      body: '您的會籍將在明天到期，請立即續約！',
      data: { type, contractId: data.contractId, urgent: true },
    },
    class_cancelled: {
      title: '課程取消通知',
      body: `很抱歉，${data.className || '您預約的課程'} 已被取消，請重新預約其他時段。`,
      data: { type, sessionId: data.sessionId },
    },
    waitlist_promoted: {
      title: '候補成功',
      body: `您已從候補名單晉升，${data.className || '課程'} 預約成功！`,
      data: { type, sessionId: data.sessionId, bookingId: data.bookingId },
    },
  };

  return payloads[type] || {
    title: 'Gym Nexus',
    body: data.message || '您有新的通知',
    data: { type },
  };
}
