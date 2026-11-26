import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useCoupons, getCouponState, type ApiCoupon } from './useCoupons'

const mockInvalidateCache = vi.hoisted(() => vi.fn())

vi.mock('~/composables/core/useApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/core/useApi')>()
  return {
    ...actual,
    useApi: () => ({ invalidateCache: mockInvalidateCache })
  }
})

// Fixtures in the exact wire format of backend/src/routes/coupons.ts: COUPON_SELECT spread flat
// (camelCase, decimals as strings, discountType PERCENTAGE | FIXED) plus the joined extras.
const makeCoupon = (overrides: Partial<ApiCoupon> = {}): ApiCoupon => ({
  id: 'd0000000-0000-4000-8000-000000000001',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  branchId: null,
  campaignId: null,
  code: 'SUMMER2026',
  name: '夏季折扣',
  description: null,
  discountType: 'PERCENTAGE',
  discountValue: '15.00',
  minPurchase: '1000.00',
  maxDiscount: '500.00',
  validFrom: '2026-06-01',
  validUntil: '2026-08-31',
  usageLimit: 100,
  usageLimitPerMember: 1,
  isActive: true,
  applicablePlans: [],
  status: 'active',
  createdAt: '2026-05-20T02:00:00.000Z',
  updatedAt: null,
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useCoupons', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    mockHandleError.mockClear()
    mockInvalidateCache.mockClear()
  })

  describe('fetchCoupons', () => {
    it('讀取 camelCase 列表（含 usageCount）與 pagination.total', async () => {
      const rows = [
        makeCoupon({ branch: { id: null, name: null }, campaign: { id: null, name: null }, usageCount: 7 }),
        makeCoupon({ id: 'd0000000-0000-4000-8000-000000000002', code: 'WINTER', usageCount: 0 })
      ]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: rows,
        pagination: { total: 33, page: 1, limit: 20, totalPages: 2 }
      })

      const { fetchCoupons, coupons, totalCount } = useCoupons()
      await fetchCoupons({}, true)

      expect(coupons.value).toEqual(rows)
      expect(coupons.value[0]!.usageCount).toBe(7)
      expect(totalCount.value).toBe(33)
    })

    it('只送後端支援的查詢參數（activeOnly / branchId / page / limit）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchCoupons } = useCoupons()
      await fetchCoupons({ activeOnly: true, page: 2, limit: 10 }, true)

      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/coupons')
      expect(options.params).toEqual({ activeOnly: true, branchId: undefined, page: 2, limit: 10 })
    })

    it('取得失敗時清空列表並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { fetchCoupons, coupons, totalCount, isLoading } = useCoupons()
      await fetchCoupons({}, true)

      expect(coupons.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getCoupon', () => {
    it('取得含 stats 的單一優惠券', async () => {
      const coupon = makeCoupon({ stats: { totalUsage: 4, totalDiscount: 1200 } })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: coupon })

      const { getCoupon } = useCoupons()
      const result = await getCoupon(coupon.id, true)

      expect(result).toEqual(coupon)
      expect(lastCall()[0]).toBe(`/coupons/${coupon.id}`)
    })

    it('找不到時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('優惠碼不存在'))

      const { getCoupon } = useCoupons()
      const result = await getCoupon('missing', true)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '優惠碼不存在'
      }))
    })
  })

  describe('createCoupon', () => {
    it('以 createCouponSchema 的 camelCase 欄位 POST 並返回建立的優惠券', async () => {
      const created = makeCoupon()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createCoupon } = useCoupons()
      const input = {
        code: 'SUMMER2026',
        name: '夏季折扣',
        discountType: 'PERCENTAGE' as const,
        discountValue: 15,
        validFrom: '2026-06-01',
        validUntil: '2026-08-31',
        usageLimitPerMember: 1
      }
      const result = await createCoupon(input)

      expect(result).toEqual(created)
      expect(lastCall()).toEqual(['/coupons', { method: 'POST', body: input }])
    })

    it('優惠碼重複時返回 null，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('優惠碼已存在'))

      const { createCoupon } = useCoupons()
      const result = await createCoupon({
        code: 'DUP', name: 'x', discountType: 'FIXED', discountValue: 100, validFrom: '2026-06-01', validUntil: '2026-08-31'
      })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '優惠碼已存在'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { createCoupon } = useCoupons()
      const result = await createCoupon({
        code: 'X', name: 'x', discountType: 'FIXED', discountValue: 100, validFrom: '2026-06-01', validUntil: '2026-08-31'
      })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '建立優惠券失敗'
      }))
    })
  })

  describe('updateCoupon / setCouponActive', () => {
    it('以 PATCH 送出 camelCase 欄位', async () => {
      const updated = makeCoupon({ name: '改名' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { updateCoupon } = useCoupons()
      const result = await updateCoupon(updated.id, { name: '改名', usageLimit: 50 })

      expect(result).toEqual(updated)
      expect(lastCall()).toEqual([`/coupons/${updated.id}`, { method: 'PATCH', body: { name: '改名', usageLimit: 50 } }])
    })

    it('停用 / 啟用只送 isActive（後端沒有 status 欄位可寫）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: makeCoupon({ isActive: false }) })

      const { setCouponActive } = useCoupons()
      const result = await setCouponActive('d-1', false)

      expect(result?.isActive).toBe(false)
      expect(lastCall()).toEqual(['/coupons/d-1', { method: 'PATCH', body: { isActive: false } }])
    })

    it('更新失敗時返回 null，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { setCouponActive } = useCoupons()
      const result = await setCouponActive('d-1', true)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })
  })

  describe('deleteCoupon', () => {
    it('成功時以 DELETE 返回 true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '優惠碼已刪除' })

      const { deleteCoupon } = useCoupons()

      expect(await deleteCoupon('d-1')).toBe(true)
      expect(lastCall()).toEqual(['/coupons/d-1', { method: 'DELETE' }])
    })

    it('失敗時返回 false，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { deleteCoupon } = useCoupons()

      expect(await deleteCoupon('d-1')).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })
  })

  describe('validateCoupon', () => {
    it('以 { code, amount, memberId } POST，並讀取 data.discountAmount / finalAmount', async () => {
      const coupon = makeCoupon()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: { coupon, discountAmount: 300, finalAmount: 1700 }
      })

      const { validateCoupon } = useCoupons()
      const result = await validateCoupon('SUMMER2026', 2000, 'a1b2c3d4-0000-4000-8000-000000000001')

      expect(result).toEqual({ valid: true, coupon, discountAmount: 300, finalAmount: 1700 })
      expect(lastCall()).toEqual(['/coupons/validate', {
        method: 'POST',
        body: { code: 'SUMMER2026', amount: 2000, memberId: 'a1b2c3d4-0000-4000-8000-000000000001' }
      }])
    })

    it('被後端拒絕時返回 { valid:false, reason } 且不彈 toast', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的優惠碼或已過期'))

      const { validateCoupon } = useCoupons()
      const result = await validateCoupon('NOPE', 100)

      expect(result).toEqual({ valid: false, reason: '無效的優惠碼或已過期' })
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ showToast: false }))
    })
  })

  describe('redeemCoupon', () => {
    it('只送 memberId 與 contractId，折扣金額由伺服器計算', async () => {
      const usage = {
        id: 'u-1',
        couponId: 'd-1',
        memberId: 'm-1',
        contractId: 'c-1',
        discountAmount: '300',
        usedAt: '2026-07-01T02:00:00.000Z',
        createdAt: '2026-07-01T02:00:00.000Z',
        originalAmount: 2000,
        finalAmount: 1700
      }
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: usage })

      const { redeemCoupon } = useCoupons()
      const result = await redeemCoupon('d-1', { memberId: 'm-1', contractId: 'c-1' })

      expect(result).toEqual(usage)
      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/coupons/d-1/use')
      expect(options).toEqual({ method: 'POST', body: { memberId: 'm-1', contractId: 'c-1' } })
      expect(options.body).not.toHaveProperty('discountAmount')
      expect(mockInvalidateCache).toHaveBeenCalled()
    })

    it('後端拒絕時返回 null、顯示後端原因，且不清合約快取', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此合約已使用過此優惠碼'))

      const { redeemCoupon } = useCoupons()
      const result = await redeemCoupon('d-1', { memberId: 'm-1', contractId: 'c-1' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '此合約已使用過此優惠碼'
      }))
      expect(mockInvalidateCache).not.toHaveBeenCalled()
    })
  })

  describe('getCouponState', () => {
    const base = { isActive: true, validFrom: '2026-06-01', validUntil: '2026-08-31' }

    it('isActive=false 一律是已停用', () => {
      expect(getCouponState({ ...base, isActive: false }, '2026-07-01')).toBe('INACTIVE')
    })

    it('依有效期間判斷尚未開始 / 啟用中 / 已過期', () => {
      expect(getCouponState(base, '2026-05-31')).toBe('SCHEDULED')
      expect(getCouponState(base, '2026-06-01')).toBe('ACTIVE')
      expect(getCouponState(base, '2026-08-31')).toBe('ACTIVE')
      expect(getCouponState(base, '2026-09-01')).toBe('EXPIRED')
    })
  })

  describe('helpers', () => {
    it('formatDiscount 依 discountType 顯示（decimal 字串轉數字）', () => {
      const { formatDiscount } = useCoupons()
      expect(formatDiscount(makeCoupon())).toBe('15% OFF')
      expect(formatDiscount(makeCoupon({ discountType: 'FIXED', discountValue: '200.00' }))).toBe('$200')
    })

    it('getDiscountTypeLabel / getStatusLabel / getStatusVariant', () => {
      const { getDiscountTypeLabel, getStatusLabel, getStatusVariant } = useCoupons()
      expect(getDiscountTypeLabel('PERCENTAGE')).toBe('百分比折扣')
      expect(getDiscountTypeLabel('FIXED')).toBe('固定金額折扣')
      expect(getStatusLabel('EXPIRED')).toBe('已過期')
      expect(getStatusVariant('ACTIVE')).toBe('success')
    })
  })
})
