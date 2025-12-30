/**
 * LINE Messaging API Service
 *
 * Sends push messages and Flex Messages to members via LINE
 * Uses the LINE Messaging API (not LINE Notify)
 *
 * Documentation: https://developers.line.biz/en/docs/messaging-api/
 */

import crypto from 'crypto';

// LINE API endpoints
const LINE_API_BASE = 'https://api.line.me/v2/bot';

// Module state
let config = {
  channelAccessToken: null,
  channelSecret: null,
};
let database = null;
let initialized = false;

/**
 * Initialize LINE service with credentials
 * @param {Object} options - Configuration options
 * @param {string} options.channelAccessToken - LINE Channel Access Token
 * @param {string} options.channelSecret - LINE Channel Secret
 * @param {Object} options.database - Knex database instance
 */
export function initLineService(options) {
  config.channelAccessToken = options.channelAccessToken;
  config.channelSecret = options.channelSecret;
  database = options.database;

  if (!config.channelAccessToken) {
    console.log('[LINEService] Channel access token not configured - LINE notifications disabled');
    return false;
  }

  initialized = true;
  console.log('[LINEService] Initialized successfully');
  return true;
}

/**
 * Check if LINE service is ready
 */
export function isLineEnabled() {
  return initialized && config.channelAccessToken;
}

/**
 * Get LINE config for a specific branch (multi-tenant support)
 * @param {string} branchId - Branch UUID
 * @returns {Promise<Object>} Branch-specific or default config
 */
export async function getConfigForBranch(branchId) {
  if (!database || !branchId) {
    return {
      channelAccessToken: config.channelAccessToken,
      channelSecret: config.channelSecret,
    };
  }

  try {
    const result = await database.raw(`
      SELECT line_channel_access_token, line_channel_secret, line_enabled
      FROM branch_notification_config
      WHERE branch_id = ?::uuid AND line_enabled = TRUE
    `, [branchId]);

    const row = result.rows?.[0];
    if (row?.line_channel_access_token) {
      return {
        channelAccessToken: row.line_channel_access_token,
        channelSecret: row.line_channel_secret,
      };
    }
  } catch (error) {
    console.error('[LINEService] Error fetching branch config:', error.message);
  }

  // Fallback to default config
  return {
    channelAccessToken: config.channelAccessToken,
    channelSecret: config.channelSecret,
  };
}

/**
 * Send a LINE message to a user
 *
 * @param {Object} options - Message options
 * @param {string} options.userId - LINE user ID (from member_social_accounts.provider_user_id)
 * @param {string} options.type - Notification type (e.g., 'booking_confirmation')
 * @param {Object} options.data - Template data
 * @param {string} [options.memberId] - Member ID for logging
 * @param {string} [options.branchId] - Branch ID for multi-tenant config
 * @param {string} [options.referenceType] - Reference type for logging
 * @param {string} [options.referenceId] - Reference ID for logging
 * @returns {Promise<{success: boolean, requestId?: string, error?: string}>}
 */
