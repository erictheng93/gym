/**
 * useAuthMethods - Authentication Methods Composable
 *
 * Provides all authentication methods: email/password, OTP, OAuth.
 * Also handles password reset and profile completion.
 */

import { extractErrorMessage } from '../utils/apiHelpers'
import type { CurrentMember, AuthResult, OtpSendResult, OAuthResult } from '../types/auth'

interface OtpSendResponse {
  success: boolean
  message: string
  data?: {
    expiresIn: number
    otp?: string // Only in development
  }
}

interface OtpVerifyResponse {
  success: boolean
  message: string
  data?: {
    member: {
      id: string
      memberCode: string
      fullName: string
      branchId: string
    }
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
}

interface EmailLoginResponse {
  success: boolean
  message?: string
  data?: {
    accessToken: string
    refreshToken: string
    expiresIn: number
    member: {
      id: string
      memberCode: string
      fullName: string
      branchId: string
    }
  }
  error?: string
}

export const useAuthMethods = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl

  const { setTokens, clearTokens, getAuthHeader } = useAuthTokens()
  const { fetchMember, clearSession, setLoading } = useAuthSession()

  const otpLoading = useState('otp_loading', () => false)

  // ============================================
  // OTP Authentication
  // ============================================

  /**
   * Send OTP to phone number
   */
  const sendOtp = async (phone: string): Promise<OtpSendResult> => {
    otpLoading.value = true
    try {
      const response = await $fetch<OtpSendResponse>(`${apiUrl}/api/member/otp/send`, {
        method: 'POST',
        body: {
          identifier: phone,
          type: 'phone',
        },
      })

      return {
        success: response.success,
        message: response.message,
        otp: response.data?.otp, // For development testing
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '發送驗證碼失敗'),
      }
    } finally {
      otpLoading.value = false
    }
  }

  /**
   * Verify OTP and login
   */
  const verifyOtp = async (phone: string, code: string): Promise<AuthResult> => {
    setLoading(true)
    try {
      const response = await $fetch<OtpVerifyResponse>(`${apiUrl}/api/member/otp/verify`, {
        method: 'POST',
        body: {
          identifier: phone,
          type: 'phone',
          code,
        },
      })

      if (response.success && response.data) {
        // Store tokens
        setTokens(response.data.accessToken, response.data.refreshToken)

        // Fetch full member profile with the token directly
        await fetchMember(response.data.accessToken)

        return { success: true, message: response.message }
      }

      return { success: false, message: response.message || '驗證失敗' }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '驗證失敗'),
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Legacy OTP login method (for backwards compatibility)
   */
  const loginWithOtp = async (phone: string, otp: string) => {
    return await verifyOtp(phone, otp)
  }

  // ============================================
  // Email/Password Authentication
  // ============================================

  /**
   * Email/Password login
   */
  const login = async (email: string, password: string): Promise<AuthResult> => {
    setLoading(true)
    try {
      const response = await $fetch<EmailLoginResponse>(`${apiUrl}/api/member/auth/login`, {
        method: 'POST',
        body: { email, password },
      })

      if (response.success && response.data) {
        // Store tokens
        setTokens(response.data.accessToken, response.data.refreshToken)

        // Fetch full member profile with the token directly
        await fetchMember(response.data.accessToken)

        return { success: true, message: response.message || '登入成功' }
      }

      return { success: false, message: response.error || response.message || '登入失敗' }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '帳號或密碼錯誤'),
      }
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // OAuth Authentication
  // ============================================

  /**
   * OAuth login - initiate OAuth flow
   */
  const initiateOAuth = (provider: 'google' | 'line' | 'apple') => {
    const { loginWithProvider } = useSocialAuth()
    loginWithProvider(provider)
  }

  /**
   * OAuth callback handler - process OAuth callback
   * This is called from the callback page with the OAuth result
   */
  const loginWithOAuth = async (): Promise<OAuthResult> => {
    setLoading(true)
    try {
      // After OAuth callback, tokens should be set via URL params or cookie
      // This is handled by the OAuth callback page
      // For now, fetch the member profile
      const headers = getAuthHeader()
      if (!headers['X-Member-Token']) {
        return { success: false, error: '無法取得認證資訊' }
      }

      await fetchMember(headers['X-Member-Token'])
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '登入失敗'
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Complete OAuth login with tokens from callback
   * This is called after the OAuth callback page receives tokens
   */
  const completeOAuthLogin = async (
    accessToken: string,
    refreshToken: string,
  ): Promise<OAuthResult> => {
    setLoading(true)
    try {
      // Store tokens
      setTokens(accessToken, refreshToken)

      // Fetch full member profile
      await fetchMember(accessToken)

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '登入失敗'
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Password Management
  // ============================================

  /**
   * Request password reset email
   */
  const forgotPassword = async (email: string): Promise<AuthResult & { resetUrl?: string }> => {
    try {
      const response = await $fetch<{ success: boolean; message: string; data?: { resetUrl?: string } }>(`${apiUrl}/api/member/auth/forgot-password`, {
        method: 'POST',
        body: { email },
      })

      return {
        success: response.success,
        message: response.message,
        resetUrl: response.data?.resetUrl, // Only in development
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '發送失敗，請稍後再試'),
      }
    }
  }

  /**
   * Reset password using token
   */
  const resetPassword = async (token: string, newPassword: string): Promise<AuthResult> => {
    try {
      const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/api/member/auth/reset-password`, {
        method: 'POST',
        body: {
          token,
          password: newPassword,
        },
      })

      return {
        success: response.success,
        message: response.message,
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '重置密碼失敗，請稍後再試'),
      }
    }
  }

  /**
   * Change password for logged-in user
   */
  const changePassword = async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
    const headers = getAuthHeader()
    if (!headers['X-Member-Token']) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/api/member/auth/change-password`, {
        method: 'POST',
        headers,
        body: {
          currentPassword,
          newPassword,
        },
      })

      return {
        success: response.success,
        message: response.message,
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '密碼變更失敗，請稍後再試'),
      }
    }
  }

  // ============================================
  // Profile Completion
  // ============================================

  /**
   * Complete member profile after social login
   */
  const completeProfile = async (data: {
    fullName: string
    phone: string
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | null
    birthday?: string
    branchId?: string
    emergencyContact?: string
    emergencyPhone?: string
  }): Promise<AuthResult> => {
    setLoading(true)
    const headers = getAuthHeader()

    try {
      const response = await $fetch<{ success: boolean; message: string; data?: { member: CurrentMember } }>(`${apiUrl}/api/member/me/complete-profile`, {
        method: 'POST',
        headers,
        body: data,
      })

      if (response.success) {
        // Refresh member data
        await fetchMember(headers['X-Member-Token'] || '')
        return { success: true, message: response.message || '資料已更新' }
      }

      return { success: false, message: response.message || '更新資料失敗' }
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '更新資料失敗，請稍後再試'),
      }
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Logout
  // ============================================

  /**
   * Logout and clear all auth state
   */
  const logout = async () => {
    clearTokens()
    clearSession()
    await navigateTo('/login')
  }

  return {
    // Loading state
    otpLoading,

    // OTP methods
    sendOtp,
    verifyOtp,
    loginWithOtp,

    // Email/Password methods
    login,

    // OAuth methods
    initiateOAuth,
    loginWithOAuth,
    completeOAuthLogin,

    // Password management
    forgotPassword,
    resetPassword,
    changePassword,

    // Profile
    completeProfile,

    // Logout
    logout,
  }
}
