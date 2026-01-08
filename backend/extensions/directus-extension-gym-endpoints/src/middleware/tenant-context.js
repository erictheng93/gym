/**
 * Tenant Context Middleware
 * 租戶上下文中間件
 *
 * 功能：
 * 1. 從當前用戶推導出 tenant_id 和 branch_id
 * 2. 注入到請求上下文中供後續路由使用
 * 3. 驗證租戶狀態（active/suspended/cancelled）
 * 4. 支持 Directus 超級管理員跨租戶訪問
 */

/**
 * 創建租戶上下文中間件
 * @param {object} database - Knex database instance
 * @returns {Function} Express 中間件
 */
export function createTenantContextMiddleware(database) {
  return async (req, res, next) => {
    try {
      const userId = req.accountability?.user;

      console.log('[TenantContext] User ID:', userId, 'Type:', typeof userId);
      console.log('[TenantContext] Accountability:', JSON.stringify(req.accountability));

      if (!userId) {
        console.warn('[TenantContext] No user ID found');
        return res.status(401).json({
          success: false,
          message: '請先登入'
        });
      }

      // Directus 超級管理員跳過租戶檢查（可全局訪問）
      if (req.accountability?.admin === true) {
        req.tenantId = null;  // null = 全局訪問
        req.branchId = null;
        req.isSuperAdmin = true;
        console.log('[TenantContext] Super Admin access granted');
        return next();
      }

      // 查詢員工的租戶和分店信息
      console.log('[TenantContext] Querying employee with user_id:', userId);
      const result = await database.raw(`
        SELECT
          e.id AS employee_id,
          e.branch_id,
          b.tenant_id,
          b.name AS branch_name,
          b.status AS branch_status,
          t.name AS tenant_name,
          t.plan_type,
          t.tenant_status,
          t.max_branches,
          t.max_members,
          t.max_employees,
          t.trial_ends_at
        FROM employees e
        INNER JOIN branches b ON e.branch_id = b.id
        INNER JOIN tenants t ON b.tenant_id = t.id
        WHERE e.user_id = ?::uuid
          AND e.status = 'active'
        LIMIT 1
      `, [userId]);

      if (result.rows?.length === 0) {
        return res.status(403).json({
          success: false,
          message: '找不到有效的員工帳號'
        });
      }

      const employee = result.rows[0];

      // 檢查租戶狀態
      if (employee.tenant_status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: '租戶已暫停，請聯繫管理員',
          error_code: 'TENANT_SUSPENDED'
        });
      }

      if (employee.tenant_status === 'cancelled') {
        return res.status(403).json({
          success: false,
          message: '租戶已取消，無法訪問',
          error_code: 'TENANT_CANCELLED'
        });
      }

      if (employee.tenant_status !== 'trial' && employee.tenant_status !== 'active') {
        return res.status(403).json({
          success: false,
          message: '租戶狀態異常，請聯繫管理員',
          error_code: 'TENANT_INVALID_STATUS'
        });
      }

      // 檢查分店狀態
      if (employee.branch_status !== 'active') {
        return res.status(403).json({
          success: false,
          message: '分店已停用，無法訪問',
          error_code: 'BRANCH_INACTIVE'
        });
      }

      // 檢查試用期是否過期
      if (employee.tenant_status === 'trial' && employee.trial_ends_at) {
        const trialEndDate = new Date(employee.trial_ends_at);
        const now = new Date();
        if (now > trialEndDate) {
          return res.status(403).json({
            success: false,
            message: '試用期已結束，請升級訂閱',
            error_code: 'TRIAL_EXPIRED',
            trial_ends_at: employee.trial_ends_at
          });
        }
      }

      // 注入租戶和分店上下文到請求對象
      req.tenantId = employee.tenant_id;
      req.branchId = employee.branch_id;
      req.employeeId = employee.employee_id;
      req.tenantName = employee.tenant_name;
      req.branchName = employee.branch_name;
      req.planType = employee.plan_type;
      req.tenantStatus = employee.tenant_status;
      req.isSuperAdmin = false;

      // 注入配額信息（供後續配額檢查使用）
      req.tenantQuota = {
        maxBranches: employee.max_branches,
        maxMembers: employee.max_members,
        maxEmployees: employee.max_employees
      };

      console.log(`[TenantContext] User ${userId} -> Tenant ${req.tenantId} (${req.tenantName}), Branch ${req.branchId} (${req.branchName}), Plan: ${req.planType}`);

      next();
    } catch (error) {
      console.error('[TenantContext] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error_code: 'TENANT_CONTEXT_ERROR'
      });
    }
  };
}

