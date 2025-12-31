import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Payment } from '~/types/directus'

export const usePayments = () => {
  const directus = useDirectus()
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
    const { page = 1, limit = 20, memberId, contractId, branchId, paymentType, startDate, endDate, search } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (memberId) filter.member_id = { _eq: memberId }
      if (contractId) filter.contract_id = { _eq: contractId }
      if (branchId) filter.branch_id = { _eq: branchId }
      if (paymentType) filter.payment_type = { _eq: paymentType }
      if (startDate) filter.payment_date = { _gte: startDate }
      if (endDate) filter.payment_date = { ...(filter.payment_date as object || {}), _lte: endDate }

      // Add search filter
      if (search) {
        filter._or = [
          { 'member': { 'full_name': { _icontains: search } } },
          { 'member': { 'member_code': { _icontains: search } } },
          { 'contract': { 'contract_no': { _icontains: search } } },
          { notes: { _icontains: search } }
        ]
      }

      // Fetch payments data
      const data = await directus.request(
        readItems('payments', {
          filter,
          fields: ['*', 'member.full_name', 'member.member_code', 'contract.contract_no', 'branch.name', 'received_by.full_name'],
          sort: ['-payment_date', '-date_created'],
          limit,
          offset: (page - 1) * limit
        })
      )

      payments.value = data as Payment[]

      // Try to get count separately
      try {
        const countResult = await directus.request(
          aggregate('payments', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
        totalCount.value = Number(countResult[0]?.count) || data.length
      } catch {
        totalCount.value = data.length
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error)
      payments.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  const getPayment = async (id: string) => {
    const data = await directus.request(
      readItem('payments', id, {
        fields: ['*', 'member.*', 'contract.*', 'branch.*', 'receiver.*']
      })
    )
    return data as Payment
  }

  const createPayment = async (payment: Partial<Payment>) => {
    const data = await directus.request(createItem('payments', payment))
    return data
  }

  const updatePayment = async (id: string, payment: Partial<Payment>) => {
    const data = await directus.request(updateItem('payments', id, payment))
    return data
  }

  const deletePayment = async (id: string) => {
    await directus.request(deleteItem('payments', id))
  }

  // 統計資料
  const getPaymentStats = async (branchId?: string, startDate?: string, endDate?: string) => {
    const defaultStats = {
      income: { count: 0, amount: 0 },
      refund: { count: 0, amount: 0 },
      netAmount: 0
    }

    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = { _eq: branchId }
      if (startDate) filter.payment_date = { _gte: startDate }
      if (endDate) filter.payment_date = { ...(filter.payment_date as object || {}), _lte: endDate }

      const [income, refund] = await Promise.all([
        directus.request(aggregate('payments', {
          aggregate: { count: '*', sum: ['amount'] },
          query: { filter: { ...filter, payment_type: { _eq: 'INCOME' } } }
        })),
        directus.request(aggregate('payments', {
          aggregate: { count: '*', sum: ['amount'] },
          query: { filter: { ...filter, payment_type: { _eq: 'REFUND' } } }
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
      console.error('Failed to fetch payment stats:', error)
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
