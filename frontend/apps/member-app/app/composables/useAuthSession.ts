/**
 * useAuthSession - Member Session State Composable
 *
 * Manages the current member's profile and session state.
 * Handles fetching member data from the API.
 */

import type { ActiveContractSummary, CurrentMember } from '../types/auth'

/** GET /api/member/me (backend/src/routes/member-profile.ts) */
export interface MemberMeResponse {
  success: boolean
  data: {
    member: {
      id: string
      memberCode: string
      fullName: string
      phone: string | null
      email: string | null
      gender: 'MALE' | 'FEMALE' | 'OTHER' | null
      birthday: string | null
      address: string | null
      emergencyContact: string | null
      emergencyPhone: string | null
      status: CurrentMember['member_status']
      joinDate: string | null
      avatar: string | null
      height: number | null
      hasPassword: boolean
    }
    branch: { id: string; name: string; address: string | null; phone: string | null } | null
    contracts: Array<{
      id: string
      contractNo: string
      status: 'ACTIVE' | 'PAUSED'
      startDate: string
      endDate: string | null
      remainingCounts: number | null
      plan: { id: string | null; name: string | null; type: 'TIME_BASED' | 'COUNT_BASED' | null } | null
    }>
  }
}

/** Map the /me payload to the session's CurrentMember. */
export function toCurrentMember(data: MemberMeResponse['data']): CurrentMember {
  const active = data.contracts?.find(c => c.status === 'ACTIVE')
  const activeContract: ActiveContractSummary | null = active
    ? {
        id: active.id,
        contract_no: active.contractNo,
        contract_status: active.status,
        start_date: active.startDate,
        end_date: active.endDate,
        remaining_counts: active.remainingCounts,
        plan: active.plan ? { name: active.plan.name, plan_type: active.plan.type } : null,
      }
    : null

  return {
    id: data.member.id,
    member_code: data.member.memberCode,
    full_name: data.member.fullName,
    phone: data.member.phone,
    email: data.member.email,
    branch_id: data.branch?.id ?? null,
    branch_name: data.branch?.name ?? null,
    member_status: data.member.status,
    activeContract,
  }
}

let inFlightFetchMemberPromise: Promise<boolean> | null = null

export const useAuthSession = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { refreshAccessToken, accessToken } = useAuthTokens()

  const member = useState<CurrentMember | null>('current_member', () => null)
  const isAuthenticated = computed(() => !!member.value)
  const isLoading = useState('member_auth_loading', () => false)
  // Track if initial auth check is in progress (prevents content flash)
  const isAuthChecking = useState('member_auth_checking', () => true)

  /**
   * Get the active contract from member
   */
  const activeContract = computed(() => member.value?.activeContract ?? null)

  /**
   * Get member display name
   */
  const displayName = computed(() => member.value?.full_name ?? '會員')

  /**
   * Get member status
   */
  const memberStatus = computed(() => member.value?.member_status ?? null)

  /**
   * Fetch current member profile
   * @param token - Optional token to use instead of reading from cookie
   * @param retryCount - Internal retry counter
   */
  const fetchMember = async (token?: string, retryCount = 0): Promise<boolean> => {
    const authToken = token || accessToken.value
    if (!authToken) {
      member.value = null
      return false
    }

    // Reuse in-flight promise when using default ambient token without retry
    if (!token && retryCount === 0 && inFlightFetchMemberPromise) {
      return inFlightFetchMemberPromise
    }

    const promise = (async (): Promise<boolean> => {
      try {
        const response = await $fetch<MemberMeResponse>(`${apiUrl}/api/member/me`, {
          headers: {
            'X-Member-Token': authToken,
          },
        })

        if (response.success && response.data?.member) {
          member.value = toCurrentMember(response.data)
          return true
        } else {
          member.value = null
          return false
        }
      } catch {
        // Try to refresh token (only once to prevent infinite loop)
        if (retryCount < 1) {
          const refreshed = await refreshAccessToken()
          if (refreshed) {
            // Retry fetching member with the new token
            return await fetchMember(undefined, retryCount + 1)
          }
        }

        member.value = null
        return false
      } finally {
        if (!token && retryCount === 0) {
          inFlightFetchMemberPromise = null
        }
      }
    })()

    if (!token && retryCount === 0) {
      inFlightFetchMemberPromise = promise
    }

    return promise
  }

  /**
   * Clear session state
   */
  const clearSession = () => {
    member.value = null
  }

  /**
   * Set loading state
   */
  const setLoading = (loading: boolean) => {
    isLoading.value = loading
  }

  /**
   * Set auth checking state (for initial auth check)
   */
  const setAuthChecking = (checking: boolean) => {
    isAuthChecking.value = checking
  }

  /**
   * Update member data (for profile updates)
   */
  const updateMemberData = (updates: Partial<CurrentMember>) => {
    if (member.value) {
      member.value = { ...member.value, ...updates }
    }
  }

  return {
    // Reactive state
    member,
    isAuthenticated,
    isLoading,
    isAuthChecking,
    activeContract,
    displayName,
    memberStatus,

    // Actions
    fetchMember,
    clearSession,
    setLoading,
    setAuthChecking,
    updateMemberData,
  }
}
