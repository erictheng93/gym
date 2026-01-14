/**
 * CSRF Protection Middleware
 * 為狀態變更操作提供 CSRF 保護
 *
 * 注意：由於本 API 使用 JWT Bearer Token 認證（不是 Cookie），
 * 傳統 CSRF 攻擊已經被大幅緩解。此中間件提供額外的防護層。
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const crypto = require('crypto');

import { logger } from '../utils/logger.js';

// CSRF Token 有效期（毫秒）
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

// 存儲活躍的 CSRF tokens（生產環境應使用 Redis）
const activeTokens = new Map();

/**
 * 生成 CSRF Token
 * @param {string} userId - 用戶 ID
 * @returns {string} CSRF Token
 */
export function generateCsrfToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + CSRF_TOKEN_EXPIRY;

  activeTokens.set(token, {
    userId,
    expiry,
    createdAt: Date.now()
  });

  // 清理過期的 tokens
  cleanupExpiredTokens();

  return token;
}

/**
 * 驗證 CSRF Token
 * @param {string} token - CSRF Token
 * @param {string} userId - 用戶 ID
 * @returns {boolean} 是否有效
 */
export function validateCsrfToken(token, userId) {
  if (!token) return false;

  const tokenData = activeTokens.get(token);
  if (!tokenData) return false;

  // 檢查是否過期
  if (Date.now() > tokenData.expiry) {
    activeTokens.delete(token);
    return false;
  }

  // 檢查用戶是否匹配
  if (tokenData.userId !== userId) {
    return false;
  }

  return true;
}

/**
 * 清理過期的 tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of activeTokens.entries()) {
    if (now > data.expiry) {
      activeTokens.delete(token);
    }
  }
}

/**
 * 需要 CSRF 保護的 HTTP 方法
 */
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * 不需要 CSRF 保護的路徑（登入、OTP 等）
 */
const EXEMPT_PATHS = [
  '/gym/otp/send',
  '/gym/otp/verify',
  '/gym/auth/login',
  '/gym/auth/refresh',
  '/gym/health',
  '/gym/csrf/token'
];

/**
 * 創建 CSRF 保護中間件
 * @param {object} options - 配置選項
 * @param {boolean} options.enabled - 是否啟用 CSRF 保護
 * @returns {Function} Express 中間件
 */
export function createCsrfMiddleware(options = {}) {
  const { enabled = true } = options;

  return (req, res, next) => {
    // 如果禁用，直接通過
    if (!enabled) {
      return next();
    }

    // 檢查是否為豁免路徑
    const path = req.path;
    if (EXEMPT_PATHS.some(exemptPath => path.startsWith(exemptPath))) {
      return next();
    }

    // 只對狀態變更操作檢查 CSRF
    if (!PROTECTED_METHODS.includes(req.method)) {
      return next();
    }

    // 檢查用戶是否已認證
    const userId = req.accountability?.user;
    if (!userId) {
      // 未認證用戶不需要 CSRF 保護（其他中間件會拒絕）
      return next();
    }

    // 獲取 CSRF Token（從 header 或 body）
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;

    // 驗證 CSRF Token
    if (!validateCsrfToken(csrfToken, userId)) {
      // 記錄可疑請求
      logger.warn('[CSRF] Invalid CSRF token', {
        userId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({
        success: false,
        message: 'CSRF token 無效或已過期',
        error_code: 'INVALID_CSRF_TOKEN'
      });
    }

    next();
  };
}

export default createCsrfMiddleware;
