/**
 * Dashboard API Composable
 * 提供戰情室 Dashboard 資料查詢與即時更新功能
 */

import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core'

// ============================================
// Types
// ============================================

export interface DashboardPeriod {
  type: 'today' | 'week' | 'month' | 'year'
  start_date: string
  end_date: string
}

export interface RevenueKPIs {
  today: number
  mtd: number
  ytd: number
  period: number
  change: number
  transactions: {
    today: number
    period: number
  }
  by_payment_method: Array<{
    payment_method: string
    amount: number
    count: number
  }>
  by_branch: Array<{
    branch_id: string
    branch_name: string
    revenue: number
    transactions: number
  }>
}

export interface MemberKPIs {
  total: number
  active: number
  new: number
  churned: number
  active_rate: number
  by_gender: {
    male: number
    female: number
  }
  by_age: Array<{
    age_group: string
    count: number
  }>
  by_branch: Array<{
    branch_id: string
    branch_name: string
    total: number
    active: number
  }>
}

export interface ContractKPIs {
  active: number
  expiring_7: number
  expiring_30: number
  expiring_90: number
  renewal_rate: number
  avg_value: number
  by_type: Array<{
    contract_type: string
    plan_name: string
    count: number
    total_value: number
  }>
}

export interface OperationsKPIs {
  today_checkins: number
  period_checkins: number
  peak_hour: number
  hourly_distribution: number[]
  class_attendance_rate: number
  by_branch: Array<{
    branch_id: string
    branch_name: string
    today_checkins: number
    period_checkins: number
  }>
}

export interface DashboardKPIs {
  success: boolean
  period: DashboardPeriod
  revenue: RevenueKPIs
  members: MemberKPIs
  contracts: ContractKPIs
  operations: OperationsKPIs
  generated_at: string
}

export interface LiveMetrics {
  timestamp: string
  today_checkins: number
  today_revenue: number
  recent_checkins: Array<{
    id: string
    name: string
    time: string
    branch: string
  }>
}

export interface ContractAlert {
  contract_id: string
  contract_no: string
  days_until_expiry: number
  member_name: string
  member_phone: string
  plan_name: string
  branch_name: string
  urgency: 'URGENT' | 'SOON' | 'UPCOMING'
}

export interface ContractAlertsResponse {
  success: boolean
  summary: {
    total: number
    urgent: number
    soon: number
    upcoming: number
  }
  grouped: {
    urgent: ContractAlert[]
    soon: ContractAlert[]
    upcoming: ContractAlert[]
  }
  alerts: ContractAlert[]
}

export interface RevenueTarget {
  id: string
  branch_id: string
  branch_name: string
  year: number
  month: number
  target_amount: number
}

// ============================================
// Composable
// ============================================

