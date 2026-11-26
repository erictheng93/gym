/**
 * useCheckIns composable
 * Member check-in history (GET /api/member/check-in/history) and detail (GET /api/member/check-in/:id).
 */

export interface CheckInListItem {
  id: string
  checkInTime: string
  checkInType: 'ENTRY' | 'CLASS' | 'FACILITY' | string
  checkInMethod: string | null
  branch: { id: string; name: string | null }
  contractId: string | null
  isCrossBranch: boolean
}

export interface CheckInDetail {
  id: string
  checkInTime: string
  checkInType: string
  checkInMethod: string | null
  isCrossBranch: boolean
  branch: { id: string; name: string; address: string | null; phone: string | null }
  contract: {
    id: string
    contractNo: string
    planName: string | null
    planType: 'TIME_BASED' | 'COUNT_BASED' | null
    remainingCounts: number | null
  } | null
}

export const CHECKIN_METHOD_LABELS: Record<string, string> = {
  QR_CODE: 'QR Code',
  MANUAL: '人工驗證',
  CARD: '感應卡',
  BIOMETRIC: '生物辨識'
}

export const CHECKIN_TYPE_LABELS: Record<string, string> = {
  ENTRY: '入場',
  CLASS: '課程',
  FACILITY: '設施'
}

interface HistoryResponse {
  success: boolean
  data: {
    checkIns: CheckInListItem[]
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

const PAGE_SIZE = 20

export const useCheckIns = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()

  const checkIns = useState<CheckInListItem[]>('member_checkins', () => [])
  const isLoading = useState('member_checkins_loading', () => false)
  const hasMore = useState('member_checkins_has_more', () => false)
  const page = useState('member_checkins_page', () => 1)

  const load = async (nextPage: number, append: boolean) => {
    if (!member.value) return false

    isLoading.value = true
    try {
      const response = await $fetch<HistoryResponse>(`${apiUrl}/api/member/check-in/history`, {
        headers: getAuthHeader(),
        query: { page: nextPage, limit: PAGE_SIZE }
      })
      if (!response.success) return false

      const { checkIns: rows, pagination } = response.data
      checkIns.value = append ? [...checkIns.value, ...rows] : rows
      page.value = pagination.page
      hasMore.value = pagination.page < pagination.totalPages
      return true
    } finally {
      isLoading.value = false
    }
  }

  const fetchCheckIns = () => load(1, false)

  const loadMore = async () => {
    if (!hasMore.value || isLoading.value) return false
    return load(page.value + 1, true)
  }

  /** Returns null when the record is missing or not the member's own (404). */
  const fetchCheckIn = async (id: string): Promise<CheckInDetail | null> => {
    if (!member.value) return null
    try {
      const response = await $fetch<{ success: boolean; data: CheckInDetail }>(
        `${apiUrl}/api/member/check-in/${encodeURIComponent(id)}`,
        { headers: getAuthHeader() }
      )
      return response.success ? response.data : null
    } catch {
      return null
    }
  }

  return { checkIns, isLoading, hasMore, fetchCheckIns, loadMore, fetchCheckIn }
}
