/**
 * Member Authentication Middleware
 * 會員 JWT Token 驗證中間件
 */

import { jwt } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * 創建會員認證中間件
 * @param {object} env - Directus 環境變數
 * @returns {Function} Express 中間件
 */
export function createMemberAuthMiddleware(env) {
  return async (req, res, next) => {
    try {
      // Use custom header 'X-Member-Token' to avoid Directus intercepting Authorization header
      // Also check Authorization header for backwards compatibility with direct API calls
      const memberToken = req.headers['x-member-token'];
      const authHeader = req.headers.authorization;
      const token = memberToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

      if (!token) {
        throw UnauthorizedError('Authentication required');
      }

      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';

      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (e) {
        throw UnauthorizedError('Invalid or expired token');
      }

      if (decoded.type !== 'member') {
        throw UnauthorizedError('Invalid token type');
      }

      req.member = decoded;
      next();
    } catch (error) {
      res.status(error.status || 401).json({
        success: false,
        message: error.message || 'Authentication failed',
      });
    }
  };
}

export default createMemberAuthMiddleware;
