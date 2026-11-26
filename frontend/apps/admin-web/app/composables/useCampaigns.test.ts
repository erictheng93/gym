import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useCampaigns, getCampaignState, type ApiCampaign } from './useCampaigns'

// Fixtures in the exact wire format of backend/src/routes/campaigns.ts: CAMPAIGN_SELECT spread
// flat (camelCase, decimals as strings) with the joined branch / createdBy.
const makeCampaign = (overrides: Partial<ApiCampaign> = {}): ApiCampaign => ({
  id: 'c0000000-0000-4000-8000-000000000001',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  branchId: null,
  name: '夏季促銷',
  description: '夏季限定',
  campaignType: 'PROMOTION',
  startDate: '2026-06-01',
  endDate: '2026-08-31',
  targetAudience: null,
  budget: '50000.00',
  discountType: null,
  discountValue: null,
  isActive: true,
  terms: null,
  createdById: 'e0000000-0000-4000-8000-000000000001',
  status: 'active',
  createdAt: '2026-05-20T02:00:00.000Z',
  updatedAt: null,
  branch: { id: null, name: null },
  createdBy: { id: 'e0000000-0000-4000-8000-000000000001', fullName: '王經理' },
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useCampaigns', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    mockHandleError.mockClear()
  })

  describe('fetchCampaigns', () => {
    it('讀取 camelCase 列表與 pagination.total', async () => {
      const rows = [makeCampaign(), makeCampaign({ id: 'c0000000-0000-4000-8000-000000000002', name: '冬季活動' })]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: rows,
        pagination: { total: 42, page: 2, limit: 20, totalPages: 3 }
      })

      const { fetchCampaigns, campaigns, totalCount } = useCampaigns()
      await fetchCampaigns({ page: 2 }, true)

      expect(campaigns.value).toEqual(rows)
      expect(totalCount.value).toBe(42)
    })

    it('只送後端支援的查詢參數（campaignType / activeOnly / branchId / page / limit）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchCampaigns } = useCampaigns()
      await fetchCampaigns({ campaignType: 'REFERRAL', activeOnly: true, page: 3, limit: 10 }, true)

      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/campaigns')
      expect(options.params).toEqual({
        campaignType: 'REFERRAL',
        activeOnly: true,
        branchId: undefined,
        page: 3,
        limit: 10
      })
    })

    it('沒有 activeOnly 時不送出該參數', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchCampaigns } = useCampaigns()
      await fetchCampaigns({ activeOnly: false }, true)

      expect(lastCall()[1].params.activeOnly).toBeUndefined()
    })

    it('取得失敗時清空列表並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { fetchCampaigns, campaigns, totalCount, isLoading } = useCampaigns()
      await fetchCampaigns({}, true)

      expect(campaigns.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getCampaign / fetchCampaign', () => {
    it('取得單一活動', async () => {
      const campaign = makeCampaign()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: campaign })

      const { getCampaign } = useCampaigns()
      const result = await getCampaign(campaign.id, true)

      expect(result).toEqual(campaign)
      expect(lastCall()[0]).toBe(`/campaigns/${campaign.id}`)
    })

    it('找不到時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('活動不存在'))

      const { getCampaign } = useCampaigns()
      const result = await getCampaign('missing', true)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '活動不存在'
      }))
    })

    it('fetchCampaign 把結果存進 currentCampaign', async () => {
      const campaign = makeCampaign()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: campaign })

      const { fetchCampaign, currentCampaign } = useCampaigns()
      await fetchCampaign(campaign.id)

      expect(currentCampaign.value).toEqual(campaign)
    })
  })

  describe('createCampaign', () => {
    it('以 createCampaignSchema 的 camelCase 欄位 POST 並返回建立的活動', async () => {
      const created = makeCampaign()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createCampaign } = useCampaigns()
      const input = {
        name: '夏季促銷',
        campaignType: 'PROMOTION' as const,
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        budget: 50000,
        isActive: true
      }
      const result = await createCampaign(input)

      expect(result).toEqual(created)
      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/campaigns')
      expect(options).toEqual({ method: 'POST', body: input })
    })

    it('後端回 400 時返回 null，並把後端的錯誤訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('開始日期不能晚於結束日期'))

      const { createCampaign } = useCampaigns()
      const result = await createCampaign({ name: 'x', startDate: '2026-09-01', endDate: '2026-08-01' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '開始日期不能晚於結束日期'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { createCampaign } = useCampaigns()
      const result = await createCampaign({ name: 'x', startDate: '2026-06-01', endDate: '2026-08-01' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '建立活動失敗'
      }))
    })

    it('回應沒有 data 時視為失敗', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true })

      const { createCampaign } = useCampaigns()
      const result = await createCampaign({ name: 'x', startDate: '2026-06-01', endDate: '2026-08-01' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updateCampaign', () => {
    it('以 PATCH 送出 isActive 等 camelCase 欄位', async () => {
      const updated = makeCampaign({ isActive: false })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { updateCampaign } = useCampaigns()
      const result = await updateCampaign(updated.id, { isActive: false })

      expect(result).toEqual(updated)
      const [endpoint, options] = lastCall()
      expect(endpoint).toBe(`/campaigns/${updated.id}`)
      expect(options).toEqual({ method: 'PATCH', body: { isActive: false } })
    })

    it('更新失敗時返回 null，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { updateCampaign } = useCampaigns()
      const result = await updateCampaign('c-1', { name: 'x' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })
  })

  describe('deleteCampaign', () => {
    it('成功時以 DELETE 返回 true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '活動已刪除' })

      const { deleteCampaign } = useCampaigns()
      const result = await deleteCampaign('c-1')

      expect(result).toBe(true)
      expect(lastCall()).toEqual(['/campaigns/c-1', { method: 'DELETE' }])
    })

    it('後端回 403 時返回 false，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { deleteCampaign } = useCampaigns()
      const result = await deleteCampaign('c-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })
  })

  describe('getCampaignState', () => {
    const base = { isActive: true, startDate: '2026-06-01', endDate: '2026-08-31' }

    it('isActive=false 一律是已停用', () => {
      expect(getCampaignState({ ...base, isActive: false }, '2026-07-01')).toBe('INACTIVE')
    })

    it('開始日之前是已排程，結束日之後是已結束，區間內（含首尾日）是進行中', () => {
      expect(getCampaignState(base, '2026-05-31')).toBe('SCHEDULED')
      expect(getCampaignState(base, '2026-06-01')).toBe('ACTIVE')
      expect(getCampaignState(base, '2026-08-31')).toBe('ACTIVE')
      expect(getCampaignState(base, '2026-09-01')).toBe('ENDED')
    })

    it('isActive 為 null（資料庫預設）視為啟用', () => {
      expect(getCampaignState({ ...base, isActive: null }, '2026-07-01')).toBe('ACTIVE')
    })
  })

  describe('helpers', () => {
    it('getTypeLabel 對應後端的活動類型', () => {
      const { getTypeLabel } = useCampaigns()
      expect(getTypeLabel('PROMOTION')).toBe('促銷活動')
      expect(getTypeLabel('MEMBERSHIP')).toBe('會籍活動')
      expect(getTypeLabel(null)).toBe('—')
    })

    it('getStatusLabel / getStatusVariant 以衍生狀態顯示', () => {
      const { getStatusLabel, getStatusVariant } = useCampaigns()
      expect(getStatusLabel('ACTIVE')).toBe('進行中')
      expect(getStatusLabel('INACTIVE')).toBe('已停用')
      expect(getStatusVariant('ACTIVE')).toBe('success')
      expect(getStatusVariant('SCHEDULED')).toBe('warning')
    })
  })
})
