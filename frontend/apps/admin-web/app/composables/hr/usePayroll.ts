/**
 * usePayroll - 薪資管理 composable
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useFetch } from '~/composables/core/useFetch'
import { apiErrorMessage } from '~/utils/api-error'

// =============================================================================
// Wire format of backend/src/routes/hr-payroll.ts: the salary / promotion routes answer in
// snake_case with numeric money fields (parseFloat'ed server side) and a `meta.total` count.
// Only POST /promotions returns the raw camelCase row (PromotionCreated).
// The PATCH / approve / pay routes answer `{ success, message }` without `data`.
// =============================================================================

export interface SalaryRecord {
  id: string
  employee_id: string
  employee?: {
    id: string
    full_name: string
    employee_code: string
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

/** Row of GET /api/payroll/promotions: ids only, no from/to titles or branches */
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
  from_branch_id: string | null
  to_branch_id: string | null
  effective_date: string
  new_base_salary: number | null
  reason: string | null
  date_created: string | null
}

/** Body of POST /api/payroll/promotions */
export interface CreatePromotionInput {
  employee_id: string
  type: PromotionRecord['type']
  effective_date: string
  to_job_title_id?: string
  to_branch_id?: string
  new_base_salary?: number | null
  reason?: string
}

/** The raw row POST /api/payroll/promotions returns (camelCase, decimals as strings) */
export interface PromotionCreated {
  id: string
  employeeId: string
  type: PromotionRecord['type']
  fromJobTitleId: string | null
  toJobTitleId: string | null
  fromBranchId: string | null
  toBranchId: string | null
  effectiveDate: string
  newBaseSalary: string | null
  reason: string | null
  createdBy: string | null
  createdAt: string
  tenantId: string | null
}

/** Body of PATCH /api/payroll/salary-records/:id (updateSchema); commission is accepted too */
export interface UpdateSalaryInput {
  overtime_hours?: number
  commission?: number
  bonus?: number
  deductions?: number
  notes?: string
}

interface ListResponse<T> {
  success: boolean
  data: T[]
  meta?: { total: number }
}

const inFlightSalaryRecordsMap = new Map<string, Promise<void>>()
const inFlightSingleSalaryRecordMap = new Map<string, Promise<void>>()
const inFlightPromotionsMap = new Map<string, Promise<void>>()

const SALARY_STATUS_LABELS: Record<SalaryRecord['status'], string> = {
  PENDING: '待審核',
  APPROVED: '已核准',
  PAID: '已發放'
}

const SALARY_STATUS_VARIANTS: Record<SalaryRecord['status'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success'
}

const PROMOTION_TYPE_LABELS: Record<PromotionRecord['type'], string> = {
  PROMOTION: '升遷',
  TRANSFER: '調動',
  DEMOTION: '降職'
}

const payrollCurrencyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  minimumFractionDigits: 0
})

