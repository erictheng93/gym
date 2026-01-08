/**
 * Quota Check Hooks
 * 配額檢查鉤子
 *
 * 功能：
 * 1. 在創建資源前自動檢查配額
 * 2. 阻止超過配額限制的創建操作
 * 3. 支持 members, employees, branches 資源類型
 * 4. 超級管理員跳過配額檢查
 */

/**
 * 配額映射：collection -> tenant field
 */
const QUOTA_MAPPINGS = {
  members: 'max_members',
  employees: 'max_employees',
  branches: 'max_branches'
};

/**
 * 獲取租戶 ID 和配額信息
 * @param {object} database - Knex database instance
 * @param {object} accountability - Directus accountability object
 * @returns {Promise<{tenantId: string, quota: object}|null>}
 */
async function getTenantQuota(database, accountability) {
  if (!accountability || !accountability.user) {
    return null;
  }

  // 超級管理員跳過配額檢查
  if (accountability.admin === true) {
    return null;
  }

  try {
    // 從員工資料獲取租戶信息
    const result = await database.raw(`
      SELECT
        e.id AS employee_id,
        e.branch_id,
        b.tenant_id,
        t.max_branches,
        t.max_members,
        t.max_employees,
        t.plan_type,
        t.tenant_status
      FROM employees e
      INNER JOIN branches b ON e.branch_id = b.id
      INNER JOIN tenants t ON b.tenant_id = t.id
      WHERE e.user_id = ?::uuid
        AND e.status = 'active'
      LIMIT 1
    `, [accountability.user]);

    if (result.rows?.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      quota: {
        maxBranches: row.max_branches,
        maxMembers: row.max_members,
        maxEmployees: row.max_employees,
        planType: row.plan_type,
        tenantStatus: row.tenant_status
      }
    };
  } catch (error) {
    console.error('[QuotaCheck] Error fetching tenant quota:', error);
    return null;
  }
}

/**
 * 檢查資源配額是否超限
 * @param {object} database - Knex database instance
 * @param {string} collection - Collection name
 * @param {string} tenantId - Tenant ID
 * @param {object} quota - Quota limits
 * @returns {Promise<boolean>} - 是否可以創建
 */
async function checkQuota(database, collection, tenantId, quota) {
  const quotaField = QUOTA_MAPPINGS[collection];
  if (!quotaField) {
    // 不在配額檢查範圍內的 collection
    return true;
  }

  const limit = quota[quotaField.replace('max_', 'max' + collection.charAt(0).toUpperCase() + collection.slice(1, -1))];

  // 簡化：直接使用字段映射
  let maxLimit;
  if (collection === 'branches') maxLimit = quota.maxBranches;
  else if (collection === 'members') maxLimit = quota.maxMembers;
  else if (collection === 'employees') maxLimit = quota.maxEmployees;

  try {
    // 獲取租戶下所有分店 ID
    const branchesResult = await database.raw(`
      SELECT id
      FROM branches
      WHERE tenant_id = ?::uuid
        AND status = 'active'
    `, [tenantId]);

    const branchIds = branchesResult.rows.map(b => b.id);

    // 根據資源類型獲取當前使用量
    let currentCount = 0;

    if (collection === 'branches') {
      currentCount = branchIds.length;
    } else if (collection === 'members') {
      if (branchIds.length > 0) {
        const result = await database.raw(`
          SELECT COUNT(*) as count
          FROM members
          WHERE branch_id = ANY(?::uuid[])
            AND member_status IN ('ACTIVE', 'INACTIVE', 'FROZEN')
        `, [branchIds]);
        currentCount = parseInt(result.rows[0]?.count || 0);
      }
    } else if (collection === 'employees') {
      if (branchIds.length > 0) {
        const result = await database.raw(`
          SELECT COUNT(*) as count
          FROM employees
          WHERE branch_id = ANY(?::uuid[])
            AND status = 'active'
        `, [branchIds]);
        currentCount = parseInt(result.rows[0]?.count || 0);
      }
    }

    // 檢查是否超限
    if (currentCount >= maxLimit) {
      console.log(`[QuotaCheck] Quota exceeded for ${collection}: ${currentCount}/${maxLimit}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[QuotaCheck] Error checking quota:', error);
    // 出錯時允許創建（避免阻塞正常操作）
    return true;
  }
}

/**
 * 註冊配額檢查 Hooks
 * @param {object} directusHooks - Directus hook functions
 * @param {object} context - Directus context
 */
export function registerQuotaCheckHooks({ filter }, context) {
  const { database } = context;

  // 為每個需要配額檢查的 collection 註冊 hooks
  ['members', 'employees', 'branches'].forEach(collection => {
    /**
     * 創建前檢查配額
     */
    filter(`${collection}.items.create`, async (input, meta, context) => {
      try {
        // 從 context 獲取 accountability (Directus 11)
        const accountability = context?.accountability;

        // 獲取租戶配額信息
        const tenantQuota = await getTenantQuota(database, accountability);

        // 如果無法獲取租戶信息（例如超級管理員），跳過檢查
        if (!tenantQuota) {
          return input;
        }

        // 檢查配額
        const canCreate = await checkQuota(
          database,
          collection,
          tenantQuota.tenantId,
          tenantQuota.quota
        );

        if (!canCreate) {
          const quotaField = QUOTA_MAPPINGS[collection];
          let maxLimit;
          if (collection === 'branches') maxLimit = tenantQuota.quota.maxBranches;
          else if (collection === 'members') maxLimit = tenantQuota.quota.maxMembers;
          else if (collection === 'employees') maxLimit = tenantQuota.quota.maxEmployees;

          throw new Error(
            `已達到 ${collection} 配額上限 (${maxLimit})，請升級套餐`
          );
        }

        return input;
      } catch (error) {
        // 如果錯誤訊息包含 "配額上限"，則拋出錯誤
        if (error.message.includes('配額上限')) {
          throw error;
        }

        // 其他錯誤記錄但不阻塞
        console.error(`[QuotaCheck] Error in ${collection}.items.create:`, error);
        return input;
      }
    });
  });

  console.log('[QuotaCheckHooks] Quota check hooks registered for members, employees, branches');
}

export default registerQuotaCheckHooks;
