// -nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCoupons } from './useCoupons'
import type { Coupon, CouponUsage, CouponValidation } from './useCoupons'

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useRuntimeConfig
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
    apiUrl: 'http://localhost:8056/api'
  }
}))

// Mock useState
const mockState: Record<string, unknown> = {}
vi.stubGlobal('useState', (key: string, init: () => unknown) => {
  if (!(key in mockState)) {
    mockState[key] = { value: init() }
  }
  return mockState[key]
})

// Mock useErrorHandler
vi.mock('~/composables/core/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn()
  })
}))

// Mock useApi
vi.mock('~/composables/core/useApi', () => ({
  useApi: () => ({
    invalidateCache: vi.fn()
  }),
  CACHE_KEYS: {
    CONTRACTS: 'contracts'
  }
}))

describe('useCoupons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockState).forEach(key => delete mockState[key])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchCoupons', () => {
    it('應該成功取得優惠券列表', async () => {
      const mockCoupons: Partial<Coupon>[] = [
        {
          id: 'coupon-1',
          code: 'SUMMER2025',
          name: '夏季促銷',
          discount_type: 'PERCENTAGE',
          discount_value: 10,
          status: 'ACTIVE'
        },
        {
          id: 'coupon-2',
          code: 'FLAT500',
          name: '固定折扣',
          discount_type: 'FIXED_AMOUNT',
          discount_value: 500,
          status: 'ACTIVE'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCoupons,
        meta: { total: 2 }
      })

      const { fetchCoupons, coupons, totalCount } = useCoupons()

      await fetchCoupons()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(coupons.value).toEqual(mockCoupons)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchCoupons } = useCoupons()

      await fetchCoupons({
        status: 'ACTIVE',
        discountType: 'PERCENTAGE',
        search: 'SUMMER',
        page: 2,
        limit: 10
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('discount_type=PERCENTAGE')
      )
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchCoupons, coupons, totalCount } = useCoupons()

      await fetchCoupons()

      expect(coupons.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('getCoupon', () => {
    it('應該成功取得單一優惠券', async () => {
      const mockCoupon: Partial<Coupon> = {
        id: 'coupon-1',
        code: 'SUMMER2025',
        name: '夏季促銷',
        discount_type: 'PERCENTAGE',
        discount_value: 10,
        status: 'ACTIVE'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCoupon
      })

      const { getCoupon } = useCoupons()

      const result = await getCoupon('coupon-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/coupon-1')
      )
      expect(result).toEqual(mockCoupon)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getCoupon } = useCoupons()

      const result = await getCoupon('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('createCoupon', () => {
    it('應該成功建立優惠券', async () => {
      const newCoupon = {
        code: 'NEW2025',
        name: '新年優惠',
        discount_type: 'PERCENTAGE' as const,
        discount_value: 15,
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      }

      const createdCoupon: Partial<Coupon> = {
        id: 'coupon-new',
        ...newCoupon,
        status: 'ACTIVE'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdCoupon
      })

      const { createCoupon } = useCoupons()

      const result = await createCoupon(newCoupon)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons'),
        expect.objectContaining({
          method: 'POST',
          body: newCoupon
        })
      )
      expect(result?.id).toBe('coupon-new')
    })
  })

  describe('updateCoupon', () => {
    it('應該成功更新優惠券', async () => {
      const updateData = {
        name: '更新名稱',
        discount_value: 20
      }

      const updatedCoupon: Partial<Coupon> = {
        id: 'coupon-1',
        ...updateData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedCoupon
      })

      const { updateCoupon } = useCoupons()

      const result = await updateCoupon('coupon-1', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/coupon-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: updateData
        })
      )
      expect(result?.discount_value).toBe(20)
    })
  })

  describe('deactivateCoupon', () => {
    it('應該成功停用優惠券', async () => {
      mockFetch.mockResolvedValueOnce({ success: true })

      const { deactivateCoupon } = useCoupons()

      const result = await deactivateCoupon('coupon-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/coupon-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(result).toBe(true)
    })

    it('應該處理停用失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Deactivate failed'))

      const { deactivateCoupon } = useCoupons()

      const result = await deactivateCoupon('coupon-1')

      expect(result).toBe(false)
    })
  })

  describe('validateCoupon', () => {
    it('應該成功驗證有效優惠券', async () => {
      const validation: CouponValidation = {
        valid: true,
        coupon_id: 'coupon-1',
        coupon_code: 'SUMMER2025',
        coupon_name: '夏季促銷',
        discount_type: 'PERCENTAGE',
        discount_value: 10,
        discount_amount: 500,
        original_amount: 5000,
        final_amount: 4500
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: validation
      })

      const { validateCoupon } = useCoupons()

      const result = await validateCoupon('SUMMER2025', 'member-1', 5000, 'plan-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/validate'),
        expect.objectContaining({
          method: 'POST',
          body: {
            code: 'SUMMER2025',
            member_id: 'member-1',
            plan_id: 'plan-1',
            amount: 5000
          }
        })
      )
      expect(result.valid).toBe(true)
      expect(result.discount_amount).toBe(500)
    })

    it('應該處理無效優惠券', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { valid: false, reason: '優惠券已過期' }
      })

      const { validateCoupon } = useCoupons()

      const result = await validateCoupon('EXPIRED', 'member-1', 5000)

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('優惠券已過期')
    })

    it('應該處理驗證失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Validation error'))

      const { validateCoupon } = useCoupons()

      const result = await validateCoupon('ERROR', 'member-1', 5000)

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('驗證失敗')
    })
  })

  describe('getCouponUsages', () => {
    it('應該成功取得使用紀錄', async () => {
      const mockUsages: Partial<CouponUsage>[] = [
        {
          id: 'usage-1',
          coupon_id: 'coupon-1',
          member_id: 'member-1',
          discount_amount: 500
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockUsages,
        meta: { total: 1 }
      })

      const { getCouponUsages } = useCoupons()

      const result = await getCouponUsages('coupon-1', { page: 1, limit: 50 })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/coupon-1/usages')
      )
      expect(result.data).toEqual(mockUsages)
      expect(result.total).toBe(1)
    })
  })

  describe('generateBatch', () => {
    it('應該成功批次產生優惠券', async () => {
      const batchData = {
        prefix: 'BATCH',
        count: 10,
        name: '批次優惠券',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 100,
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          count: 10,
          codes: ['BATCH001', 'BATCH002', 'BATCH003']
        }
      })

      const { generateBatch } = useCoupons()

      const result = await generateBatch(batchData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/generate-batch'),
        expect.objectContaining({
          method: 'POST',
          body: batchData
        })
      )
      expect(result?.count).toBe(10)
    })
  })

  describe('applyCoupon', () => {
    it('應該成功套用優惠券', async () => {
      const applyData = {
        coupon_id: 'coupon-1',
        member_id: 'member-1',
        contract_id: 'contract-1',
        discount_amount: 500,
        used_by: 'emp-1'
      }

      const usage: Partial<CouponUsage> = {
        id: 'usage-new',
        ...applyData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: usage
      })

      const { applyCoupon } = useCoupons()

      const result = await applyCoupon(applyData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/coupons/apply'),
        expect.objectContaining({
          method: 'POST',
          body: applyData
        })
      )
      expect(result?.id).toBe('usage-new')
    })
  })

  describe('Helper functions', () => {
    it('getDiscountTypeLabel 應該返回正確的標籤', () => {
      const { getDiscountTypeLabel } = useCoupons()

      expect(getDiscountTypeLabel('PERCENTAGE')).toBe('百分比折扣')
      expect(getDiscountTypeLabel('FIXED_AMOUNT')).toBe('固定金額折扣')
    })

    it('formatDiscount 應該正確格式化折扣', () => {
      const { formatDiscount } = useCoupons()

      expect(formatDiscount({
        discount_type: 'PERCENTAGE',
        discount_value: 10
      } as Coupon)).toBe('10% OFF')

      expect(formatDiscount({
        discount_type: 'FIXED_AMOUNT',
        discount_value: 500
      } as Coupon)).toBe('$500')
    })

    it('getStatusLabel 應該返回正確的標籤', () => {
      const { getStatusLabel } = useCoupons()

      expect(getStatusLabel('ACTIVE')).toBe('啟用中')
      expect(getStatusLabel('INACTIVE')).toBe('已停用')
      expect(getStatusLabel('EXPIRED')).toBe('已過期')
    })

    it('getStatusColor 應該返回正確的顏色', () => {
      const { getStatusColor } = useCoupons()

      expect(getStatusColor('ACTIVE')).toContain('green')
      expect(getStatusColor('INACTIVE')).toContain('gray')
      expect(getStatusColor('EXPIRED')).toContain('red')
    })
  })
})
