/**
 * useMemberAuth - Unified Authentication Composable (Facade)
 *
 * This composable provides a unified interface for all authentication functionality.
 * It delegates to specialized composables:
 * - useAuthTokens: Token management (JWT storage, refresh)
 * - useAuthSession: Member profile and session state
 * - useAuthMethods: Login methods (email, OTP, OAuth, password reset)
 *
 * @example
 * const { member, isAuthenticated, login, logout, checkAuth } = useMemberAuth()
 *
 * // Check if user is authenticated
 * await checkAuth()
 *
 * // Login with email
 * const result = await login(email, password)
 *
 * // Get member info
 * console.log(member.value?.full_name)
 */

export const useMemberAuth = () => {
  // Get instances of specialized composables
  const tokens = useAuthTokens()
  const session = useAuthSession()
  const methods = useAuthMethods()

  /**
   * Check authentication status and restore session if possible
   *
   * Tries authentication in this order:
   * 1. If member already loaded, return true
   * 2. If access token exists, fetch member profile
   * 3. If refresh token exists, refresh access token then fetch profile
   * 4. Try OAuth session (cookie-based auth)
   */
  const checkAuth = async (): Promise<boolean> => {
    // Already authenticated - skip loading state to avoid flash
    if (session.isAuthenticated.value) {
      session.setAuthChecking(false)
      return true
    }

    // Set auth checking state to show loading UI
    session.setAuthChecking(true)

    try {

      // Try with access token
      if (tokens.hasAccessToken.value) {
        const success = await session.fetchMember()
        if (success) return true
      }

      // Try refreshing token
      if (tokens.hasRefreshToken.value) {
        const refreshed = await tokens.refreshAccessToken()
        if (refreshed) {
          const success = await session.fetchMember()
          if (success) return true
        }
      }

      // Try OAuth session (cookie-based auth)
      try {
        const oauthResult = await methods.loginWithOAuth()
        if (oauthResult.success) {
          return true
        }
      } catch {
        // OAuth session invalid, continue
      }

      return false
    } finally {
      // Always clear auth checking state when done
      session.setAuthChecking(false)
    }
  }

  return {
    // ============================================
    // State (from useAuthSession)
    // ============================================
    member: session.member,
    isAuthenticated: session.isAuthenticated,
    isLoading: session.isLoading,
    isAuthChecking: session.isAuthChecking,
    activeContract: session.activeContract,
    displayName: session.displayName,
    memberStatus: session.memberStatus,

    // ============================================
    // Token state (from useAuthTokens)
    // ============================================
    accessToken: tokens.accessToken,

    // ============================================
    // Loading states (from useAuthMethods)
    // ============================================
    otpLoading: methods.otpLoading,

    // ============================================
    // OTP Methods (from useAuthMethods)
    // ============================================
    sendOtp: methods.sendOtp,
    verifyOtp: methods.verifyOtp,
    loginWithOtp: methods.loginWithOtp,

    // ============================================
    // Email/Password Methods (from useAuthMethods)
    // ============================================
    login: methods.login,

    // ============================================
    // OAuth Methods (from useAuthMethods)
    // ============================================
    loginWithOAuth: methods.loginWithOAuth,
    completeOAuthLogin: methods.completeOAuthLogin,
    initiateOAuth: methods.initiateOAuth,

    // ============================================
    // Password Management (from useAuthMethods)
    // ============================================
    forgotPassword: methods.forgotPassword,
    resetPassword: methods.resetPassword,
    changePassword: methods.changePassword,

    // ============================================
    // Profile (from useAuthMethods)
    // ============================================
    completeProfile: methods.completeProfile,

    // ============================================
    // Session Management
    // ============================================
    logout: methods.logout,
    fetchMember: session.fetchMember,
    checkAuth,

    // ============================================
    // Token Management (from useAuthTokens)
    // ============================================
    refreshAccessToken: tokens.refreshAccessToken,
    getAuthHeader: tokens.getAuthHeader,
  }
}
