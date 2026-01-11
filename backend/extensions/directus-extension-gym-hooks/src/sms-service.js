/**
 * SMS Service - Mitake (三竹簡訊) Integration
 *
 * Taiwan SMS gateway for OTP verification and fallback notifications
 * API Documentation: https://sms.mitake.com.tw/common/api
 *
 * Features:
 * - OTP verification messages
 * - Fallback notifications when other channels fail
 * - Multi-tenant support (per-branch credentials)
 * - Cost tracking and usage statistics
 */

// Module state
let config = {
  username: null,
  password: null,
  apiUrl: 'https://smsapi.mitake.com.tw/api/mtk/SmSend',
  costPerSegment: 0.5, // NT$ per SMS segment
};
let database = null;
let initialized = false;

// SMS character limits
const SMS_CHARSET = {
  ASCII_LIMIT: 160,      // ASCII: 160 chars per segment
  UNICODE_LIMIT: 70,     // Unicode (Chinese): 70 chars per segment
  CONCAT_ASCII: 153,     // Concatenated ASCII: 153 chars per segment
  CONCAT_UNICODE: 67,    // Concatenated Unicode: 67 chars per segment
};

/**
 * Initialize SMS service with Mitake credentials
 * @param {Object} options - Configuration options
 * @param {string} options.username - Mitake API username
 * @param {string} options.password - Mitake API password
 * @param {string} [options.apiUrl] - Custom API URL
 * @param {number} [options.costPerSegment] - Cost per SMS segment (NT$)
 * @param {Object} options.database - Knex database instance
 */
export function initSmsService(options) {
  config.username = options.username;
  config.password = options.password;
  if (options.apiUrl) {
    config.apiUrl = options.apiUrl;
  }
  if (options.costPerSegment) {
    config.costPerSegment = options.costPerSegment;
  }
  database = options.database;

  if (!config.username || !config.password) {
    // Status logged('[SMSService] Mitake credentials not configured - SMS notifications disabled');
    return false;
  }

  initialized = true;
  // Status logged('[SMSService] Initialized with Mitake API');
  return true;
}

/**
 * Check if SMS service is ready
 */
export function isSmsEnabled() {
  return initialized && config.username && config.password;
}

/**
 * Get SMS config for a specific branch (multi-tenant support)
 * @param {string} branchId - Branch UUID
 * @returns {Promise<Object>} Branch-specific or default config
 */
export async function getConfigForBranch(branchId) {
  if (!database || !branchId) {
    return {
      username: config.username,
      password: config.password,
      apiUrl: config.apiUrl,
      costPerSegment: config.costPerSegment,
    };
  }

  try {
    const result = await database.raw(`
      SELECT mitake_username, mitake_password, mitake_api_url, sms_cost_per_message, sms_enabled
      FROM branch_notification_config
      WHERE branch_id = ?::uuid AND sms_enabled = TRUE
    `, [branchId]);

    const row = result.rows?.[0];
    if (row?.mitake_username && row?.mitake_password) {
      return {
        username: row.mitake_username,
        password: row.mitake_password,
        apiUrl: row.mitake_api_url || config.apiUrl,
        costPerSegment: row.sms_cost_per_message || config.costPerSegment,
      };
    }
  } catch (error) {
    // Error logged('[SMSService] Error fetching branch config:', error.message);
  }

  // Fallback to default config
  return {
    username: config.username,
    password: config.password,
    apiUrl: config.apiUrl,
    costPerSegment: config.costPerSegment,
  };
}

/**
 * Send an SMS message
 *
 * @param {Object} options - SMS options
 * @param {string} options.phoneNumber - Recipient phone number
 * @param {string} options.type - Notification type
 * @param {Object} options.data - Template data
 * @param {string} [options.memberId] - Member ID for logging
 * @param {string} [options.branchId] - Branch ID for multi-tenant config
 * @param {string} [options.referenceType] - Reference type for logging
 * @param {string} [options.referenceId] - Reference ID for logging
 * @returns {Promise<{success: boolean, msgid?: string, segments?: number, error?: string}>}
 */
