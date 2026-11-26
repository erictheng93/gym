import { useFetch } from '~/composables/core/useFetch'
import type { Payment, PaymentMethod, PaymentRecordStatus, PaymentType } from '~/types/schema'
import { MESSAGES, PAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

// =============================================================================
// Wire format of the staff payments API (backend/src/routes/payments.ts)
// =============================================================================

/** A payment row as the API sends it: decimal columns arrive as strings ("1500.00") */
export type ApiPayment = Omit<Payment, 'amount'> & { amount: string | number }

/** GET /api/payments */
export interface PaymentListResponse {
  success: boolean
  data: ApiPayment[]
  meta: { total: number; page: number; limit: number; totalPages?: number }
}

/** GET /api/payments/summary — COMPLETED payments only */
export interface PaymentSummary {
  totalIncome: number
  totalRefund: number
  netIncome: number
  paymentCount: number
}

/** Body of POST /api/payments; field names match the backend zod schema exactly */
export interface CreatePaymentInput {
  contractId: string
  memberId: string
  branchId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentType: PaymentType
  /** YYYY-MM-DD; omitted = now */
  paymentDate?: string
  notes?: string | null
}

export interface PaymentListFilters {
  page?: number
  limit?: number
  memberId?: string
  contractId?: string
  branchId?: string
  type?: PaymentType
  status?: PaymentRecordStatus
  /** YYYY-MM-DD, inclusive */
  startDate?: string
  /** YYYY-MM-DD, inclusive */
  endDate?: string
  search?: string
}

/** A contract from GET /api/members/:id/contracts, the ones a payment can be recorded against */
export interface PayableContract {
  id: string
  contractNo: string
  status: string
  branchId: string | null
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  plan: { id: string; name: string } | null
}

export const EMPTY_PAYMENT_SUMMARY: PaymentSummary = Object.freeze({
  totalIncome: 0,
  totalRefund: 0,
  netIncome: 0,
  paymentCount: 0
})

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const normalizePayment = (row: ApiPayment): Payment => ({
  ...row,
  amount: toNumber(row.amount)
})

/** Only a COMPLETED payment is money that was actually received (or paid back) */
export const isReceived = (payment: Pick<Payment, 'status'>) => payment.status === 'COMPLETED'

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query[key] = value
  }
  return query
}

const inFlightPaymentsMap = new Map<string, Promise<void>>()
const inFlightSinglePaymentMap = new Map<string, Promise<Payment | null>>()
const inFlightPaymentStatsMap = new Map<string, Promise<PaymentSummary>>()

