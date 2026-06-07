// -nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSegmentation } from './useSegmentation'
import type { RFMScore, SegmentInfo } from './useSegmentation'

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

// Mock window.open
vi.stubGlobal('window', {
  open: vi.fn()
})

describe('useSegmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockState).forEach(key => delete mockState[key])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchRFMScores', () => {
    it('應該成功取得 RFM 分數列表', async () => {
      const mockScores: Partial<RFMScore>[] = [
        {
          id: 'rfm-1',
          member_id: 'member-1',
          recency_score: 5,
          frequency_score: 4,
          monetary_score: 5,
          rfm_segment: 'CHAMPIONS'
        },
        {
          id: 'rfm-2',
          member_id: 'member-2',
          recency_score: 3,
          frequency_score: 3,
          monetary_score: 3,
          rfm_segment: 'LOYAL'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockScores,
        meta: { total: 2 }
      })

      const { fetchRFMScores, rfmScores, totalCount } = useSegmentation()

      await fetchRFMScores()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(rfmScores.value).toEqual(mockScores)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchRFMScores } = useSegmentation()

      await fetchRFMScores({
        branchId: 'branch-1',
        segment: 'CHAMPIONS',
        page: 2,
        limit: 25
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('branch_id=branch-1')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('segment=CHAMPIONS')
      )
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchRFMScores, rfmScores, totalCount } = useSegmentation()

      await fetchRFMScores()

      expect(rfmScores.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('getMemberRFM', () => {
    it('應該成功取得單一會員 RFM 分數', async () => {
      const mockScore: Partial<RFMScore> = {
        id: 'rfm-1',
        member_id: 'member-1',
        recency_score: 5,
        frequency_score: 4,
        monetary_score: 5,
        rfm_segment: 'CHAMPIONS',
        total_payments_12m: 50000,
        total_checkins_12m: 100
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockScore
      })

      const { getMemberRFM } = useSegmentation()

      const result = await getMemberRFM('member-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/rfm/member-1')
      )
      expect(result).toEqual(mockScore)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getMemberRFM } = useSegmentation()

      const result = await getMemberRFM('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('calculateRFM', () => {
    it('應該成功觸發 RFM 計算', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { calculated: 150, calculated_at: '2025-01-31T02:00:00Z' }
      })

      const { calculateRFM } = useSegmentation()

      const result = await calculateRFM('branch-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/calculate'),
        expect.objectContaining({
          method: 'POST',
          body: { branch_id: 'branch-1' }
        })
      )
      expect(result?.calculated).toBe(150)
    })

    it('應該處理計算失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Calculation failed'))

      const { calculateRFM } = useSegmentation()

      const result = await calculateRFM()

      expect(result).toBeNull()
    })
  })

  describe('fetchSegments', () => {
    it('應該成功取得分群定義', async () => {
      const mockSegments: Partial<SegmentInfo>[] = [
        {
          segment: 'CHAMPIONS',
          label: '冠軍客戶',
          member_count: 50
        },
        {
          segment: 'LOYAL',
          label: '忠誠客戶',
          member_count: 100
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { segments: mockSegments, total_members: 150 }
      })

      const { fetchSegments, segments } = useSegmentation()

      await fetchSegments('branch-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/segments?branch_id=branch-1')
      )
      expect(segments.value).toEqual(mockSegments)
    })
  })

  describe('fetchSegmentMembers', () => {
    it('應該成功取得分群會員', async () => {
      const mockMembers: Partial<RFMScore>[] = [
        {
          id: 'rfm-1',
          member_id: 'member-1',
          rfm_segment: 'CHAMPIONS'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          segment: 'CHAMPIONS',
          segment_label: '冠軍客戶',
          segment_description: '最佳客戶',
          members: mockMembers
        },
        meta: { total: 1 }
      })

      const { fetchSegmentMembers, rfmScores, totalCount } = useSegmentation()

      const result = await fetchSegmentMembers('CHAMPIONS', {
        branchId: 'branch-1',
        page: 1,
        limit: 50
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/segments/CHAMPIONS/members')
      )
      expect(result?.segment).toBe('CHAMPIONS')
      expect(rfmScores.value).toEqual(mockMembers)
      expect(totalCount.value).toBe(1)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchSegmentMembers, rfmScores, totalCount } = useSegmentation()

      const result = await fetchSegmentMembers('CHAMPIONS')

      expect(result).toBeNull()
      expect(rfmScores.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('autoApplyTags', () => {
    it('應該成功套用標籤', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { updated: 50 }
      })

      const { autoApplyTags } = useSegmentation()

      const result = await autoApplyTags({
        branchId: 'branch-1',
        segment: 'CHAMPIONS'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/auto-tag'),
        expect.objectContaining({
          method: 'POST',
          body: { branch_id: 'branch-1', segment: 'CHAMPIONS' }
        })
      )
      expect(result?.updated).toBe(50)
    })
  })

  describe('exportSegment', () => {
    it('應該開啟匯出連結', () => {
      const { exportSegment } = useSegmentation()

      exportSegment('CHAMPIONS', 'branch-1')

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/export/CHAMPIONS?branch_id=branch-1'),
        '_blank'
      )
    })

    it('應該支援匯出全部', () => {
      const { exportSegment } = useSegmentation()

      exportSegment('ALL')

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('/segmentation/export/ALL'),
        '_blank'
      )
    })
  })

  describe('Helper functions', () => {
    it('getSegmentLabel 應該返回正確的標籤', () => {
      const { getSegmentLabel } = useSegmentation()

      expect(getSegmentLabel('CHAMPIONS')).toBe('冠軍客戶')
      expect(getSegmentLabel('LOYAL')).toBe('忠誠客戶')
      expect(getSegmentLabel('POTENTIAL_LOYAL')).toBe('潛力客戶')
      expect(getSegmentLabel('NEW_CUSTOMERS')).toBe('新客戶')
      expect(getSegmentLabel('AT_RISK')).toBe('有風險')
      expect(getSegmentLabel('LOST')).toBe('已流失')
    })

    it('getSegmentColor 應該返回正確的顏色', () => {
      const { getSegmentColor } = useSegmentation()

      expect(getSegmentColor('CHAMPIONS')).toContain('emerald')
      expect(getSegmentColor('LOYAL')).toContain('green')
      expect(getSegmentColor('AT_RISK')).toContain('red')
      expect(getSegmentColor('LOST')).toContain('slate')
    })

    it('getSegmentIcon 應該返回正確的圖示', () => {
      const { getSegmentIcon } = useSegmentation()

      expect(getSegmentIcon('CHAMPIONS')).toBe('🏆')
      expect(getSegmentIcon('LOYAL')).toBe('💎')
      expect(getSegmentIcon('NEW_CUSTOMERS')).toBe('🌱')
      expect(getSegmentIcon('AT_RISK')).toBe('⚠️')
      expect(getSegmentIcon('LOST')).toBe('💨')
    })

    it('getScoreColor 應該返回正確的顏色', () => {
      const { getScoreColor } = useSegmentation()

      expect(getScoreColor(5)).toContain('emerald')
      expect(getScoreColor(4)).toContain('emerald')
      expect(getScoreColor(3)).toContain('yellow')
      expect(getScoreColor(2)).toContain('orange')
      expect(getScoreColor(1)).toContain('red')
    })
  })
})