/**
 * 檢查租戶配額的中間件工廠函數
 * 用於特定路由檢查是否超過配額限制
 * @param {object} database - Knex database instance
 * @param {string} resourceType - 資源類型: 'branches' | 'members' | 'employees'
 * @returns {Function} Express 中間件
 */
export function createQuotaCheckMiddleware(database, resourceType) {
  return async (req, res, next) => {
    try {
      // 超級管理員跳過配額檢查
      if (req.isSuperAdmin) {
        return next();
      }

      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          message: '無法確定租戶身份'
        });
      }

      // 查詢當前使用量
      let currentCount = 0;
      let maxCount = 0;

      switch (resourceType) {
        case 'branches':
          maxCount = req.tenantQuota?.maxBranches || 0;
          const branchResult = await database.raw(`
            SELECT COUNT(*) AS count
            FROM branches
            WHERE tenant_id = $1::uuid AND status = 'active'
          `, [tenantId]);
          currentCount = parseInt(branchResult.rows[0]?.count || 0);
          break;

        case 'members':
          maxCount = req.tenantQuota?.maxMembers || 0;
          const memberResult = await database.raw(`
            SELECT COUNT(*) AS count
            FROM members m
            INNER JOIN branches b ON m.branch_id = b.id
            WHERE b.tenant_id = $1::uuid AND m.status = 'active'
          `, [tenantId]);
          currentCount = parseInt(memberResult.rows[0]?.count || 0);
          break;

        case 'employees':
          maxCount = req.tenantQuota?.maxEmployees || 0;
          const employeeResult = await database.raw(`
            SELECT COUNT(*) AS count
            FROM employees e
            INNER JOIN branches b ON e.branch_id = b.id
            WHERE b.tenant_id = $1::uuid AND e.status = 'active'
          `, [tenantId]);
          currentCount = parseInt(employeeResult.rows[0]?.count || 0);
          break;

        default:
          return res.status(400).json({
            success: false,
            message: '不支持的資源類型'
          });
      }

      // 檢查是否超過配額
      if (currentCount >= maxCount) {
        return res.status(403).json({
          success: false,
          message: `已達到 ${resourceType} 配額上限 (${maxCount})`,
          error_code: 'QUOTA_EXCEEDED',
          resource_type: resourceType,
          current_count: currentCount,
          max_count: maxCount,
          upgrade_message: '請升級訂閱以增加配額'
        });
      }

      // 注入當前使用量供後續使用
      req.currentUsage = {
        ...req.currentUsage,
        [resourceType]: currentCount
      };

      next();
    } catch (error) {
      console.error('[QuotaCheck] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error_code: 'QUOTA_CHECK_ERROR'
      });
    }
  };
}

/**
 * 租戶隔離查詢輔助函數
 * 自動添加 tenant_id 篩選條件到查詢
 * @param {object} knex - Knex query builder
 * @param {string} tenantId - 租戶 ID
 * @param {string} [tableName='branches'] - 表名（預設為 branches）
 * @returns {object} 添加了租戶篩選的查詢構建器
 */
export function withTenantScope(knex, tenantId, tableName = 'branches') {
  if (!tenantId) {
    // 如果沒有 tenantId（如超級管理員），返回不加篩選的查詢
    return knex;
  }
  return knex.where(`${tableName}.tenant_id`, tenantId);
}

export default createTenantContextMiddleware;
