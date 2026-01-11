/**
 * Quota Routes
 * /gym/quota/*
 * 租戶配額管理端點
 */

/**
 * 註冊配額路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerQuotaRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/quota/status
   * 獲取當前租戶的配額使用情況
   * 需要認證，自動從租戶上下文中間件獲取租戶信息
   */
  router.get('/quota/status', async (req, res) => {
    try {
      // 從租戶上下文中間件獲取租戶信息
      const { tenantId, isSuperAdmin } = req;

      // 超級管理員需要指定 tenant_id 參數
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId) {
        return res.status(403).json({
          success: false,
          message: '無租戶上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 獲取租戶資訊
      const tenantResult = await database.raw(`
        SELECT
          id,
          name,
          slug,
          plan_type,
          tenant_status,
          max_branches,
          max_members,
          max_employees,
          max_storage_mb,
          trial_ends_at,
          date_created
        FROM tenants
        WHERE id = ?::uuid
        LIMIT 1
      `, [targetTenantId]);

      const tenant = tenantResult.rows?.[0];
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: '找不到租戶資料',
        });
      }

      // 獲取租戶的所有分店 ID
      const branchesResult = await database.raw(`
        SELECT id, status FROM branches
        WHERE tenant_id = ?::uuid
      `, [targetTenantId]);

      const allBranches = branchesResult.rows || [];
      const activeBranches = allBranches.filter(b => b.status === 'active');
      const branchIds = activeBranches.map(b => b.id);

      // 獲取租戶相關的所有用戶 ID（員工的 user_id）
      const employeeUsersResult = await database.raw(`
        SELECT user_id FROM employees
        WHERE branch_id = ANY(?::uuid[])
          AND user_id IS NOT NULL
      `, [branchIds.length > 0 ? branchIds : [null]]);

      const userIds = employeeUsersResult.rows?.map(row => row.user_id).filter(Boolean) || [];

      // 平行計算當前使用量
      const [membersResult, employeesResult, storageResult] = await Promise.all([
        // 計算會員數（包含 ACTIVE, INACTIVE, FROZEN）
        database.raw(`
          SELECT COUNT(*) as count
          FROM members
          WHERE branch_id = ANY(?::uuid[])
            AND member_status IN ('ACTIVE', 'INACTIVE', 'FROZEN')
        `, [branchIds.length > 0 ? branchIds : [null]]),

        // 計算員工數（只計算 active）
        database.raw(`
          SELECT COUNT(*) as count
          FROM employees
          WHERE branch_id = ANY(?::uuid[])
            AND status = 'active'
        `, [branchIds.length > 0 ? branchIds : [null]]),

        // 計算存儲空間（從 directus_files 計算，單位轉換為 MB）
        userIds.length > 0
          ? database.raw(`
              SELECT COALESCE(SUM(filesize), 0)::bigint / 1024.0 / 1024.0 as storage_mb
              FROM directus_files
              WHERE uploaded_by = ANY(?::uuid[])
            `, [userIds])
          : Promise.resolve({ rows: [{ storage_mb: 0 }] })
      ]);

      const currentMembers = parseInt(membersResult.rows?.[0]?.count || 0);
      const currentEmployees = parseInt(employeesResult.rows?.[0]?.count || 0);
      const currentStorageMb = parseFloat(storageResult.rows?.[0]?.storage_mb || 0);

      // 構建回應
      res.json({
        success: true,
        data: {
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan_type: tenant.plan_type,
            status: tenant.tenant_status,
            trial_ends_at: tenant.trial_ends_at,
            created_at: tenant.created_at
          },
          members: {
            current: currentMembers,
            limit: tenant.max_members,
            available: Math.max(0, tenant.max_members - currentMembers),
            usage_percentage: tenant.max_members > 0
              ? Math.round((currentMembers / tenant.max_members) * 100)
              : 0,
          },
          employees: {
            current: currentEmployees,
            limit: tenant.max_employees,
            available: Math.max(0, tenant.max_employees - currentEmployees),
            usage_percentage: tenant.max_employees > 0
              ? Math.round((currentEmployees / tenant.max_employees) * 100)
              : 0,
          },
          branches: {
            current: activeBranches.length,
            total: allBranches.length,
            limit: tenant.max_branches,
            available: Math.max(0, tenant.max_branches - activeBranches.length),
            usage_percentage: tenant.max_branches > 0
              ? Math.round((activeBranches.length / tenant.max_branches) * 100)
              : 0,
          },
          storage: {
            current: currentStorageMb,
            limit: tenant.max_storage_mb,
            available: Math.max(0, tenant.max_storage_mb - currentStorageMb),
            usage_percentage: tenant.max_storage_mb > 0
              ? Math.round((currentStorageMb / tenant.max_storage_mb) * 100)
              : 0,
            unit: 'MB'
          },
        },
      });

      // Status logged(`[QuotaEndpoint] Status fetched for tenant: ${tenant.name} (${tenant.id})`);
    } catch (error) {
      // Error logged('[QuotaEndpoint] Error fetching quota status:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/quota/check
   * 檢查是否可以創建指定資源
   * Body: { resource: 'members' | 'employees' | 'branches', count?: number }
   */
  router.post('/quota/check', async (req, res) => {
    try {
      // 從租戶上下文中間件獲取租戶信息
      const { tenantId, isSuperAdmin } = req;

      // 超級管理員跳過配額檢查
      if (isSuperAdmin) {
        return res.json({
          success: true,
          can_create: true,
          message: '超級管理員無配額限制',
          quota: null
        });
      }

      const { resource, count = 1 } = req.body;

      if (!resource || !['members', 'employees', 'branches'].includes(resource)) {
        return res.status(400).json({
          success: false,
          message: '無效的資源類型，必須是 members, employees 或 branches',
          error_code: 'INVALID_RESOURCE_TYPE'
        });
      }

      if (!tenantId) {
        return res.status(403).json({
          success: false,
          message: '無租戶上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 使用資料庫函數檢查配額
      const checkResult = await database.raw(`
        SELECT
          t.id,
          t.name,
          t.plan_type,
          CASE ?
            WHEN 'members' THEN t.max_members
            WHEN 'employees' THEN t.max_employees
            WHEN 'branches' THEN t.max_branches
            ELSE 0
          END as max_quota,
          CASE ?
            WHEN 'members' THEN (
              SELECT COUNT(*)::int FROM members m
              INNER JOIN branches b ON b.id = m.branch_id
              WHERE b.tenant_id = t.id AND m.member_status IN ('ACTIVE', 'INACTIVE', 'FROZEN')
            )
            WHEN 'employees' THEN (
              SELECT COUNT(*)::int FROM employees e
              INNER JOIN branches b ON b.id = e.branch_id
              WHERE b.tenant_id = t.id AND e.status = 'active'
            )
            WHEN 'branches' THEN (
              SELECT COUNT(*)::int FROM branches b
              WHERE b.tenant_id = t.id AND b.status = 'active'
            )
            ELSE 0
          END as current_count
        FROM tenants t
        WHERE t.id = ?::uuid
        LIMIT 1
      `, [resource, resource, tenantId]);

      const result = checkResult.rows?.[0];
      if (!result) {
        return res.status(404).json({
          success: false,
          message: '找不到租戶資料',
        });
      }

      const available = result.max_quota - result.current_count;
      const canCreate = available >= count;

      res.json({
        success: true,
        can_create: canCreate,
        resource,
        requested_count: count,
        quota: {
          current: result.current_count,
          limit: result.max_quota,
          available: Math.max(0, available),
          usage_percentage: result.max_quota > 0
            ? Math.round((result.current_count / result.max_quota) * 100)
            : 0,
          plan_type: result.plan_type
        },
        message: canCreate
          ? `可以創建 ${count} 個${resource}`
          : `配額不足，目前僅剩 ${Math.max(0, available)} 個名額`,
        upgrade_url: canCreate ? null : '/admin/settings/billing'
      });
    } catch (error) {
      // Error logged('[QuotaEndpoint] Error checking quota:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerQuotaRoutes;