export async function sendLineMessage(options) {
  const { userId, type, data, memberId, branchId, referenceType, referenceId } = options;

  if (!userId) {
    return { success: false, error: 'LINE user ID not provided' };
  }

  // Get branch-specific or default config
  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.channelAccessToken) {
    return { success: false, error: 'LINE service not configured' };
  }

  try {
    // Build message based on type
    const message = buildLineMessage(type, data);

    // Send via LINE Messaging API
    const response = await fetch(`${LINE_API_BASE}/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${branchConfig.channelAccessToken}`,
        'X-Line-Retry-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        to: userId,
        messages: [message],
      }),
    });

    const requestId = response.headers.get('x-line-request-id');
    const success = response.ok;

    // Log the message
    if (database && memberId) {
      await logLineMessage({
        memberId,
        branchId,
        lineUserId: userId,
        messageType: message.type,
        notificationType: type,
        messagePayload: message,
        altText: message.altText || null,
        requestId,
        success,
        referenceType,
        referenceId,
      });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[LINEService] Send failed:', response.status, errorData);
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    console.log(`[LINEService] Message sent to ${userId}: ${type}`);
    return { success: true, requestId };

  } catch (error) {
    console.error('[LINEService] Send error:', error.message);

    // Log failure
    if (database && memberId) {
      await logLineMessage({
        memberId,
        branchId,
        lineUserId: userId,
        messageType: 'error',
        notificationType: type,
        messagePayload: { error: error.message },
        success: false,
        referenceType,
        referenceId,
      });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Send a LINE message to multiple users
 *
 * @param {Object} options - Multicast options
 * @param {string[]} options.userIds - Array of LINE user IDs (max 500)
 * @param {string} options.type - Notification type
 * @param {Object} options.data - Template data
 * @param {string} [options.branchId] - Branch ID for multi-tenant config
 * @returns {Promise<{success: boolean, requestId?: string, error?: string}>}
 */
export async function sendMulticast(options) {
  const { userIds, type, data, branchId } = options;

  if (!userIds || userIds.length === 0) {
    return { success: false, error: 'No user IDs provided' };
  }

  if (userIds.length > 500) {
    return { success: false, error: 'Maximum 500 recipients per multicast' };
  }

  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.channelAccessToken) {
    return { success: false, error: 'LINE service not configured' };
  }

  try {
    const message = buildLineMessage(type, data);

    const response = await fetch(`${LINE_API_BASE}/message/multicast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${branchConfig.channelAccessToken}`,
        'X-Line-Retry-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        to: userIds,
        messages: [message],
      }),
    });

    const requestId = response.headers.get('x-line-request-id');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      };
    }

    console.log(`[LINEService] Multicast sent to ${userIds.length} users: ${type}`);
    return { success: true, requestId, recipientCount: userIds.length };

  } catch (error) {
    console.error('[LINEService] Multicast error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Build LINE message based on notification type
 * @param {string} type - Notification type
 * @param {Object} data - Template data
 * @returns {Object} LINE message object
 */
export function buildLineMessage(type, data) {
  const builders = {
    booking_confirmation: () => buildBookingConfirmationFlex(data),
    booking_reminder_24h: () => buildBookingReminderFlex(data, 24),
    booking_reminder_2h: () => buildBookingReminderFlex(data, 2),
    contract_expiry_7d: () => buildContractExpiryFlex(data, 7),
    contract_expiry_3d: () => buildContractExpiryFlex(data, 3),
    contract_expiry_1d: () => buildContractExpiryFlex(data, 1),
    class_cancelled: () => buildClassCancelledFlex(data),
    payment_confirmation: () => buildPaymentConfirmationFlex(data),
    welcome: () => buildWelcomeFlex(data),
    otp: () => buildOtpText(data),
    check_in: () => buildCheckInFlex(data),
    test: () => buildTestMessage(data),
  };

  const builder = builders[type];
  if (builder) {
    return builder();
  }

  // Default text message
  return {
    type: 'text',
    text: data.message || `您有一則來自 Gym Nexus 的通知`,
  };
}

// ============================================
// Flex Message Builders
// ============================================

/**
 * Build Flex Message for booking confirmation
 */
function buildBookingConfirmationFlex(data) {
  return {
    type: 'flex',
    altText: `課程預約確認 - ${data.className || '課程'}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10b981',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: '✓',
                color: '#ffffff',
                size: 'xl',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: '預約成功',
                color: '#ffffff',
                size: 'xl',
                weight: 'bold',
                margin: 'md',
              },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: data.className || '課程',
            weight: 'bold',
            size: 'xl',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 日期', data.sessionDate),
              createInfoRow('⏰ 時間', `${data.startTime || ''} - ${data.endTime || ''}`),
              createInfoRow('👤 教練', data.coachName),
              createInfoRow('📍 地點', data.branchName),
              ...(data.bookingCode ? [createInfoRow('🎫 預約編號', data.bookingCode)] : []),
            ],
          },
        ],
      },
      footer: data.bookingUrl ? {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#10b981',
            action: {
              type: 'uri',
              label: '查看預約詳情',
              uri: data.bookingUrl,
            },
          },
        ],
      } : undefined,
    },
  };
}

/**
 * Build Flex Message for booking reminder
 */
function buildBookingReminderFlex(data, hoursRemaining) {
  const timeText = hoursRemaining === 24 ? '明天' : '2小時後';

  return {
    type: 'flex',
    altText: `課程提醒 - ${timeText}有課程`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#3b82f6',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '⏰ 課程提醒',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${timeText}有課程`,
            weight: 'bold',
            size: 'lg',
            color: '#3b82f6',
          },
          {
            type: 'text',
            text: data.className || '課程',
            weight: 'bold',
            size: 'xl',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 日期', data.sessionDate),
              createInfoRow('⏰ 時間', data.startTime),
              createInfoRow('📍 地點', data.branchName),
            ],
          },
          {
            type: 'text',
            text: '記得準時出席！',
            margin: 'lg',
            size: 'sm',
            color: '#666666',
          },
        ],
      },
    },
  };
}

