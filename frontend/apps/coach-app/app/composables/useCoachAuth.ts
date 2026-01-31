/**
 * useCoachAuth - Unified Coach Authentication Composable (Facade)
 *
 * This composable provides a unified interface for all coach authentication functionality.
 * It delegates to specialized composables:
 * - useCoachTokens: Token management (JWT storage, refresh)
 * - useCoachSession: Coach profile and session state
 *
 * @example
 * const { coach, isAuthenticated, login, logout, checkAuth } = useCoachAuth()
 *
 * // Check if user is authenticated
 * await checkAuth()
 *
 * // Login with email/employee_code
 * const result = await login(identifier, password)
 *
 * // Get coach info
 * console.log(coach.value?.full_name)
 */

export const useCoachAuth = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl

  // Get instances of specialized composables
  const tokens = useCoachTokens()
  const session = useCoachSession()

  /**
   * Login with email/employee_code and password
   */
  const login = async (identifier: string, password: string): Promise<{
    success: boolean
    message?: string
  }> => {
    session.setLoading(true)

    try {
      const isEmail = identifier.includes('@')
      const response = await $fetch<{
        success: boolean
        message: string
        coach: {
          id: string
          employee_code: string
          full_name: string
          email?: string
          branch_id: string
          job_title: string
        }
        access_token: string
        refresh_token: string
      }>(`${apiUrl}/gym/coach/auth/login`, {
        method: 'POST',
        body: isEmail
          ? { email: identifier, password }
          : { employee_code: identifier, password },
      })

      if (response.success) {
        tokens.setTokens(response.access_token, response.refresh_token)
        await session.fetchCoach(response.access_token)
        return { success: true }
      }

      return { success: false, message: response.message }
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '登入失敗'
      return { success: false, message }
    } finally {
      session.setLoading(false)
    }
  }

  /**
   * Logout - clear tokens and session
   */
  const logout = () => {
    tokens.clearTokens()
    session.clearSession()
  }

  /**
   * Check authentication status and restore session if possible
   */
  const checkAuth = async (): Promise<boolean> => {
    // Already authenticated
    if (session.isAuthenticated.value) {
      return true
    }

    // Try with access token
    if (tokens.hasAccessToken.value) {
      const success = await session.fetchCoach()
      if (success) return true
    }

    // Try refreshing token
    if (tokens.hasRefreshToken.value) {
      const refreshed = await tokens.refreshAccessToken()
      if (refreshed) {
        const success = await session.fetchCoach()
        if (success) return true
      }
    }

    return false
  }

  /**
   * Change password
   */
  const changePassword = async (currentPassword: string, newPassword: string): Promise<{
    success: boolean
    message?: string
  }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/gym/coach/auth/change-password`, {
        method: 'POST',
        headers: tokens.getAuthHeader(),
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      })

      return { success: response.success, message: response.message }
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '修改密碼失敗'
      return { success: false, message }
    }
  }

  return {
    // ============================================
    // State (from useCoachSession)
    // ============================================
    coach: session.coach,
    isAuthenticated: session.isAuthenticated,
    isLoading: session.isLoading,
    displayName: session.displayName,
    branchName: session.branchName,
    studentCount: session.studentCount,
    todayClassCount: session.todayClassCount,

    // ============================================
    // Token state (from useCoachTokens)
    // ============================================
    accessToken: tokens.accessToken,

    // ============================================
    // Authentication Methods
    // ============================================
    login,
    logout,
    checkAuth,
    changePassword,

    // ============================================
    // Session Management
    // ============================================
    fetchCoach: session.fetchCoach,

    // ============================================
    // Token Management (from useCoachTokens)
    // ============================================
    refreshAccessToken: tokens.refreshAccessToken,
    getAuthHeader: tokens.getAuthHeader,
  }
}
