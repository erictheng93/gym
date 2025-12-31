/**
 * Permissions Hooks
 * 基於 job_titles.permissions_config 和 employees.custom_permissions 的細粒度權限控制
 */

import { getActionName, getModuleName } from './utils.js';

/**
 * 註冊權限檢查鉤子
 */
export function registerPermissionsHooks({ action, filter, schedule }, { database }) {
  /**
   * 權限緩存
   */
  const permissionCache = new Map();
  const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

  /**
   * 集合名稱到權限模組的對應
   */
  const COLLECTION_TO_MODULE = {
    members: 'members',
    contracts: 'contracts',
    payments: 'payments',
    membership_plans: 'plans',
    employees: 'employees',
    branches: 'branches',
    checkin_logs: 'checkin',
    attendance_records: 'hr',
    leave_requests: 'hr',
    leave_balances: 'hr',
    makeup_punch_requests: 'hr',
    schedules: 'hr',
    reports: 'reports',
    job_titles: 'settings',
    system_settings: 'settings',
  };

  /**
   * 操作到權限動作的對應
   */
  const OPERATION_TO_ACTION = {
    'items.create': 'create',
    'items.read': 'read',
    'items.update': 'update',
    'items.delete': 'delete',
  };

  /**
   * 取得員工的有效權限
   */
  async function getEffectivePermissions(userId) {
    try {
      const cached = permissionCache.get(userId);
      if (cached && (Date.now() - cached.timestamp) < PERMISSION_CACHE_TTL) {
        return cached.permissions;
      }

      const result = await database.raw(`
        SELECT
          e.id,
          e.custom_permissions,
          jt.permissions_config as job_title_permissions
        FROM employees e
        LEFT JOIN job_titles jt ON jt.id = e.job_title_id
        WHERE e.user_id = $1
          AND e.status = 'active'
        LIMIT 1
      `, [userId]);

      const employee = result.rows?.[0];
      if (!employee) {
        console.log(`[PermissionCheck] No active employee found for user ${userId}`);
        return {};
      }

      let permissions = {};
      if (employee.custom_permissions && typeof employee.custom_permissions === 'object') {
        permissions = employee.custom_permissions;
        console.log(`[PermissionCheck] Using custom permissions for employee ${employee.id}`);
      } else if (employee.job_title_permissions && typeof employee.job_title_permissions === 'object') {
        permissions = employee.job_title_permissions;
        console.log(`[PermissionCheck] Using job title permissions for employee ${employee.id}`);
      } else {
        console.log(`[PermissionCheck] No permissions configured for employee ${employee.id}`);
      }

      permissionCache.set(userId, {
        permissions,
        timestamp: Date.now(),
      });

      return permissions;
    } catch (error) {
      console.error('[PermissionCheck] Error fetching permissions:', error);
      return {};
    }
  }

  /**
   * 清除權限緩存
   */
  function invalidatePermissionCache(userId) {
    if (userId) {
      permissionCache.delete(userId);
    } else {
      permissionCache.clear();
    }
  }

  /**
   * 檢查使用者是否有執行操作的權限
   */
  async function checkPermission(userId, collection, action) {
    const permissions = await getEffectivePermissions(userId);

    const module = COLLECTION_TO_MODULE[collection];
    if (!module) {
      return true;
    }

    const hasPermission = permissions[module]?.[action] === true;

    if (!hasPermission) {
      console.log(`[PermissionCheck] Permission denied: user=${userId}, collection=${collection}, action=${action}, module=${module}`);
    }

    return hasPermission;
  }

  // 權限檢查 Filter Hook
  ['items.create', 'items.read', 'items.update', 'items.delete'].forEach(operation => {
    filter(operation, async (input, { collection, accountability, schema }) => {
      if (!accountability || !accountability.user) {
        return input;
      }

      if (accountability.admin === true) {
        return input;
      }

      if (collection.startsWith('directus_')) {
        return input;
      }

      try {
        const action = OPERATION_TO_ACTION[operation];
        const hasPermission = await checkPermission(accountability.user, collection, action);

        if (!hasPermission) {
          const module = COLLECTION_TO_MODULE[collection];
          throw new Error(`權限不足：您沒有權限${getActionName(action)}${getModuleName(module)}`);
        }

        return input;
      } catch (error) {
        if (error.message && error.message.includes('權限不足')) {
          throw error;
        }
        console.error('[PermissionCheck] Error in permission check:', error);
        return input;
      }
    });
  });

  // 當員工資料更新時，清除權限緩存
  action('employees.items.update', async ({ keys }) => {
    try {
      const result = await database.raw(`
        SELECT user_id FROM employees WHERE id = ANY($1::uuid[])
      `, [keys]);

      const userIds = result.rows?.map(r => r.user_id).filter(Boolean) || [];
      userIds.forEach(userId => invalidatePermissionCache(userId));

      console.log(`[PermissionCheck] Invalidated permission cache for ${userIds.length} users`);
    } catch (error) {
      console.error('[PermissionCheck] Error invalidating cache:', error);
    }
  });

  // 當職位資料更新時，清空所有緩存
  action('job_titles.items.update', async ({ keys }) => {
    try {
      invalidatePermissionCache();
      console.log('[PermissionCheck] Cleared all permission cache due to job title update');
    } catch (error) {
      console.error('[PermissionCheck] Error invalidating cache:', error);
    }
  });

  // 定期清理過期的權限緩存
  if (typeof schedule === 'function') {
    schedule('*/30 * * * *', async () => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [userId, cache] of permissionCache.entries()) {
        if ((now - cache.timestamp) >= PERMISSION_CACHE_TTL) {
          permissionCache.delete(userId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[PermissionCheck] Cleaned ${cleanedCount} expired permission cache entries`);
      }
    });
  }
}

export default registerPermissionsHooks;
