/**
 * useMemberContracts composable
 * Read-only list of the member's own contracts (GET /api/member/contracts).
 * Pausing/resuming a contract is a staff-only flow, so there is no mutation here.
 */

export type MemberContractStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'TRANSFERRED'

export interface MemberContract {
  id: string
  contractNo: string
  status: MemberContractStatus
  startDate: string
  endDate: string
  remainingCounts: number | null
  totalAmount: number
  paidAmount: number
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | string
  planName: string | null
  planType: 'TIME_BASED' | 'COUNT_BASED' | null
}

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '有效',
  PAUSED: '暫停中',
  EXPIRED: '已到期',
  CANCELLED: '已取消',
  TRANSFERRED: '已轉讓'
}

export const CONTRACT_PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: '未付款',
  PARTIAL: '部分付款',
  PAID: '已付清'
}

interface ContractsResponse {
  success: boolean
  data: {
    contracts: MemberContract[]
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

export const useMemberContracts = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()

  const contracts = useState<MemberContract[]>('member_contracts', () => [])
  const isLoading = useState('member_contracts_loading', () => false)

  /** Load the member's contracts. Throws on network/API errors. */
  const fetchContracts = async () => {
    if (!member.value) return false

    isLoading.value = true
    try {
      const response = await $fetch<ContractsResponse>(`${apiUrl}/api/member/contracts`, {
        headers: getAuthHeader(),
        query: { page: 1, limit: 50 }
      })
      if (!response.success) return false
      contracts.value = response.data.contracts
      return true
    } finally {
      isLoading.value = false
    }
  }

  return { contracts, isLoading, fetchContracts }
}
