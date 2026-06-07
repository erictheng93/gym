/**
 * useAuthSession - Member Session State Composable
 *
 * Manages the current member's profile and session state.
 * Handles fetching member data from the API.
 */

import type { Contract } from '@gym-nexus/shared/types'
import type { CurrentMember } from '../types/auth'

interface MemberProfileResponse {
  success: boolean
  data: CurrentMember & {
    branch?: { id?: string; name?: string } | null
    branch_name?: string | null
    contracts: (Contract & { plan_id?: { name: string; plan_type: string } })[]
  }
}

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

    try {
      const response = await $fetch<MemberProfileResponse>(`${apiUrl}/api/member/me`, {
        headers: {
          'X-Member-Token': authToken,
        },
      })

      if (response.success && response.data) {
        const data = response.data

        // Find active contract
        const contract = data.contracts?.find(
          (c: Contract) => c.contract_status === 'ACTIVE'
        ) || null

        member.value = {
          id: data.id,
          member_code: data.member_code,
          full_name: data.full_name,
          phone: data.phone,
          email: data.email,
          branch_id: data.branch_id,
          branch_name: data.branch_name || data.branch?.name || null,
          member_status: data.member_status,
          activeContract: contract,
        }
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
    }
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
