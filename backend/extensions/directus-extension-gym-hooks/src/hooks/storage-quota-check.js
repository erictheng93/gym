/**
 * Storage Quota Check Hook
 * 檔案上傳前檢查存儲配額
 */

/**
 * 獲取租戶存儲配額資訊
 * @param {object} database - Knex database instance
 * @param {object} accountability - Directus accountability object
 * @returns {Promise<object|null>} 租戶配額資訊或 null（超級管理員）
 */
async function getTenantStorageQuota(database, accountability) {
  // 超級管理員跳過配額檢查
  if (accountability?.admin) {
    return null;
  }

  if (!accountability?.user) {
    console.warn('[StorageQuotaCheck] No user in accountability');
    return null;
  }

  try {
    // 獲取當前用戶的員工資訊
    const employeeResult = await database.raw(`
      SELECT e.branch_id, b.tenant_id
      FROM employees e
      INNER JOIN branches b ON b.id = e.branch_id
      WHERE e.user_id = $1::uuid
      LIMIT 1
    `, [accountability.user]);

    const employee = employeeResult.rows?.[0];
    if (!employee?.tenant_id) {
      console.warn('[StorageQuotaCheck] No tenant found for user:', accountability.user);
      return null;
    }

    // 獲取租戶配額限制
    const tenantResult = await database.raw(`
      SELECT id, max_storage_mb
      FROM tenants
      WHERE id = $1::uuid
      LIMIT 1
    `, [employee.tenant_id]);

    const tenant = tenantResult.rows?.[0];
    if (!tenant) {
      console.warn('[StorageQuotaCheck] Tenant not found:', employee.tenant_id);
      return null;
    }

    return {
      tenantId: tenant.id,
      maxStorageMb: tenant.max_storage_mb
    };
  } catch (error) {
    console.error('[StorageQuotaCheck] Error fetching tenant quota:', error);
    return null;
  }
}

/**
 * 計算租戶當前存儲使用量
 * @param {object} database - Knex database instance
 * @param {string} tenantId - 租戶 ID
 * @returns {Promise<number>} 當前使用量（MB）
 */
async function getCurrentStorageUsage(database, tenantId) {
  try {
    // 獲取租戶所有分店
    const branchesResult = await database.raw(`
      SELECT id FROM branches
      WHERE tenant_id = $1::uuid
    `, [tenantId]);

    const branchIds = branchesResult.rows?.map(b => b.id) || [];
    if (branchIds.length === 0) {
      return 0;
    }

    // 獲取這些分店的所有員工用戶 ID
    const employeeUsersResult = await database.raw(`
      SELECT user_id FROM employees
      WHERE branch_id = ANY($1::uuid[])
        AND user_id IS NOT NULL
    `, [branchIds]);

    const userIds = employeeUsersResult.rows?.map(row => row.user_id).filter(Boolean) || [];
    if (userIds.length === 0) {
      return 0;
    }

    // 計算這些用戶上傳的所有檔案大小
    const storageResult = await database.raw(`
      SELECT COALESCE(SUM(filesize), 0)::bigint / 1024.0 / 1024.0 as storage_mb
      FROM directus_files
      WHERE uploaded_by = ANY($1::uuid[])
    `, [userIds]);

    return parseFloat(storageResult.rows?.[0]?.storage_mb || 0);
  } catch (error) {
    console.error('[StorageQuotaCheck] Error calculating storage usage:', error);
    return 0;
  }
}

/**
 * 註冊存儲配額檢查 Hook
 * @param {object} hooks - Directus hooks object with { filter }
 * @param {object} context - Directus context { database, services, getSchema }
 */
export function registerStorageQuotaCheckHooks({ filter }, context) {
  const { database } = context;

  /**
   * 檔案上傳前檢查存儲配額
   */
  filter('files.create', async (input, { accountability }) => {
    try {
      const tenantQuota = await getTenantStorageQuota(database, accountability);

      // 超級管理員或無租戶上下文，跳過檢查
      if (!tenantQuota) {
        return input;
      }

      // 獲取當前存儲使用量
      const currentUsageMb = await getCurrentStorageUsage(database, tenantQuota.tenantId);

      // 檢查新檔案大小
      let newFileSizeMb = 0;
      if (input.filesize) {
        newFileSizeMb = input.filesize / 1024.0 / 1024.0;
      }

      // 計算上傳後的總使用量
      const totalUsageMb = currentUsageMb + newFileSizeMb;

      // 檢查是否超過配額
      if (totalUsageMb > tenantQuota.maxStorageMb) {
        const availableMb = Math.max(0, tenantQuota.maxStorageMb - currentUsageMb);
        throw new Error(
          `存儲空間配額不足。` +
          `當前使用: ${currentUsageMb.toFixed(2)} MB, ` +
          `配額上限: ${tenantQuota.maxStorageMb} MB, ` +
          `可用: ${availableMb.toFixed(2)} MB, ` +
          `檔案大小: ${newFileSizeMb.toFixed(2)} MB。` +
          `請刪除不需要的檔案或升級您的訂閱方案。`
        );
      }

      console.log(
        `[StorageQuotaCheck] File upload allowed. ` +
        `Current: ${currentUsageMb.toFixed(2)} MB, ` +
        `New file: ${newFileSizeMb.toFixed(2)} MB, ` +
        `Total: ${totalUsageMb.toFixed(2)} MB / ${tenantQuota.maxStorageMb} MB`
      );

      return input;
    } catch (error) {
      // 如果是配額錯誤，直接拋出
      if (error.message.includes('存儲空間配額不足')) {
        throw error;
      }

      // 其他錯誤記錄但不阻止上傳（避免影響系統功能）
      console.error('[StorageQuotaCheck] Error in files.create hook:', error);
      return input;
    }
  });

  console.log('[StorageQuotaCheck] Storage quota check hook registered for file uploads');
}

export default registerStorageQuotaCheckHooks;