/**
 * Build Flex Message for contract expiry reminder
 */
function buildContractExpiryFlex(data, daysRemaining) {
  const urgencyColor = daysRemaining <= 3 ? '#ef4444' : '#f59e0b';
  const urgencyText = daysRemaining === 1 ? '明天' : `${daysRemaining} 天後`;

  return {
    type: 'flex',
    altText: `會籍即將到期 - 剩餘 ${daysRemaining} 天`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: urgencyColor,
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '⚠️ 會籍到期提醒',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${urgencyText}到期`,
            weight: 'bold',
            size: 'xxl',
            color: urgencyColor,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📋 合約編號', data.contractNo),
              createInfoRow('🏷️ 方案', data.planName),
              createInfoRow('📅 到期日', data.expiryDate),
            ],
          },
          {
            type: 'text',
            text: '續約可享會員專屬優惠！',
            margin: 'lg',
            size: 'sm',
            color: '#666666',
          },
        ],
      },
      footer: data.renewUrl ? {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: urgencyColor,
            action: {
              type: 'uri',
              label: '立即續約',
              uri: data.renewUrl,
            },
          },
        ],
      } : undefined,
    },
  };
}

/**
 * Build Flex Message for class cancellation
 */
function buildClassCancelledFlex(data) {
  return {
    type: 'flex',
    altText: `課程取消通知 - ${data.className || '課程'}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ef4444',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '❌ 課程取消通知',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: data.className || '課程',
            weight: 'bold',
            size: 'xl',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 原定日期', data.sessionDate),
              createInfoRow('⏰ 原定時間', data.startTime),
              ...(data.reason ? [createInfoRow('📝 原因', data.reason)] : []),
            ],
          },
          {
            type: 'text',
            text: '請重新預約其他時段，造成不便敬請見諒。',
            margin: 'lg',
            size: 'sm',
            color: '#666666',
            wrap: true,
          },
        ],
      },
      footer: data.rebookUrl ? {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#3b82f6',
            action: {
              type: 'uri',
              label: '重新預約',
              uri: data.rebookUrl,
            },
          },
        ],
      } : undefined,
    },
  };
}

/**
 * Build Flex Message for payment confirmation
 */
function buildPaymentConfirmationFlex(data) {
  const amount = typeof data.amount === 'number'
    ? data.amount.toLocaleString()
    : data.amount;

  return {
    type: 'flex',
    altText: `付款確認 - NT$ ${amount}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6366f1',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '💳 付款確認',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `NT$ ${amount}`,
            weight: 'bold',
            size: 'xxl',
            color: '#10b981',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📋 合約編號', data.contractNo),
              createInfoRow('🏷️ 方案', data.planName),
              createInfoRow('💰 付款方式', data.paymentMethod),
              createInfoRow('📅 付款日期', data.paymentDate),
            ],
          },
          {
            type: 'text',
            text: '感謝您的支持！',
            margin: 'lg',
            size: 'sm',
            color: '#666666',
          },
        ],
      },
      footer: data.receiptUrl ? {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'link',
            action: {
              type: 'uri',
              label: '查看收據',
              uri: data.receiptUrl,
            },
          },
        ],
      } : undefined,
    },
  };
}

/**
 * Build Flex Message for welcome
 */
function buildWelcomeFlex(data) {
  return {
    type: 'flex',
    altText: '歡迎加入 Gym Nexus！',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10b981',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '🎉 歡迎加入！',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${data.memberName || '會員'}您好`,
            weight: 'bold',
            size: 'xl',
            margin: 'md',
          },
          {
            type: 'text',
            text: '歡迎成為我們的會員！',
            size: 'md',
            margin: 'sm',
            color: '#666666',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('🆔 會員編號', data.memberCode),
              createInfoRow('📍 所屬分店', data.branchName),
            ],
          },
          {
            type: 'text',
            text: '開始您的健身旅程吧！',
            margin: 'lg',
            size: 'sm',
            color: '#666666',
          },
        ],
      },
      footer: data.appUrl ? {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#10b981',
            action: {
              type: 'uri',
              label: '開始預約課程',
              uri: data.appUrl,
            },
          },
        ],
      } : undefined,
    },
  };
}

