import { useFetch } from '~/composables/core/useFetch'
import type { Payment } from '~/types/schema'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'

const inFlightPaymentsMap = new Map<string, Promise<void>>()
const inFlightSinglePaymentMap = new Map<string, Promise<Payment | null>>()
const inFlightPaymentStatsMap = new Map<string, Promise<any>>()

export const usePayments = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const { invalidateCache } = useApi()
  const payments = useState<Payment[]>('payments', () => [])
  const isLoading = useState('payments_loading', () => false)
  const totalCount = useState('payments_total', () => 0)

  const fetchPayments = async (options?: {
    page?: number
    limit?: number
    memberId?: string
    contractId?: string
    branchId?: string
    paymentType?: string
    startDate?: string
    endDate?: string
    search?: string
  }, force = false) => {
    const key = JSON.stringify(options || {})
    if (!force && inFlightPaymentsMap.has(key)) {
      return inFlightPaymentsMap.get(key)
    }

    const promise = (async () => {
      isLoading.value = true
      const { page = 1, limit = 20, memberId, contractId, branchId, paymentType, startDate, endDate, search } = options || {}

      try {
        const filter: Record<string, unknown> = {}
        if (memberId) filter.member_id = memberId
        if (contractId) filter.contract_id = contractId
        if (branchId) filter.branch_id = branchId
        if (paymentType) filter.payment_type = paymentType
        if (startDate) filter.start_date = startDate
        if (endDate) filter.end_date = endDate

        const { data, total } = await readItems<Payment>('payments', {
          page,
          limit,
          search,
          filter,
          sort: 'payment_date',
          sortOrder: 'desc'
        })

        payments.value = data
        totalCount.value = total
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
      return inFlightSinglePaymentMap.get(id)
    }

    const promise = (async () => {
      try {
        const data = await readItem<Payment>('payments', id)
        return data
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

  const createPayment = async (payment: Partial<Payment>) => {
    try {
      const data = await createItem<Payment>('payments', payment)
      // 失效付款和合約緩存（付款可能影響合約狀態）
      invalidateCache([CACHE_KEYS.PAYMENTS, CACHE_KEYS.CONTRACTS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'usePayments.createPayment',
        customMessage: MESSAGES.ERRORS.PAYMENT_CREATE_FAILED
      })
      return null
    }
  }

  const updatePayment = async (id: string, payment: Partial<Payment>) => {
    try {
      const data = await updateItem<Payment>('payments', id, payment)
      // 失效付款緩存
      invalidateCache([CACHE_KEYS.PAYMENTS])
      return data
    } catch (error) {
      handleError(error, {
        context: 'usePayments.updatePayment',
        customMessage: MESSAGES.ERRORS.PAYMENT_UPDATE_FAILED
      })
      return null
    }
  }

  const deletePayment = async (id: string) => {
    try {
      const success = await deleteItem('payments', id)
      if (success) {
        // 失效付款和合約緩存
        invalidateCache([CACHE_KEYS.PAYMENTS, CACHE_KEYS.CONTRACTS])
      }
      return success
    } catch (error) {
      handleError(error, {
        context: 'usePayments.deletePayment',
        customMessage: MESSAGES.ERRORS.PAYMENT_DELETE_FAILED
      })
      return false
    }
  }

  // 統計資料
  const getPaymentStats = async (branchId?: string, startDate?: string, endDate?: string) => {
    const flightKey = `${branchId || ''}_${startDate || ''}_${endDate || ''}`
    const existing = inFlightPaymentStatsMap.get(flightKey)
    if (existing) return existing

    const defaultStats = {
      income: { count: 0, amount: 0 },
      refund: { count: 0, amount: 0 },
      netAmount: 0
    }

    const promise = (async () => {
      try {
        const baseFilter: Record<string, unknown> = {}
        if (branchId) baseFilter.branch_id = branchId
        if (startDate) baseFilter.start_date = startDate
        if (endDate) baseFilter.end_date = endDate

        // Fetch income and refund payments in parallel
        const [incomeResult, refundResult] = await Promise.all([
          readItems<Payment>('payments', {
            limit: 1000, // Get all for aggregation
            filter: {
              ...baseFilter,
              payment_type: 'INCOME'
            }
          }),
          readItems<Payment>('payments', {
            limit: 1000, // Get all for aggregation
            filter: {
              ...baseFilter,
              payment_type: 'REFUND'
            }
          })
        ])

        // Calculate totals from the returned data
        const incomeAmount = incomeResult.data.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        const refundAmount = refundResult.data.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

        return {
          income: {
            count: incomeResult.total,
            amount: incomeAmount
          },
          refund: {
            count: refundResult.total,
            amount: refundAmount
          },
          netAmount: incomeAmount - refundAmount
        }
      } catch (error) {
        handleError(error, {
          context: 'usePayments.getPaymentStats',
          customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED,
          showToast: false
        })
        return defaultStats
      } finally {
        inFlightPaymentStatsMap.delete(flightKey)
      }
    })()

    inFlightPaymentStatsMap.set(flightKey, promise)
    return promise
  }

  return {
    payments,
    isLoading,
    totalCount,
    fetchPayments,
    getPayment,
    createPayment,
    updatePayment,
    deletePayment,
    getPaymentStats
  }
}
