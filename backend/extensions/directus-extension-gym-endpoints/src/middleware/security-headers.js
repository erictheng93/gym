/**
 * Security Headers Middleware
 * 為所有 API 回應添加安全標頭
 */

import { logger } from '../utils/logger.js';

/**
 * 創建安全標頭中間件
 * @returns {Function} Express 中間件
 */
export function createSecurityHeadersMiddleware() {
  return (req, res, next) => {
    // 防止 MIME 類型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 防止 Clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS 過濾（舊版瀏覽器）
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // 控制 Referer 標頭
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 禁用不必要的瀏覽器功能
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // 確保 JSON 回應使用 UTF-8 編碼 (防止中文亂碼)
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Cache-Control for API responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 防止 IE 下載對話框中的內容執行
    res.setHeader('X-Download-Options', 'noopen');

    // 跨域資源策略
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    next();
  };
}

export default createSecurityHeadersMiddleware;