export async function sendSms(options) {
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
    if (database) {
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
    }

    if (!result.success) {
      // Error logged('[SMSService] Send failed:', result);
      return {
        success: false,
        error: result.error || `Mitake error: ${result.statuscode}`,
      };
    }

    // Status logged(`[SMSService] SMS sent to ${normalizedPhone}: ${type} (${segmentCount} segments)`);
    return {
      success: true,
      msgid: result.msgid,
      segments: segmentCount,
      cost: totalCost,
    };

  } catch (error) {
    // Error logged('[SMSService] Send error:', error.message);

    // Log failure
    if (database) {
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
    }

    return { success: false, error: error.message };
  }
}

/**
 * Build SMS message based on notification type
 * @param {string} type - Notification type
 * @param {Object} data - Template data
 * @returns {string} SMS message content
 */
export function buildSmsMessage(type, data) {
  const templates = {
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
  return `【Gym Nexus】${data.message || '您有新的通知，請登入APP查看。'}`;
}

/**
 * Normalize phone number to international format
 * @param {string} phone - Phone number in various formats
 * @returns {string|null} Normalized phone number or null if invalid
 */
export function normalizePhoneNumber(phone) {
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

/**
 * Calculate SMS segment count based on content
 * @param {string} message - SMS message content
 * @returns {{charCount: number, segmentCount: number}}
 */
export function calculateSmsSegments(message) {
  const charCount = message.length;

  // Check if message contains non-ASCII characters (Chinese, emoji, etc.)
  const hasUnicode = /[^\x00-\x7F]/.test(message);

  let segmentCount;
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

/**
 * Parse Mitake API response
 * @param {string} responseText - Raw response from Mitake API
 * @returns {{success: boolean, msgid?: string, statuscode?: string, error?: string}}
 */
function parseMitakeResponse(responseText) {
  // Mitake response format varies:
  // Success: [msgid]\nstatuscode=0
  // Error: statuscode=X (where X is error code)
  const lines = responseText.trim().split('\n');

  const result = {
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
 * @param {string} statuscode - Mitake status code
 * @returns {string} Human-readable error message
 */
function getMitakeErrorMessage(statuscode) {
  const errors = {
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

/**
 * Log SMS message to database
 */
async function logSmsMessage(options) {
  if (!database) return;

  try {
    await database.raw(`
      INSERT INTO sms_logs (
        member_id, branch_id, phone_number, notification_type, message_content,
        character_count, segment_count, mitake_msgid, mitake_statuscode,
        delivery_status, sent_at, total_cost, reference_type, reference_id
      ) VALUES (
        ?::uuid, ?::uuid, ?::varchar, ?::varchar, ?::text,
        ?::integer, ?::integer, ?::varchar, ?::varchar,
        ?::varchar, NOW(), ?::decimal, ?::varchar, ?::uuid
      )
    `, [
      options.memberId || null,
      options.branchId || null,
      options.phoneNumber,
      options.notificationType,
      options.messageContent,
      options.characterCount,
      options.segmentCount,
      options.mitakeMsgid || null,
      options.mitakeStatuscode || null,
      options.success ? 'submitted' : 'failed',
      options.totalCost || 0,
      options.referenceType || null,
      options.referenceId || null,
    ]);
  } catch (error) {
    // Error logged('[SMSService] Log error:', error.message);
  }
}

/**
 * Check Mitake account balance
 * @param {string} [branchId] - Optional branch ID for multi-tenant config
 * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
 */
export async function checkBalance(branchId = null) {
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
    return { success: false, error: error.message };
  }
}

/**
 * Get SMS usage statistics for a branch
 * @param {string} branchId - Branch UUID
 * @param {Date} [startDate] - Start date (default: current month start)
 * @param {Date} [endDate] - End date (default: today)
 * @returns {Promise<Object>} Usage statistics
 */
export async function getUsageStats(branchId, startDate = null, endDate = null) {
  if (!database) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const result = await database.raw(`
      SELECT * FROM get_sms_usage_stats(?::uuid, ?::date, ?::date)
    `, [
      branchId,
      startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate || new Date(),
    ]);

    const row = result.rows?.[0];
    if (row) {
      return {
        success: true,
        stats: {
          totalMessages: row.total_messages,
          totalSegments: row.total_segments,
          totalCost: parseFloat(row.total_cost),
          successCount: row.success_count,
          failureCount: row.failure_count,
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
    return { success: false, error: error.message };
  }
}

export default {
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
