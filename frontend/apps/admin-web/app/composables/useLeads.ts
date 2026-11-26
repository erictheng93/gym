/**
 * useLeads - 潛在客戶管理 composable
 * CRM 功能：Leads CRUD、指派、轉換為會員、統計
 *
 * Wire format: backend/src/routes/leads.ts. The API is camelCase; the pipeline stage is the
 * `status` field; there are no activities / assign / analytics routes.
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import { apiErrorMessage } from '~/utils/api-error'

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'TRIAL' | 'NEGOTIATION' | 'CONVERTED' | 'LOST'
export type LeadSource = 'WALK_IN' | 'REFERRAL' | 'WEBSITE' | 'SOCIAL_MEDIA' | 'EVENT' | 'AD' | 'OTHER'

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'NEGOTIATION', 'CONVERTED', 'LOST'
]
export const LEAD_SOURCES: readonly LeadSource[] = [
  'WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'AD', 'OTHER'
]

/** A lead row as GET /api/leads and GET /api/leads/:id send it (LEAD_SELECT + joins) */
export interface Lead {
  id: string
  status: LeadStatus
  createdAt: string
  updatedAt: string | null
  fullName: string
  phone: string | null
  email: string | null
  source: LeadSource | null
  sourceDetail: string | null
  branchId: string
  assignedToId: string | null
  leadStatus: string | null
  notes: string | null
  interests: string[] | null
  /** decimal column: arrives as a string */
  expectedBudget: string | null
  convertedMemberId: string | null
  convertedAt: string | null
  branch?: { id: string; name: string } | null
  assignedTo?: { id: string; fullName: string } | null
  /** only on GET /api/leads/:id */
  convertedMember?: { id: string; fullName: string; memberCode: string } | null
}

/** Body of POST /api/leads (createLeadSchema) */
export interface CreateLeadInput {
  fullName: string
  branchId: string
  phone?: string
  email?: string
  source?: LeadSource
  sourceDetail?: string
  assignedToId?: string
  status?: LeadStatus
  notes?: string
  interests?: string[]
  expectedBudget?: string | number
}

/** Body of PATCH /api/leads/:id (every field optional) */
export type UpdateLeadInput = Partial<CreateLeadInput>

/** GET /api/leads/stats/summary */
export interface LeadStats {
  total: number
  byStatus: Partial<Record<LeadStatus, number>>
  /** percentage with one decimal, as a string ("12.5") */
  conversionRate: string
}

/** POST /api/leads/:id/convert */
export interface LeadConvertResult {
  lead: Lead
  member: { id: string; fullName: string; memberCode: string; [key: string]: unknown }
}

interface LeadListResponse {
  success: boolean
  data: Lead[]
  pagination?: { total: number; page: number; limit: number; totalPages: number }
}

const inFlightLeadsMap = new Map<string, Promise<void>>()
const inFlightSingleLeadMap = new Map<string, Promise<Lead | null>>()
const inFlightStatsMap = new Map<string, Promise<LeadStats | null>>()

