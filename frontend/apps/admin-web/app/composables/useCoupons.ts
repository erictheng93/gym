/**
 * useCoupons - 優惠券管理 composable
 *
 * Wire format of backend/src/routes/coupons.ts: camelCase rows, decimals as strings,
 * discount type PERCENTAGE | FIXED, the list answers with `pagination`. There is no
 * lifecycle `status` to write: a coupon is enabled/disabled with `isActive`.
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import { apiErrorMessage } from '~/utils/api-error'

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED'

/** Display state derived from isActive + validity range */
export type CouponState = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED'

export interface ApiCoupon {
  id: string
  tenantId: string
  branchId: string | null
  campaignId: string | null
  code: string
  name: string
  description: string | null
  discountType: CouponDiscountType
  discountValue: string
  minPurchase: string | null
  maxDiscount: string | null
  /** YYYY-MM-DD */
  validFrom: string
  validUntil: string
  usageLimit: number | null
  usageLimitPerMember: number | null
  isActive: boolean | null
  applicablePlans: string[] | null
  status: string | null
  createdAt: string | null
  updatedAt: string | null
  // GET /coupons (list)
  branch?: { id: string | null; name: string | null } | null
  campaign?: { id: string | null; name: string | null } | null
  usageCount?: number
  // GET /coupons/:id
  stats?: { totalUsage: number; totalDiscount: number }
}

/** Body of POST /api/coupons (createCouponSchema) */
export interface CreateCouponInput {
  code: string
  name: string
  description?: string
  discountType: CouponDiscountType
  discountValue: number | string
  minPurchase?: number | string
  maxDiscount?: number | string
  validFrom: string
  validUntil: string
  usageLimit?: number
  usageLimitPerMember?: number
  campaignId?: string
  branchId?: string
  isActive?: boolean
  applicablePlans?: string[]
}

/** Body of PATCH /api/coupons/:id (updateCouponSchema): every field optional, the code cannot change */
export type UpdateCouponInput = Partial<Omit<CreateCouponInput, 'code'>>

/** data of POST /api/coupons/:id/use */
export interface CouponUsageResult {
  id: string
  couponId: string
  memberId: string
  contractId: string | null
  discountAmount: string
  usedAt: string | null
  createdAt: string | null
  originalAmount: number
  finalAmount: number
}

export interface CouponValidation {
  valid: boolean
  /** the backend's reason when invalid */
  reason?: string
  coupon?: ApiCoupon
  discountAmount?: number
  finalAmount?: number
}

interface CouponListResponse {
  success: boolean
  data: ApiCoupon[]
  pagination?: { total: number; page: number; limit: number; totalPages: number }
}

const inFlightCouponsMap = new Map<string, Promise<void>>()
const inFlightSingleCouponMap = new Map<string, Promise<ApiCoupon | null>>()

/** Same day boundary the backend uses (UTC date) */
const todayIso = () => new Date().toISOString().slice(0, 10)

export const getCouponState = (
  coupon: Pick<ApiCoupon, 'isActive' | 'validFrom' | 'validUntil'>,
  today: string = todayIso()
): CouponState => {
  if (coupon.isActive === false) return 'INACTIVE'
  if (today > coupon.validUntil) return 'EXPIRED'
  if (today < coupon.validFrom) return 'SCHEDULED'
  return 'ACTIVE'
}

