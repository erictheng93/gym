/**
 * CSRF Routes
 * /gym/csrf/*
 * CSRF Token 管理端點
 */

import { generateCsrfToken } from '../middleware/csrf.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊 CSRF 路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerCsrfRoutes(router, context) {
  /**
   * GET /gym/csrf/token
   * 獲取 CSRF Token
   * 需要認證
   */
  router.get('/csrf/token', async (req, res) => {
    try {
      const userId = req.accountability?.user;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '需要認證',
          error_code: 'UNAUTHORIZED'
        });
      }

      const token = generateCsrfToken(userId);

      logger.info('[CSRF] Token generated', { userId });

      res.json({
        success: true,
        data: {
          csrfToken: token,
          expiresIn: 3600 // 1 hour in seconds
        }
      });
    } catch (error) {
      logger.error('[CSRF] Error generating token:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });
}

export default registerCsrfRoutes;