export const usePayments = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const payments = useState<Payment[]>('payments', () => [])
  const isLoading = useState('payments_loading', () => false)
  const totalCount = useState('payments_total', () => 0)

  const fetchPayments = async (filters: PaymentListFilters = {}, force = false) => {
    const key = JSON.stringify(filters)
    if (!force && inFlightPaymentsMap.has(key)) {
      return inFlightPaymentsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, ...rest } = filters

      try {
        const response = await apiFetch<ApiPayment[]>('/payments', {
          params: buildQuery({ page, limit, ...rest })
        }) as unknown as PaymentListResponse

        payments.value = (response.data || []).map(normalizePayment)
        totalCount.value = toNumber(response.meta?.total)
      } catch (error) {
        handleError(error, {
          context: 'usePayments.fetchPayments',
          customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED
        })
        payments.value = []
        totalCount.value = 0
      } finally {
        isLoading.value = false
        inFlightPaymentsMap.delete(key)
      }
    })()

    inFlightPaymentsMap.set(key, promise)
    return promise
  }

  const getPayment = async (id: string, force = false) => {
    if (!force && inFlightSinglePaymentMap.has(id)) {
      return inFlightSinglePaymentMap.get(id)!
    }

    const promise = (async () => {
      try {
        const { data } = await apiFetch<ApiPayment>(`/payments/${id}`)
        return data ? normalizePayment(data) : null
      } catch (error) {
        handleError(error, {
          context: 'usePayments.getPayment',
          customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED
        })
        return null
      } finally {
        inFlightSinglePaymentMap.delete(id)
      }
    })()

    inFlightSinglePaymentMap.set(id, promise)
    return promise
  }

  /**
   * Records money received (paymentType INCOME) or paid back (REFUND) against a contract.
   * Returns null on failure, after showing the backend's reason; never throws.
   */
  const createPayment = async (input: CreatePaymentInput): Promise<Payment | null> => {
    try {
      const body: CreatePaymentInput = {
        contractId: input.contractId,
        memberId: input.memberId,
        branchId: input.branchId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentType: input.paymentType,
        ...(input.paymentDate ? { paymentDate: input.paymentDate } : {}),
        notes: input.notes || null
      }
      const { data } = await apiFetch<ApiPayment>('/payments', { method: 'POST', body })
      if (!data) throw new Error(MESSAGES.ERRORS.PAYMENT_CREATE_FAILED)
      // 付款會改變合約的已付金額與付款狀態
      invalidateCache([CACHE_KEYS.PAYMENTS, CACHE_KEYS.CONTRACTS])
      return normalizePayment(data)
    } catch (error) {
      handleError(error, {
        context: 'usePayments.createPayment',
        customMessage: errorMessage(error, MESSAGES.ERRORS.PAYMENT_CREATE_FAILED)
      })
      return null
    }
  }

  /** Totals of COMPLETED payments, computed by GET /api/payments/summary */
  const getPaymentStats = async (branchId?: string, startDate?: string, endDate?: string): Promise<PaymentSummary> => {
    const flightKey = `${branchId || ''}_${startDate || ''}_${endDate || ''}`
    const existing = inFlightPaymentStatsMap.get(flightKey)
    if (existing) return existing

    const promise = (async () => {
      try {
        const { data } = await apiFetch<PaymentSummary>('/payments/summary', {
          params: buildQuery({ branchId, startDate, endDate })
        })
        return {
          totalIncome: toNumber(data?.totalIncome),
          totalRefund: toNumber(data?.totalRefund),
          netIncome: toNumber(data?.netIncome),
          paymentCount: toNumber(data?.paymentCount)
        }
      } catch (error) {
        handleError(error, {
          context: 'usePayments.getPaymentStats',
          customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED,
          showToast: false
        })
        return { ...EMPTY_PAYMENT_SUMMARY }
      } finally {
        inFlightPaymentStatsMap.delete(flightKey)
      }
    })()

    inFlightPaymentStatsMap.set(flightKey, promise)
    return promise
  }

  /** Contracts of a member, with what is still owed on each */
  const fetchMemberContracts = async (memberId: string): Promise<PayableContract[]> => {
    try {
      const { data } = await apiFetch<Array<Record<string, unknown>>>(`/members/${memberId}/contracts`)
      return (data || []).map(c => ({
        id: String(c.id),
        contractNo: String(c.contractNo ?? ''),
        status: String(c.status ?? ''),
        branchId: (c.branchId as string | null) ?? null,
        totalAmount: toNumber(c.totalAmount),
        paidAmount: toNumber(c.paidAmount),
        paymentStatus: String(c.paymentStatus ?? ''),
        plan: (c.plan as PayableContract['plan']) ?? null
      }))
    } catch (error) {
      handleError(error, {
        context: 'usePayments.fetchMemberContracts',
        customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED
      })
      return []
    }
  }

  /** Downloads GET /api/payments/export (COMPLETED payments only) as a file */
  const exportPayments = async (options: {
    branchId?: string
    startDate?: string
    endDate?: string
    format?: 'csv' | 'xlsx'
  } = {}): Promise<boolean> => {
    const { format = 'csv', ...filters } = options
    try {
      const baseUrl = useRuntimeConfig().public?.apiBaseUrl || 'http://localhost:8056'
      const params = new URLSearchParams({ ...buildQuery(filters), format } as Record<string, string>)
      const response = await fetch(`${baseUrl}/api/payments/export?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `付款記錄_${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      return true
    } catch (error) {
      handleError(error, {
        context: 'usePayments.exportPayments',
        customMessage: PAGES.PAYMENTS.EXPORT_FAILED
      })
      return false
    }
  }

  return {
    payments,
    isLoading,
    totalCount,
    fetchPayments,
    getPayment,
    createPayment,
    getPaymentStats,
    fetchMemberContracts,
    exportPayments
  }
}
