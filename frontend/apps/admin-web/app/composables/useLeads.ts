/**
 * useLeads - 潛在客戶管理 composable
 * CRM 功能：Leads CRUD、活動紀錄、轉換、分析
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

export interface Lead {
  id: string
  name: string
  phone: string
  email: string | null
  source: 'FB_AD' | 'IG_AD' | 'GOOGLE_AD' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL'
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  branch_id: string
  assigned_to: string | { id: string; full_name: string; employee_code?: string } | null
  status: 'NEW' | 'CONTACTED' | 'TRIAL_BOOKED' | 'VISITED' | 'CONVERTED' | 'LOST'
  interest: Record<string, unknown> | null
  notes: string | null
  converted_member_id: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
  date_created?: string // Alias for created_at
  // Joined fields
  assigned_to_name?: string
  branch_name?: string
  branch?: { id: string; name: string }
  converted_member_name?: string
  activities?: LeadActivity[]
}

export interface LeadActivity {
  id: string
  lead_id: string
  activity_type: 'CALL' | 'SMS' | 'EMAIL' | 'VISIT' | 'TRIAL'
  content: string
  result: string | null
  next_action: string | null
  next_action_date: string | null
  created_by: string | { id: string; full_name: string } | null
  created_at: string
  date_created?: string // Alias for created_at
  created_by_name?: string
}

export interface LeadAnalytics {
  total_leads?: number
  converted_leads?: number
  by_source: Array<{
    source: string
    total: number
    count?: number // Alias for total
    converted: number
    conversion_rate: number
  }>
  by_status: Array<{
    status: string
    count: number
  }>
  average_conversion_days: number
  avg_conversion_days?: number // Alias for average_conversion_days
  source_conversion?: Array<{
    source: string
    total: number
    converted: number
    conversion_rate: number
  }>
  top_performers: Array<{
    id: string
    full_name: string
    total_leads: number
    converted: number
    conversion_rate: number
  }>
}

export const useLeads = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()

  // State
  const leads = useState<Lead[]>('leads', () => [])
  const isLoading = useState('leads_loading', () => false)
  const totalCount = useState('leads_total', () => 0)

  const apiUrl = config.public.apiUrl

  /**
   * Fetch leads with filters
   */
  const fetchLeads = async (options?: {
    status?: string
    source?: string
    assignedTo?: string
    branchId?: string
    search?: string
    page?: number
    limit?: number
  }) => {
    isLoading.value = true
    const { status, source, assignedTo, branchId, search, page = 1, limit = 20 } = options || {}

    try {
      const params = new URLSearchParams()
      if (status) params.append('status', status)
      if (source) params.append('source', source)
      if (assignedTo) params.append('assigned_to', assignedTo)
      if (branchId) params.append('branch_id', branchId)
      if (search) params.append('search', search)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: Lead[]
        meta: { total: number }
      }>(`${apiUrl}/leads?${params}`)

      if (response.success) {
        leads.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useLeads.fetchLeads',
        customMessage: '取得潛在客戶列表失敗'
      })
      leads.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get single lead with activities
   */
  const getLead = async (id: string): Promise<Lead | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Lead }>(`${apiUrl}/leads/${id}`)
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.getLead',
        customMessage: '取得潛在客戶詳情失敗'
      })
      return null
    }
  }

  /**
   * Create new lead
   */
  const createLead = async (data: Partial<Lead>): Promise<Lead | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Lead }>(`${apiUrl}/leads`, {
        method: 'POST',
        body: data
      })
      if (response.success) {
        invalidateCache([CACHE_KEYS.MEMBERS])
        return response.data
      }
      return null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.createLead',
        customMessage: '建立潛在客戶失敗'
      })
      return null
    }
  }

  /**
   * Update lead
   */
  const updateLead = async (id: string, data: Partial<Lead>): Promise<Lead | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Lead }>(`${apiUrl}/leads/${id}`, {
        method: 'PATCH',
        body: data
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.updateLead',
        customMessage: '更新潛在客戶失敗'
      })
      return null
    }
  }

  /**
   * Delete lead (mark as LOST)
   */
  const deleteLead = async (id: string): Promise<boolean> => {
    try {
      const response = await $fetch<{ success: boolean }>(`${apiUrl}/leads/${id}`, {
        method: 'DELETE'
      })
      return response.success
    } catch (error) {
      handleError(error, {
        context: 'useLeads.deleteLead',
        customMessage: '刪除潛在客戶失敗'
      })
      return false
    }
  }

  /**
   * Add activity to lead
   */
  const addActivity = async (
    leadId: string,
    activity: {
      activity_type: string
      content: string
      result?: string
      next_action?: string
      next_action_date?: string
      created_by?: string
    }
  ): Promise<LeadActivity | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: LeadActivity }>(
        `${apiUrl}/leads/${leadId}/activities`,
        {
          method: 'POST',
          body: activity
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.addActivity',
        customMessage: '新增跟進紀錄失敗'
      })
      return null
    }
  }

  /**
   * Convert lead to member
   */
  const convertToMember = async (
    leadId: string,
    convertedBy?: string
  ): Promise<{ lead: Lead; member: { id: string; [key: string]: unknown }; is_new_member: boolean; member_id?: string } | null> => {
    try {
      const response = await $fetch<{
        success: boolean
        data: { lead: Lead; member: { id: string; [key: string]: unknown }; is_new_member: boolean; member_id?: string }
      }>(`${apiUrl}/leads/${leadId}/convert`, {
        method: 'POST',
        body: { converted_by: convertedBy }
      })
      if (response.success) {
        invalidateCache([CACHE_KEYS.MEMBERS])
        return response.data
      }
      return null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.convertToMember',
        customMessage: '轉換為會員失敗'
      })
      return null
    }
  }

  /**
   * Assign lead to employee
   */
  const assignLead = async (
    leadId: string,
    assignedTo: string,
    assignedBy?: string
  ): Promise<Lead | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: Lead }>(
        `${apiUrl}/leads/${leadId}/assign`,
        {
          method: 'POST',
          body: { assigned_to: assignedTo, assigned_by: assignedBy }
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.assignLead',
        customMessage: '指派潛在客戶失敗'
      })
      return null
    }
  }

  /**
   * Get lead analytics
   */
  const fetchAnalytics = async (options?: {
    branchId?: string
    startDate?: string
    endDate?: string
    period?: string
  }): Promise<LeadAnalytics | null> => {
    try {
      const params = new URLSearchParams()
      if (options?.branchId) params.append('branch_id', options.branchId)
      if (options?.startDate) params.append('start_date', options.startDate)
      if (options?.endDate) params.append('end_date', options.endDate)
      if (options?.period) params.append('period', options.period)

      const response = await $fetch<{ success: boolean; data: LeadAnalytics }>(
        `${apiUrl}/leads/analytics?${params}`
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useLeads.fetchAnalytics',
        customMessage: '取得分析資料失敗'
      })
      return null
    }
  }

  // Status helpers
  const getStatusLabel = (status: Lead['status']): string => {
    const labels: Record<Lead['status'], string> = {
      NEW: '新建',
      CONTACTED: '已聯繫',
      TRIAL_BOOKED: '已預約體驗',
      VISITED: '已到訪',
      CONVERTED: '已轉換',
      LOST: '已流失'
    }
    return labels[status] || status
  }

  const getStatusColor = (status: Lead['status']): string => {
    const colors: Record<Lead['status'], string> = {
      NEW: 'bg-blue-100 text-blue-800',
      CONTACTED: 'bg-yellow-100 text-yellow-800',
      TRIAL_BOOKED: 'bg-purple-100 text-purple-800',
      VISITED: 'bg-green-100 text-green-800',
      CONVERTED: 'bg-emerald-100 text-emerald-800',
      LOST: 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusVariant = (status: Lead['status']): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    const variants: Record<Lead['status'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
      NEW: 'info',
      CONTACTED: 'warning',
      TRIAL_BOOKED: 'accent',
      VISITED: 'success',
      CONVERTED: 'success',
      LOST: 'default'
    }
    return variants[status] || 'default'
  }

  const getSourceLabel = (source: Lead['source']): string => {
    const labels: Record<Lead['source'], string> = {
      FB_AD: 'Facebook 廣告',
      IG_AD: 'Instagram 廣告',
      GOOGLE_AD: 'Google 廣告',
      WEBSITE: '官網',
      WALK_IN: '現場來訪',
      REFERRAL: '轉介紹'
    }
    return labels[source] || source
  }

  const getActivityTypeLabel = (type: LeadActivity['activity_type']): string => {
    const labels: Record<LeadActivity['activity_type'], string> = {
      CALL: '電話',
      SMS: '簡訊',
      EMAIL: '郵件',
      VISIT: '到訪',
      TRIAL: '體驗'
    }
    return labels[type] || type
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
    addActivity,
    convertToMember,
    assignLead,
    fetchAnalytics,
    // Helpers
    getStatusLabel,
    getStatusColor,
    getStatusVariant,
    getSourceLabel,
    getActivityTypeLabel
  }
}

export default useLeads
