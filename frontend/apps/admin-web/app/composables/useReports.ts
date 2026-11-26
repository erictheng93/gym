/**
 * Reports API Composable
 * 提供報表資料查詢功能
 *
 * Shapes mirror backend/src/routes/reports.ts and dashboard.ts exactly (camelCase).
 * Revenue counts COMPLETED INCOME payments only; date windows are YYYY-MM-DD with
 * the end day inclusive.
 */

import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useFetch } from '~/composables/core/useFetch'

/** GET /api/reports/revenue → data */
export interface RevenueReport {
  total: number
  byBranch: Array<{ branchId: string; branchName: string; total: number }>
  byDay: Array<{ date: string; total: number }>
}

/** GET /api/reports/member-growth → data */
export interface MemberGrowthReport {
  /** ACTIVE members now (not limited to the window) */
  total: number
  /** Members created inside startDate..endDate; null when no window was sent */
  newMembers: number | null
  byMonth: Array<{ month: string; count: number }>
}

/** GET /api/reports/contract-expiry → data[] */
export interface ExpiringContract {
  id: string
  contractNo: string
  memberId: string
  planId: string
  branchId: string
  status: string
  startDate: string
  endDate: string
  remainingCounts: number | null
  totalAmount: string | number
  paidAmount: string | number
  paymentStatus: string
  member: { id: string; fullName: string; memberCode: string | null; phone: string | null }
  branch: { id: string; name: string }
  daysUntilExpiry: number
}

/** GET /api/reports/member-activity → data */
export interface MemberActivityReport {
  totalCheckIns: number
  byBranch: Array<{ branchId: string; branchName: string; checkInCount: number; uniqueMembers: number }>
  byDay: Array<{ date: string; count: number }>
}

/** GET /api/dashboard/revenue-trend → data[]; period is YYYY-MM (monthly) or YYYY-MM-DD (daily) */
export interface RevenueTrendPoint {
  period: string
  amount: number
}

export interface ReportWindow {
  /** YYYY-MM-DD */
  startDate?: string
  /** YYYY-MM-DD, inclusive */
  endDate?: string
  branchId?: string
}

/** Reports that have a backend file export (GET /api/reports/<type>/export) */
export type ExportableReport = 'revenue' | 'member-growth' | 'contract-expiry' | 'member-activity'
export type ExportFormat = 'csv' | 'xlsx'

// Branch Performance Report Types
export interface BranchPerformancePeriod {
  current: { start: string; end: string }
  previous: { start: string; end: string }
}

export interface BranchPerformanceSummary {
  total_revenue: number
  total_revenue_growth: number
  total_new_members: number
  total_check_ins: number
  total_active_contracts: number
}

export interface BranchPerformanceData {
  branch_id: string
  branch_name: string
  current_period: {
    revenue: number
    new_members: number
    check_ins: number
    active_contracts: number
  }
  previous_period: {
    revenue: number
    new_members: number
    check_ins: number
  }
  growth: {
    revenue_change: number
    members_change: number
    check_ins_change: number
  }
  rank: number
}

export interface BranchRanking {
  branch_id: string
  branch_name: string
  value: number
  rank: number
}

export interface BranchPerformanceReport {
  success: boolean
  period: BranchPerformancePeriod
  summary: BranchPerformanceSummary
  data: BranchPerformanceData[]
  ranking: {
    by_revenue: BranchRanking[]
    by_growth: BranchRanking[]
    by_check_ins: BranchRanking[]
  }
}

// Coach Performance Report Types
export interface CoachPerformanceSummary {
  total_coaches: number
  total_classes_taught: number
  total_students: number
  average_satisfaction: number
}

export interface CoachPerformanceMetrics {
  classes_taught: number
  total_students: number
  satisfaction_rating: number | null
  review_count: number
  renewal_rate: number | null
  attendance_rate: number
  notes_created: number
  lesson_plans_created: number
}

export interface CoachPerformanceData {
  coach_id: string
  coach_name: string
  coach_code: string
  branch_id: string
  branch_name: string
  job_title: string
  metrics: CoachPerformanceMetrics
  details: {
    classes_by_category: Array<{ category: string; count: number }>
  }
}

export interface CoachPerformanceReport {
  success: boolean
  period: { start_date: string; end_date: string }
  summary: CoachPerformanceSummary
  data: CoachPerformanceData[]
}

// In-flight deduplication map for reports
const inFlightReports = new Map<string, Promise<any>>()

