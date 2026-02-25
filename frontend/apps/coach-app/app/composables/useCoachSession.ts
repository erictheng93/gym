/**
 * useCoachSession - Coach Session State Composable
 *
 * Manages the current coach's profile and session state.
 */

import type { Coach } from '../types/coach'

interface CoachProfileResponse {
  success: boolean
  data: Coach
}

export const useCoachSession = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { refreshAccessToken, accessToken } = useCoachTokens()
  const { getCache, setCache } = useOfflineSync()

  const PROFILE_CACHE_KEY = 'coach:profile'
  const PROFILE_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

  const coach = useState<Coach | null>('current_coach', () => null)
  const isAuthenticated = computed(() => !!coach.value)
  const isLoading = useState('coach_auth_loading', () => false)
  // Track if initial auth check is in progress (prevents content flash)
  const isAuthChecking = useState('coach_auth_checking', () => true)

  /**
   * Get coach display name
   */
  const displayName = computed(() => coach.value?.full_name ?? '教練')

  /**
   * Get coach branch name
   */
  const branchName = computed(() => coach.value?.branch_name ?? null)

  /**
   * Get student count
   */
  const studentCount = computed(() => coach.value?.stats?.student_count ?? 0)

  /**
   * Get today's class count
   */
  const todayClassCount = computed(() => coach.value?.stats?.today_class_count ?? 0)

  /**
   * Fetch current coach profile
   * @param token - Optional token to use instead of reading from cookie
   * @param retryCount - Internal retry counter
   */
  const fetchCoach = async (token?: string, retryCount = 0): Promise<boolean> => {
    const authToken = token || accessToken.value
    if (!authToken) {
      coach.value = null
      return false
    }

    try {
      const response = await $fetch<CoachProfileResponse>(`${apiUrl}/api/coach/me`, {
        headers: {
          'X-Coach-Token': authToken,
        },
      })

      if (response.success && response.data) {
        coach.value = response.data
        // Cache profile for offline fallback
        await setCache(PROFILE_CACHE_KEY, response.data, PROFILE_CACHE_TTL)
        return true
      } else {
        coach.value = null
        return false
      }
    } catch {
      // Try to refresh token (only once to prevent infinite loop)
      if (retryCount < 1) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          return await fetchCoach(undefined, retryCount + 1)
        }
      }

      // Fallback to cached profile (prevents offline redirect to login)
      const cached = await getCache<Coach>(PROFILE_CACHE_KEY)
      if (cached) {
        coach.value = cached
        return true
      }

      coach.value = null
      return false
    }
  }

  /**
   * Clear session state
   */
  const clearSession = () => {
    coach.value = null
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
   * Update coach data
   */
  const updateCoachData = (updates: Partial<Coach>) => {
    if (coach.value) {
      coach.value = { ...coach.value, ...updates }
    }
  }

  return {
    // Reactive state
    coach,
    isAuthenticated,
    isLoading,
    isAuthChecking,
    displayName,
    branchName,
    studentCount,
    todayClassCount,

    // Actions
    fetchCoach,
    clearSession,
    setLoading,
    setAuthChecking,
    updateCoachData,
  }
}
