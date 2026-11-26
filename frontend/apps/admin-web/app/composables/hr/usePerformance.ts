/**
 * usePerformance - 績效考核管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useFetch } from '~/composables/core/useFetch'
import { apiErrorMessage } from '~/utils/api-error'

export interface PerformanceReview {
  id: string
  employee_id: string
  employee?: {
    id: string
    full_name: string
    employee_code: string
    job_title?: { name: string }
    branch?: { name: string }
  }
  reviewer_id: string | null
  reviewer?: {
    id: string
    full_name: string
  }
  review_period: string
  review_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  kpi_data: KPIItem[]
  score: number | null
  comments: string | null
  improvement_plan: string | null
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED'
  reviewed_at: string | null
  date_created: string
}

export interface KPIItem {
  id: string
  name: string
  weight: number
  target: number
  actual?: number
  achievement?: number
  unit?: string
}

export interface KPITemplate {
  id: string
  name: string
  description?: string
  job_title_id: string | null
  review_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  kpis: KPIItem[]
  is_default: boolean
  is_active: boolean
  date_created: string
}

export interface TeamDashboard {
  total_reviews: number
  pending_reviews: number
  completed_reviews: number
  average_score: number | null
  score_distribution: {
    excellent: number
    good: number
    poor: number
  }
  top_performers: Array<{
    id: string
    full_name: string
    score: number
  }>
}

/** The raw row the review write routes return (camelCase, decimals as strings) */
export interface ReviewRecord {
  id: string
  employeeId: string
  reviewerId: string | null
  reviewPeriod: string
  reviewType: string | null
  status: PerformanceReview['status'] | null
  overallScore: string | null
  reviewerComments: string | null
  improvementPlan: string | null
  approvedBy: string | null
  approvedAt: string | null
  submittedAt: string | null
  reviewedAt: string | null
  kpiData: KPIItem[] | null
  createdAt: string | null
  updatedAt: string | null
}

/** The raw row POST /kpi-templates returns */
export interface KpiTemplateRecord {
  id: string
  name: string
  description: string | null
  jobTitleId: string | null
  reviewType: string
  kpis: KPIItem[]
  isDefault: boolean | null
  isActive: boolean | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** Body of PATCH /performance/reviews/:id */
export interface UpdateReviewInput {
  kpi_data?: KPIItem[]
  score?: number | null
  comments?: string
  improvement_plan?: string
  reviewer_id?: string
}

interface ListResponse<T> {
  success: boolean
  data: T[]
  meta?: { total: number }
}

const toScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

/** The API sends the decimal score as a string ("85.50") */
const normalizeReview = (review: PerformanceReview): PerformanceReview => ({
  ...review,
  score: toScore(review.score)
})

const inFlightReviewsMap = new Map<string, Promise<void>>()
const inFlightSingleReviewMap = new Map<string, Promise<void>>()
let inFlightKPITemplatesPromise: Promise<void> | null = null
const inFlightTeamDashboardMap = new Map<string, Promise<TeamDashboard | null>>()

export const usePerformance = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  // State
  const reviews = useState<PerformanceReview[]>('performance_reviews', () => [])
  const currentReview = useState<PerformanceReview | null>('current_performance_review', () => null)
  const kpiTemplates = useState<KPITemplate[]>('kpi_templates', () => [])
  const isLoading = useState('performance_loading', () => false)
  const totalCount = useState('performance_total', () => 0)

  /**
   * Fetch reviews list
   */
  const fetchReviews = async (options?: {
    employee_id?: string
    reviewer_id?: string
    status?: string
    review_type?: string
    period?: string
    page?: number
    limit?: number
  }) => {
    const key = JSON.stringify(options || {})
    const existing = inFlightReviewsMap.get(key)
    if (existing) return existing

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, ...filters } = options || {}

