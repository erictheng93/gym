import { db, branchNotificationConfig, smsLogs } from '../db/index.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';

// =============================================================================
// SMS SERVICE - Mitake (三竹簡訊) Integration
// =============================================================================
// Taiwan SMS gateway for OTP verification and fallback notifications
// API Documentation: https://sms.mitake.com.tw/common/api

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SmsConfig {
  username: string | null;
  password: string | null;
  apiUrl: string;
  costPerSegment: number;
}

interface SendSmsOptions {
  phoneNumber: string;
  type: SmsNotificationType;
  data: Record<string, unknown>;
  memberId?: string;
  branchId?: string;
  referenceType?: string;
  referenceId?: string;
}

interface SmsResult {
  success: boolean;
  msgid?: string;
  segments?: number;
  cost?: number;
  error?: string;
}

interface BalanceResult {
  success: boolean;
  balance?: number;
  error?: string;
}

interface UsageStats {
  totalMessages: number;
  totalSegments: number;
  totalCost: number;
  successCount: number;
  failureCount: number;
}

interface UsageStatsResult {
  success: boolean;
  stats?: UsageStats;
  error?: string;
}

type SmsNotificationType =
  | 'otp'
  | 'booking_confirmation'
  | 'booking_reminder_24h'
  | 'booking_reminder_2h'
  | 'contract_expiry_7d'
  | 'contract_expiry_3d'
  | 'contract_expiry_1d'
  | 'class_cancelled'
  | 'payment_confirmation'
  | 'welcome';

// SMS character limits
const SMS_CHARSET = {
  ASCII_LIMIT: 160,      // ASCII: 160 chars per segment
  UNICODE_LIMIT: 70,     // Unicode (Chinese): 70 chars per segment
  CONCAT_ASCII: 153,     // Concatenated ASCII: 153 chars per segment
  CONCAT_UNICODE: 67,    // Concatenated Unicode: 67 chars per segment
};

// -----------------------------------------------------------------------------
// Module State
// -----------------------------------------------------------------------------

let config: SmsConfig = {
  username: null,
  password: null,
  apiUrl: 'https://smsapi.mitake.com.tw/api/mtk/SmSend',
  costPerSegment: 0.5, // NT$ per SMS segment
};
let initialized = false;

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

/**
 * Initialize SMS service with Mitake credentials
 */
export function initSmsService(options: {
  username?: string;
  password?: string;
  apiUrl?: string;
  costPerSegment?: number;
}): boolean {
  config.username = options.username || null;
  config.password = options.password || null;
  if (options.apiUrl) {
    config.apiUrl = options.apiUrl;
  }
  if (options.costPerSegment) {
    config.costPerSegment = options.costPerSegment;
  }

  if (!config.username || !config.password) {
    console.log('[SMSService] Mitake credentials not configured - SMS notifications disabled');
    return false;
  }

  initialized = true;
  console.log('[SMSService] Initialized with Mitake API');
  return true;
}

/**
 * Check if SMS service is ready
 */
export function isSmsEnabled(): boolean {
  return initialized && !!config.username && !!config.password;
}

// -----------------------------------------------------------------------------
// Branch-Specific Config (Multi-Tenant Support)
// -----------------------------------------------------------------------------

/**
 * Get SMS config for a specific branch
 */
export async function getConfigForBranch(branchId?: string): Promise<SmsConfig> {
  if (!branchId) {
    return {
      username: config.username,
      password: config.password,
      apiUrl: config.apiUrl,
      costPerSegment: config.costPerSegment,
    };
  }

  try {
    const [row] = await db
      .select({
        mitakeUsername: branchNotificationConfig.mitakeUsername,
        mitakePassword: branchNotificationConfig.mitakePassword,
        mitakeApiUrl: branchNotificationConfig.mitakeApiUrl,
        smsCostPerMessage: branchNotificationConfig.smsCostPerMessage,
        smsEnabled: branchNotificationConfig.smsEnabled,
      })
      .from(branchNotificationConfig)
      .where(
        and(
          eq(branchNotificationConfig.branchId, branchId),
          eq(branchNotificationConfig.smsEnabled, true)
        )
      )
      .limit(1);

    if (row?.mitakeUsername && row?.mitakePassword) {
      return {
        username: row.mitakeUsername,
        password: row.mitakePassword,
        apiUrl: row.mitakeApiUrl || config.apiUrl,
        costPerSegment: row.smsCostPerMessage ? parseFloat(row.smsCostPerMessage) : config.costPerSegment,
      };
    }
  } catch (error) {
    console.error('[SMSService] Error fetching branch config:', error);
  }

  // Fallback to default config
  return {
    username: config.username,
    password: config.password,
    apiUrl: config.apiUrl,
    costPerSegment: config.costPerSegment,
  };
}

