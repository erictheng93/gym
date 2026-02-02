/**
 * useTenant - DEPRECATED
 *
 * This composable has been deprecated. Tenant information is now retrieved
 * from the authenticated user's context via backend-v2 APIs.
 *
 * @deprecated Use useAuthV2 to get tenant context from authenticated user
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
  trialEndsAt: string | null
}

export interface TenantQuota {
  members: { current: number; limit: number; available: number }
  employees: { current: number; limit: number; available: number }
  branches: { current: number; limit: number; available: number }
  storage: { current: number; limit: number; available: number }
}

/**
 * @deprecated Use backend-v2 APIs for tenant management
 */
export const useTenant = () => {
  console.warn('[DEPRECATED] useTenant is deprecated. Tenant info is now available via useAuthV2 and backend-v2 APIs.')

  const tenantInfo = useState<TenantInfo | null>('tenant_info', () => null)
  const tenantQuota = useState<TenantQuota | null>('tenant_quota', () => null)
  const isLoading = useState('tenant_loading', () => false)

  const fetchTenantInfo = async () => {
    console.warn('[DEPRECATED] fetchTenantInfo is deprecated. Use backend-v2 /tenant endpoint.')
  }

  const fetchTenantQuota = async () => {
    console.warn('[DEPRECATED] fetchTenantQuota is deprecated. Use backend-v2 /tenant/quota endpoint.')
  }

  const canCreate = (_resource: 'members' | 'employees' | 'branches'): boolean => {
    console.warn('[DEPRECATED] canCreate is deprecated. Quota checks are handled by backend-v2.')
    return true
  }

  const isTenantActive = computed(() => {
    if (!tenantInfo.value) return false
    return tenantInfo.value.status === 'active' || tenantInfo.value.status === 'trial'
  })

  const isTrialExpired = computed(() => {
    if (!tenantInfo.value?.trialEndsAt) return false
    return new Date(tenantInfo.value.trialEndsAt) < new Date()
  })

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

  const getQuotaUsagePercent = (_resource: 'members' | 'employees' | 'branches' | 'storage'): number => {
    return 0
  }

  const isQuotaNearLimit = (
    _resource: 'members' | 'employees' | 'branches' | 'storage',
    _threshold: number = 80
  ): boolean => {
    return false
  }

  return {
    tenantInfo,
    tenantQuota,
    isLoading,
    fetchTenantInfo,
    fetchTenantQuota,
    canCreate,
    isTenantActive,
    isTrialExpired,
    tenantStatusText,
    planTypeText,
    getQuotaUsagePercent,
    isQuotaNearLimit
  }
}
