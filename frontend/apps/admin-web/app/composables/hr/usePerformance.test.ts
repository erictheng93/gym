import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockHandleError } from '@test/setup'
import { usePerformance } from './usePerformance'
import type { PerformanceReview, KPITemplate, TeamDashboard } from './usePerformance'

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

const requestedUrl = (callIndex = 0) => new URL(String(mockFetch.mock.calls[callIndex]![0]))

describe('usePerformance', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  describe('fetchReviews', () => {
    it('應該成功取得績效考核列表', async () => {
      const mockReviews: Partial<PerformanceReview>[] = [
        {
          id: 'review-1',
          employee_id: 'emp-1',
          review_period: '2025-01',
          review_type: 'MONTHLY',
          status: 'DRAFT',
          score: null
        },
        {
          id: 'review-2',
          employee_id: 'emp-2',
          review_period: '2025-01',
          review_type: 'MONTHLY',
          status: 'APPROVED',
          score: 85
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockReviews,
        meta: { total: 2 }
      })

      const { fetchReviews, reviews, totalCount } = usePerformance()

      await fetchReviews()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(reviews.value).toEqual(mockReviews)
      expect(totalCount.value).toBe(2)
      const url = requestedUrl()
      expect(url.pathname).toBe('/api/performance/reviews')
      expect(url.searchParams.get('limit')).toBe('20')
      expect(url.searchParams.get('offset')).toBe('0')
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchReviews } = usePerformance()

      await fetchReviews({
        employee_id: 'emp-1',
        status: 'SUBMITTED',
        review_type: 'MONTHLY',
        page: 3,
        limit: 10
      })

      const url = requestedUrl()
      expect(url.searchParams.get('employee_id')).toBe('emp-1')
      expect(url.searchParams.get('status')).toBe('SUBMITTED')
      expect(url.searchParams.get('review_type')).toBe('MONTHLY')
      expect(url.searchParams.get('limit')).toBe('10')
      expect(url.searchParams.get('offset')).toBe('20') // page 3 of 10 per page
      expect(url.searchParams.has('page')).toBe(false)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchReviews, reviews, totalCount } = usePerformance()

      await fetchReviews()

      expect(reviews.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('fetchReview', () => {
    it('應該成功取得單一績效考核', async () => {
      const mockReview: Partial<PerformanceReview> = {
        id: 'review-1',
        employee_id: 'emp-1',
        review_period: '2025-01',
        review_type: 'MONTHLY',
        status: 'DRAFT',
        score: 78
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockReview
      })

      const { fetchReview, currentReview } = usePerformance()

      await fetchReview('review-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews/review-1')
      )
      expect(currentReview.value).toEqual(mockReview)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { fetchReview, currentReview } = usePerformance()

      await fetchReview('non-existent')

      expect(currentReview.value).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createReview', () => {
    it('應該成功建立績效考核', async () => {
      const newReview = {
        employee_id: 'emp-1',
        review_period: '2025-02',
        review_type: 'MONTHLY' as const
      }

      const createdReview: Partial<PerformanceReview> = {
        id: 'review-new',
        ...newReview,
        status: 'DRAFT'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdReview
      })

      const { createReview } = usePerformance()

      const result = await createReview(newReview)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews'),
        expect.objectContaining({
          method: 'POST',
          body: newReview
        })
      )
      expect(result).toEqual(createdReview)
    })

    it('應該在建立失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({
        success: false,
        error: 'Validation failed'
      })

      const { createReview } = usePerformance()

      await expect(createReview({
        employee_id: '',
        review_period: '',
        review_type: 'MONTHLY'
      })).rejects.toThrow('建立績效考核失敗')
    })
  })

  describe('updateReview', () => {
    it('應該成功更新績效考核', async () => {
      const updateData = {
        score: 85,
        comments: '表現良好'
      }

      const updatedReview: Partial<PerformanceReview> = {
        id: 'review-1',
        ...updateData,
        status: 'DRAFT'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedReview
      })

      const { updateReview } = usePerformance()

      const result = await updateReview('review-1', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews/review-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: updateData
        })
      )
      expect(result.score).toBe(85)
    })

    it('應該在更新失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { updateReview } = usePerformance()

      await expect(updateReview('review-1', { score: 1 })).rejects.toThrow('更新績效考核失敗')
    })
  })

  describe('submitReview', () => {
    it('應該成功提交績效考核', async () => {
      const submittedReview: Partial<PerformanceReview> = {
        id: 'review-1',
        status: 'SUBMITTED'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: submittedReview
      })

      const { submitReview } = usePerformance()

      const result = await submitReview('review-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews/review-1/submit'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.status).toBe('SUBMITTED')
    })

    it('應該在提交失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { submitReview } = usePerformance()

      await expect(submitReview('review-1')).rejects.toThrow('提交績效考核失敗')
    })
  })

  describe('approveReview', () => {
    it('應該成功核准績效考核', async () => {
      const approvedReview: Partial<PerformanceReview> = {
        id: 'review-1',
        status: 'APPROVED'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: approvedReview
      })

      const { approveReview } = usePerformance()

      const result = await approveReview('review-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews/review-1/approve'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.status).toBe('APPROVED')
    })

    it('應該在核准失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { approveReview } = usePerformance()

      await expect(approveReview('review-1')).rejects.toThrow('核准績效考核失敗')
    })
  })

  describe('rejectReview', () => {
    it('應該成功退回績效考核', async () => {
      const rejectedReview: Partial<PerformanceReview> = {
        id: 'review-1',
        status: 'DRAFT'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: rejectedReview
      })

      const { rejectReview } = usePerformance()

      const result = await rejectReview('review-1', '需要補充說明')

      expect(result).toEqual(rejectedReview)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/reviews/review-1/reject'),
        expect.objectContaining({
          method: 'POST',
          body: { reason: '需要補充說明' }
        })
      )
    })

    it('應該在退回失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { rejectReview } = usePerformance()

      await expect(rejectReview('review-1', 'x')).rejects.toThrow('退回績效考核失敗')
    })
  })

  describe('fetchKPITemplates', () => {
    it('應該成功取得 KPI 範本列表', async () => {
      const mockTemplates: Partial<KPITemplate>[] = [
        {
          id: 'tpl-1',
          name: '業務人員 KPI',
          kpis: [
            { id: 'kpi-1', name: '業績目標', weight: 50, target: 100000 }
          ]
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockTemplates
      })

      const { fetchKPITemplates, kpiTemplates } = usePerformance()

      await fetchKPITemplates()

      expect(kpiTemplates.value).toEqual(mockTemplates)
      expect(requestedUrl().pathname).toBe('/api/performance/kpi-templates')
    })

    it('應該在取得失敗時清空範本並呼叫 handleError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchKPITemplates, kpiTemplates } = usePerformance()
      kpiTemplates.value = [{ id: 'old' } as KPITemplate]

      await fetchKPITemplates()

      expect(kpiTemplates.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createKPITemplate', () => {
    it('應該成功建立 KPI 範本', async () => {
      const newTemplate = {
        name: '新範本',
        kpis: [
          { id: 'kpi-1', name: '指標一', weight: 100, target: 10 }
        ]
      }

      const createdTemplate: Partial<KPITemplate> = {
        id: 'tpl-new',
        ...newTemplate
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdTemplate
      })

      const { createKPITemplate } = usePerformance()

      const result = await createKPITemplate(newTemplate)

      expect(result.id).toBe('tpl-new')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/kpi-templates'),
        expect.objectContaining({ method: 'POST', body: newTemplate })
      )
    })

    it('應該在建立失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { createKPITemplate } = usePerformance()

      await expect(createKPITemplate({ name: 'x', kpis: [] })).rejects.toThrow('建立 KPI 範本失敗')
    })
  })

  describe('deleteKPITemplate', () => {
    it('應該成功刪除 KPI 範本', async () => {
      mockFetch.mockResolvedValueOnce({ success: true })

      const { deleteKPITemplate } = usePerformance()

      await deleteKPITemplate('tpl-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/performance/kpi-templates/tpl-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('應該在刪除失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { deleteKPITemplate } = usePerformance()

      await expect(deleteKPITemplate('tpl-1')).rejects.toThrow('刪除 KPI 範本失敗')
    })
  })

  describe('fetchTeamDashboard', () => {
    it('應該成功取得團隊儀表板', async () => {
      const mockDashboard: TeamDashboard = {
        total_reviews: 10,
        pending_reviews: 3,
        completed_reviews: 7,
        average_score: 82.5,
        score_distribution: {
          excellent: 3,
          good: 4,
          poor: 0
        },
        top_performers: [
          { id: 'emp-1', full_name: '張三', score: 95 }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockDashboard
      })

      const { fetchTeamDashboard } = usePerformance()

      const result = await fetchTeamDashboard({ period: '2025-01' })

      expect(result).toEqual(mockDashboard)
      const url = requestedUrl()
      expect(url.pathname).toBe('/api/performance/team-dashboard')
      expect(url.searchParams.get('period')).toBe('2025-01')
      expect(url.searchParams.has('branch_id')).toBe(false)
    })

    it('應該在 API 回報失敗時返回 null', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { fetchTeamDashboard } = usePerformance()

      expect(await fetchTeamDashboard({ branch_id: 'branch-1' })).toBeNull()
    })

    it('應該在請求錯誤時返回 null 並呼叫 handleError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchTeamDashboard } = usePerformance()

      expect(await fetchTeamDashboard()).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('Helper functions', () => {
    it('getReviewTypeLabel 應該返回正確的標籤', () => {
      const { getReviewTypeLabel } = usePerformance()

      expect(getReviewTypeLabel('MONTHLY')).toBe('月考核')
      expect(getReviewTypeLabel('QUARTERLY')).toBe('季考核')
      expect(getReviewTypeLabel('ANNUAL')).toBe('年度考核')
    })

    it('getStatusLabel 應該返回正確的標籤', () => {
      const { getStatusLabel } = usePerformance()

      expect(getStatusLabel('DRAFT')).toBe('草稿')
      expect(getStatusLabel('SUBMITTED')).toBe('待審核')
      expect(getStatusLabel('APPROVED')).toBe('已核准')
    })

    it('getStatusVariant 應該返回正確的樣式', () => {
      const { getStatusVariant } = usePerformance()

      expect(getStatusVariant('DRAFT')).toBe('default')
      expect(getStatusVariant('SUBMITTED')).toBe('warning')
      expect(getStatusVariant('APPROVED')).toBe('success')
    })
  })
})