export const usePayroll = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  // State
  const salaryRecords = useState<SalaryRecord[]>('salary_records', () => [])
  const currentSalaryRecord = useState<SalaryRecord | null>('current_salary_record', () => null)
  const promotions = useState<PromotionRecord[]>('promotion_records', () => [])
  const promotionCount = useState('promotion_count', () => 0)
  const isLoading = useState('payroll_loading', () => false)
  const isPromotionLoading = useState('promotion_loading', () => false)
  const totalCount = useState('payroll_total', () => 0)

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
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force) {
      const existing = inFlightSalaryRecordsMap.get(key)
      if (existing) return existing
    }

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, ...filters } = options || {}

      try {
        const response = await apiFetch<SalaryRecord[]>('/payroll/salary-records', {
          params: { ...filters, limit, offset: (page - 1) * limit }
        }) as unknown as ListResponse<SalaryRecord>

        salaryRecords.value = response.data || []
        totalCount.value = Number(response.meta?.total ?? salaryRecords.value.length)
      } catch (error) {
        handleError(error, {
          context: 'usePayroll.fetchSalaryRecords',
          customMessage: apiErrorMessage(error, '取得薪資紀錄失敗')
        })
        salaryRecords.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightSalaryRecordsMap.delete(key)
      }
    })()

    inFlightSalaryRecordsMap.set(key, promise)
    return promise
  }

  /**
   * Fetch single salary record
   */
  const fetchSalaryRecord = async (id: string) => {
    const existing = inFlightSingleSalaryRecordMap.get(id)
    if (existing) return existing

    const promise = (async () => {
      isLoading.value = true
      try {
        const response = await apiFetch<SalaryRecord>(`/payroll/salary-records/${id}`)
        currentSalaryRecord.value = response.data ?? null
      } catch (error) {
        handleError(error, {
          context: 'usePayroll.fetchSalaryRecord',
          customMessage: apiErrorMessage(error, '取得薪資詳情失敗')
        })
        currentSalaryRecord.value = null
      } finally {
        isLoading.value = false
        inFlightSingleSalaryRecordMap.delete(id)
      }
    })()

    inFlightSingleSalaryRecordMap.set(id, promise)
    return promise
  }

  /**
   * Generate salary records for a period (admin). Existing (employee, period) rows are skipped.
   * Throws the backend error on failure.
   */
  const generateSalaryRecords = async (data: {
    period: string
    branch_id?: string
    employee_ids?: string[]
  }): Promise<{ generated: number; skipped: number }> => {
    const response = await apiFetch<{ generated: number; skipped?: number }>('/payroll/generate', {
      method: 'POST',
      body: data
    })
    if (!response.data) throw new Error('產生薪資紀錄失敗')
    return { generated: response.data.generated, skipped: response.data.skipped ?? 0 }
  }

  /**
   * Update salary record adjustments (admin). The backend answers only `message`, so this
   * resolves with nothing: refetch the record to show the recalculated amounts.
   * Throws the backend error on failure.
   */
  const updateSalaryRecord = async (id: string, data: UpdateSalaryInput): Promise<void> => {
    // number inputs may hand over strings; the backend schema is strictly z.number()
    const body: UpdateSalaryInput = {}
    if (data.overtime_hours !== undefined) body.overtime_hours = Number(data.overtime_hours) || 0
    if (data.commission !== undefined) body.commission = Number(data.commission) || 0
    if (data.bonus !== undefined) body.bonus = Number(data.bonus) || 0
    if (data.deductions !== undefined) body.deductions = Number(data.deductions) || 0
    if (data.notes !== undefined) body.notes = data.notes

    await apiFetch(`/payroll/salary-records/${id}`, { method: 'PATCH', body })
  }

  /**
   * Approve salary record (admin). `message`-only response, throws the backend error on failure.
   */
  const approveSalary = async (id: string): Promise<void> => {
    await apiFetch(`/payroll/salary-records/${id}/approve`, { method: 'POST' })
  }

  /**
   * Batch approve salary records (admin). Rows not PENDING / not in the tenant are silently
   * left out, so compare `approved_count` with what was requested.
   */
  const batchApproveSalary = async (ids: string[]): Promise<{ approved_count: number }> => {
    const response = await apiFetch<{ approved_count: number }>('/payroll/batch-approve', {
      method: 'POST',
      body: { ids }
    })
    return { approved_count: Number(response.data?.approved_count ?? 0) }
  }

  /**
   * Mark salary as paid (admin). `message`-only response, throws the backend error on failure.
   */
  const markAsPaid = async (id: string): Promise<void> => {
    await apiFetch(`/payroll/salary-records/${id}/pay`, { method: 'POST' })
  }

  /**
   * Export payroll report as a file (csv | xlsx). apiFetch only speaks JSON, so this uses
   * fetch with the session cookie and surfaces the backend's JSON error text.
   */
  const exportPayroll = async (options: {
    period: string
    branch_id?: string
    format?: 'csv' | 'xlsx'
  }): Promise<Blob> => {
    const config = useRuntimeConfig()
    const baseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'
    const params = new URLSearchParams()
    params.append('period', options.period)
    if (options.branch_id) params.append('branch_id', options.branch_id)
    if (options.format) params.append('format', options.format)

    const response = await fetch(`${baseUrl}/api/payroll/export?${params}`, { credentials: 'include' })
    if (!response.ok) {
      let message = ''
      try {
        message = ((await response.json()) as { error?: string }).error || ''
      } catch {
        // not JSON
      }
      throw new Error(message || `HTTP ${response.status}`)
    }
    return response.blob()
  }

  /**
   * Fetch promotion records
   */
  const fetchPromotions = async (options?: {
    employee_id?: string
    type?: string
    page?: number
    limit?: number
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force) {
      const existing = inFlightPromotionsMap.get(key)
      if (existing) return existing
    }

    const promise = (async () => {
      isPromotionLoading.value = true
      const { page = 1, limit = 20, ...filters } = options || {}

      try {
        const response = await apiFetch<PromotionRecord[]>('/payroll/promotions', {
          params: { ...filters, limit, offset: (page - 1) * limit }
        }) as unknown as ListResponse<PromotionRecord>

        promotions.value = response.data || []
        promotionCount.value = Number(response.meta?.total ?? promotions.value.length)
      } catch (error) {
        handleError(error, {
          context: 'usePayroll.fetchPromotions',
          customMessage: apiErrorMessage(error, '取得異動紀錄失敗')
        })
        promotions.value = []
        promotionCount.value = 0
      } finally {
        isPromotionLoading.value = false
        inFlightPromotionsMap.delete(key)
      }
    })()

    inFlightPromotionsMap.set(key, promise)
    return promise
  }

  /**
   * Create promotion record (admin). Empty optional ids are dropped (the backend requires
   * valid uuids when present). Throws the backend error on failure.
   */
  const createPromotion = async (data: CreatePromotionInput): Promise<PromotionCreated> => {
    const body: CreatePromotionInput = {
      employee_id: data.employee_id,
      type: data.type,
      effective_date: data.effective_date
    }
    if (data.to_job_title_id) body.to_job_title_id = data.to_job_title_id
    if (data.to_branch_id) body.to_branch_id = data.to_branch_id
    if (data.new_base_salary !== undefined && data.new_base_salary !== null) body.new_base_salary = Number(data.new_base_salary)
    if (data.reason) body.reason = data.reason

    const response = await apiFetch<PromotionCreated>('/payroll/promotions', { method: 'POST', body })
    if (!response.data) throw new Error('建立異動紀錄失敗')
    return response.data
  }

  // Helper functions
  const getStatusLabel = (status: SalaryRecord['status']): string => {
    return SALARY_STATUS_LABELS[status] || status
  }

  const getStatusVariant = (status: SalaryRecord['status']): 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' => {
    return SALARY_STATUS_VARIANTS[status] || 'default'
  }

  const getPromotionTypeLabel = (type: PromotionRecord['type']): string => {
    return PROMOTION_TYPE_LABELS[type] || type
  }

  const formatCurrency = (amount: number): string => {
    return payrollCurrencyFormatter.format(amount)
  }

  // Alias for generateSalaryRecords
  const generatePayroll = generateSalaryRecords

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
    generatePayroll,
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
