/**
 * Reports API Composable
 * 提供報表資料查詢功能
 */

export interface ReportPeriod {
  start_date: string
  end_date: string
}

export interface RevenueSummary {
  total_income: number
  total_refund: number
  net_revenue: number
  total_transactions: number
  average_daily_revenue: string
}

export interface RevenueData {
  payment_day: string
  branch_id: string
  branch_name: string
  transaction_count: string
  total_income: string
  total_refund: string
  net_revenue: string
  unique_members: string
  cash_income: string
  credit_card_income: string
  bank_transfer_income: string
  line_pay_income: string
}

export interface RevenueReport {
  success: boolean
  period: ReportPeriod
  summary: RevenueSummary
  data: RevenueData[]
}

export interface MemberGrowthSummary {
  total_new_members: number
  total_members: number
  average_daily_growth: string
  gender_distribution: {
    male: number
    female: number
  }
}

export interface MemberGrowthData {
  join_day: string
  branch_id: string
  branch_name: string
  new_members: string
  active_members: string
  male_count: string
  female_count: string
  sales_persons_involved: string
}

export interface MemberGrowthReport {
  success: boolean
  period: ReportPeriod
  summary: MemberGrowthSummary
  data: MemberGrowthData[]
}

export interface ContractExpiryItem {
  contract_id: string
  contract_no: string
  member_id: string
  member_name: string
  member_code: string
  member_phone: string
  member_email: string
  branch_id: string
  branch_name: string
  plan_name: string
  start_date: string
  end_date: string
  contract_status: string
  payment_status: string
  days_until_expiry: number
  sales_person_id: string
  sales_person_name: string
  total_amount: string
  total_paid: string
  outstanding_amount: string
}

export interface ContractExpiryReport {
  success: boolean
  summary: {
    total_expiring: number
    urgent_count: number
    soon_count: number
    upcoming_count: number
  }
  grouped: {
    urgent: ContractExpiryItem[]
    soon: ContractExpiryItem[]
    upcoming: ContractExpiryItem[]
  }
  data: ContractExpiryItem[]
}

export interface MemberActivitySummary {
  total_check_ins: number
  average_daily_check_ins: string
  method_distribution: {
    qr_code: number
    manual: number
    card: number
  }
}

export interface MemberActivityData {
  activity_day: string
  branch_id: string
  branch_name: string
  total_check_ins: string
  unique_members: string
  qr_code_count: string
  manual_count: string
  card_count: string
  morning_count: string
  afternoon_count: string
  evening_count: string
}

export interface MemberActivityReport {
  success: boolean
  period: ReportPeriod
  summary: MemberActivitySummary
  data: MemberActivityData[]
}

export const useReports = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.directusUrl || 'http://localhost:8055'

  /**
   * 獲取營收報表
   */
  const getRevenueReport = async (
    startDate?: string,
    endDate?: string,
    branchId?: string
  ): Promise<RevenueReport> => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (branchId) params.append('branch_id', branchId)

    const response = await fetch(`${baseURL}/gym/reports/revenue?${params}`)
    return response.json()
  }

  /**
   * 獲取會員成長報表
   */
  const getMemberGrowthReport = async (
    startDate?: string,
    endDate?: string,
    branchId?: string
  ): Promise<MemberGrowthReport> => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (branchId) params.append('branch_id', branchId)

    const response = await fetch(`${baseURL}/gym/reports/member-growth?${params}`)
    return response.json()
  }

  /**
   * 獲取合約到期提醒
   */
  const getContractExpiryReport = async (
    daysAhead: number = 30,
    branchId?: string,
    limit: number = 100
  ): Promise<ContractExpiryReport> => {
    const params = new URLSearchParams()
    params.append('days_ahead', daysAhead.toString())
    if (branchId) params.append('branch_id', branchId)
    params.append('limit', limit.toString())

    const response = await fetch(`${baseURL}/gym/reports/contract-expiry?${params}`)
    return response.json()
  }

  /**
   * 獲取會員活躍度報表
   */
  const getMemberActivityReport = async (
    startDate?: string,
    endDate?: string,
    branchId?: string
  ): Promise<MemberActivityReport> => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (branchId) params.append('branch_id', branchId)

    const response = await fetch(`${baseURL}/gym/reports/member-activity?${params}`)
    return response.json()
  }

  /**
   * 刷新報表資料
   */
  const refreshReports = async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${baseURL}/gym/reports/refresh`, {
      method: 'POST'
    })
    return response.json()
  }

  return {
    getRevenueReport,
    getMemberGrowthReport,
    getContractExpiryReport,
    getMemberActivityReport,
    refreshReports
  }
}
