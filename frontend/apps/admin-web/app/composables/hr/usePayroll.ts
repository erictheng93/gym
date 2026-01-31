/**
 * usePayroll - 薪資管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'

export interface SalaryRecord {
  id: string
  employee_id: string
  employee?: {
    id: string
    full_name: string
    employee_code: string
    base_salary?: number
    job_title?: { name: string }
    branch?: { name: string }
  }
  period: string
  base_salary: number
  overtime_hours: number
  overtime_pay: number
  commission: number
  bonus: number
  deductions: number
  net_salary: number
  hourly_rate?: number
  work_days: number
  leave_days: Record<string, number> | null
  notes: string | null
  status: 'PENDING' | 'APPROVED' | 'PAID'
  approved_by: string | null
  approved_at: string | null
  paid_at: string | null
  date_created: string
}

export interface PromotionRecord {
  id: string
  employee_id: string
  employee?: {
    id: string
    full_name: string
    employee_code: string
  }
  type: 'PROMOTION' | 'TRANSFER' | 'DEMOTION'
  from_job_title_id: string | null
  to_job_title_id: string | null
  from_job_title?: { name: string }
  to_job_title?: { name: string }
  from_branch_id: string | null
  to_branch_id: string | null
  from_branch?: { name: string }
  to_branch?: { name: string }
  effective_date: string
  new_base_salary: number | null
  reason: string | null
  date_created: string
}

export interface PayrollSummary {
  period: string
  total_employees: number
  totals: {
    base_salary: number
    commission: number
    bonus: number
    overtime_pay: number
    deductions: number
    net_salary: number
  }
  by_status: {
    pending: number
    approved: number
    paid: number
  }
}

export const usePayroll = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()

  // State
  const salaryRecords = useState<SalaryRecord[]>('salary_records', () => [])
  const currentSalaryRecord = useState<SalaryRecord | null>('current_salary_record', () => null)
  const promotions = useState<PromotionRecord[]>('promotion_records', () => [])
  const promotionCount = useState('promotion_count', () => 0)
  const isLoading = useState('payroll_loading', () => false)
  const isPromotionLoading = useState('promotion_loading', () => false)
  const totalCount = useState('payroll_total', () => 0)

  const apiBase = `${config.public.apiUrl}/gym`

  /**
   * Fetch salary records
   */
  const fetchSalaryRecords = async (options?: {
    employee_id?: string
    period?: string
    status?: string
    branch_id?: string
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
        data: SalaryRecord[]
        meta: { total: number }
      }>(`${apiBase}/payroll/salary-records?${params}`)

      if (response.success) {
        salaryRecords.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'usePayroll.fetchSalaryRecords',
        customMessage: '取得薪資紀錄失敗'
      })
      salaryRecords.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch single salary record
   */
  const fetchSalaryRecord = async (id: string) => {
    isLoading.value = true
    try {
      const response = await $fetch<{ success: boolean; data: SalaryRecord }>(
        `${apiBase}/payroll/salary-records/${id}`
      )
      if (response.success) {
        currentSalaryRecord.value = response.data
      }
    } catch (error) {
      handleError(error, {
        context: 'usePayroll.fetchSalaryRecord',
        customMessage: '取得薪資詳情失敗'
      })
      currentSalaryRecord.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Generate salary records for a period
   */
  const generateSalaryRecords = async (data: {
    period: string
    branch_id?: string
    employee_ids?: string[]
  }): Promise<{ generated: number; records: SalaryRecord[] }> => {
    const response = await $fetch<{
      success: boolean
      data: { generated: number; records: SalaryRecord[] }
    }>(`${apiBase}/payroll/generate`, {
      method: 'POST',
      body: data
    })
    if (!response.success) {
      throw new Error('產生薪資紀錄失敗')
    }
    return response.data
  }

  /**
   * Update salary record (adjustments)
   */
  const updateSalaryRecord = async (
    id: string,
    data: {
      overtime_hours?: number
      bonus?: number
      deductions?: number
      notes?: string
    }
  ): Promise<SalaryRecord> => {
    const response = await $fetch<{ success: boolean; data: SalaryRecord }>(
      `${apiBase}/payroll/salary-records/${id}`,
      {
        method: 'PATCH',
        body: data
      }
    )
    if (!response.success) {
      throw new Error('調整薪資失敗')
    }
    return response.data
  }

  /**
   * Approve salary record
   */
  const approveSalary = async (id: string): Promise<SalaryRecord> => {
    const response = await $fetch<{ success: boolean; data: SalaryRecord }>(
      `${apiBase}/payroll/salary-records/${id}/approve`,
      { method: 'POST' }
    )
    if (!response.success) {
      throw new Error('核准薪資失敗')
    }
    return response.data
  }

  /**
   * Batch approve salary records
   */
  const batchApproveSalary = async (ids: string[]): Promise<{ approved_count: number }> => {
    const response = await $fetch<{ success: boolean; data: { approved_count: number } }>(
      `${apiBase}/payroll/batch-approve`,
      {
        method: 'POST',
        body: { ids }
      }
    )
    if (!response.success) {
      throw new Error('批次核准失敗')
    }
    return response.data
  }

  /**
   * Mark salary as paid
   */
  const markAsPaid = async (id: string): Promise<SalaryRecord> => {
    const response = await $fetch<{ success: boolean; data: SalaryRecord }>(
      `${apiBase}/payroll/salary-records/${id}/pay`,
      { method: 'POST' }
    )
    if (!response.success) {
      throw new Error('標記已發放失敗')
    }
    return response.data
  }

  /**
   * Export payroll report
   */
  const exportPayroll = async (options: {
    period: string
    branch_id?: string
    format?: string
    include_details?: boolean
  }): Promise<Blob> => {
    const params = new URLSearchParams()
    params.append('period', options.period)
    if (options.branch_id) params.append('branch_id', options.branch_id)
    if (options.format) params.append('format', options.format)
    if (options.include_details !== undefined) params.append('include_details', String(options.include_details))

    const response = await $fetch<Blob>(`${apiBase}/payroll/export?${params}`, {
      responseType: 'blob'
    })
    return response
  }

  /**
   * Fetch promotion records
   */
  const fetchPromotions = async (options?: {
    employee_id?: string
    type?: string
    page?: number
    limit?: number
  }) => {
    isPromotionLoading.value = true
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
        data: PromotionRecord[]
        meta: { total: number }
      }>(`${apiBase}/payroll/promotions?${params}`)

      if (response.success) {
        promotions.value = response.data
        promotionCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'usePayroll.fetchPromotions',
        customMessage: '取得異動紀錄失敗'
      })
      promotions.value = []
      promotionCount.value = 0
    } finally {
      isPromotionLoading.value = false
    }
  }

  /**
   * Create promotion record
   */
  const createPromotion = async (data: {
    employee_id: string
    type: string
    effective_date: string
    to_job_title_id?: string
    to_branch_id?: string
    new_base_salary?: number | null
    reason?: string
  }): Promise<PromotionRecord> => {
    const response = await $fetch<{ success: boolean; data: PromotionRecord }>(
      `${apiBase}/payroll/promotions`,
      {
        method: 'POST',
        body: data
      }
    )
    if (!response.success) {
      throw new Error('建立異動紀錄失敗')
    }
    return response.data
  }

  // Helper functions
  const getStatusLabel = (status: SalaryRecord['status']): string => {
    const labels: Record<SalaryRecord['status'], string> = {
      PENDING: '待審核',
      APPROVED: '已核准',
      PAID: '已發放'
    }
    return labels[status] || status
  }

  const getStatusVariant = (status: SalaryRecord['status']): string => {
    const variants: Record<SalaryRecord['status'], string> = {
      PENDING: 'warning',
      APPROVED: 'info',
      PAID: 'success'
    }
    return variants[status] || 'secondary'
  }

  const getPromotionTypeLabel = (type: PromotionRecord['type']): string => {
    const labels: Record<PromotionRecord['type'], string> = {
      PROMOTION: '升遷',
      TRANSFER: '調動',
      DEMOTION: '降職'
    }
    return labels[type] || type
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0
    }).format(amount)
  }

  return {
    // State
    salaryRecords,
    currentSalaryRecord,
    promotions,
    promotionCount,
    isLoading,
    isPromotionLoading,
    totalCount,
    // Actions
    fetchSalaryRecords,
    fetchSalaryRecord,
    generateSalaryRecords,
    updateSalaryRecord,
    approveSalary,
    batchApproveSalary,
    markAsPaid,
    exportPayroll,
    fetchPromotions,
    createPromotion,
    // Helpers
    getStatusLabel,
    getStatusVariant,
    getPromotionTypeLabel,
    formatCurrency
  }
}

export default usePayroll
