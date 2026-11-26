/**
 * useCampaigns - 行銷活動管理 composable
 *
 * Wire format of backend/src/routes/campaigns.ts: camelCase rows, decimals (budget,
 * discountValue) as strings, the list answers with `pagination`. The backend has no
 * lifecycle `status` to write: whether a campaign runs is `isActive` plus its date range.
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { apiErrorMessage } from '~/utils/api-error'

export const CAMPAIGN_TYPES = ['PROMOTION', 'REFERRAL', 'SEASONAL', 'MEMBERSHIP', 'EVENT', 'OTHER'] as const
export type CampaignType = typeof CAMPAIGN_TYPES[number]

export type CampaignDiscountType = 'PERCENTAGE' | 'FIXED' | 'FREE_TRIAL' | 'GIFT'

/** Display state derived from isActive + date range (the backend `status` column is never written) */
export type CampaignState = 'INACTIVE' | 'SCHEDULED' | 'ACTIVE' | 'ENDED'

export interface ApiCampaign {
  id: string
  tenantId: string
  branchId: string | null
  name: string
  description: string | null
  campaignType: CampaignType | null
  /** YYYY-MM-DD */
  startDate: string
  endDate: string
  targetAudience: string | null
  budget: string | null
  discountType: CampaignDiscountType | null
  discountValue: string | null
  isActive: boolean | null
  terms: string | null
  createdById: string | null
  status: string | null
  createdAt: string | null
  updatedAt: string | null
  branch?: { id: string | null; name: string | null } | null
  createdBy?: { id: string | null; fullName: string | null } | null
}

/** Body of POST /api/campaigns (createCampaignSchema) */
export interface CreateCampaignInput {
  name: string
  description?: string
  campaignType?: CampaignType
  startDate: string
  endDate: string
  targetAudience?: string
  budget?: number | string
  discountType?: CampaignDiscountType
  discountValue?: number | string
  branchId?: string
  isActive?: boolean
  terms?: string
}

/** Body of PATCH /api/campaigns/:id (updateCampaignSchema); every field optional */
export type UpdateCampaignInput = Partial<CreateCampaignInput>

interface CampaignListResponse {
  success: boolean
  data: ApiCampaign[]
  pagination?: { total: number; page: number; limit: number; totalPages: number }
}

const inFlightCampaignsMap = new Map<string, Promise<void>>()
const inFlightSingleCampaignMap = new Map<string, Promise<ApiCampaign | null>>()

/** Same day boundary the backend uses for activeOnly (UTC date) */
const todayIso = () => new Date().toISOString().slice(0, 10)

export const getCampaignState = (
  campaign: Pick<ApiCampaign, 'isActive' | 'startDate' | 'endDate'>,
  today: string = todayIso()
): CampaignState => {
  if (campaign.isActive === false) return 'INACTIVE'
  if (today < campaign.startDate) return 'SCHEDULED'
  if (today > campaign.endDate) return 'ENDED'
  return 'ACTIVE'
}

export const useCampaigns = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  // State
  const campaigns = useState<ApiCampaign[]>('campaigns', () => [])
  const currentCampaign = useState<ApiCampaign | null>('current_campaign', () => null)
  const isLoading = useState('campaigns_loading', () => false)
  const totalCount = useState('campaigns_total', () => 0)

  /**
   * Fetch campaigns. The backend filters by campaignType, branchId and activeOnly only.
   */
  const fetchCampaigns = async (options?: {
    campaignType?: string
    activeOnly?: boolean
    branchId?: string
    page?: number
    limit?: number
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightCampaignsMap.has(key)) {
      return inFlightCampaignsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { campaignType, activeOnly, branchId, page = 1, limit = 20 } = options || {}

      try {
        const response = await apiFetch<ApiCampaign[]>('/campaigns', {
          params: {
            campaignType,
            activeOnly: activeOnly ? true : undefined,
            branchId,
            page,
            limit
          }
        }) as unknown as CampaignListResponse

        campaigns.value = response.data || []
        totalCount.value = Number(response.pagination?.total ?? campaigns.value.length)
      } catch (error) {
        handleError(error, {
          context: 'useCampaigns.fetchCampaigns',
          customMessage: apiErrorMessage(error, '取得活動列表失敗')
        })
        campaigns.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightCampaignsMap.delete(key)
      }
    })()

    inFlightCampaignsMap.set(key, promise)
    return promise
  }

  /**
   * Get single campaign
   */
  const getCampaign = async (id: string, force = false): Promise<ApiCampaign | null> => {
    if (!force && inFlightSingleCampaignMap.has(id)) {
      return inFlightSingleCampaignMap.get(id)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiCampaign>(`/campaigns/${id}`)
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useCampaigns.getCampaign',
          customMessage: apiErrorMessage(error, '取得活動詳情失敗')
        })
        return null
      } finally {
        inFlightSingleCampaignMap.delete(id)
      }
    })()

    inFlightSingleCampaignMap.set(id, promise)
    return promise
  }

  /**
   * Fetch single campaign and store in state
   */
  const fetchCampaign = async (id: string): Promise<void> => {
    isLoading.value = true
    try {
      currentCampaign.value = await getCampaign(id, true)
    } finally {
      isLoading.value = false
    }
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const createCampaign = async (input: CreateCampaignInput): Promise<ApiCampaign | null> => {
    try {
      const { data } = await apiFetch<ApiCampaign>('/campaigns', { method: 'POST', body: input })
      if (!data) throw new Error('建立活動失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.createCampaign',
        customMessage: apiErrorMessage(error, '建立活動失敗')
      })
      return null
    }
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const updateCampaign = async (id: string, input: UpdateCampaignInput): Promise<ApiCampaign | null> => {
    try {
      const { data } = await apiFetch<ApiCampaign>(`/campaigns/${id}`, { method: 'PATCH', body: input })
      if (!data) throw new Error('更新活動失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.updateCampaign',
        customMessage: apiErrorMessage(error, '更新活動失敗')
      })
      return null
    }
  }

  /** Permanent delete (admin only on the backend). Returns false on failure, after showing why. */
  const deleteCampaign = async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/campaigns/${id}`, { method: 'DELETE' })
      return true
    } catch (error) {
      handleError(error, {
        context: 'useCampaigns.deleteCampaign',
        customMessage: apiErrorMessage(error, '刪除活動失敗')
      })
      return false
    }
  }

  // Helpers
  const getTypeLabel = (type: CampaignType | string | null | undefined): string => {
    const labels: Record<CampaignType, string> = {
      PROMOTION: '促銷活動',
      REFERRAL: '推薦活動',
      SEASONAL: '季節活動',
      MEMBERSHIP: '會籍活動',
      EVENT: '線下活動',
      OTHER: '其他'
    }
    if (!type) return '—'
    return labels[type as CampaignType] || type
  }

  const getStatusLabel = (state: CampaignState): string => {
    const labels: Record<CampaignState, string> = {
      INACTIVE: '已停用',
      SCHEDULED: '已排程',
      ACTIVE: '進行中',
      ENDED: '已結束'
    }
    return labels[state] || state
  }

  const getStatusVariant = (state: CampaignState): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<CampaignState, 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      INACTIVE: 'default',
      SCHEDULED: 'warning',
      ACTIVE: 'success',
      ENDED: 'info'
    }
    return variants[state] || 'default'
  }

  return {
    // State
    campaigns,
    currentCampaign,
    isLoading,
    totalCount,
    // Actions
    fetchCampaigns,
    fetchCampaign,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    // Helpers
    getCampaignState,
    getTypeLabel,
    getStatusLabel,
    getStatusVariant
  }
}

export default useCampaigns
