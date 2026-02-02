/**
 * useCampaigns - 行銷活動管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'

export interface Campaign {
  id: string
  name: string
  type: 'PROMOTION' | 'EVENT' | 'CHECKIN' | 'REFERRAL'
  description: string | null
  start_date: string
  end_date: string
  target_audience: Record<string, unknown> | null
  budget: number | null
  actual_cost: number | null
  status: 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
  metrics: CampaignMetrics | null
  created_by: string | null
  created_at: string
  // Computed
  computed_status?: string
  is_running?: boolean
  created_by_name?: string
  coupons?: Array<{
    id: string
    code: string
    name: string
    discount_type: string
    discount_value: number
    used_count: number
  }>
  associated_coupons?: Array<{
    id: string
    code: string
    name: string
    discount_type: string
    discount_value: number
    used_count: number
  }>
  assets?: Array<{
    id: string
    name: string
    type: string
    file_id: string | null
  }>
}

export interface CampaignMetrics {
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  total_revenue?: number // Alias for revenue
  leads_generated?: number
  contracts_created?: number
  revenue_generated?: number
  coupon_usages?: number
  roi?: string | null
  conversion_rate?: string | null
  updated_at?: string
}

export interface ROIReport {
  id: string
  name: string
  type: string
  status: string
  period: {
    start: string
    end: string
  }
  budget: number | null
  actual_cost: number
  revenue: number
  profit: number
  roi: number | null
  conversions: number
}

export interface ROISummary {
  total_campaigns: number
  total_budget: number
  total_cost: number
  total_revenue: number
  total_profit: number
  total_conversions: number
  average_roi: string | null
  best_performing: ROIReport | null
  worst_performing: ROIReport | null
}

export const useCampaigns = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()

  // State
  const campaigns = useState<Campaign[]>('campaigns', () => [])
  const currentCampaign = useState<Campaign | null>('current_campaign', () => null)
  const campaignMetrics = useState<CampaignMetrics | null>('campaign_metrics', () => null)
  const isLoading = useState('campaigns_loading', () => false)
  const totalCount = useState('campaigns_total', () => 0)

  const apiBase = config.public.apiUrl

  /**
   * Fetch campaigns
   */
  const fetchCampaigns = async (options?: {
    type?: string
    status?: string
    search?: string
    page?: number
    limit?: number
  }) => {
    isLoading.value = true
    const { type, status, search, page = 1, limit = 20 } = options || {}

    try {
      const params = new URLSearchParams()
      if (type) params.append('type', type)
      if (status) params.append('status', status)
      if (search) params.append('search', search)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: Campaign[]
        meta: { total: number }
      }>(`${apiBase}/campaigns?${params}`)

      if (response.success) {
        campaigns.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.fetchCampaigns',
        customMessage: '取得活動列表失敗'
      })
      campaigns.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get single campaign
   */
  const getCampaign = async (id: string): Promise<Campaign | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Campaign }>(
        `${apiBase}/campaigns/${id}`
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.getCampaign',
        customMessage: '取得活動詳情失敗'
      })
      return null
    }
  }

  /**
   * Fetch single campaign and store in state
   */
  const fetchCampaign = async (id: string): Promise<void> => {
    isLoading.value = true
    try {
      const campaign = await getCampaign(id)
      currentCampaign.value = campaign
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Create campaign
   */
  const createCampaign = async (data: Partial<Campaign>): Promise<Campaign | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Campaign }>(`${apiBase}/campaigns`, {
        method: 'POST',
        body: data
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.createCampaign',
        customMessage: '建立活動失敗'
      })
      return null
    }
  }

  /**
   * Update campaign
   */
  const updateCampaign = async (id: string, data: Partial<Campaign>): Promise<Campaign | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Campaign }>(
        `${apiBase}/campaigns/${id}`,
        {
          method: 'PATCH',
          body: data
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.updateCampaign',
        customMessage: '更新活動失敗'
      })
      return null
    }
  }

  /**
   * Cancel campaign
   */
  const cancelCampaign = async (id: string): Promise<boolean> => {
    try {
      const response = await $fetch<{ success: boolean }>(`${apiBase}/campaigns/${id}`, {
        method: 'DELETE'
      })
      return response.success
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.cancelCampaign',
        customMessage: '取消活動失敗'
      })
      return false
    }
  }

  /**
   * Delete campaign (alias for cancelCampaign)
   */
  const deleteCampaign = cancelCampaign

  /**
   * Get campaign metrics
   */
  const getCampaignMetrics = async (id: string): Promise<CampaignMetrics | null> => {
    try {
      const response = await $fetch<{
        success: boolean
        data: {
          campaign_id: string
          campaign_name: string
          period: { start_date: string; end_date: string }
          budget: number | null
          actual_cost: number | null
          metrics: CampaignMetrics
        }
      }>(`${apiBase}/campaigns/${id}/metrics`)
      return response.success ? response.data.metrics : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.getCampaignMetrics',
        customMessage: '取得活動指標失敗'
      })
      return null
    }
  }

  /**
   * Fetch campaign metrics and store in state
   */
  const fetchCampaignMetrics = async (id: string): Promise<void> => {
    try {
      const metrics = await getCampaignMetrics(id)
      campaignMetrics.value = metrics
    } catch {
      campaignMetrics.value = null
    }
  }

  /**
   * Update campaign metrics
   */
  const updateCampaignMetrics = async (
    id: string,
    metrics: Partial<CampaignMetrics> & { actual_cost?: number }
  ): Promise<Campaign | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Campaign }>(
        `${apiBase}/campaigns/${id}/update-metrics`,
        {
          method: 'POST',
          body: metrics
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.updateCampaignMetrics',
        customMessage: '更新活動指標失敗'
      })
      return null
    }
  }

  /**
   * Add asset to campaign
   */
  const addAsset = async (
    campaignId: string,
    asset: {
      name: string
      type: string
      category?: string
      file_id?: string
      content?: string
      created_by?: string
    }
  ): Promise<unknown | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: unknown }>(
        `${apiBase}/campaigns/${campaignId}/assets`,
        {
          method: 'POST',
          body: asset
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.addAsset',
        customMessage: '新增素材失敗'
      })
      return null
    }
  }

  /**
   * Get ROI report
   */
  const getROIReport = async (options?: {
    startDate?: string
    endDate?: string
    type?: string
  }): Promise<{ summary: ROISummary; data: ROIReport[] } | null> => {
    try {
      const params = new URLSearchParams()
      if (options?.startDate) params.append('start_date', options.startDate)
      if (options?.endDate) params.append('end_date', options.endDate)
      if (options?.type) params.append('type', options.type)

      const response = await $fetch<{
        success: boolean
        period: { start_date: string; end_date: string }
        summary: ROISummary
        data: ROIReport[]
      }>(`${apiBase}/campaigns/roi-report?${params}`)

      return response.success ? { summary: response.summary, data: response.data } : null
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.getROIReport',
        customMessage: '取得 ROI 報表失敗'
      })
      return null
    }
  }

  /**
   * Fetch ROI report (alias for getROIReport)
   */
  const fetchROIReport = getROIReport

  // Helpers
  const getTypeLabel = (type: Campaign['type']): string => {
    const labels: Record<Campaign['type'], string> = {
      PROMOTION: '促銷活動',
      EVENT: '線下活動',
      CHECKIN: '打卡活動',
      REFERRAL: '轉介紹'
    }
    return labels[type] || type
  }

  const getTypeColor = (type: Campaign['type']): string => {
    const colors: Record<Campaign['type'], string> = {
      PROMOTION: 'bg-purple-100 text-purple-800',
      EVENT: 'bg-blue-100 text-blue-800',
      CHECKIN: 'bg-green-100 text-green-800',
      REFERRAL: 'bg-orange-100 text-orange-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: Campaign['status']): string => {
    const labels: Record<Campaign['status'], string> = {
      DRAFT: '草稿',
      ACTIVE: '進行中',
      ENDED: '已結束',
      CANCELLED: '已取消'
    }
    return labels[status] || status
  }

  const getStatusColor = (status: Campaign['status']): string => {
    const colors: Record<Campaign['status'], string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      ACTIVE: 'bg-green-100 text-green-800',
      ENDED: 'bg-blue-100 text-blue-800',
      CANCELLED: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusVariant = (status: Campaign['status']): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<Campaign['status'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      DRAFT: 'default',
      ACTIVE: 'success',
      ENDED: 'info',
      CANCELLED: 'error'
    }
    return variants[status] || 'default'
  }

  const formatROI = (roi: number | null): string => {
    if (roi === null) return '-'
    return `${roi >= 0 ? '+' : ''}${roi}%`
  }

  const getROIColor = (roi: number | null): string => {
    if (roi === null) return 'text-gray-500'
    if (roi >= 100) return 'text-emerald-600'
    if (roi >= 50) return 'text-green-600'
    if (roi >= 0) return 'text-yellow-600'
    return 'text-red-600'
  }

  return {
    // State
    campaigns,
    currentCampaign,
    campaignMetrics,
    isLoading,
    totalCount,
    // Actions
    fetchCampaigns,
    fetchCampaign,
    getCampaign,
    createCampaign,
    updateCampaign,
    cancelCampaign,
    deleteCampaign,
    getCampaignMetrics,
    fetchCampaignMetrics,
    updateCampaignMetrics,
    addAsset,
    getROIReport,
    fetchROIReport,
    // Helpers
    getTypeLabel,
    getTypeColor,
    getStatusLabel,
    getStatusColor,
    getStatusVariant,
    formatROI,
    getROIColor
  }
}

export default useCampaigns