// -----------------------------------------------------------------------------
// Send SMS Function
// -----------------------------------------------------------------------------

/**
 * Send an SMS message
 */
export async function sendSms(options: SendSmsOptions): Promise<SmsResult> {
  const { phoneNumber, type, data, memberId, branchId, referenceType, referenceId } = options;

  if (!phoneNumber) {
    return { success: false, error: 'Phone number not provided' };
  }

  // Normalize phone number to international format
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  // Get branch-specific or default config
  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.username || !branchConfig.password) {
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    // Build SMS message
    const message = buildSmsMessage(type, data);
    const { charCount, segmentCount } = calculateSmsSegments(message);

    // Calculate cost
    const totalCost = segmentCount * branchConfig.costPerSegment;

    // Send via Mitake API
    const params = new URLSearchParams({
      username: branchConfig.username,
      password: branchConfig.password,
      dstaddr: normalizedPhone,
      smbody: message,
      encoding: 'UTF8',
    });

    const response = await fetch(`${branchConfig.apiUrl}?${params.toString()}`, {
      method: 'POST',
    });

    const responseText = await response.text();
    const result = parseMitakeResponse(responseText);

    // Log to database
    await logSmsMessage({
      memberId,
      branchId,
      phoneNumber: normalizedPhone,
      notificationType: type,
      messageContent: message,
      characterCount: charCount,
      segmentCount,
      mitakeMsgid: result.msgid,
      mitakeStatuscode: result.statuscode,
      success: result.success,
      totalCost,
      referenceType,
      referenceId,
    });

    if (!result.success) {
      console.error('[SMSService] Send failed:', result);
      return {
        success: false,
        error: result.error || `Mitake error: ${result.statuscode}`,
      };
    }

    console.log(`[SMSService] SMS sent to ${normalizedPhone}: ${type} (${segmentCount} segments)`);
    return {
      success: true,
      msgid: result.msgid || undefined,
      segments: segmentCount,
      cost: totalCost,
    };

  } catch (error) {
    console.error('[SMSService] Send error:', error);

    // Log failure
    await logSmsMessage({
      memberId,
      branchId,
      phoneNumber: normalizedPhone,
      notificationType: type,
      messageContent: buildSmsMessage(type, data),
      characterCount: 0,
      segmentCount: 0,
      success: false,
      referenceType,
      referenceId,
    });

    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Message Builder
// -----------------------------------------------------------------------------

/**
 * Build SMS message based on notification type
 */
export function buildSmsMessage(type: SmsNotificationType, data: Record<string, unknown>): string {
  const templates: Record<SmsNotificationType, () => string> = {
    otp: () =>
      `【Gym Nexus】您的驗證碼是 ${data.code}，5分鐘內有效。請勿將驗證碼告知他人。`,

    booking_confirmation: () =>
      `【Gym Nexus】${data.memberName || ''}您好，已為您預約 ${data.sessionDate} ${data.startTime} 的${data.className}課程。`,

    booking_reminder_24h: () =>
      `【Gym Nexus】提醒您，明天 ${data.startTime} 有${data.className}課程。地點：${data.branchName}`,

    booking_reminder_2h: () =>
      `【Gym Nexus】${data.className}課程將在2小時後開始，請準時出席！`,

    contract_expiry_7d: () =>
      `【Gym Nexus】您的會籍將於7天後到期，請盡快續約以享優惠！`,

    contract_expiry_3d: () =>
      `【Gym Nexus】您的會籍將於3天後到期，續約優惠即將截止！`,

    contract_expiry_1d: () =>
      `【Gym Nexus】您的會籍明天到期，今日續約享最後優惠！`,

    class_cancelled: () =>
      `【Gym Nexus】抱歉，${data.sessionDate}的${data.className}課程已取消，請重新預約。`,

    payment_confirmation: () =>
      `【Gym Nexus】已收到您的付款 NT$${data.amount}，感謝您的支持！`,

    welcome: () =>
      `【Gym Nexus】${data.memberName || ''}您好，歡迎加入！會員編號：${data.memberCode}`,
  };

  const template = templates[type];
  if (template) {
    return template();
  }

  // Default message
  return `【Gym Nexus】${(data.message as string) || '您有新的通知，請登入APP查看。'}`;
}

// -----------------------------------------------------------------------------
// Phone Number Normalization
// -----------------------------------------------------------------------------

/**
 * Normalize phone number to international format
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Taiwan mobile: 09xxxxxxxx -> 8869xxxxxxxx
  if (digits.startsWith('09') && digits.length === 10) {
    return '886' + digits.substring(1);
  }

  // Already international format with country code
  if (digits.startsWith('886') && digits.length === 12) {
    return digits;
  }

  // Handle +886 format
  if (digits.startsWith('8869') && digits.length === 12) {
    return digits;
  }

  // Taiwan landline (optional support): 02-xxxx-xxxx -> 8862xxxxxxxx
  if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    return '886' + digits.substring(1);
  }

  return null;
}

// -----------------------------------------------------------------------------
// SMS Segment Calculation
// -----------------------------------------------------------------------------

/**
 * Calculate SMS segment count based on content
 */
export function calculateSmsSegments(message: string): { charCount: number; segmentCount: number } {
  const charCount = message.length;

  // Check if message contains non-ASCII characters (Chinese, emoji, etc.)
  const hasUnicode = /[^\x00-\x7F]/.test(message);

  let segmentCount: number;
  if (hasUnicode) {
    // Unicode (Chinese): 70 chars for single, 67 for concatenated
    segmentCount = charCount <= SMS_CHARSET.UNICODE_LIMIT
      ? 1
      : Math.ceil(charCount / SMS_CHARSET.CONCAT_UNICODE);
  } else {
    // ASCII only: 160 chars for single, 153 for concatenated
    segmentCount = charCount <= SMS_CHARSET.ASCII_LIMIT
      ? 1
      : Math.ceil(charCount / SMS_CHARSET.CONCAT_ASCII);
  }

  return { charCount, segmentCount };
}

// -----------------------------------------------------------------------------
// Mitake Response Parser
// -----------------------------------------------------------------------------

interface MitakeResponse {
  success: boolean;
  msgid: string | null;
  statuscode: string | null;
  error: string | null;
}

/**
 * Parse Mitake API response
 */
function parseMitakeResponse(responseText: string): MitakeResponse {
  const lines = responseText.trim().split('\n');

  const result: MitakeResponse = {
    msgid: null,
    statuscode: null,
    success: false,
    error: null,
  };

  // Parse response lines
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('=')) {
      const [key, value] = trimmed.split('=');
      if (key === 'statuscode') {
        result.statuscode = value;
      } else if (key === 'msgid') {
        result.msgid = value;
      }
    } else if (trimmed.match(/^[a-zA-Z0-9]+$/) && !result.msgid) {
      // First line might be msgid directly
      result.msgid = trimmed;
    }
  }

  // Status codes: 0 or 1 = success, others = error
  if (result.statuscode === '0' || result.statuscode === '1') {
    result.success = true;
  } else if (result.statuscode) {
    result.error = getMitakeErrorMessage(result.statuscode);
  } else if (result.msgid) {
    // If we have msgid but no statuscode, assume success
    result.success = true;
  }

  return result;
}