export const useCoupons = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()

  // State
  const coupons = useState<ApiCoupon[]>('coupons', () => [])
  const isLoading = useState('coupons_loading', () => false)
  const totalCount = useState('coupons_total', () => 0)

  /**
   * Fetch coupons. The backend filters by branchId and activeOnly only (no search / status).
   */
  const fetchCoupons = async (options?: {
    activeOnly?: boolean
    branchId?: string
    page?: number
    limit?: number
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightCouponsMap.has(key)) {
      return inFlightCouponsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { activeOnly, branchId, page = 1, limit = 20 } = options || {}

      try {
        const response = await apiFetch<ApiCoupon[]>('/coupons', {
          params: { activeOnly: activeOnly ? true : undefined, branchId, page, limit }
        }) as unknown as CouponListResponse

        coupons.value = response.data || []
        totalCount.value = Number(response.pagination?.total ?? coupons.value.length)
      } catch (error) {
        handleError(error, {
          context: 'useCoupons.fetchCoupons',
          customMessage: apiErrorMessage(error, '取得優惠券列表失敗')
        })
        coupons.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightCouponsMap.delete(key)
      }
    })()

    inFlightCouponsMap.set(key, promise)
    return promise
  }

  /**
   * Get single coupon (with usage stats)
   */
  const getCoupon = async (id: string, force = false): Promise<ApiCoupon | null> => {
    if (!force && inFlightSingleCouponMap.has(id)) {
      return inFlightSingleCouponMap.get(id)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiCoupon>(`/coupons/${id}`)
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useCoupons.getCoupon',
          customMessage: apiErrorMessage(error, '取得優惠券詳情失敗')
        })
        return null
      } finally {
        inFlightSingleCouponMap.delete(id)
      }
    })()

    inFlightSingleCouponMap.set(id, promise)
    return promise
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const createCoupon = async (input: CreateCouponInput): Promise<ApiCoupon | null> => {
    try {
      const { data } = await apiFetch<ApiCoupon>('/coupons', { method: 'POST', body: input })
      if (!data) throw new Error('建立優惠券失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.createCoupon',
        customMessage: apiErrorMessage(error, '建立優惠券失敗')
      })
      return null
    }
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const updateCoupon = async (id: string, input: UpdateCouponInput): Promise<ApiCoupon | null> => {
    try {
      const { data } = await apiFetch<ApiCoupon>(`/coupons/${id}`, { method: 'PATCH', body: input })
      if (!data) throw new Error('更新優惠券失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.updateCoupon',
        customMessage: apiErrorMessage(error, '更新優惠券失敗')
      })
      return null
    }
  }

  /** Enable / disable (PATCH isActive). Returns the updated coupon, or null on failure. */
  const setCouponActive = (id: string, isActive: boolean): Promise<ApiCoupon | null> =>
    updateCoupon(id, { isActive })

  /** Permanent delete (admin only on the backend). Returns false on failure, after showing why. */
  const deleteCoupon = async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/coupons/${id}`, { method: 'DELETE' })
      return true
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.deleteCoupon',
        customMessage: apiErrorMessage(error, '刪除優惠券失敗')
      })
      return false
    }
  }

  /**
   * Validate a coupon code against a purchase amount. Never throws: a rejected code comes back
   * as { valid: false, reason } with the backend's reason.
   */
  const validateCoupon = async (
    code: string,
    amount: number,
    memberId?: string
  ): Promise<CouponValidation> => {
    try {
      const { data } = await apiFetch<{ coupon: ApiCoupon; discountAmount: number; finalAmount: number }>(
        '/coupons/validate',
        { method: 'POST', body: { code, amount, memberId } }
      )
      if (!data) return { valid: false, reason: '驗證失敗' }
      return { valid: true, coupon: data.coupon, discountAmount: data.discountAmount, finalAmount: data.finalAmount }
    } catch (error) {
      const reason = apiErrorMessage(error, '驗證失敗')
      handleError(error, {
        context: 'useCoupons.validateCoupon',
        customMessage: reason,
        showToast: false
      })
      return { valid: false, reason }
    }
  }

  /**
   * Redeem a coupon against a member's contract. The server computes the discount from the
   * coupon and the contract amount, so no amount is sent. Returns null on failure.
   */
  const redeemCoupon = async (
    couponId: string,
    input: { memberId: string; contractId: string }
  ): Promise<CouponUsageResult | null> => {
    try {
      const { data } = await apiFetch<CouponUsageResult>(`/coupons/${couponId}/use`, {
        method: 'POST',
        body: { memberId: input.memberId, contractId: input.contractId }
      })
      if (!data) throw new Error('套用優惠券失敗')
      invalidateCache([CACHE_KEYS.CONTRACTS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCoupons.redeemCoupon',
        customMessage: apiErrorMessage(error, '套用優惠券失敗')
      })
      return null
    }
  }

  // Helpers
  const getDiscountTypeLabel = (type: CouponDiscountType): string => {
    return type === 'PERCENTAGE' ? '百分比折扣' : '固定金額折扣'
  }

  const formatDiscount = (coupon: Pick<ApiCoupon, 'discountType' | 'discountValue'>): string => {
    const value = Number(coupon.discountValue)
    if (coupon.discountType === 'PERCENTAGE') {
      return `${value}% OFF`
    }
    return `$${value}`
  }

  const getStatusLabel = (state: CouponState): string => {
    const labels: Record<CouponState, string> = {
      ACTIVE: '啟用中',
      INACTIVE: '已停用',
      EXPIRED: '已過期',
      SCHEDULED: '尚未開始'
    }
    return labels[state] || state
  }

  const getStatusVariant = (state: CouponState): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<CouponState, 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      ACTIVE: 'success',
      INACTIVE: 'default',
      EXPIRED: 'error',
      SCHEDULED: 'warning'
    }
    return variants[state] || 'default'
  }

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
    setCouponActive,
    deleteCoupon,
    validateCoupon,
    redeemCoupon,
    // Helpers
    getCouponState,
    getDiscountTypeLabel,
    formatDiscount,
    getStatusLabel,
    getStatusVariant
  }
}

export default useCoupons