      try {
        const response = await apiFetch<PerformanceReview[]>('/performance/reviews', {
          params: { ...filters, limit, offset: (page - 1) * limit }
        }) as unknown as ListResponse<PerformanceReview>

        reviews.value = (response.data || []).map(normalizeReview)
        totalCount.value = Number(response.meta?.total ?? reviews.value.length)
      } catch (error) {
        handleError(error, {
          context: 'usePerformance.fetchReviews',
          customMessage: apiErrorMessage(error, '取得績效考核列表失敗')
        })
        reviews.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightReviewsMap.delete(key)
      }
    })()

    inFlightReviewsMap.set(key, promise)
    return promise
  }

  /**
   * Fetch single review
   */
  const fetchReview = async (id: string) => {
    const existing = inFlightSingleReviewMap.get(id)
    if (existing) return existing

    const promise = (async () => {
      isLoading.value = true
      try {
        const response = await apiFetch<PerformanceReview>(`/performance/reviews/${id}`)
        currentReview.value = response.data ? normalizeReview(response.data) : null
      } catch (error) {
        handleError(error, {
          context: 'usePerformance.fetchReview',
          customMessage: apiErrorMessage(error, '取得績效考核詳情失敗')
        })
        currentReview.value = null
      } finally {
        isLoading.value = false
        inFlightSingleReviewMap.delete(id)
      }
    })()

    inFlightSingleReviewMap.set(id, promise)
    return promise
  }

  /**
   * Create review. Throws the backend error on failure.
   */
  const createReview = async (data: {
    employee_id: string
    review_period: string
    review_type: string
    template_id?: string
    score?: number | null
    comments?: string
  }): Promise<ReviewRecord> => {
    const response = await apiFetch<ReviewRecord>('/performance/reviews', {
      method: 'POST',
      body: data
    })
    if (!response.data) throw new Error('建立績效考核失敗')
    return response.data
  }

  /**
   * Update review. Throws the backend error on failure.
   */
  const updateReview = async (id: string, data: UpdateReviewInput): Promise<ReviewRecord> => {
    const response = await apiFetch<ReviewRecord>(`/performance/reviews/${id}`, {
      method: 'PATCH',
      body: data
    })
    if (!response.data) throw new Error('更新績效考核失敗')
    return response.data
  }

  /**
   * Submit review for approval (DRAFT only). Throws the backend error on failure.
   */
  const submitReview = async (id: string): Promise<ReviewRecord> => {
    const response = await apiFetch<ReviewRecord>(`/performance/reviews/${id}/submit`, { method: 'POST' })
    if (!response.data) throw new Error('提交績效考核失敗')
    return response.data
  }

  /**
   * Approve review (admin, SUBMITTED only). Throws the backend error on failure.
   */
  const approveReview = async (id: string): Promise<ReviewRecord> => {
    const response = await apiFetch<ReviewRecord>(`/performance/reviews/${id}/approve`, { method: 'POST' })
    if (!response.data) throw new Error('核准績效考核失敗')
    return response.data
  }

  /**
   * Reject review back to DRAFT (admin, SUBMITTED only). Throws the backend error on failure.
   */
  const rejectReview = async (id: string, reason: string): Promise<ReviewRecord> => {
    const response = await apiFetch<ReviewRecord>(`/performance/reviews/${id}/reject`, {
      method: 'POST',
      body: { reason }
    })
    if (!response.data) throw new Error('退回績效考核失敗')
    return response.data
  }

  /**
   * Fetch KPI templates
   */
  const fetchKPITemplates = async () => {
    if (inFlightKPITemplatesPromise) return inFlightKPITemplatesPromise

    inFlightKPITemplatesPromise = (async () => {
      try {
        const response = await apiFetch<KPITemplate[]>('/performance/kpi-templates')
        kpiTemplates.value = response.data || []
      } catch (error) {
        handleError(error, {
          context: 'usePerformance.fetchKPITemplates',
          customMessage: apiErrorMessage(error, '取得 KPI 範本失敗')
        })
        kpiTemplates.value = []
      } finally {
        inFlightKPITemplatesPromise = null
      }
    })()

    return inFlightKPITemplatesPromise
  }

  /**
   * Create KPI template. Throws the backend error on failure.
   */
  const createKPITemplate = async (data: {
    name: string
    description?: string
    kpis: KPIItem[]
  }): Promise<KpiTemplateRecord> => {
    const response = await apiFetch<KpiTemplateRecord>('/performance/kpi-templates', {
      method: 'POST',
      body: data
    })
    if (!response.data) throw new Error('建立 KPI 範本失敗')
    return response.data
  }

  /**
   * Delete KPI template (admin; only the tenant's own templates, shared ones answer 404).
   * Throws the backend error on failure.
   */
  const deleteKPITemplate = async (id: string): Promise<void> => {
    await apiFetch(`/performance/kpi-templates/${id}`, { method: 'DELETE' })
  }

  /**
   * Fetch team dashboard. The backend filters by period only (no branch filter).
   */
  const fetchTeamDashboard = async (options?: {
    period?: string
  }): Promise<TeamDashboard | null> => {
    const key = JSON.stringify(options || {})
    const existing = inFlightTeamDashboardMap.get(key)
    if (existing) return existing

    const promise = (async () => {
      try {
        const response = await apiFetch<TeamDashboard>('/performance/team-dashboard', {
          params: { period: options?.period }
        })
        return response.data ?? null
      } catch (error) {
        handleError(error, {
          context: 'usePerformance.fetchTeamDashboard',
          customMessage: apiErrorMessage(error, '取得團隊儀表板失敗')
        })
        return null
      } finally {
        inFlightTeamDashboardMap.delete(key)
      }
    })()

    inFlightTeamDashboardMap.set(key, promise)
    return promise
  }

  // Helper functions
  const getReviewTypeLabel = (type: PerformanceReview['review_type']): string => {
    const labels: Record<PerformanceReview['review_type'], string> = {
      MONTHLY: '月考核',
      QUARTERLY: '季考核',
      ANNUAL: '年度考核'
    }
    return labels[type] || type
  }

  const getStatusLabel = (status: PerformanceReview['status']): string => {
    const labels: Record<PerformanceReview['status'], string> = {
      DRAFT: '草稿',
      SUBMITTED: '待審核',
      REVIEWED: '已審閱',
      APPROVED: '已核准'
    }
    return labels[status] || status
  }

  const getStatusVariant = (status: PerformanceReview['status']): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<PerformanceReview['status'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      DRAFT: 'default',
      SUBMITTED: 'warning',
      REVIEWED: 'info',
      APPROVED: 'success'
    }
    return variants[status] || 'default'
  }

  return {
    // State
    reviews,
    currentReview,
    kpiTemplates,
    isLoading,
    totalCount,
    // Actions
    fetchReviews,
    fetchReview,
    createReview,
    updateReview,
    submitReview,
    approveReview,
    rejectReview,
    fetchKPITemplates,
    createKPITemplate,
    deleteKPITemplate,
    fetchTeamDashboard,
    // Helpers
    getReviewTypeLabel,
    getStatusLabel,
    getStatusVariant
  }
}

export default usePerformance
