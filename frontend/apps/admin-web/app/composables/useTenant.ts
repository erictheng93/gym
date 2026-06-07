/**
 * useTenant - Tenant information and quota management
 *
 * Provides tenant context including:
 * - Tenant information (name, plan, status)
 * - Quota usage (members, employees, branches, storage)
 * - Quota checking utilities
 */

export interface TenantInfo {
  id: string
  name: string
  slug: string
  planType: 'starter' | 'professional' | 'enterprise' | 'custom'
  status: 'trial' | 'active' | 'suspended' | 'cancelled'
  maxBranches: number
  maxMembers: number
  maxEmployees: number
  maxStorageMb: number
  trialEndsAt: string | null
  billingCycle: 'monthly' | 'yearly'
  nextBillingDate: string | null
  settings: Record<string, any>
}

export interface QuotaItem {
  current: number
  limit: number
  available: number
}

export interface TenantQuota {
  members: QuotaItem
  employees: QuotaItem
  branches: QuotaItem
  storage: QuotaItem
}

export const useTenant = () => {
  const config = useRuntimeConfig()
  const apiBaseUrl = config.public.apiBaseUrl || 'http://localhost:8056'

  const tenantInfo = useState<TenantInfo | null>('tenant_info', () => null)
  const tenantQuota = useState<TenantQuota | null>('tenant_quota', () => null)
  const isLoading = useState('tenant_loading', () => false)
  const error = useState<string | null>('tenant_error', () => null)

  /**
   * Fetch tenant information from backend-v2
   */
  const fetchTenantInfo = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; data: TenantInfo; error?: string }>(
        `${apiBaseUrl}/api/tenant`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (response.success && response.data) {
        tenantInfo.value = response.data
      } else {
        error.value = response.error || '無法載入租戶資訊'
      }
    } catch (e: any) {
      console.error('[useTenant] Failed to fetch tenant info:', e)
      error.value = e.message || '無法載入租戶資訊'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch tenant quota usage from backend-v2
   */
  const fetchTenantQuota = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; data: TenantQuota; error?: string }>(
        `${apiBaseUrl}/api/tenant/quota`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (response.success && response.data) {
        tenantQuota.value = response.data
      } else {
        error.value = response.error || '無法載入配額資訊'
      }
    } catch (e: any) {
      console.error('[useTenant] Failed to fetch tenant quota:', e)
      error.value = e.message || '無法載入配額資訊'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Check if a resource can be created (quota not exceeded)
   */
  const canCreate = (resource: 'members' | 'employees' | 'branches'): boolean => {
    if (!tenantQuota.value) return true // Allow if quota not loaded yet
    const quota = tenantQuota.value[resource]
    return quota.current < quota.limit
  }

  /**
   * Check if tenant is active (not suspended or cancelled)
   */
  const isTenantActive = computed(() => {
    if (!tenantInfo.value) return false
    return tenantInfo.value.status === 'active' || tenantInfo.value.status === 'trial'
  })

  /**
   * Check if trial has expired
   */
  const isTrialExpired = computed(() => {
    if (!tenantInfo.value?.trialEndsAt) return false
    return new Date(tenantInfo.value.trialEndsAt) < new Date()
  })

  /**
   * Get tenant status text in Chinese
   */
  const tenantStatusText = computed(() => {
    if (!tenantInfo.value) return ''
    switch (tenantInfo.value.status) {
      case 'trial': return '試用中'
      case 'active': return '正常'
      case 'suspended': return '已暫停'
      case 'cancelled': return '已取消'
      default: return '未知'
    }
  })

  /**
   * Get plan type text in Chinese
   */
  const planTypeText = computed(() => {
    if (!tenantInfo.value) return ''
    switch (tenantInfo.value.planType) {
      case 'starter': return '入門版'
      case 'professional': return '專業版'
      case 'enterprise': return '企業版'
      case 'custom': return '自訂版'
      default: return '未知'
    }
  })

  /**
   * Get quota usage percentage
   */
  const getQuotaUsagePercent = (resource: 'members' | 'employees' | 'branches' | 'storage'): number => {
    if (!tenantQuota.value) return 0
    const quota = tenantQuota.value[resource]
    if (quota.limit === 0) return 0
    return Math.round((quota.current / quota.limit) * 100)
  }

  /**
   * Check if quota is near limit (default 80%)
   */
  const isQuotaNearLimit = (
    resource: 'members' | 'employees' | 'branches' | 'storage',
    threshold: number = 80
  ): boolean => {
    return getQuotaUsagePercent(resource) >= threshold
  }

  return {
    // State
    tenantInfo,
    tenantQuota,
    isLoading,
    error,
    // Actions
    fetchTenantInfo,
    fetchTenantQuota,
    canCreate,
    // Computed
    isTenantActive,
    isTrialExpired,
    tenantStatusText,
    planTypeText,
    // Utilities
    getQuotaUsagePercent,
    isQuotaNearLimit,
  }
}
