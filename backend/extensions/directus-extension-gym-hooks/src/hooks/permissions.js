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
    contract_logs: 'contracts',
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
    // Class management
    classes: 'classes',
    class_sessions: 'classes',
    class_categories: 'classes',
    class_bookings: 'classes',
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
   * 取得員工的有效權限（包含租戶資訊）
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
          e.branch_id,
          e.custom_permissions,
          jt.permissions_config as job_title_permissions,
          b.tenant_id
        FROM employees e
        LEFT JOIN job_titles jt ON jt.id = e.job_title_id
        LEFT JOIN branches b ON b.id = e.branch_id
        WHERE e.user_id = $1
          AND e.status = 'active'
        LIMIT 1
      `, [userId]);

      const employee = result.rows?.[0];
      if (!employee) {
        // Perms logged(`[PermissionCheck] No active employee found for user ${userId}`);
        return {};
      }

      let permissions = {};
      if (employee.custom_permissions && typeof employee.custom_permissions === 'object') {
        permissions = employee.custom_permissions;
        // Perms logged(`[PermissionCheck] Using custom permissions for employee ${employee.id}`);
      } else if (employee.job_title_permissions && typeof employee.job_title_permissions === 'object') {
        permissions = employee.job_title_permissions;
        // Perms logged(`[PermissionCheck] Using job title permissions for employee ${employee.id}`);
      } else {
        // Perms logged(`[PermissionCheck] No permissions configured for employee ${employee.id}`);
      }

      permissionCache.set(userId, {
        permissions,
        tenantId: employee.tenant_id,
        branchId: employee.branch_id,
        employeeId: employee.id,
        timestamp: Date.now(),
      });

      return {
        permissions,
        tenantId: employee.tenant_id,
        branchId: employee.branch_id,
        employeeId: employee.id
      };
    } catch (error) {
      // Error logged('[PermissionCheck] Error fetching permissions:', error);
      return { permissions: {} };
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
   * 取得租戶的所有分店 ID
   */
  async function getTenantBranches(tenantId) {
    if (!tenantId) {
      return [];
    }

    try {
      const result = await database.raw(`
        SELECT id FROM branches
        WHERE tenant_id = $1 AND status = 'active'
      `, [tenantId]);

      return result.rows?.map(r => r.id) || [];
    } catch (error) {
      // Error logged('[TenantIsolation] Error fetching tenant branches:', error);
      return [];
    }
  }

  /**
   * 檢查使用者是否有執行操作的權限
   */
  async function checkPermission(userId, collection, action) {
    const effectivePerms = await getEffectivePermissions(userId);
    const permissions = effectivePerms.permissions || effectivePerms;

    const module = COLLECTION_TO_MODULE[collection];
    if (!module) {
      return true;
    }

    const hasPermission = permissions[module]?.[action] === true;

    if (!hasPermission) {
      // Perms logged(`[PermissionCheck] Permission denied: user=${userId}, collection=${collection}, action=${action}, module=${module}`);
    }

    return hasPermission;
  }

  // 權限檢查與租戶隔離 Filter Hook
  ['items.create', 'items.read', 'items.update', 'items.delete'].forEach(operation => {
    filter(operation, async (input, { collection, accountability, schema }) => {
      // 跳過未認證用戶和管理員
      if (!accountability || !accountability.user) {
        return input;
      }

      if (accountability.admin === true) {
        return input;
      }

      // 跳過 Directus 系統表
      if (collection.startsWith('directus_')) {
        return input;
      }

      try {
        const action = OPERATION_TO_ACTION[operation];

        // 1. 檢查權限
        const hasPermission = await checkPermission(accountability.user, collection, action);

        if (!hasPermission) {
          const module = COLLECTION_TO_MODULE[collection];
          throw new Error(`權限不足：您沒有權限${getActionName(action)}${getModuleName(module)}`);
        }

        // 2. 應用租戶隔離（只對特定集合）
        const tenantIsolatedCollections = [
          'branches', 'employees', 'members', 'contracts', 'contract_logs', 'payments',
          'membership_plans', 'checkin_logs', 'attendance_records',
          'leave_requests', 'leave_balances', 'makeup_punch_requests',
          'schedules', 'job_titles', 'classes', 'class_sessions', 'class_categories', 'class_bookings'
        ];

        if (tenantIsolatedCollections.includes(collection)) {
          const effectivePerms = await getEffectivePermissions(accountability.user);
          const tenantId = effectivePerms.tenantId;

          if (tenantId) {
            // 獲取租戶的所有分店 ID
            const tenantBranches = await getTenantBranches(tenantId);

            if (tenantBranches.length > 0) {
              // 根據集合類型應用不同的過濾規則
              if (collection === 'branches') {
                // branches 表直接過濾 tenant_id
                input.filter = {
                  _and: [
                    input.filter || {},
                    { tenant_id: { _eq: tenantId } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: tenant_id=${tenantId}`);
              } else if (collection === 'employees') {
                // employees 通過 branch_id 過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { branch_id: { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (collection === 'members') {
                // members 通過 branch_id 過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { branch_id: { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (collection === 'contracts') {
                // contracts 通過關聯的 members.branch_id 過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { 'member_id.branch_id': { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (collection === 'contract_logs') {
                // contract_logs 通過關聯的 contract.member_id.branch_id 過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { 'contract_id.member_id.branch_id': { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (['payments', 'checkin_logs', 'class_bookings'].includes(collection)) {
                // 這些表通過關聯的資源過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { 'member_id.branch_id': { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (['attendance_records', 'leave_requests', 'leave_balances', 'makeup_punch_requests'].includes(collection)) {
                // HR 相關表通過 employee.branch_id 過濾
                input.filter = {
                  _and: [
                    input.filter || {},
                    { 'employee_id.branch_id': { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              } else if (['membership_plans', 'classes', 'class_sessions', 'class_categories', 'schedules', 'job_titles'].includes(collection)) {
                // 這些表有 branch_id 欄位
                input.filter = {
                  _and: [
                    input.filter || {},
                    { branch_id: { _in: tenantBranches } }
                  ]
                };
                // Perms logged(`[TenantIsolation] Applied tenant filter for ${collection}: ${tenantBranches.length} branches`);
              }
            }
          }
        }

        return input;
      } catch (error) {
        if (error.message && error.message.includes('權限不足')) {
          throw error;
        }
        // Error logged('[PermissionCheck] Error in permission check:', error);
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

      // Perms logged(`[PermissionCheck] Invalidated permission cache for ${userIds.length} users`);
    } catch (error) {
      // Error logged('[PermissionCheck] Error invalidating cache:', error);
    }
  });

  // 當職位資料更新時，清空所有緩存
  action('job_titles.items.update', async ({ keys }) => {
    try {
      invalidatePermissionCache();
      // Perms logged('[PermissionCheck] Cleared all permission cache due to job title update');
    } catch (error) {
      // Error logged('[PermissionCheck] Error invalidating cache:', error);
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
        // Perms logged(`[PermissionCheck] Cleaned ${cleanedCount} expired permission cache entries`);
      }
    });
  }
}

export default registerPermissionsHooks;
