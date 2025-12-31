/**
 * Simple JWT Implementation
 * 無需外部依賴的 JWT 簽發與驗證
 */

import crypto from 'crypto';

/**
 * Base64URL 編碼
 */
export function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL 解碼
 */
export function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * 解析過期時間字串
 * @param {string} str - 時間字串 (如 '1h', '30m', '7d')
 * @returns {number} 秒數
 */
export function parseExpiry(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;
  const [, num, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num) * (multipliers[unit] || 3600);
}

/**
 * JWT 工具對象
 */
export const jwt = {
  /**
   * 簽發 JWT Token
   * @param {object} payload - Token 載荷
   * @param {string} secret - 簽名密鑰
   * @param {object} options - 選項 (expiresIn)
   * @returns {string} JWT Token
   */
  sign: (payload, secret, options = {}) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);

    let exp = null;
    if (options.expiresIn) {
      exp = typeof options.expiresIn === 'number'
        ? now + options.expiresIn
        : now + parseExpiry(options.expiresIn);
    }

    const fullPayload = { ...payload, iat: now };
    if (exp) fullPayload.exp = exp;

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(fullPayload));
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  },

  /**
   * 驗證 JWT Token
   * @param {string} token - JWT Token
   * @param {string} secret - 簽名密鑰
   * @returns {object} 解碼後的載荷
   * @throws {Error} Token 無效或過期
   */
  verify: (token, secret) => {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSig) throw new Error('Invalid signature');

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }
};

export default jwt;
