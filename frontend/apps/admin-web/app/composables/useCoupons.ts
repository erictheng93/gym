/**
 * useCoupons - 優惠券管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

export interface Coupon {
  id: string
  code: string
  name: string
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discount_value: number
  min_purchase: number
  max_discount: number | null
  usage_limit: number | null
  usage_per_member: number
  used_count: number
  applicable_plans: string[] | null
  start_date: string
  end_date: string
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
  created_by: string | null
  created_at: string
  // Computed
  is_valid?: boolean
  remaining_uses?: number | null
  created_by_name?: string
}

export interface CouponUsage {
  id: string
  coupon_id: string
  member_id: string
  contract_id: string | null
  discount_amount: number
  used_at: string
  used_by: string | null
  // Joined
  member_name?: string
  member_code?: string
  contract_no?: string
  used_by_name?: string
}

export interface CouponValidation {
  valid: boolean
  reason?: string
  errors?: string[]
  coupon_id?: string
  coupon_code?: string
  coupon_name?: string
  discount_type?: string
  discount_value?: number
  discount_amount?: number
  original_amount?: number
  final_amount?: number
}

export const useCoupons = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()

  // State
  const coupons = useState<Coupon[]>('coupons', () => [])
  const isLoading = useState('coupons_loading', () => false)
  const totalCount = useState('coupons_total', () => 0)

  const apiUrl = config.public.apiUrl

  /**
   * Fetch coupons
   */
  const fetchCoupons = async (options?: {
    status?: string
    discountType?: string
    search?: string
    page?: number
    limit?: number
  }) => {
    isLoading.value = true
    const { status, discountType, search, page = 1, limit = 20 } = options || {}

    try {
      const params = new URLSearchParams()
      if (status) params.append('status', status)
      if (discountType) params.append('discount_type', discountType)
      if (search) params.append('search', search)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: Coupon[]
        meta: { total: number }
      }>(`${apiUrl}/coupons?${params}`)

      if (response.success) {
        coupons.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.fetchCoupons',
        customMessage: '取得優惠券列表失敗'
      })
      coupons.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get single coupon
   */
  const getCoupon = async (id: string): Promise<Coupon | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Coupon }>(`${apiUrl}/coupons/${id}`)
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.getCoupon',
        customMessage: '取得優惠券詳情失敗'
      })
      return null
    }
  }

  /**
   * Create coupon
   */
  const createCoupon = async (data: Partial<Coupon>): Promise<Coupon | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Coupon }>(`${apiUrl}/coupons`, {
        method: 'POST',
        body: data
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.createCoupon',
        customMessage: '建立優惠券失敗'
      })
      return null
    }
  }

  /**
   * Update coupon
   */
  const updateCoupon = async (id: string, data: Partial<Coupon>): Promise<Coupon | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Coupon }>(`${apiUrl}/coupons/${id}`, {
        method: 'PATCH',
        body: data
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.updateCoupon',
        customMessage: '更新優惠券失敗'
      })
      return null
    }
  }

  /**
   * Deactivate coupon
   */
  const deactivateCoupon = async (id: string): Promise<boolean> => {
    try {
      const response = await $fetch<{ success: boolean }>(`${apiUrl}/coupons/${id}`, {
        method: 'DELETE'
      })
      return response.success
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.deactivateCoupon',
        customMessage: '停用優惠券失敗'
      })
      return false
    }
  }

  /**
   * Validate coupon
   */
  const validateCoupon = async (
    code: string,
    memberId: string,
    amount: number,
    planId?: string
  ): Promise<CouponValidation> => {
    try {
      const response = await $fetch<{ success: boolean; data: CouponValidation }>(
        `${apiUrl}/coupons/validate`,
        {
          method: 'POST',
          body: {
            code,
            member_id: memberId,
            plan_id: planId,
            amount
          }
        }
      )
      return response.success ? response.data : { valid: false, reason: '驗證失敗' }
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.validateCoupon',
        customMessage: '驗證優惠券失敗',
        showToast: false
      })
      return { valid: false, reason: '驗證失敗' }
    }
  }

  /**
   * Get coupon usages
   */
  const getCouponUsages = async (
    couponId: string,
    options?: { page?: number; limit?: number }
  ): Promise<{ data: CouponUsage[]; total: number }> => {
    const { page = 1, limit = 50 } = options || {}
    try {
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: CouponUsage[]
        meta: { total: number }
      }>(`${apiUrl}/coupons/${couponId}/usages?${params}`)

      return response.success
        ? { data: response.data, total: response.meta.total }
        : { data: [], total: 0 }
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.getCouponUsages',
        customMessage: '取得使用紀錄失敗'
      })
      return { data: [], total: 0 }
    }
  }

  /**
   * Generate batch coupons
   */
  const generateBatch = async (data: {
    prefix?: string
    count: number
    name: string
    discount_type: string
    discount_value: number
    min_purchase?: number
    max_discount?: number
    usage_limit?: number
    usage_per_member?: number
    applicable_plans?: string[]
    start_date: string
    end_date: string
    created_by?: string
  }): Promise<{ count: number; codes: string[] } | null> => {
    try {
      const response = await $fetch<{
        success: boolean
        data: { count: number; codes: string[] }
      }>(`${apiUrl}/coupons/generate-batch`, {
        method: 'POST',
        body: data
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.generateBatch',
        customMessage: '批次產生優惠券失敗'
      })
      return null
    }
  }

  /**
   * Apply coupon (internal use for contract creation)
   */
  const applyCoupon = async (data: {
    coupon_id: string
    member_id: string
    contract_id?: string
    discount_amount: number
    used_by?: string
  }): Promise<CouponUsage | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: CouponUsage }>(
        `${apiUrl}/coupons/apply`,
        {
          method: 'POST',
          body: data
        }
      )
      if (response.success) {
        invalidateCache([CACHE_KEYS.CONTRACTS])
      }
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.applyCoupon',
        customMessage: '套用優惠券失敗'
      })
      return null
    }
  }

  // Helpers
  const getDiscountTypeLabel = (type: Coupon['discount_type']): string => {
    return type === 'PERCENTAGE' ? '百分比折扣' : '固定金額折扣'
  }

  const formatDiscount = (coupon: Coupon): string => {
    if (coupon.discount_type === 'PERCENTAGE') {
      return `${coupon.discount_value}% OFF`
    }
    return `$${coupon.discount_value}`
  }

  const getStatusLabel = (status: Coupon['status']): string => {
    const labels: Record<Coupon['status'], string> = {
      ACTIVE: '啟用中',
      INACTIVE: '已停用',
      EXPIRED: '已過期'
    }
    return labels[status] || status
  }

  const getStatusColor = (status: Coupon['status']): string => {
    const colors: Record<Coupon['status'], string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
      EXPIRED: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusVariant = (status: Coupon['status']): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<Coupon['status'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      ACTIVE: 'success',
      INACTIVE: 'default',
      EXPIRED: 'error'
    }
    return variants[status] || 'default'
  }

  /**
   * Delete coupon (alias for deactivateCoupon)
   */
  const deleteCoupon = deactivateCoupon

  return {
    // State
    coupons,
    isLoading,
    totalCount,
    // Actions
    fetchCoupons,
    getCoupon,
    createCoupon,
    updateCoupon,
    deactivateCoupon,
    deleteCoupon,
    validateCoupon,
    getCouponUsages,
    generateBatch,
    applyCoupon,
    // Helpers
    getDiscountTypeLabel,
    formatDiscount,
    getStatusLabel,
    getStatusColor,
    getStatusVariant
  }
}

export default useCoupons