export const useDashboard = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.directusUrl || 'http://localhost:8055'
  const { handleError } = useErrorHandler()
  const { $directus } = useNuxtApp()

  // State
  const isLoading = ref(false)
  const kpis = ref<DashboardKPIs | null>(null)
  const liveMetrics = ref<LiveMetrics | null>(null)
  const contractAlerts = ref<ContractAlertsResponse | null>(null)
  const revenueTargets = ref<RevenueTarget[]>([])

  // SSE connection
  let eventSource: EventSource | null = null

  /**
   * 帶認證的 fetch 請求
   */
  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await $directus.getToken()

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
      }
    })
  }

  /**
   * 獲取 Dashboard KPIs
   */
  const fetchKPIs = async (
    period: 'today' | 'week' | 'month' | 'year' = 'today',
    branchId?: string
  ): Promise<DashboardKPIs | null> => {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      params.append('period', period)
      if (branchId) params.append('branch_id', branchId)

      const response = await authFetch(`${baseURL}/gym/dashboard/kpis?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      kpis.value = data
      return data
    } catch (error) {
      handleError(error, {
        context: 'useDashboard.fetchKPIs',
        customMessage: MESSAGES.ERRORS.DASHBOARD_LOAD_FAILED
      })
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取合約到期警示
   */
  const fetchContractAlerts = async (
    daysAhead: number = 30,
    branchId?: string,
    limit: number = 50
  ): Promise<ContractAlertsResponse | null> => {
    try {
      const params = new URLSearchParams()
      params.append('days_ahead', daysAhead.toString())
      if (branchId) params.append('branch_id', branchId)
      params.append('limit', limit.toString())

      const response = await authFetch(`${baseURL}/gym/dashboard/contract-alerts?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      contractAlerts.value = data
      return data
    } catch (error) {
      handleError(error, {
        context: 'useDashboard.fetchContractAlerts',
        customMessage: MESSAGES.ERRORS.REPORT_FETCH_FAILED
      })
      return null
    }
  }

  /**
   * 獲取營收目標
   */
  const fetchRevenueTargets = async (
    year?: number,
    branchId?: string
  ): Promise<RevenueTarget[]> => {
    try {
      const params = new URLSearchParams()
      if (year) params.append('year', year.toString())
      if (branchId) params.append('branch_id', branchId)

      const response = await authFetch(`${baseURL}/gym/dashboard/revenue-targets?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      revenueTargets.value = data.targets || []
      return revenueTargets.value
    } catch (error) {
      handleError(error, {
        context: 'useDashboard.fetchRevenueTargets',
        customMessage: MESSAGES.ERRORS.REPORT_FETCH_FAILED
      })
      return []
    }
  }

  /**
   * 設定營收目標 (管理員)
   */
  const setRevenueTarget = async (
    branchId: string,
    year: number,
    month: number,
    targetAmount: number
  ): Promise<boolean> => {
    try {
      const response = await authFetch(`${baseURL}/gym/dashboard/revenue-targets`, {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          year,
          month,
          target_amount: targetAmount
        })
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      // 重新載入目標
      await fetchRevenueTargets(year, branchId)
      return true
    } catch (error) {
      handleError(error, {
        context: 'useDashboard.setRevenueTarget',
        customMessage: '設定營收目標失敗'
      })
      return false
    }
  }

  // Reconnection state for live updates
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_BASE_DELAY = 5000 // 5 seconds
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  /**
   * 啟動 SSE 即時更新連線 (with auto-reconnect)
   */
  const startLiveUpdates = (branchId?: string) => {
    // 先關閉現有連線
    stopLiveUpdates()
    reconnectAttempts = 0

    const token = $directus.getToken()
    if (!token) {
      console.warn('[Dashboard] No token available for SSE')
      return
    }

    const params = new URLSearchParams()
    if (branchId) params.append('branch_id', branchId)

    // 使用 polling 替代 SSE（EventSource 不支援自訂 headers）
    // 包含自動重連邏輯
    const startPolling = () => {
      const pollInterval = setInterval(async () => {
        try {
          const response = await authFetch(`${baseURL}/gym/dashboard/kpis?period=today${branchId ? `&branch_id=${branchId}` : ''}`)
          if (response.ok) {
            const data = await response.json()
            liveMetrics.value = {
              timestamp: new Date().toISOString(),
              today_checkins: data.operations?.today_checkins || 0,
              today_revenue: data.revenue?.today || 0,
              recent_checkins: []
            }
            // 成功後重設重連計數
            reconnectAttempts = 0
          } else if (response.status === 401) {
            // Token 過期，停止 polling
            console.warn('[Dashboard] Token expired, stopping live updates')
            stopLiveUpdates()
          }
        } catch (err) {
          console.error('[Dashboard] Live update poll error:', err)
          reconnectAttempts++

          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[Dashboard] Max reconnect attempts reached, stopping live updates')
            stopLiveUpdates()
          }
        }
      }, 30000) // 每30秒更新

      // 保存 interval ID 以便清理
      ;(eventSource as any) = {
        close: () => {
          clearInterval(pollInterval)
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout)
            reconnectTimeout = null
          }
        }
      }
    }

    try {
      startPolling()

      // 立即執行一次
      fetchKPIs('today', branchId).then(data => {
        if (data) {
          liveMetrics.value = {
            timestamp: new Date().toISOString(),
            today_checkins: data.operations?.today_checkins || 0,
            today_revenue: data.revenue?.today || 0,
            recent_checkins: []
          }
        }
      })
    } catch (error) {
      console.error('[Dashboard] Failed to start live updates:', error)

      // 嘗試重連
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)
        console.log(`[Dashboard] Attempting reconnect in ${delay}ms...`)
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++
          startLiveUpdates(branchId)
        }, delay)
      }
    }
  }

  /**
   * 停止 SSE 即時更新連線
   */
  const stopLiveUpdates = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  /**
   * 刷新所有數據
   */
  const refreshAll = async (
    period: 'today' | 'week' | 'month' | 'year' = 'today',
    branchId?: string
  ) => {
    await Promise.all([
      fetchKPIs(period, branchId),
      fetchContractAlerts(30, branchId),
      fetchRevenueTargets(new Date().getFullYear(), branchId)
    ])
  }

  /**
   * 匯出報表數據
   */
  const exportData = async (
    type: 'kpis' | 'member-analytics' | 'revenue' | 'contracts' | 'checkins',
    format: 'csv' | 'json' = 'csv',
    days: number = 30,
    branchId?: string
  ): Promise<boolean> => {
    try {
      const params = new URLSearchParams()
      params.append('type', type)
      params.append('format', format)
      params.append('days', days.toString())
      if (branchId) params.append('branch_id', branchId)

      const response = await authFetch(`${baseURL}/gym/dashboard/export?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      return true
    } catch (error) {
      handleError(error, {
        context: 'useDashboard.exportData',
        customMessage: '匯出失敗'
      })
      return false
    }
  }

  // 清理
  onUnmounted(() => {
    stopLiveUpdates()
  })

  return {
    // State
    isLoading,
    kpis,
    liveMetrics,
    contractAlerts,
    revenueTargets,

    // Methods
    fetchKPIs,
    fetchContractAlerts,
    fetchRevenueTargets,
    setRevenueTarget,
    startLiveUpdates,
    stopLiveUpdates,
    refreshAll,
    exportData
  }
}
