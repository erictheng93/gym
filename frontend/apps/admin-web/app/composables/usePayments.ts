import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Payment } from '~/types/directus'
import { MESSAGES } from '~/constants'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { useApi, CACHE_KEYS } from '~/composables/core/useApi'
import {
  buildPaginationParams,
  buildSearchFilter,
  buildFilter,
  buildDateRangeFilter,
  mergeFilters
} from '~/utils/api-helpers'

export const usePayments = () => {
  const directus = useDirectus()
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
  }) => {
    isLoading.value = true
    const { memberId, contractId, branchId, paymentType, startDate, endDate, search } = options || {}

    try {
      // 使用工具函數建構分頁和過濾器
      const { limit, offset } = buildPaginationParams(options)

      const filter = mergeFilters(
        buildSearchFilter(search, ['notes']),
        buildFilter([
          { field: 'member_id', value: memberId },
          { field: 'contract_id', value: contractId },
          { field: 'branch_id', value: branchId },
          { field: 'payment_type', value: paymentType }
        ]),
        buildDateRangeFilter('payment_date', startDate, endDate)
      )

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('payments', {
            filter,
            fields: ['*', 'member.full_name', 'member.member_code', 'contract.contract_no', 'branch.name', 'received_by.full_name'],
            sort: ['-payment_date', '-date_created'],
            limit,
            offset
          })
        ),
        directus.request(
          aggregate('payments', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      payments.value = data as Payment[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'usePayments.fetchPayments',
        customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED
      })
      payments.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  const getPayment = async (id: string) => {
    try {
      const data = await directus.request(
        readItem('payments', id, {
          fields: ['*', 'member.*', 'contract.*', 'branch.*', 'receiver.*']
        })
      )
      return data as Payment
    } catch (error) {
      handleError(error, {
        context: 'usePayments.getPayment',
        customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED
      })
      return null
    }
  }

  const createPayment = async (payment: Partial<Payment>) => {
    try {
      const data = await directus.request(createItem('payments', payment))
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
      const data = await directus.request(updateItem('payments', id, payment))
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
      await directus.request(deleteItem('payments', id))
      // 失效付款和合約緩存
      invalidateCache([CACHE_KEYS.PAYMENTS, CACHE_KEYS.CONTRACTS])
      return true
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
    const defaultStats = {
      income: { count: 0, amount: 0 },
      refund: { count: 0, amount: 0 },
      netAmount: 0
    }

    try {
      const baseFilter = mergeFilters(
        buildFilter([{ field: 'branch_id', value: branchId }]),
        buildDateRangeFilter('payment_date', startDate, endDate)
      )

      const [income, refund] = await Promise.all([
        directus.request(aggregate('payments', {
          aggregate: { count: '*', sum: ['amount'] },
          query: { filter: { ...baseFilter, payment_type: { _eq: 'INCOME' } } }
        })),
        directus.request(aggregate('payments', {
          aggregate: { count: '*', sum: ['amount'] },
          query: { filter: { ...baseFilter, payment_type: { _eq: 'REFUND' } } }
        }))
      ])

      const incomeAmount = Number(income[0]?.sum?.amount) || 0
      const refundAmount = Number(refund[0]?.sum?.amount) || 0

      return {
        income: {
          count: Number(income[0]?.count) || 0,
          amount: incomeAmount
        },
        refund: {
          count: Number(refund[0]?.count) || 0,
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
    }
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