/**
 * Get error message for Mitake status code
 */
function getMitakeErrorMessage(statuscode: string): string {
  const errors: Record<string, string> = {
    '2': '帳號或密碼錯誤',
    '3': '餘額不足',
    '4': '傳送內容不正確',
    '5': '手機號碼格式錯誤',
    '6': '傳送數量超過限制',
    '7': '傳送時間格式錯誤',
    '8': '傳送時間已過期',
    '9': '系統錯誤，請稍後再試',
    '*': '帳號已被停權',
    'a': '帳號已被鎖定',
    'b': '帳號已過期',
    'c': '傳送失敗',
    'd': '傳送對象重複',
    'e': '黑名單拒絕',
    'f': '內容包含敏感字',
  };
  return errors[statuscode] || `未知錯誤 (${statuscode})`;
}

// -----------------------------------------------------------------------------
// Database Logging
// -----------------------------------------------------------------------------

/**
 * Log SMS message to database
 */
async function logSmsMessage(options: {
  memberId?: string;
  branchId?: string;
  phoneNumber: string;
  notificationType: string;
  messageContent: string;
  characterCount: number;
  segmentCount: number;
  mitakeMsgid?: string | null;
  mitakeStatuscode?: string | null;
  success: boolean;
  totalCost?: number;
  referenceType?: string;
  referenceId?: string;
}): Promise<void> {
  try {
    await db.insert(smsLogs).values({
      memberId: options.memberId || null,
      branchId: options.branchId || null,
      phoneNumber: options.phoneNumber,
      notificationType: options.notificationType,
      messageContent: options.messageContent,
      characterCount: options.characterCount,
      segmentCount: options.segmentCount,
      mitakeMsgid: options.mitakeMsgid || null,
      mitakeStatuscode: options.mitakeStatuscode || null,
      deliveryStatus: options.success ? 'submitted' : 'failed',
      sentAt: new Date(),
      totalCost: options.totalCost?.toString() || '0',
      referenceType: options.referenceType || null,
      referenceId: options.referenceId || null,
    });
  } catch (error) {
    console.error('[SMSService] Log error:', error);
  }
}

