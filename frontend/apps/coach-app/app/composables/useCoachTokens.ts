/**
 * useCoachTokens - Coach Token Management Composable
 *
 * Handles JWT token storage, refresh, and validation for coaches.
 * Uses cookies for secure token storage.
 */

import type { TokenState } from '../types/coach'

export const useCoachTokens = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl

  // Token management - secure only in production (HTTPS)
  const isSecure = import.meta.env.PROD

  const accessToken = useCookie('coach_access_token', {
    maxAge: 60 * 60 * 24, // 24 hours
    secure: isSecure,
    sameSite: 'lax',
  })

  const refreshToken = useCookie('coach_refresh_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: isSecure,
    sameSite: 'lax',
  })

  /**
   * Check if access token exists
   */
  const hasAccessToken = computed(() => !!accessToken.value)

  /**
   * Check if refresh token exists
   */
  const hasRefreshToken = computed(() => !!refreshToken.value)

  /**
   * Set tokens after successful authentication
   */
  const setTokens = (access: string, refresh: string) => {
    accessToken.value = access
    refreshToken.value = refresh
  }

  /**
   * Clear all tokens (logout)
   */
  const clearTokens = () => {
    accessToken.value = null
    refreshToken.value = null
  }

  /**
   * Refresh access token using refresh token
   * Returns true if refresh was successful
   */
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) return false

    try {
      const response = await $fetch<{
        success: boolean
        access_token: string
        refresh_token: string
      }>(`${apiUrl}/api/coach/auth/refresh`, {
        method: 'POST',
        body: {
          refresh_token: refreshToken.value,
        },
      })

      if (response.success) {
        accessToken.value = response.access_token
        refreshToken.value = response.refresh_token
        return true
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * Get authorization headers for API calls
   * Uses X-Coach-Token header for coach authentication
   */
  const getAuthHeader = (): Record<string, string> => {
    if (!accessToken.value) return {}
    return {
      'X-Coach-Token': accessToken.value,
    }
  }

  /**
   * Get current token state
   */
  const getTokenState = (): TokenState => ({
    accessToken: accessToken.value ?? null,
    refreshToken: refreshToken.value ?? null,
  })

  return {
    // Reactive state
    accessToken: computed(() => accessToken.value),
    refreshToken: computed(() => refreshToken.value),
    hasAccessToken,
    hasRefreshToken,

    // Actions
    setTokens,
    clearTokens,
    refreshAccessToken,
    getAuthHeader,
    getTokenState,
  }
}
