/**
 * Admin Notification Middleware
 * 管理員通知設定權限驗證中間件
 */

import { logger } from '../utils/logger.js';

/**
 * 創建管理員通知設定中間件
 * Requires Directus admin or branch manager with notification_config permission
 * @param {object} database - Knex database instance
 * @returns {Function} Express 中間件
 */
export function createAdminNotificationMiddleware(database) {
  return async (req, res, next) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({ success: false, message: '請先登入' });
      }

      // Directus admin has full access
      if (req.accountability?.admin === true) {
        req.adminBranchId = null; // null means all branches
        return next();
      }

      // Check if user is employee with notification config permission
      const empResult = await database.raw(`
        SELECT
          e.id,
          e.branch_id,
          jt.permissions_config,
          e.custom_permissions
        FROM employees e
        JOIN job_titles jt ON e.job_title_id = jt.id
        WHERE e.user_id = ?::uuid AND e.status = 'active'
      `, [userId]);

      if (empResult.rows?.length === 0) {
        return res.status(403).json({ success: false, message: '無權限' });
      }

      const emp = empResult.rows[0];
      const permissions = { ...emp.permissions_config, ...emp.custom_permissions };

      // Check for notification_config or admin permission
      if (!permissions.notification_config && !permissions.admin && !permissions.settings) {
        return res.status(403).json({ success: false, message: '無通知設定權限' });
      }

      req.adminBranchId = emp.branch_id;
      req.employeeId = emp.id;
      next();
    } catch (error) {
      logger.error('Admin auth error', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
}

export default createAdminNotificationMiddleware;