/**
 * Build Flex Message for check-in confirmation
 */
function buildCheckInFlex(data) {
  return {
    type: 'flex',
    altText: '入場成功！',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10b981',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: '✓ 入場成功',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            align: 'center',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: data.branchName || '健身房',
            weight: 'bold',
            size: 'lg',
            align: 'center',
          },
          {
            type: 'text',
            text: data.checkInTime || new Date().toLocaleTimeString('zh-TW'),
            size: 'sm',
            color: '#666666',
            align: 'center',
            margin: 'sm',
          },
        ],
      },
    },
  };
}

/**
 * Build simple OTP text message
 */
function buildOtpText(data) {
  return {
    type: 'text',
    text: `【Gym Nexus】您的驗證碼是 ${data.code}，5分鐘內有效。請勿將驗證碼告知他人。`,
  };
}

/**
 * Build test message
 */
function buildTestMessage(data) {
  return {
    type: 'text',
    text: data.message || '這是一則來自 Gym Nexus 的測試訊息 ✓',
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create info row for Flex Message
 */
function createInfoRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: label,
        color: '#666666',
        size: 'sm',
        flex: 2,
      },
      {
        type: 'text',
        text: value || '-',
        wrap: true,
        color: '#333333',
        size: 'sm',
        flex: 3,
      },
    ],
  };
}

/**
 * Log LINE message to database
 */
async function logLineMessage(options) {
  if (!database) return;

  try {
    await database.raw(`
      INSERT INTO line_message_logs (
        member_id, branch_id, line_user_id, message_type, notification_type,
        message_payload, alt_text, request_id, delivery_status, sent_at,
        reference_type, reference_id
      ) VALUES (
        ?::uuid, ?::uuid, ?::varchar, ?::varchar, ?::varchar,
        ?::jsonb, ?::varchar, ?::varchar, ?::varchar, NOW(),
        ?::varchar, ?::uuid
      )
    `, [
      options.memberId,
      options.branchId || null,
      options.lineUserId,
      options.messageType,
      options.notificationType,
      JSON.stringify(options.messagePayload),
      options.altText || null,
      options.requestId || null,
      options.success ? 'sent' : 'failed',
      options.referenceType || null,
      options.referenceId || null,
    ]);
  } catch (error) {
    console.error('[LINEService] Log error:', error.message);
  }
}

/**
 * Validate webhook signature (for receiving webhooks)
 */
export function validateWebhookSignature(body, signature) {
  if (!config.channelSecret || !signature) {
    return false;
  }

  const hash = crypto
    .createHmac('sha256', config.channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

/**
 * Get message quota (check remaining messages)
 */
export async function getMessageQuota(branchId = null) {
  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.channelAccessToken) {
    return { success: false, error: 'LINE service not configured' };
  }

  try {
    const response = await fetch(`${LINE_API_BASE}/message/quota`, {
      headers: {
        'Authorization': `Bearer ${branchConfig.channelAccessToken}`,
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      type: data.type,  // 'limited' or 'unlimited'
      value: data.value, // remaining quota if limited
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  initLineService,
  isLineEnabled,
  getConfigForBranch,
  sendLineMessage,
  sendMulticast,
  buildLineMessage,
  validateWebhookSignature,
  getMessageQuota,
};
