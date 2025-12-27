/**
 * 權限管理 Composable
 *
 * 提供當前使用者權限檢查功能
 */
import type { PermissionAction } from '~/constants/permissions'

interface EffectivePermissions {
  [module: string]: {
    [action: string]: boolean
  }
}

interface PermissionState {
  permissions: EffectivePermissions | null
  isLoading: boolean
  error: Error | null
}

const state = reactive<PermissionState>({
  permissions: null,
  isLoading: false,
  error: null,
})

export const usePermissions = () => {
  const directus = useDirectus()
  const { user } = useAuth()

  /**
   * 取得當前使用者的有效權限
   */
  const fetchPermissions = async () => {
    if (!user.value?.id) {
      console.warn('[usePermissions] No user logged in')
      state.permissions = null
      return
    }

    state.isLoading = true
    state.error = null

    try {
      // 查詢員工資料（包含 custom_permissions 和 job_title.permissions_config）
      const employees = await directus.request(
        readItems('employees', {
          filter: {
            user_id: { _eq: user.value.id },
            status: { _eq: 'active' }
          },
          fields: [
            'id',
            'custom_permissions',
            'job_title_id',
            { job_title_id: ['id', 'name', 'permissions_config'] }
          ],
          limit: 1
        })
      )

      if (employees.length === 0) {
        console.warn('[usePermissions] No active employee record found for user')
        state.permissions = {}
        return
      }

      const employee = employees[0]

      // 決定使用哪一個權限配置
      let permissions: EffectivePermissions = {}

      if (employee.custom_permissions && typeof employee.custom_permissions === 'object') {
        // 使用自訂權限
        permissions = employee.custom_permissions as EffectivePermissions
        console.log('[usePermissions] Using custom permissions')
      } else if (employee.job_title_id?.permissions_config && typeof employee.job_title_id.permissions_config === 'object') {
        // 使用職位預設權限
        permissions = employee.job_title_id.permissions_config as EffectivePermissions
        console.log('[usePermissions] Using job title permissions:', employee.job_title_id.name)
      } else {
        console.warn('[usePermissions] No permissions configured')
        permissions = {}
      }

      state.permissions = permissions
    } catch (error) {
      console.error('[usePermissions] Failed to fetch permissions:', error)
      state.error = error as Error
      state.permissions = {}
    } finally {
      state.isLoading = false
    }
  }

  /**
   * 檢查是否有特定權限
   */
  const hasPermission = (module: string, action: PermissionAction): boolean => {
    if (!state.permissions) {
      return false
    }

    return state.permissions[module]?.[action] === true
  }

  /**
   * 檢查是否有任一權限
   */
  const hasAnyPermission = (module: string, actions: PermissionAction[]): boolean => {
    return actions.some(action => hasPermission(module, action))
  }

  /**
   * 檢查是否有所有權限
   */
  const hasAllPermissions = (module: string, actions: PermissionAction[]): boolean => {
    return actions.every(action => hasPermission(module, action))
  }

  /**
   * 取得模組的所有權限
   */
  const getModulePermissions = (module: string) => {
    return state.permissions?.[module] || {}
  }

  /**
   * 清除權限緩存
   */
  const clearPermissions = () => {
    state.permissions = null
    state.error = null
  }

  // 自動載入權限（如果還沒載入且有使用者登入）
  onMounted(() => {
    if (!state.permissions && user.value?.id && !state.isLoading) {
      fetchPermissions()
    }
  })

  // 監聽使用者變更
  watch(() => user.value?.id, (newUserId) => {
    if (newUserId) {
      fetchPermissions()
    } else {
      clearPermissions()
    }
  })

  return {
    // State
    permissions: computed(() => state.permissions),
    isLoading: computed(() => state.isLoading),
    error: computed(() => state.error),

    // Methods
    fetchPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getModulePermissions,
    clearPermissions,

    // Convenience getters for common checks
    can: {
      // Members
      createMember: computed(() => hasPermission('members', 'create')),
      readMember: computed(() => hasPermission('members', 'read')),
      updateMember: computed(() => hasPermission('members', 'update')),
      deleteMember: computed(() => hasPermission('members', 'delete')),

      // Contracts
      createContract: computed(() => hasPermission('contracts', 'create')),
      readContract: computed(() => hasPermission('contracts', 'read')),
      updateContract: computed(() => hasPermission('contracts', 'update')),
      deleteContract: computed(() => hasPermission('contracts', 'delete')),

      // Payments
      createPayment: computed(() => hasPermission('payments', 'create')),
      readPayment: computed(() => hasPermission('payments', 'read')),
      updatePayment: computed(() => hasPermission('payments', 'update')),
      deletePayment: computed(() => hasPermission('payments', 'delete')),

      // Plans
      createPlan: computed(() => hasPermission('plans', 'create')),
      readPlan: computed(() => hasPermission('plans', 'read')),
      updatePlan: computed(() => hasPermission('plans', 'update')),
      deletePlan: computed(() => hasPermission('plans', 'delete')),

      // Employees
      createEmployee: computed(() => hasPermission('employees', 'create')),
      readEmployee: computed(() => hasPermission('employees', 'read')),
      updateEmployee: computed(() => hasPermission('employees', 'update')),
      deleteEmployee: computed(() => hasPermission('employees', 'delete')),

      // Branches
      createBranch: computed(() => hasPermission('branches', 'create')),
      readBranch: computed(() => hasPermission('branches', 'read')),
      updateBranch: computed(() => hasPermission('branches', 'update')),
      deleteBranch: computed(() => hasPermission('branches', 'delete')),

      // Check-in
      createCheckin: computed(() => hasPermission('checkin', 'create')),
      readCheckin: computed(() => hasPermission('checkin', 'read')),
      updateCheckin: computed(() => hasPermission('checkin', 'update')),
      deleteCheckin: computed(() => hasPermission('checkin', 'delete')),

      // HR
      createHR: computed(() => hasPermission('hr', 'create')),
      readHR: computed(() => hasPermission('hr', 'read')),
      updateHR: computed(() => hasPermission('hr', 'update')),
      deleteHR: computed(() => hasPermission('hr', 'delete')),

      // Reports
      readReports: computed(() => hasPermission('reports', 'read')),

      // Settings
      readSettings: computed(() => hasPermission('settings', 'read')),
      updateSettings: computed(() => hasPermission('settings', 'update')),
    }
  }
}
