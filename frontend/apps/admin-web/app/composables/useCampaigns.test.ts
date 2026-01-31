import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCampaigns } from './useCampaigns'
import type { Campaign, CampaignMetrics, ROIReport, ROISummary } from './useCampaigns'

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useRuntimeConfig
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiUrl: 'http://localhost:8055'
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

describe('useCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockState).forEach(key => delete mockState[key])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchCampaigns', () => {
    it('應該成功取得活動列表', async () => {
      const mockCampaigns: Partial<Campaign>[] = [
        {
          id: 'campaign-1',
          name: '夏季促銷',
          type: 'PROMOTION',
          status: 'ACTIVE'
        },
        {
          id: 'campaign-2',
          name: '轉介紹獎勵',
          type: 'REFERRAL',
          status: 'ACTIVE'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCampaigns,
        meta: { total: 2 }
      })

      const { fetchCampaigns, campaigns, totalCount } = useCampaigns()

      await fetchCampaigns()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(campaigns.value).toEqual(mockCampaigns)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchCampaigns } = useCampaigns()

      await fetchCampaigns({
        type: 'PROMOTION',
        status: 'ACTIVE',
        search: '夏季',
        page: 2,
        limit: 10
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=PROMOTION')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE')
      )
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchCampaigns, campaigns, totalCount } = useCampaigns()

      await fetchCampaigns()

      expect(campaigns.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('getCampaign', () => {
    it('應該成功取得單一活動', async () => {
      const mockCampaign: Partial<Campaign> = {
        id: 'campaign-1',
        name: '夏季促銷',
        type: 'PROMOTION',
        status: 'ACTIVE',
        metrics: {
          impressions: 10000,
          clicks: 500,
          conversions: 50,
          revenue: 100000
        }
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCampaign
      })

      const { getCampaign } = useCampaigns()

      const result = await getCampaign('campaign-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1')
      )
      expect(result).toEqual(mockCampaign)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getCampaign } = useCampaigns()

      const result = await getCampaign('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('createCampaign', () => {
    it('應該成功建立活動', async () => {
      const newCampaign = {
        name: '新年活動',
        type: 'PROMOTION' as const,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        budget: 50000
      }

      const createdCampaign: Partial<Campaign> = {
        id: 'campaign-new',
        ...newCampaign,
        status: 'DRAFT'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdCampaign
      })

      const { createCampaign } = useCampaigns()

      const result = await createCampaign(newCampaign)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns'),
        expect.objectContaining({
          method: 'POST',
          body: newCampaign
        })
      )
      expect(result?.id).toBe('campaign-new')
    })
  })

  describe('updateCampaign', () => {
    it('應該成功更新活動', async () => {
      const updateData = {
        name: '更新名稱',
        budget: 80000
      }

      const updatedCampaign: Partial<Campaign> = {
        id: 'campaign-1',
        ...updateData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedCampaign
      })

      const { updateCampaign } = useCampaigns()

      const result = await updateCampaign('campaign-1', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: updateData
        })
      )
      expect(result?.budget).toBe(80000)
    })
  })

  describe('cancelCampaign', () => {
    it('應該成功取消活動', async () => {
      mockFetch.mockResolvedValueOnce({ success: true })

      const { cancelCampaign } = useCampaigns()

      const result = await cancelCampaign('campaign-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(result).toBe(true)
    })

    it('應該處理取消失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Cancel failed'))

      const { cancelCampaign } = useCampaigns()

      const result = await cancelCampaign('campaign-1')

      expect(result).toBe(false)
    })
  })

  describe('getCampaignMetrics', () => {
    it('應該成功取得活動指標', async () => {
      const mockMetrics: CampaignMetrics = {
        impressions: 10000,
        clicks: 500,
        conversions: 50,
        revenue: 100000,
        leads_generated: 100,
        contracts_created: 30,
        roi: '150%'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          campaign_id: 'campaign-1',
          campaign_name: '夏季促銷',
          period: { start_date: '2025-01-01', end_date: '2025-01-31' },
          budget: 50000,
          actual_cost: 40000,
          metrics: mockMetrics
        }
      })

      const { getCampaignMetrics } = useCampaigns()

      const result = await getCampaignMetrics('campaign-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1/metrics')
      )
      expect(result).toEqual(mockMetrics)
    })
  })

  describe('updateCampaignMetrics', () => {
    it('應該成功更新活動指標', async () => {
      const metricsData = {
        impressions: 15000,
        clicks: 750,
        actual_cost: 45000
      }

      const updatedCampaign: Partial<Campaign> = {
        id: 'campaign-1',
        metrics: { ...metricsData, conversions: 0, revenue: 0 }
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedCampaign
      })

      const { updateCampaignMetrics } = useCampaigns()

      const result = await updateCampaignMetrics('campaign-1', metricsData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1/update-metrics'),
        expect.objectContaining({
          method: 'POST',
          body: metricsData
        })
      )
      expect(result?.metrics?.impressions).toBe(15000)
    })
  })

  describe('addAsset', () => {
    it('應該成功新增素材', async () => {
      const assetData = {
        name: '宣傳圖片',
        type: 'IMAGE',
        category: 'banner',
        file_id: 'file-1'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { id: 'asset-1', ...assetData }
      })

      const { addAsset } = useCampaigns()

      const result = await addAsset('campaign-1', assetData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/campaign-1/assets'),
        expect.objectContaining({
          method: 'POST',
          body: assetData
        })
      )
      expect(result).not.toBeNull()
    })
  })

  describe('getROIReport', () => {
    it('應該成功取得 ROI 報表', async () => {
      const mockSummary: ROISummary = {
        total_campaigns: 5,
        total_budget: 200000,
        total_cost: 180000,
        total_revenue: 500000,
        total_profit: 320000,
        total_conversions: 150,
        average_roi: '178%',
        best_performing: null,
        worst_performing: null
      }

      const mockReports: ROIReport[] = [
        {
          id: 'campaign-1',
          name: '夏季促銷',
          type: 'PROMOTION',
          status: 'ENDED',
          period: { start: '2025-01-01', end: '2025-01-31' },
          budget: 50000,
          actual_cost: 45000,
          revenue: 150000,
          profit: 105000,
          roi: 233,
          conversions: 50
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        period: { start_date: '2025-01-01', end_date: '2025-12-31' },
        summary: mockSummary,
        data: mockReports
      })

      const { getROIReport } = useCampaigns()

      const result = await getROIReport({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        type: 'PROMOTION'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/roi-report')
      )
      expect(result?.summary.total_campaigns).toBe(5)
      expect(result?.data).toHaveLength(1)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Report failed'))

      const { getROIReport } = useCampaigns()

      const result = await getROIReport()

      expect(result).toBeNull()
    })
  })

  describe('Helper functions', () => {
    it('getTypeLabel 應該返回正確的標籤', () => {
      const { getTypeLabel } = useCampaigns()

      expect(getTypeLabel('PROMOTION')).toBe('促銷活動')
      expect(getTypeLabel('EVENT')).toBe('線下活動')
      expect(getTypeLabel('CHECKIN')).toBe('打卡活動')
      expect(getTypeLabel('REFERRAL')).toBe('轉介紹')
    })

    it('getTypeColor 應該返回正確的顏色', () => {
      const { getTypeColor } = useCampaigns()

      expect(getTypeColor('PROMOTION')).toContain('purple')
      expect(getTypeColor('EVENT')).toContain('blue')
      expect(getTypeColor('CHECKIN')).toContain('green')
      expect(getTypeColor('REFERRAL')).toContain('orange')
    })

    it('getStatusLabel 應該返回正確的標籤', () => {
      const { getStatusLabel } = useCampaigns()

      expect(getStatusLabel('DRAFT')).toBe('草稿')
      expect(getStatusLabel('ACTIVE')).toBe('進行中')
      expect(getStatusLabel('ENDED')).toBe('已結束')
      expect(getStatusLabel('CANCELLED')).toBe('已取消')
    })

    it('getStatusColor 應該返回正確的顏色', () => {
      const { getStatusColor } = useCampaigns()

      expect(getStatusColor('DRAFT')).toContain('gray')
      expect(getStatusColor('ACTIVE')).toContain('green')
      expect(getStatusColor('ENDED')).toContain('blue')
      expect(getStatusColor('CANCELLED')).toContain('red')
    })

    it('formatROI 應該正確格式化 ROI', () => {
      const { formatROI } = useCampaigns()

      expect(formatROI(150)).toBe('+150%')
      expect(formatROI(0)).toBe('+0%')
      expect(formatROI(-20)).toBe('-20%')
      expect(formatROI(null)).toBe('-')
    })

    it('getROIColor 應該返回正確的顏色', () => {
      const { getROIColor } = useCampaigns()

      expect(getROIColor(150)).toContain('emerald')
      expect(getROIColor(75)).toContain('green')
      expect(getROIColor(25)).toContain('yellow')
      expect(getROIColor(-10)).toContain('red')
      expect(getROIColor(null)).toContain('gray')
    })
  })
})
