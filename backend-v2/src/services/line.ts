import crypto from 'crypto';
import { db, branchNotificationConfig, lineMessageLogs } from '../db/index.js';
import { eq, and } from 'drizzle-orm';

// =============================================================================
// LINE MESSAGING API SERVICE
// =============================================================================
// Sends push messages and Flex Messages to members via LINE
// Documentation: https://developers.line.biz/en/docs/messaging-api/

const LINE_API_BASE = 'https://api.line.me/v2/bot';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface LineConfig {
  channelAccessToken: string | null;
  channelSecret: string | null;
}

interface SendLineMessageOptions {
  userId: string;
  type: NotificationType;
  data: Record<string, unknown>;
  memberId?: string;
  branchId?: string;
  referenceType?: string;
  referenceId?: string;
}

interface SendMulticastOptions {
  userIds: string[];
  type: NotificationType;
  data: Record<string, unknown>;
  branchId?: string;
}

interface LineMessageResult {
  success: boolean;
  requestId?: string;
  error?: string;
  statusCode?: number;
  recipientCount?: number;
}

interface MessageQuotaResult {
  success: boolean;
  type?: string;
  value?: number;
  error?: string;
}

type NotificationType =
  | 'booking_confirmation'
  | 'booking_reminder_24h'
  | 'booking_reminder_2h'
  | 'contract_expiry_7d'
  | 'contract_expiry_3d'
  | 'contract_expiry_1d'
  | 'class_cancelled'
  | 'payment_confirmation'
  | 'welcome'
  | 'otp'
  | 'check_in'
  | 'test';

interface FlexMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
}

interface TextMessage {
  type: 'text';
  text: string;
}

type LineMessage = FlexMessage | TextMessage;

// -----------------------------------------------------------------------------
// Module State
// -----------------------------------------------------------------------------

let config: LineConfig = {
  channelAccessToken: null,
  channelSecret: null,
};
let initialized = false;

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

/**
 * Initialize LINE service with credentials
 */
export function initLineService(options: {
  channelAccessToken?: string;
  channelSecret?: string;
}): boolean {
  config.channelAccessToken = options.channelAccessToken || null;
  config.channelSecret = options.channelSecret || null;

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
export function isLineEnabled(): boolean {
  return initialized && !!config.channelAccessToken;
}

// -----------------------------------------------------------------------------
// Branch-Specific Config (Multi-Tenant Support)
// -----------------------------------------------------------------------------

/**
 * Get LINE config for a specific branch
 */
export async function getConfigForBranch(branchId?: string): Promise<LineConfig> {
  if (!branchId) {
    return {
      channelAccessToken: config.channelAccessToken,
      channelSecret: config.channelSecret,
    };
  }

  try {
    const [row] = await db
      .select({
        lineChannelAccessToken: branchNotificationConfig.lineChannelAccessToken,
        lineChannelSecret: branchNotificationConfig.lineChannelSecret,
        lineEnabled: branchNotificationConfig.lineEnabled,
      })
      .from(branchNotificationConfig)
      .where(
        and(
          eq(branchNotificationConfig.branchId, branchId),
          eq(branchNotificationConfig.lineEnabled, true)
        )
      )
      .limit(1);

    if (row?.lineChannelAccessToken) {
      return {
        channelAccessToken: row.lineChannelAccessToken,
        channelSecret: row.lineChannelSecret || null,
      };
    }
  } catch (error) {
    console.error('[LINEService] Error fetching branch config:', error);
  }

  // Fallback to default config
  return {
    channelAccessToken: config.channelAccessToken,
    channelSecret: config.channelSecret,
  };
}

// -----------------------------------------------------------------------------
// Send Message Functions
// -----------------------------------------------------------------------------

/**
 * Send a LINE message to a user
 */
export async function sendLineMessage(options: SendLineMessageOptions): Promise<LineMessageResult> {
  const { userId, type, data, memberId, branchId, referenceType, referenceId } = options;

  if (!userId) {
    return { success: false, error: 'LINE user ID not provided' };
  }

  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.channelAccessToken) {
    return { success: false, error: 'LINE service not configured' };
  }

  try {
    const message = buildLineMessage(type, data);

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

    const requestId = response.headers.get('x-line-request-id') || undefined;
    const success = response.ok;

    // Log the message
    if (memberId) {
      await logLineMessage({
        memberId,
        branchId,
        lineUserId: userId,
        messageType: message.type,
        notificationType: type,
        messagePayload: message,
        altText: 'altText' in message ? message.altText : null,
        requestId,
        success,
        referenceType,
        referenceId,
      });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
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
    console.error('[LINEService] Send error:', error);

    // Log failure
    if (memberId) {
      await logLineMessage({
        memberId,
        branchId,
        lineUserId: userId,
        messageType: 'error',
        notificationType: type,
        messagePayload: { error: error instanceof Error ? error.message : 'Unknown error' },
        success: false,
        referenceType,
        referenceId,
      });
    }

    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send a LINE message to multiple users (max 500)
 */
export async function sendMulticast(options: SendMulticastOptions): Promise<LineMessageResult> {
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

    const requestId = response.headers.get('x-line-request-id') || undefined;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      };
    }

    console.log(`[LINEService] Multicast sent to ${userIds.length} users: ${type}`);
    return { success: true, requestId, recipientCount: userIds.length };

  } catch (error) {
    console.error('[LINEService] Multicast error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Message Builders
// -----------------------------------------------------------------------------

/**
 * Build LINE message based on notification type
 */
export function buildLineMessage(type: NotificationType, data: Record<string, unknown>): LineMessage {
  const builders: Record<NotificationType, () => LineMessage> = {
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
    text: (data.message as string) || `您有一則來自 Gym Nexus 的通知`,
  };
}

// -----------------------------------------------------------------------------
// Flex Message Builders
// -----------------------------------------------------------------------------

function buildBookingConfirmationFlex(data: Record<string, unknown>): FlexMessage {
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
              { type: 'text', text: '✓', color: '#ffffff', size: 'xl', weight: 'bold', flex: 0 },
              { type: 'text', text: '預約成功', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'md' },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: (data.className as string) || '課程', weight: 'bold', size: 'xl', margin: 'md', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 日期', data.sessionDate as string),
              createInfoRow('⏰ 時間', `${data.startTime || ''} - ${data.endTime || ''}`),
              createInfoRow('👤 教練', data.coachName as string),
              createInfoRow('📍 地點', data.branchName as string),
              ...(data.bookingCode ? [createInfoRow('🎫 預約編號', data.bookingCode as string)] : []),
            ],
          },
        ],
      },
      ...(data.bookingUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: '#10b981', action: { type: 'uri', label: '查看預約詳情', uri: data.bookingUrl } },
          ],
        },
      } : {}),
    },
  };
}

