/**
 * usePerformance - 績效考核管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'

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
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED'
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

export const usePerformance = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()

  // State
  const reviews = useState<PerformanceReview[]>('performance_reviews', () => [])
  const currentReview = useState<PerformanceReview | null>('current_performance_review', () => null)
  const kpiTemplates = useState<KPITemplate[]>('kpi_templates', () => [])
  const isLoading = useState('performance_loading', () => false)
  const totalCount = useState('performance_total', () => 0)

  const apiBase = `${config.public.apiUrl}/gym`

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
    isLoading.value = true
    const { page = 1, limit = 20, ...filters } = options || {}

    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: PerformanceReview[]
        meta: { total: number }
      }>(`${apiBase}/performance/reviews?${params}`)

      if (response.success) {
        reviews.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'usePerformance.fetchReviews',
        customMessage: '取得績效考核列表失敗'
      })
      reviews.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch single review
   */
  const fetchReview = async (id: string) => {
    isLoading.value = true
    try {
      const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
        `${apiBase}/performance/reviews/${id}`
      )
      if (response.success) {
        currentReview.value = response.data
      }
    } catch (error) {
      handleError(error, {
        context: 'usePerformance.fetchReview',
        customMessage: '取得績效考核詳情失敗'
      })
      currentReview.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Create review
   */
  const createReview = async (data: {
    employee_id: string
    review_period: string
    review_type: string
    template_id?: string
    score?: number | null
    comments?: string
  }): Promise<PerformanceReview> => {
    const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
      `${apiBase}/performance/reviews`,
      {
        method: 'POST',
        body: data
      }
    )
    if (!response.success) {
      throw new Error('建立績效考核失敗')
    }
    return response.data
  }

  /**
   * Update review
   */
  const updateReview = async (
    id: string,
    data: Partial<PerformanceReview>
  ): Promise<PerformanceReview> => {
    const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
      `${apiBase}/performance/reviews/${id}`,
      {
        method: 'PATCH',
        body: data
      }
    )
    if (!response.success) {
      throw new Error('更新績效考核失敗')
    }
    return response.data
  }

  /**
   * Submit review for approval
   */
  const submitReview = async (id: string): Promise<PerformanceReview> => {
    const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
      `${apiBase}/performance/reviews/${id}/submit`,
      { method: 'POST' }
    )
    if (!response.success) {
      throw new Error('提交績效考核失敗')
    }
    return response.data
  }

  /**
   * Approve review
   */
  const approveReview = async (id: string): Promise<PerformanceReview> => {
    const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
      `${apiBase}/performance/reviews/${id}/approve`,
      { method: 'POST' }
    )
    if (!response.success) {
      throw new Error('核准績效考核失敗')
    }
    return response.data
  }

  /**
   * Reject review
   */
  const rejectReview = async (id: string, reason: string): Promise<PerformanceReview> => {
    const response = await $fetch<{ success: boolean; data: PerformanceReview }>(
      `${apiBase}/performance/reviews/${id}/reject`,
      {
        method: 'POST',
        body: { reason }
      }
    )
    if (!response.success) {
      throw new Error('退回績效考核失敗')
    }
    return response.data
  }

  /**
   * Fetch KPI templates
   */
  const fetchKPITemplates = async () => {
    try {
      const response = await $fetch<{ success: boolean; data: KPITemplate[] }>(
        `${apiBase}/performance/kpi-templates`
      )
      if (response.success) {
        kpiTemplates.value = response.data
      }
    } catch (error) {
      handleError(error, {
        context: 'usePerformance.fetchKPITemplates',
        customMessage: '取得 KPI 範本失敗'
      })
      kpiTemplates.value = []
    }
  }

  /**
   * Create KPI template
   */
  const createKPITemplate = async (data: {
    name: string
    description?: string
    kpis: KPIItem[]
  }): Promise<KPITemplate> => {
    const response = await $fetch<{ success: boolean; data: KPITemplate }>(
      `${apiBase}/performance/kpi-templates`,
      {
        method: 'POST',
        body: data
      }
    )
    if (!response.success) {
      throw new Error('建立 KPI 範本失敗')
    }
    return response.data
  }

  /**
   * Delete KPI template
   */
  const deleteKPITemplate = async (id: string): Promise<void> => {
    const response = await $fetch<{ success: boolean }>(
      `${apiBase}/performance/kpi-templates/${id}`,
      { method: 'DELETE' }
    )
    if (!response.success) {
      throw new Error('刪除 KPI 範本失敗')
    }
  }

  /**
   * Fetch team dashboard
   */
  const fetchTeamDashboard = async (options?: {
    branch_id?: string
    period?: string
  }): Promise<TeamDashboard | null> => {
    try {
      const params = new URLSearchParams()
      if (options?.branch_id) params.append('branch_id', options.branch_id)
      if (options?.period) params.append('period', options.period)

      const response = await $fetch<{ success: boolean; data: TeamDashboard }>(
        `${apiBase}/performance/team-dashboard?${params}`
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'usePerformance.fetchTeamDashboard',
        customMessage: '取得團隊儀表板失敗'
      })
      return null
    }
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
      APPROVED: '已核准'
    }
    return labels[status] || status
  }

  const getStatusVariant = (status: PerformanceReview['status']): string => {
    const variants: Record<PerformanceReview['status'], string> = {
      DRAFT: 'secondary',
      SUBMITTED: 'warning',
      APPROVED: 'success'
    }
    return variants[status] || 'secondary'
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