export const useLeads = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()

  // State
  const leads = useState<Lead[]>('leads', () => [])
  const isLoading = useState('leads_loading', () => false)
  const totalCount = useState('leads_total', () => 0)

  /**
   * Fetch leads with filters (the backend filters by status, branchId, assignedToId, search)
   */
  const fetchLeads = async (options?: {
    status?: string
    assignedToId?: string
    branchId?: string
    search?: string
    page?: number
    limit?: number
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightLeadsMap.has(key)) {
      return inFlightLeadsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { status, assignedToId, branchId, search, page = 1, limit = 20 } = options || {}

      try {
        const response = await apiFetch<Lead[]>('/leads', {
          params: { status, assignedToId, branchId, search, page, limit }
        }) as unknown as LeadListResponse

        leads.value = response.data || []
        totalCount.value = Number(response.pagination?.total ?? leads.value.length)
      } catch (error) {
        handleError(error, {
          context: 'useLeads.fetchLeads',
          customMessage: apiErrorMessage(error, '取得潛在客戶列表失敗')
        })
        leads.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightLeadsMap.delete(key)
      }
    })()

    inFlightLeadsMap.set(key, promise)
    return promise
  }

  /**
   * Get a single lead (with branch, assignee and converted member)
   */
  const getLead = async (id: string, force = false): Promise<Lead | null> => {
    if (!force && inFlightSingleLeadMap.has(id)) {
      return inFlightSingleLeadMap.get(id)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<Lead>(`/leads/${id}`)
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useLeads.getLead',
          customMessage: apiErrorMessage(error, '取得潛在客戶詳情失敗')
        })
        return null
      } finally {
        inFlightSingleLeadMap.delete(id)
      }
    })()

    inFlightSingleLeadMap.set(id, promise)
    return promise
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const createLead = async (input: CreateLeadInput): Promise<Lead | null> => {
    try {
      const { data } = await apiFetch<Lead>('/leads', { method: 'POST', body: input })
      if (!data) throw new Error('建立潛在客戶失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useLeads.createLead',
        customMessage: apiErrorMessage(error, '建立潛在客戶失敗')
      })
      return null
    }
  }

  /** Returns null on failure, after showing the backend's reason; never throws. */
  const updateLead = async (id: string, input: UpdateLeadInput): Promise<Lead | null> => {
    try {
      const { data } = await apiFetch<Lead>(`/leads/${id}`, { method: 'PATCH', body: input })
      if (!data) throw new Error('更新潛在客戶失敗')
      return data
    } catch (error) {
      handleError(error, {
        context: 'useLeads.updateLead',
        customMessage: apiErrorMessage(error, '更新潛在客戶失敗')
      })
      return null
    }
  }

  /** Returns false on failure, after showing the backend's reason; never throws. */
  const deleteLead = async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/leads/${id}`, { method: 'DELETE' })
      return true
    } catch (error) {
      handleError(error, {
        context: 'useLeads.deleteLead',
        customMessage: apiErrorMessage(error, '刪除潛在客戶失敗')
      })
      return false
    }
  }

  /**
   * Convert a lead into a member. Returns null on failure, after showing the backend's reason.
   */
  const convertToMember = async (leadId: string): Promise<LeadConvertResult | null> => {
    try {
      const { data } = await apiFetch<LeadConvertResult>(`/leads/${leadId}/convert`, { method: 'POST' })
      if (!data) throw new Error('轉換為會員失敗')
      invalidateCache([CACHE_KEYS.MEMBERS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'useLeads.convertToMember',
        customMessage: apiErrorMessage(error, '轉換為會員失敗')
      })
      return null
    }
  }

  /** Assign a lead: a PATCH of assignedToId only (status is left untouched). */
  const assignLead = (leadId: string, assignedToId: string): Promise<Lead | null> =>
    updateLead(leadId, { assignedToId })

  /**
   * Lead statistics: total, count per status, conversion rate.
   */
  const fetchStats = async (options?: { branchId?: string }, force = false): Promise<LeadStats | null> => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightStatsMap.has(key)) {
      return inFlightStatsMap.get(key)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<LeadStats>('/leads/stats/summary', {
          params: { branchId: options?.branchId }
        })
        return data ?? null
      } catch (error) {
        handleError(error, {
          context: 'useLeads.fetchStats',
          customMessage: apiErrorMessage(error, '取得統計資料失敗')
        })
        return null
      } finally {
        inFlightStatsMap.delete(key)
      }
    })()

    inFlightStatsMap.set(key, promise)
    return promise
  }

  // Status helpers
  const getStatusLabel = (status: LeadStatus): string => {
    const labels: Record<LeadStatus, string> = {
      NEW: '新建',
      CONTACTED: '已聯繫',
      QUALIFIED: '有意願',
      TRIAL: '體驗中',
      NEGOTIATION: '洽談中',
      CONVERTED: '已轉換',
      LOST: '已流失'
    }
    return labels[status] || status
  }

  const getStatusVariant = (status: LeadStatus): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<LeadStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      NEW: 'info',
      CONTACTED: 'warning',
      QUALIFIED: 'warning',
      TRIAL: 'accent',
      NEGOTIATION: 'accent',
      CONVERTED: 'success',
      LOST: 'default'
    }
    return variants[status] || 'default'
  }

  const getSourceLabel = (source: LeadSource | null | undefined): string => {
    if (!source) return '未填寫'
    const labels: Record<LeadSource, string> = {
      WALK_IN: '現場來訪',
      REFERRAL: '轉介紹',
      WEBSITE: '官網',
      SOCIAL_MEDIA: '社群媒體',
      EVENT: '活動',
      AD: '廣告',
      OTHER: '其他'
    }
    return labels[source] || source
  }

  return {
    // State
    leads,
    isLoading,
    totalCount,
    // Actions
    fetchLeads,
    getLead,
    createLead,
    updateLead,
    deleteLead,
    convertToMember,
    assignLead,
    fetchStats,
    // Helpers
    getStatusLabel,
    getStatusVariant,
    getSourceLabel
  }
}

export default useLeads