function buildBookingReminderFlex(data: Record<string, unknown>, hoursRemaining: number): FlexMessage {
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
          { type: 'text', text: '⏰ 課程提醒', color: '#ffffff', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${timeText}有課程`, weight: 'bold', size: 'lg', color: '#3b82f6' },
          { type: 'text', text: (data.className as string) || '課程', weight: 'bold', size: 'xl', margin: 'md', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 日期', data.sessionDate as string),
              createInfoRow('⏰ 時間', data.startTime as string),
              createInfoRow('📍 地點', data.branchName as string),
            ],
          },
          { type: 'text', text: '記得準時出席！', margin: 'lg', size: 'sm', color: '#666666' },
        ],
      },
    },
  };
}

function buildContractExpiryFlex(data: Record<string, unknown>, daysRemaining: number): FlexMessage {
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
          { type: 'text', text: '⚠️ 會籍到期提醒', color: '#ffffff', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${urgencyText}到期`, weight: 'bold', size: 'xxl', color: urgencyColor },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📋 合約編號', data.contractNo as string),
              createInfoRow('🏷️ 方案', data.planName as string),
              createInfoRow('📅 到期日', data.expiryDate as string),
            ],
          },
          { type: 'text', text: '續約可享會員專屬優惠！', margin: 'lg', size: 'sm', color: '#666666' },
        ],
      },
      ...(data.renewUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: urgencyColor, action: { type: 'uri', label: '立即續約', uri: data.renewUrl } },
          ],
        },
      } : {}),
    },
  };
}

function buildClassCancelledFlex(data: Record<string, unknown>): FlexMessage {
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
          { type: 'text', text: '❌ 課程取消通知', color: '#ffffff', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: (data.className as string) || '課程', weight: 'bold', size: 'xl', margin: 'md', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📅 原定日期', data.sessionDate as string),
              createInfoRow('⏰ 原定時間', data.startTime as string),
              ...(data.reason ? [createInfoRow('📝 原因', data.reason as string)] : []),
            ],
          },
          { type: 'text', text: '請重新預約其他時段，造成不便敬請見諒。', margin: 'lg', size: 'sm', color: '#666666', wrap: true },
        ],
      },
      ...(data.rebookUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: '#3b82f6', action: { type: 'uri', label: '重新預約', uri: data.rebookUrl } },
          ],
        },
      } : {}),
    },
  };
}

