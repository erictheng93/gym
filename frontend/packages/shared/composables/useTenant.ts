import { readItem } from '@directus/sdk'

export interface TenantInfo {
  id: string
  name: string
  slug: string
  planType: 'starter' | 'professional' | 'enterprise' | 'custom'
  status: 'trial' | 'active' | 'suspended' | 'cancelled'
  maxBranches: number
  maxMembers: number
  maxEmployees: number
  trialEndsAt: string | null
}

export interface TenantQuota {
  members: { current: number; limit: number; available: number }
  employees: { current: number; limit: number; available: number }
  branches: { current: number; limit: number; available: number }
  storage: { current: number; limit: number; available: number }
}

/**
 * 租戶上下文管理
 * 提供租戶資訊、配額管理和狀態檢查
 */
export const useTenant = () => {
  const directus = useDirectus()
  const { data: authData } = useAuth()

  const tenantInfo = useState<TenantInfo | null>('tenant_info', () => null)
  const tenantQuota = useState<TenantQuota | null>('tenant_quota', () => null)
  const isLoading = useState('tenant_loading', () => false)

  /**
   * 獲取租戶資訊
   */
  const fetchTenantInfo = async () => {
    // 確保已登入
    if (!authData.value) {
      console.warn('[useTenant] No authenticated user found')
      return
    }

    // 從 authData 中獲取 employee 資訊
    const currentEmployee = authData.value.employee
    if (!currentEmployee?.branch_id) {
      console.warn('[useTenant] No branch_id found for current employee')
      return
    }

    isLoading.value = true
    try {
      // 獲取分店資訊（包含租戶資訊）
      const branch = await directus.request(
        readItem('branches', currentEmployee.branch_id, {
          fields: ['tenant_id', 'tenant.*']
        })
      )

      if (branch.tenant) {
        tenantInfo.value = {
          id: branch.tenant.id,
          name: branch.tenant.name,
          slug: branch.tenant.slug,
          planType: branch.tenant.plan_type,
          status: branch.tenant.tenant_status,
          maxBranches: branch.tenant.max_branches,
          maxMembers: branch.tenant.max_members,
          maxEmployees: branch.tenant.max_employees,
          trialEndsAt: branch.tenant.trial_ends_at
        }

        console.log('[useTenant] Tenant info loaded:', tenantInfo.value.name)
      }
    } catch (error) {
      console.error('[useTenant] Failed to fetch tenant info:', error)
      tenantInfo.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取配額使用情況
   */
  const fetchTenantQuota = async () => {
    if (!tenantInfo.value) {
      console.warn('[useTenant] Tenant info not loaded, cannot fetch quota')
      return
    }

    try {
      // 調用自訂端點獲取配額資訊
      const response = await directus.request({
        method: 'GET',
        path: '/gym/quota/status'
      })

      if (response && response.data) {
        tenantQuota.value = response.data
        console.log('[useTenant] Quota loaded:', tenantQuota.value)
      }
    } catch (error) {
      console.error('[useTenant] Failed to fetch quota:', error)
      tenantQuota.value = null
    }
  }

  /**
   * 檢查是否可以創建新資源
   * @param resource 資源類型（members, employees, branches）
   * @returns 是否可以創建
   */
  const canCreate = (resource: 'members' | 'employees' | 'branches'): boolean => {
    // 如果未載入配額資訊，暫時允許（後端會檢查）
    if (!tenantQuota.value) {
      console.warn('[useTenant] Quota not loaded, allowing creation (backend will validate)')
      return true
    }

    const quota = tenantQuota.value[resource]
    if (!quota) {
      console.warn(`[useTenant] No quota info for resource: ${resource}`)
      return true
    }

    const canCreate = quota.available > 0
    if (!canCreate) {
      console.warn(`[useTenant] Cannot create ${resource}: quota limit reached (${quota.current}/${quota.limit})`)
    }

    return canCreate
  }

  /**
   * 檢查租戶是否處於活躍狀態
   */
  const isTenantActive = computed(() => {
    if (!tenantInfo.value) return false
    return tenantInfo.value.status === 'active' || tenantInfo.value.status === 'trial'
  })

  /**
   * 檢查試用期是否已過期
   */
  const isTrialExpired = computed(() => {
    if (!tenantInfo.value?.trialEndsAt) return false
    return new Date(tenantInfo.value.trialEndsAt) < new Date()
  })

  /**
   * 獲取租戶狀態文字
   */
  const tenantStatusText = computed(() => {
    if (!tenantInfo.value) return ''

    switch (tenantInfo.value.status) {
      case 'trial':
        return '試用中'
      case 'active':
        return '正常'
      case 'suspended':
        return '已暫停'
      case 'cancelled':
        return '已取消'
      default:
        return '未知'
    }
  })

  /**
   * 獲取套餐類型文字
   */
  const planTypeText = computed(() => {
    if (!tenantInfo.value) return ''

    switch (tenantInfo.value.planType) {
      case 'starter':
        return '入門版'
      case 'professional':
        return '專業版'
      case 'enterprise':
        return '企業版'
      case 'custom':
        return '自訂版'
      default:
        return '未知'
    }
  })

  /**
   * 獲取配額使用率
   * @param resource 資源類型
   * @returns 使用率百分比 (0-100)
   */
  const getQuotaUsagePercent = (resource: 'members' | 'employees' | 'branches' | 'storage'): number => {
    if (!tenantQuota.value) return 0

    const quota = tenantQuota.value[resource]
    if (!quota || quota.limit === 0) return 0

    return Math.round((quota.current / quota.limit) * 100)
  }

  /**
   * 檢查配額是否接近上限
   * @param resource 資源類型
   * @param threshold 警告閾值（預設 80%）
   * @returns 是否接近上限
   */
  const isQuotaNearLimit = (
    resource: 'members' | 'employees' | 'branches' | 'storage',
    threshold: number = 80
  ): boolean => {
    const usagePercent = getQuotaUsagePercent(resource)
    return usagePercent >= threshold
  }

  return {
    // 狀態
    tenantInfo,
    tenantQuota,
    isLoading,

    // 方法
    fetchTenantInfo,
    fetchTenantQuota,
    canCreate,

    // Computed
    isTenantActive,
    isTrialExpired,
    tenantStatusText,
    planTypeText,

    // 輔助方法
    getQuotaUsagePercent,
    isQuotaNearLimit
  }
}
