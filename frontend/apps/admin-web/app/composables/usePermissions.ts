/**
 * 權限管理 Composable
 *
 * 提供當前使用者權限檢查功能
 * 使用 backend-v2 API (/api/auth/me/permissions)
 */
import type { PermissionAction } from '~/constants/permissions'
import { getDefaultReadOnlyPermissions } from '~/utils/default-permissions'

interface EffectivePermissions {
  [module: string]: {
    [action: string]: boolean
  }
}

// Employee status types for better UX feedback
export type EmployeeStatus = 'unknown' | 'loading' | 'active' | 'no_employee' | 'inactive'

interface PermissionState {
  permissions: EffectivePermissions | null
  isLoading: boolean
  error: Error | null
  employeeStatus: EmployeeStatus
}

const state = reactive<PermissionState>({
  permissions: null,
  isLoading: false,
  error: null,
  employeeStatus: 'unknown',
})

export const usePermissions = () => {
  const config = useRuntimeConfig()
  const { user } = useAuth()
  const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

  /**
   * 取得當前使用者的有效權限
   */
  const fetchPermissions = async () => {
    if (!user.value?.id) {
      console.warn('[usePermissions] No user logged in')
      state.permissions = null
      state.employeeStatus = 'unknown'
      return
    }

    state.isLoading = true
    state.employeeStatus = 'loading'
    state.error = null

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/me/permissions`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch permissions')
      }

      const data = result.data

      // Handle employee status
      if (data.employeeStatus === 'no_employee') {
        console.warn('[usePermissions] No employee record found for user - using read-only mode')
        state.employeeStatus = 'no_employee'
        state.permissions = getDefaultReadOnlyPermissions()
        return
      }

      if (data.employeeStatus === 'inactive') {
        console.warn('[usePermissions] Employee record is not active')
        state.employeeStatus = 'inactive'
        state.permissions = getDefaultReadOnlyPermissions()
        return
      }

      state.employeeStatus = 'active'

      if (data.jobTitleName) {
        console.log('[usePermissions] Using job title permissions:', data.jobTitleName)
      }

      state.permissions = data.permissions || {}
    } catch (error) {
      console.error('[usePermissions] Failed to fetch permissions:', error)
      state.error = error as Error
      state.permissions = {}
      state.employeeStatus = 'unknown'
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
    state.employeeStatus = 'unknown'
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
    employeeStatus: computed(() => state.employeeStatus),

    // Convenience computed for checking employee issues
    hasEmployeeIssue: computed(() =>
      state.employeeStatus === 'no_employee' || state.employeeStatus === 'inactive'
    ),

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