function buildPaymentConfirmationFlex(data: Record<string, unknown>): FlexMessage {
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
          { type: 'text', text: '💳 付款確認', color: '#ffffff', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `NT$ ${amount}`, weight: 'bold', size: 'xxl', color: '#10b981' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('📋 合約編號', data.contractNo as string),
              createInfoRow('🏷️ 方案', data.planName as string),
              createInfoRow('💰 付款方式', data.paymentMethod as string),
              createInfoRow('📅 付款日期', data.paymentDate as string),
            ],
          },
          { type: 'text', text: '感謝您的支持！', margin: 'lg', size: 'sm', color: '#666666' },
        ],
      },
      ...(data.receiptUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'button', style: 'link', action: { type: 'uri', label: '查看收據', uri: data.receiptUrl } },
          ],
        },
      } : {}),
    },
  };
}

function buildWelcomeFlex(data: Record<string, unknown>): FlexMessage {
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
          { type: 'text', text: '🎉 歡迎加入！', color: '#ffffff', size: 'xl', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${data.memberName || '會員'}您好`, weight: 'bold', size: 'xl', margin: 'md' },
          { type: 'text', text: '歡迎成為我們的會員！', size: 'md', margin: 'sm', color: '#666666' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              createInfoRow('🆔 會員編號', data.memberCode as string),
              createInfoRow('📍 所屬分店', data.branchName as string),
            ],
          },
          { type: 'text', text: '開始您的健身旅程吧！', margin: 'lg', size: 'sm', color: '#666666' },
        ],
      },
      ...(data.appUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: '#10b981', action: { type: 'uri', label: '開始預約課程', uri: data.appUrl } },
          ],
        },
      } : {}),
    },
  };
}

function buildCheckInFlex(data: Record<string, unknown>): FlexMessage {
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
          { type: 'text', text: '✓ 入場成功', color: '#ffffff', size: 'lg', weight: 'bold', align: 'center' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: (data.branchName as string) || '健身房', weight: 'bold', size: 'lg', align: 'center' },
          { type: 'text', text: (data.checkInTime as string) || new Date().toLocaleTimeString('zh-TW'), size: 'sm', color: '#666666', align: 'center', margin: 'sm' },
        ],
      },
    },
  };
}

function buildOtpText(data: Record<string, unknown>): TextMessage {
  return {
    type: 'text',
    text: `【Gym Nexus】您的驗證碼是 ${data.code}，5分鐘內有效。請勿將驗證碼告知他人。`,
  };
}

function buildTestMessage(data: Record<string, unknown>): TextMessage {
  return {
    type: 'text',
    text: (data.message as string) || '這是一則來自 Gym Nexus 的測試訊息 ✓',
  };
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function createInfoRow(label: string, value?: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#666666', size: 'sm', flex: 2 },
      { type: 'text', text: value || '-', wrap: true, color: '#333333', size: 'sm', flex: 3 },
    ],
  };
}

/**
 * Log LINE message to database
 */
async function logLineMessage(options: {
  memberId: string;
  branchId?: string;
  lineUserId: string;
  messageType: string;
  notificationType: string;
  messagePayload: unknown;
  altText?: string | null;
  requestId?: string;
  success: boolean;
  referenceType?: string;
  referenceId?: string;
}): Promise<void> {
  try {
    await db.insert(lineMessageLogs).values({
      memberId: options.memberId,
      branchId: options.branchId || null,
      lineUserId: options.lineUserId,
      messageType: options.messageType,
      notificationType: options.notificationType,
      messagePayload: options.messagePayload,
      altText: options.altText || null,
      requestId: options.requestId || null,
      deliveryStatus: options.success ? 'sent' : 'failed',
      sentAt: new Date(),
      referenceType: options.referenceType || null,
      referenceId: options.referenceId || null,
    });
  } catch (error) {
    console.error('[LINEService] Log error:', error);
  }
}

// -----------------------------------------------------------------------------
// Webhook & Quota Functions
// -----------------------------------------------------------------------------

/**
 * Validate webhook signature (for receiving webhooks)
 */
export function validateWebhookSignature(body: string, signature: string): boolean {
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
export async function getMessageQuota(branchId?: string): Promise<MessageQuotaResult> {
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

    const data = await response.json() as { type: string; value?: number };
    return {
      success: true,
      type: data.type,  // 'limited' or 'unlimited'
      value: data.value, // remaining quota if limited
    };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const lineService = {
  initLineService,
  isLineEnabled,
  getConfigForBranch,
  sendLineMessage,
  sendMulticast,
  buildLineMessage,
  validateWebhookSignature,
  getMessageQuota,
};

export default lineService;
