/**
 * usePayments composable
 * Member payment history (GET /api/member/payments) with page-based "load more".
 */

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type PaymentType = 'INCOME' | 'REFUND'

export interface MemberPayment {
  id: string
  amount: number
  paymentMethod: string | null
  paymentDate: string | null
  type: PaymentType
  status: PaymentStatus
  contractId: string | null
  contractNo: string | null
  planName: string | null
}

export interface PaymentSummary {
  totalPaid: number
  totalRefunded: number
}

interface PaymentsResponse {
  success: boolean
  data: {
    payments: MemberPayment[]
    summary: PaymentSummary
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: '現金',
  CREDIT_CARD: '信用卡',
  DEBIT_CARD: '簽帳卡',
  BANK_TRANSFER: '轉帳',
  LINE_PAY: 'LINE Pay',
  OTHER: '其他'
}

export type PaymentStatusTone = 'success' | 'warning' | 'error'

/** Traditional Chinese label + design-system tone for a payment row. */
export function getPaymentStatusDisplay(
  status: PaymentStatus,
  type: PaymentType = 'INCOME'
): { label: string; tone: PaymentStatusTone } {
  const isRefund = type === 'REFUND'
  switch (status) {
    case 'COMPLETED':
      return { label: isRefund ? '已退款' : '已付款', tone: 'success' }
    case 'PENDING':
      return { label: '處理中', tone: 'warning' }
    case 'FAILED':
    default:
      return { label: isRefund ? '退款失敗' : '付款失敗', tone: 'error' }
  }
}

const PAGE_SIZE = 20

export const usePayments = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()

  const payments = useState<MemberPayment[]>('member_payments', () => [])
  const summary = useState<PaymentSummary>('member_payments_summary', () => ({ totalPaid: 0, totalRefunded: 0 }))
  const isLoading = useState('member_payments_loading', () => false)
  const hasMore = useState('member_payments_has_more', () => false)
  const page = useState('member_payments_page', () => 1)

  const load = async (nextPage: number, append: boolean) => {
    if (!member.value) return false

    isLoading.value = true
    try {
      const response = await $fetch<PaymentsResponse>(`${apiUrl}/api/member/payments`, {
        headers: getAuthHeader(),
        query: { page: nextPage, limit: PAGE_SIZE }
      })
      if (!response.success) return false

      const { payments: rows, summary: sums, pagination } = response.data
      payments.value = append ? [...payments.value, ...rows] : rows
      summary.value = sums
      page.value = pagination.page
      hasMore.value = pagination.page < pagination.totalPages
      return true
    } finally {
      isLoading.value = false
    }
  }

  /** Load the first page. Throws on network/API errors so the caller can show a message. */
  const fetchPayments = () => load(1, false)

  /** Append the next page (no-op when there is none). */
  const loadMore = async () => {
    if (!hasMore.value || isLoading.value) return false
    return load(page.value + 1, true)
  }

  return { payments, summary, isLoading, hasMore, fetchPayments, loadMore }
}