type QueryValue = string | number | boolean | undefined

const toQuery = (params: Record<string, QueryValue>) => {
  const query: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }
  return query
}

export const useReports = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl || 'http://localhost:8056'
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  /**
   * GET an endpoint, sharing concurrent identical requests; null (after showing
   * an error) on failure. `pick` selects what to return from the response body.
   */
  const getReport = <T>(
    endpoint: string,
    params: Record<string, QueryValue>,
    context: string,
    pick: (body: any) => T = body => (body?.data ?? null) as T
  ): Promise<T | null> => {
    const query = toQuery(params)
    const key = `${endpoint}?${JSON.stringify(query)}`
    const existing = inFlightReports.get(key)
    if (existing) return existing

    const promise = (async () => {
      try {
        return pick(await apiFetch(endpoint, { params: query })) ?? null
      } catch (error) {
        handleError(error, {
          context: `useReports.${context}`,
          customMessage: MESSAGES.ERRORS.REPORT_FETCH_FAILED
        })
        return null
      } finally {
        inFlightReports.delete(key)
      }
    })()

    inFlightReports.set(key, promise)
    return promise
  }

  /** 營收報表 (COMPLETED INCOME only, end day inclusive) */
  const getRevenueReport = (window: ReportWindow = {}) =>
    getReport<RevenueReport>('/reports/revenue', { ...window }, 'getRevenueReport')

  /** 會員成長報表; `newMembers` is counted inside startDate..endDate */
  const getMemberGrowthReport = (window: ReportWindow & { months?: number } = {}) =>
    getReport<MemberGrowthReport>('/reports/member-growth', { ...window }, 'getMemberGrowthReport')

  /** ACTIVE contracts ending within `days` days */
  const getContractExpiryReport = (days = 30, branchId?: string) =>
    getReport<ExpiringContract[]>('/reports/contract-expiry', { days, branchId }, 'getContractExpiryReport')

  /** 會員活躍度 (check-ins) inside startDate..endDate */
  const getMemberActivityReport = (window: ReportWindow = {}) =>
    getReport<MemberActivityReport>('/reports/member-activity', { ...window }, 'getMemberActivityReport')

  /** Revenue per day (last 30 days) or per month (last 12 months) */
  const getRevenueTrend = (period: 'daily' | 'monthly' = 'monthly', branchId?: string) =>
    getReport<RevenueTrendPoint[]>('/dashboard/revenue-trend', { period, branchId }, 'getRevenueTrend')

  /** 分店業績報表 (the whole body: period, summary, data, ranking) */
  const getBranchPerformanceReport = (
    period: 'week' | 'month' | 'year' = 'month',
    branchId?: string,
    compareWithPrevious: boolean = true
  ) =>
    getReport<BranchPerformanceReport>(
      '/reports/branch-performance',
      { period, branchId, compareWithPrevious: String(compareWithPrevious) },
      'getBranchPerformanceReport',
      body => body as BranchPerformanceReport
    )

  /** 教練績效報表 (the whole body: period, summary, data) */
  const getCoachPerformanceReport = (
    period: 'month' | 'quarter' | 'year' = 'month',
    coachId?: string,
    branchId?: string
  ) =>
    getReport<CoachPerformanceReport>(
      '/reports/coach-performance',
      { period, coachId, branchId },
      'getCoachPerformanceReport',
      body => body as CoachPerformanceReport
    )

  /**
   * Download the file the backend export endpoint generates.
   * Returns false (after showing an error) when the request fails.
   */
  const downloadReport = async (
    type: ExportableReport,
    params: Record<string, string | number | undefined> = {},
    format: ExportFormat = 'xlsx'
  ): Promise<boolean> => {
    try {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(toQuery({ ...params, format }))) {
        search.append(key, String(value))
      }
      const response = await fetch(`${baseURL}/api/reports/${type}/export?${search}`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match?.[1] ? decodeURIComponent(match[1]) : `${type}.${format}`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      return true
    } catch (error) {
      handleError(error, {
        context: 'useReports.downloadReport',
        customMessage: MESSAGES.ERRORS.REPORT_FETCH_FAILED
      })
      return false
    }
  }

  return {
    getRevenueReport,
    getMemberGrowthReport,
    getContractExpiryReport,
    getMemberActivityReport,
    getRevenueTrend,
    getBranchPerformanceReport,
    getCoachPerformanceReport,
    downloadReport
  }
}
