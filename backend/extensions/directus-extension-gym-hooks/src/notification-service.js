/**
 * NotificationService - Unified Notification Orchestration Layer
 *
 * Coordinates delivery across LINE, Push, Email, and SMS channels
 * with intelligent fallback, priority-based channel selection, and delivery tracking.
 *
 * Channel Priority: LINE → Push → Email → SMS
 *
 * Features:
 * - Multi-channel notification delivery
 * - Automatic fallback when primary channel fails
 * - Per-member notification preferences
 * - Multi-tenant support (per-branch configuration)
 * - Delivery logging and tracking
 * - Quiet hours support
 */

import * as lineService from './line-service.js';
import * as pushService from './push-service.js';
import * as emailService from './email-service.js';
import * as smsService from './sms-service.js';

// Module state
let database = null;
let services = {
  line: null,
  push: null,
  email: null,
  sms: null,
};
let initialized = false;

// Channel priority order
const CHANNEL_PRIORITY = ['line', 'push', 'email', 'sms'];

/**
 * Initialize all notification services
 * @param {Object} config - Configuration object
 * @param {Object} config.services - Directus services
 * @param {Object} config.schema - Directus schema
 * @param {Object} config.env - Environment variables
 * @param {Object} config.database - Knex database instance
 */
export function initNotificationService(config) {
  const { services: directusServices, schema, env, database: db } = config;
  database = db;

  console.log('[NotificationService] Initializing...');

  // Initialize LINE service
  if (env.LINE_CHANNEL_ACCESS_TOKEN) {
    const lineInitialized = lineService.initLineService({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: env.LINE_CHANNEL_SECRET,
      database: db,
    });
    if (lineInitialized) {
      services.line = lineService;
    }
  }

  // Initialize Push service
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    const pushInitialized = pushService.initPushService(env);
    if (pushInitialized) {
      services.push = pushService;
    }
  }

  // Initialize Email service
  if (env.EMAIL_SMTP_HOST && directusServices) {
    const emailInitialized = emailService.initEmailService(directusServices, schema);
    if (emailInitialized) {
      services.email = emailService;
    }
  }

  // Initialize SMS service
  if (env.MITAKE_USERNAME && env.MITAKE_PASSWORD) {
    const smsInitialized = smsService.initSmsService({
      username: env.MITAKE_USERNAME,
      password: env.MITAKE_PASSWORD,
      apiUrl: env.MITAKE_API_URL,
      costPerSegment: parseFloat(env.MITAKE_COST_PER_SMS) || 0.5,
      database: db,
    });
    if (smsInitialized) {
      services.sms = smsService;
    }
  }

  initialized = true;

  const enabledChannels = Object.keys(services).filter(k => services[k] !== null);
  console.log(`[NotificationService] Initialized with channels: ${enabledChannels.join(', ') || 'none'}`);

  return true;
}

/**
 * Check if NotificationService is initialized
 */
export function isInitialized() {
  return initialized;
}

/**
 * Get enabled channels
 * @returns {string[]} Array of enabled channel names
 */
export function getEnabledChannels() {
  return Object.keys(services).filter(k => services[k] !== null);
}

/**
 * Check if a specific channel is enabled
 * @param {string} channel - Channel name
 * @returns {boolean}
 */
export function isChannelEnabled(channel) {
  return services[channel] !== null;
}

/**
 * Send notification through available channels
 *
 * @param {Object} options - Notification options
 * @param {string} options.memberId - Target member ID
 * @param {string} options.type - Notification type (e.g., 'booking_confirmation')
 * @param {Object} options.data - Template data
 * @param {string} [options.branchId] - Branch ID for multi-tenant config
 * @param {string} [options.referenceType] - Reference type for logging
 * @param {string} [options.referenceId] - Reference ID for logging
 * @param {string[]} [options.forcedChannels] - Force specific channels (bypass preferences)
 * @returns {Promise<{success: boolean, channel?: string, attempts?: Array, error?: string}>}
 */