// -----------------------------------------------------------------------------
// Balance Check
// -----------------------------------------------------------------------------

/**
 * Check Mitake account balance
 */
export async function checkBalance(branchId?: string): Promise<BalanceResult> {
  const branchConfig = await getConfigForBranch(branchId);
  if (!branchConfig.username || !branchConfig.password) {
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const params = new URLSearchParams({
      username: branchConfig.username,
      password: branchConfig.password,
    });

    const response = await fetch(
      `https://smsapi.mitake.com.tw/api/mtk/SmQuery?${params.toString()}`
    );

    const text = await response.text();

    // Parse balance from response: AccountPoint=123
    const match = text.match(/AccountPoint=(\d+)/);
    if (match) {
      return {
        success: true,
        balance: parseInt(match[1], 10),
      };
    }

    // Check for error
    const errorMatch = text.match(/Error=(.+)/);
    if (errorMatch) {
      return {
        success: false,
        error: errorMatch[1],
      };
    }

    return {
      success: false,
      error: 'Unable to parse balance response',
    };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Usage Statistics
// -----------------------------------------------------------------------------

/**
 * Get SMS usage statistics for a branch
 */
export async function getUsageStats(
  branchId: string,
  startDate?: Date,
  endDate?: Date
): Promise<UsageStatsResult> {
  try {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date();

    const result = await db
      .select({
        totalMessages: sql<number>`count(*)::integer`,
        totalSegments: sql<number>`coalesce(sum(segment_count), 0)::integer`,
        totalCost: sql<string>`coalesce(sum(total_cost), 0)::decimal`,
        successCount: sql<number>`count(*) filter (where delivery_status in ('submitted', 'delivered'))::integer`,
        failureCount: sql<number>`count(*) filter (where delivery_status = 'failed')::integer`,
      })
      .from(smsLogs)
      .where(
        and(
          eq(smsLogs.branchId, branchId),
          gte(smsLogs.sentAt, start),
          lte(smsLogs.sentAt, end)
        )
      );

    const row = result[0];
    if (row) {
      return {
        success: true,
        stats: {
          totalMessages: row.totalMessages || 0,
          totalSegments: row.totalSegments || 0,
          totalCost: parseFloat(row.totalCost) || 0,
          successCount: row.successCount || 0,
          failureCount: row.failureCount || 0,
        },
      };
    }

    return {
      success: true,
      stats: {
        totalMessages: 0,
        totalSegments: 0,
        totalCost: 0,
        successCount: 0,
        failureCount: 0,
      },
    };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const smsService = {
  initSmsService,
  isSmsEnabled,
  getConfigForBranch,
  sendSms,
  buildSmsMessage,
  normalizePhoneNumber,
  calculateSmsSegments,
  checkBalance,
  getUsageStats,
};

export default smsService;
