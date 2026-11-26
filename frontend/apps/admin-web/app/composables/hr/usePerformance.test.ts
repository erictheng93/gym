import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { usePerformance } from './usePerformance'
import type { PerformanceReview, KPITemplate, TeamDashboard } from './usePerformance'

// Fixtures in the exact wire format of backend/src/routes/hr-performance.ts: reads are
// snake_case with the decimal `score` as a string and `meta.total`; writes return camelCase rows.
const makeReview = (overrides: Record<string, unknown> = {}) => ({
  id: 'a0000000-0000-4000-8000-000000000001',
  employee_id: 'e0000000-0000-4000-8000-000000000001',
  reviewer_id: null,
  review_period: '2026-01',
  review_type: 'MONTHLY',
  kpi_data: [],
  score: '85.50',
  comments: null,
  improvement_plan: null,
  status: 'DRAFT',
  reviewed_at: null,
  date_created: '2026-01-31T02:00:00.000Z',
  employee: {
    id: 'e0000000-0000-4000-8000-000000000001',
    full_name: '張三',
    employee_code: 'E00001',
    job_title: { id: 'j1', name: '教練' },
    branch: { id: 'b1', name: '信義店' }
  },
  ...overrides
}) as unknown as PerformanceReview

const reviewRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  employeeId: 'e0000000-0000-4000-8000-000000000001',
  reviewerId: null,
  reviewPeriod: '2026-01',
  reviewType: 'MONTHLY',
  status: 'SUBMITTED',
  overallScore: '85.50',
  reviewerComments: null,
  improvementPlan: null,
  approvedBy: null,
  approvedAt: null,
  submittedAt: '2026-02-01T02:00:00.000Z',
  reviewedAt: null,
  kpiData: [],
  createdAt: '2026-01-31T02:00:00.000Z',
  updatedAt: null
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('usePerformance', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  describe('fetchReviews', () => {
    it('通過 apiFetch 讀取列表，meta.total 當總數，字串分數轉成數字', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: [makeReview(), makeReview({ id: 'r2', score: null })],
        meta: { total: 30 }
      })

      const { fetchReviews, reviews, totalCount } = usePerformance()
      await fetchReviews({ page: 2, limit: 10, status: 'SUBMITTED', employee_id: 'e1' })

      expect(lastCall()[0]).toBe('/performance/reviews')
      expect(lastCall()[1].params).toEqual({ status: 'SUBMITTED', employee_id: 'e1', limit: 10, offset: 10 })
      expect(reviews.value[0]!.score).toBe(85.5)
      expect(reviews.value[1]!.score).toBeNull()
      expect(reviews.value[0]!.employee?.full_name).toBe('張三')
      expect(totalCount.value).toBe(30)
    })

    it('失敗時清空列表並回報後端錯誤訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { fetchReviews, reviews, totalCount, isLoading } = usePerformance()
      await fetchReviews({ period: 'x-fail' })

      expect(reviews.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'usePerformance.fetchReviews', customMessage: '權限不足' })
      )
    })
  })

  describe('fetchReview', () => {
    it('讀取單筆並轉換分數', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: makeReview() })

      const { fetchReview, currentReview } = usePerformance()
      await fetchReview('r1')

      expect(lastCall()[0]).toBe('/performance/reviews/r1')
      expect(currentReview.value?.score).toBe(85.5)
    })

    it('404 時清空目前考核', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到績效考核記錄'))

      const { fetchReview, currentReview } = usePerformance()
      await fetchReview('missing')

      expect(currentReview.value).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('寫入（回傳 camelCase 紀錄）', () => {
    it('createReview 回傳新建的紀錄', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...reviewRow, status: 'DRAFT' } })

      const { createReview } = usePerformance()
      const result = await createReview({ employee_id: 'e1', review_period: '2026-01', review_type: 'MONTHLY' })

      expect(lastCall()[0]).toBe('/performance/reviews')
      expect(lastCall()[1]).toEqual({
        method: 'POST',
        body: { employee_id: 'e1', review_period: '2026-01', review_type: 'MONTHLY' }
      })
      expect(result.id).toBe(reviewRow.id)
    })

    it('createReview 後端錯誤直接拋出', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到員工'))

      const { createReview } = usePerformance()
      await expect(createReview({ employee_id: 'e1', review_period: '2026-01', review_type: 'MONTHLY' }))
        .rejects.toThrow('找不到員工')
    })

    it('updateReview 以 snake_case 欄位 PATCH', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: reviewRow })

      const { updateReview } = usePerformance()
      await updateReview('r1', { score: 90, comments: 'good', improvement_plan: 'plan' })

      expect(lastCall()[0]).toBe('/performance/reviews/r1')
      expect(lastCall()[1]).toEqual({
        method: 'PATCH',
        body: { score: 90, comments: 'good', improvement_plan: 'plan' }
      })
    })

    it('submitReview 對非草稿拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('只有草稿狀態才能提交'))

      const { submitReview } = usePerformance()
      await expect(submitReview('r1')).rejects.toThrow('只有草稿狀態才能提交')
      expect(lastCall()[0]).toBe('/performance/reviews/r1/submit')
    })

    it('approveReview 成功回傳紀錄；403 時拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...reviewRow, status: 'APPROVED' } })

      const { approveReview } = usePerformance()
      const result = await approveReview('r1')
      expect(result.status).toBe('APPROVED')
      expect(lastCall()[0]).toBe('/performance/reviews/r1/approve')

      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))
      await expect(approveReview('r1')).rejects.toThrow('權限不足')
    })

    it('rejectReview 帶上退回原因', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...reviewRow, status: 'DRAFT' } })

      const { rejectReview } = usePerformance()
      await rejectReview('r1', '資料不完整')

      expect(lastCall()[0]).toBe('/performance/reviews/r1/reject')
      expect(lastCall()[1]).toEqual({ method: 'POST', body: { reason: '資料不完整' } })
    })
  })

  describe('KPI 範本', () => {
    const template: KPITemplate = {
      id: 't1',
      name: '教練季考核',
      description: '',
      job_title_id: null,
      review_type: 'QUARTERLY',
      kpis: [{ id: 'kpi_1', name: '出席率', weight: 100, target: 90 }],
      is_default: false,
      is_active: true,
      date_created: '2026-01-01T00:00:00.000Z'
    }

    it('fetchKPITemplates 讀取範本', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [template] })

      const { fetchKPITemplates, kpiTemplates } = usePerformance()
      await fetchKPITemplates()

      expect(lastCall()[0]).toBe('/performance/kpi-templates')
      expect(kpiTemplates.value).toEqual([template])
    })

    it('fetchKPITemplates 失敗時清空', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { fetchKPITemplates, kpiTemplates } = usePerformance()
      await fetchKPITemplates()

      expect(kpiTemplates.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('createKPITemplate 回傳後端的 camelCase 紀錄', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { id: 't1', name: '教練季考核', kpis: template.kpis } })

      const { createKPITemplate } = usePerformance()
      const result = await createKPITemplate({ name: '教練季考核', kpis: template.kpis })

      expect(lastCall()[0]).toBe('/performance/kpi-templates')
      expect(result.id).toBe('t1')
    })

    it('deleteKPITemplate 只回 success 也視為成功；共用範本的 404 會拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true })

      const { deleteKPITemplate } = usePerformance()
      await expect(deleteKPITemplate('t1')).resolves.toBeUndefined()
      expect(lastCall()[0]).toBe('/performance/kpi-templates/t1')
      expect(lastCall()[1]).toEqual({ method: 'DELETE' })

      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到 KPI 範本'))
      await expect(deleteKPITemplate('shared')).rejects.toThrow('找不到 KPI 範本')
    })
  })

  describe('fetchTeamDashboard', () => {
    const dashboard: TeamDashboard = {
      total_reviews: 10,
      pending_reviews: 4,
      completed_reviews: 6,
      average_score: 82.5,
      score_distribution: { excellent: 2, good: 3, poor: 1 },
      top_performers: [{ id: 'e1', full_name: '張三', score: 95 }]
    }

    it('只送 period（後端沒有分店篩選）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: dashboard })

      const { fetchTeamDashboard } = usePerformance()
      const result = await fetchTeamDashboard({ period: '2026-01' })

      expect(lastCall()[0]).toBe('/performance/team-dashboard')
      expect(lastCall()[1].params).toEqual({ period: '2026-01' })
      expect(result).toEqual(dashboard)
    })

    it('失敗時回傳 null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { fetchTeamDashboard } = usePerformance()
      expect(await fetchTeamDashboard({ period: '2025-12' })).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('helpers', () => {
    it('標籤與樣式', () => {
      const { getReviewTypeLabel, getStatusLabel, getStatusVariant } = usePerformance()

      expect(getReviewTypeLabel('QUARTERLY')).toBe('季考核')
      expect(getStatusLabel('SUBMITTED')).toBe('待審核')
      expect(getStatusLabel('APPROVED')).toBe('已核准')
      expect(getStatusVariant('APPROVED')).toBe('success')
    })
  })
})