export async function sendNotification(options) {
  const { memberId, type, data, branchId, referenceType, referenceId, forcedChannels } = options;

  if (!initialized) {
    return { success: false, error: 'NotificationService not initialized' };
  }

  if (!memberId) {
    return { success: false, error: 'Member ID is required' };
  }

  try {
    // Get member data and available channels
    const memberData = await getMemberData(memberId);
    if (!memberData) {
      return { success: false, error: 'Member not found' };
    }

    // Check quiet hours
    if (await isInQuietHours(memberId)) {
      console.log(`[NotificationService] Skipping notification (quiet hours): ${memberId}`);
      return { success: false, error: 'Quiet hours active' };
    }

    // Get channels to try
    let channels = forcedChannels;
    if (!channels || channels.length === 0) {
      channels = await getMemberChannels(memberId, type);
    }

    if (!channels || channels.length === 0) {
      return { success: false, error: 'No available notification channels' };
    }

    // Attempt delivery through each channel
    const attempts = [];
    let successfulChannel = null;

    for (const channel of channels) {
      const attempt = {
        channel,
        at: new Date().toISOString(),
        success: false,
        error: null,
      };

      try {
        const result = await deliverToChannel(channel, {
          member: memberData,
          type,
          data,
          branchId: branchId || memberData.branch_id,
          referenceType,
          referenceId,
        });

        attempt.success = result.success;
        if (!result.success) {
          attempt.error = result.error;
        }
      } catch (error) {
        attempt.success = false;
        attempt.error = error.message;
      }

      attempts.push(attempt);

      if (attempt.success) {
        successfulChannel = channel;
        break; // Stop after first successful delivery
      }
    }

    // Log the notification attempt
    await logNotificationAttempt({
      memberId,
      type,
      data,
      attempts,
      successfulChannel,
      referenceType,
      referenceId,
    });

    return {
      success: successfulChannel !== null,
      channel: successfulChannel,
      attempts,
    };

  } catch (error) {
    console.error('[NotificationService] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to multiple members
 *
 * @param {Object} options - Bulk notification options
 * @param {string[]} options.memberIds - Array of member IDs
 * @param {string} options.type - Notification type
 * @param {Object} options.data - Template data
 * @param {string} [options.branchId] - Branch ID
 * @param {string} [options.referenceType] - Reference type
 * @param {string} [options.referenceId] - Reference ID
 * @returns {Promise<{total: number, successful: number, failed: number, results: Array}>}
 */
export async function sendBulkNotification(options) {
  const { memberIds, type, data, branchId, referenceType, referenceId } = options;

  if (!memberIds || memberIds.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] };
  }

  const results = [];

  for (const memberId of memberIds) {
    const result = await sendNotification({
      memberId,
      type,
      data,
      branchId,
      referenceType,
      referenceId,
    });

    results.push({
      memberId,
      ...result,
    });
  }

  return {
    total: memberIds.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}

/**
 * Send notification to a specific channel directly (bypass preferences)
 *
 * @param {string} channel - Channel name ('line', 'push', 'email', 'sms')
 * @param {Object} options - Channel-specific options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendToChannel(channel, options) {
  if (!services[channel]) {
    return { success: false, error: `${channel} channel not available` };
  }

  try {
    switch (channel) {
      case 'line':
        return await services.line.sendLineMessage(options);

      case 'push':
        return await services.push.sendNotification(
          options.subscription,
          options.payload
        );

      case 'email':
        return await services.email.sendEmail(options);

      case 'sms':
        return await services.sms.sendSms(options);

      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Internal Helper Functions
// ============================================

/**
 * Get member data including contact info and linked accounts
 */
async function getMemberData(memberId) {
  if (!database) return null;

  try {
    const result = await database.raw(`
      SELECT
        m.id,
        m.full_name,
        m.email,
        m.phone,
        m.branch_id,
        m.member_code,
        msa.provider_user_id as line_user_id,
        ps.endpoint as push_endpoint,
        ps.p256dh as push_p256dh,
        ps.auth as push_auth
      FROM members m
      LEFT JOIN member_social_accounts msa
        ON msa.member_id = m.id
        AND msa.provider = 'line'
        AND msa.status = 'active'
      LEFT JOIN push_subscriptions ps
        ON ps.member_id = m.id
        AND ps.status = 'active'
        AND ps.error_count < 5
      WHERE m.id = ?::uuid
      LIMIT 1
    `, [memberId]);

    return result.rows?.[0] || null;
  } catch (error) {
    console.error('[NotificationService] getMemberData error:', error.message);
    return null;
  }
}

/**
 * Get available channels for a member based on preferences
 */
async function getMemberChannels(memberId, notificationType) {
  if (!database) {
    // Fallback to all enabled channels
    return CHANNEL_PRIORITY.filter(c => services[c] !== null);
  }

  try {
    const result = await database.raw(`
      SELECT * FROM get_member_notification_channels(?::uuid, ?::varchar)
    `, [memberId, notificationType]);

    const channels = result.rows?.[0]?.get_member_notification_channels || [];

    // Filter to only channels that are actually enabled
    return channels.filter(c => services[c] !== null);
  } catch (error) {
    console.error('[NotificationService] getMemberChannels error:', error.message);
    // Fallback to all enabled channels
    return CHANNEL_PRIORITY.filter(c => services[c] !== null);
  }
}

/**
 * Check if member is in quiet hours
 */
async function isInQuietHours(memberId) {
  if (!database) return false;

  try {
    const result = await database.raw(`
      SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end
      FROM member_notification_preferences
      WHERE member_id = ?::uuid
    `, [memberId]);

    const prefs = result.rows?.[0];
    if (!prefs?.quiet_hours_enabled) return false;

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    const start = prefs.quiet_hours_start.slice(0, 5);
    const end = prefs.quiet_hours_end.slice(0, 5);

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    } else {
      return currentTime >= start && currentTime < end;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Deliver notification to a specific channel
 */
async function deliverToChannel(channel, options) {
  const { member, type, data, branchId, referenceType, referenceId } = options;
  const service = services[channel];

  if (!service) {
    return { success: false, error: `${channel} service not available` };
  }

  switch (channel) {
    case 'line':
      if (!member.line_user_id) {
        return { success: false, error: 'LINE not linked' };
      }
      return await service.sendLineMessage({
        userId: member.line_user_id,
        type,
        data: { ...data, memberName: member.full_name },
        memberId: member.id,
        branchId,
        referenceType,
        referenceId,
      });

    case 'push':
      if (!member.push_endpoint) {
        return { success: false, error: 'Push not subscribed' };
      }
      const payload = buildPushPayload(type, data);
      return await service.sendNotification(
        {
          endpoint: member.push_endpoint,
          p256dh: member.push_p256dh,
          auth: member.push_auth,
        },
        payload
      );

    case 'email':
      if (!member.email) {
        return { success: false, error: 'Email not available' };
      }
      const emailContent = emailService.buildEmailByType
        ? emailService.buildEmailByType(type, { ...data, memberName: member.full_name })
        : { subject: `Gym Nexus 通知`, html: data.message || '您有新的通知' };

      return await service.sendEmail({
        to: member.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

    case 'sms':
      if (!member.phone) {
        return { success: false, error: 'Phone not available' };
      }
      return await service.sendSms({
        phoneNumber: member.phone,
        type,
        data: { ...data, memberName: member.full_name },
        memberId: member.id,
        branchId,
        referenceType,
        referenceId,
      });

    default:
      return { success: false, error: `Unknown channel: ${channel}` };
  }
}

/**
 * Build push notification payload
 */
function buildPushPayload(type, data) {
  const payloads = {
    booking_confirmation: {
      title: '預約成功',
      body: `已為您預約 ${data.className || '課程'}`,
      data: { url: '/bookings', type },
    },
    booking_reminder_24h: {
      title: '課程提醒',
      body: `明天有 ${data.className || '課程'}，別忘了！`,
      data: { url: '/bookings', type },
    },
    booking_reminder_2h: {
      title: '課程即將開始',
      body: `${data.className || '課程'} 將在 2 小時後開始`,
      data: { url: '/bookings', type },
    },
    contract_expiry_7d: {
      title: '會籍提醒',
      body: '您的會籍將於 7 天後到期',
      data: { url: '/contracts', type },
    },
    contract_expiry_3d: {
      title: '會籍提醒',
      body: '您的會籍將於 3 天後到期',
      data: { url: '/contracts', type },
    },
    contract_expiry_1d: {
      title: '會籍即將到期',
      body: '您的會籍明天到期，請盡快續約！',
      data: { url: '/contracts', type },
    },
    class_cancelled: {
      title: '課程取消通知',
      body: `${data.className || '課程'} 已取消`,
      data: { url: '/bookings', type },
    },
    payment_confirmation: {
      title: '付款確認',
      body: `已收到您的付款 NT$${data.amount || 0}`,
      data: { url: '/contracts', type },
    },
    welcome: {
      title: '歡迎加入！',
      body: '開始您的健身旅程吧',
      data: { url: '/', type },
    },
  };

  return payloads[type] || {
    title: 'Gym Nexus',
    body: data.message || '您有新的通知',
    data: { type },
  };
}

/**
 * Log notification attempt to database
 */
async function logNotificationAttempt(options) {
  if (!database) return;

  try {
    const { memberId, type, data, attempts, successfulChannel, referenceType, referenceId } = options;

    await database.raw(`
      SELECT log_notification_attempt(
        ?::uuid,
        ?::varchar,
        ?::varchar,
        ?::boolean,
        ?::text,
        ?::varchar,
        ?::text,
        ?::jsonb,
        ?::varchar,
        ?::uuid
      )
    `, [
      memberId,
      type,
      successfulChannel || attempts[attempts.length - 1]?.channel,
      successfulChannel !== null,
      successfulChannel ? null : attempts[attempts.length - 1]?.error,
      data.title || null,
      data.body || data.message || null,
      JSON.stringify(data),
      referenceType || null,
      referenceId || null,
    ]);
  } catch (error) {
    console.error('[NotificationService] Log error:', error.message);
  }
}

// ============================================
// Channel Status Functions
// ============================================

export function isLineEnabled() {
  return services.line !== null;
}

export function isPushEnabled() {
  return services.push !== null;
}

export function isEmailEnabled() {
  return services.email !== null;
}

export function isSmsEnabled() {
  return services.sms !== null;
}

// ============================================
// Service Access (for direct channel operations)
// ============================================

export function getLineService() {
  return services.line;
}

export function getPushService() {
  return services.push;
}

export function getEmailService() {
  return services.email;
}

export function getSmsService() {
  return services.sms;
}

export default {
  initNotificationService,
  isInitialized,
  getEnabledChannels,
  isChannelEnabled,
  sendNotification,
  sendBulkNotification,
  sendToChannel,
  isLineEnabled,
  isPushEnabled,
  isEmailEnabled,
  isSmsEnabled,
  getLineService,
  getPushService,
  getEmailService,
  getSmsService,
};
