/**
 * useAuthMethods - Authentication Methods Composable
 *
 * Provides all authentication methods: email/password, OTP, OAuth.
 * Also handles password reset and profile completion.
 */

import { extractErrorMessage } from '../utils/apiHelpers'
import type {
  AuthResult,
  OtpSendResult,
  OAuthResult,
  CompleteProfileInput,
  ProfileApiResult,
} from '../types/auth'

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

/**
 * Failure result from a member-profile API error. The backend replies
 * `{ error, code, attemptsRemaining? }`; $fetch exposes it as `error.data`.
 */
export function toProfileApiFailure(error: unknown, fallback: string): ProfileApiResult {
  const data = (error as { data?: unknown } | null)?.data
  if (data && typeof data === 'object') {
    const body = data as { error?: unknown; message?: unknown; code?: unknown; attemptsRemaining?: unknown }
    const message = typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string' ? body.message : fallback
    return {
      success: false,
      message,
      code: typeof body.code === 'string' ? body.code : undefined,
      attemptsRemaining: typeof body.attemptsRemaining === 'number' ? body.attemptsRemaining : undefined,
    }
  }
  return { success: false, message: extractErrorMessage(error, fallback) }
}

export const useAuthMethods = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  // The gym this app is deployed for: OTP login only looks for members there
  const tenantScope = config.public.tenantSlug ? { tenantSlug: config.public.tenantSlug as string } : {}

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
          ...tenantScope,
        },
      })

      return {
        success: response.success,
        message: response.message,
        otp: response.data?.otp || (response as any)._devCode, // For development testing
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
          ...tenantScope,
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
        body: { email, account: email, password },
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
   * Send a verification code to the phone this member wants to save.
   * The code is bound to the logged-in member and that phone number.
   */
  const sendPhoneVerification = async (phone: string): Promise<ProfileApiResult> => {
    const headers = getAuthHeader()
    if (!headers['X-Member-Token']) {
      return { success: false, message: '請先登入', code: 'UNAUTHORIZED' }
    }

    try {
      const response = await $fetch<{ success: boolean; message?: string; data?: { otp?: string } }>(
        `${apiUrl}/api/member/me/phone/otp`,
        { method: 'POST', headers, body: { phone } },
      )
      return {
        success: response.success,
        message: response.message || '驗證碼已發送',
        otp: response.data?.otp, // Only in development
      }
    } catch (error: unknown) {
      return toProfileApiFailure(error, '發送驗證碼失敗，請稍後再試')
    }
  }

  /**
   * Complete member profile after social login.
   * `otpCode` must come from sendPhoneVerification for the same phone.
   */
  const completeProfile = async (data: CompleteProfileInput): Promise<ProfileApiResult> => {
    const headers = getAuthHeader()
    if (!headers['X-Member-Token']) {
      return { success: false, message: '請先登入', code: 'UNAUTHORIZED' }
    }

    setLoading(true)
    try {
      const response = await $fetch<{ success: boolean; message?: string }>(`${apiUrl}/api/member/me/complete-profile`, {
        method: 'POST',
        headers,
        body: data,
      })

      if (response.success) {
        await fetchMember(headers['X-Member-Token'])
        return { success: true, message: response.message || '資料已更新' }
      }

      return { success: false, message: response.message || '更新資料失敗' }
    } catch (error: unknown) {
      return toProfileApiFailure(error, '更新資料失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Change the phone of an existing profile (POST /api/member/me/phone).
   * `otpCode` must come from sendPhoneVerification for the same phone.
   */
  const changePhone = async (phone: string, otpCode: string): Promise<ProfileApiResult> => {
    const headers = getAuthHeader()
    if (!headers['X-Member-Token']) {
      return { success: false, message: '請先登入', code: 'UNAUTHORIZED' }
    }

    try {
      const response = await $fetch<{ success: boolean; message?: string }>(`${apiUrl}/api/member/me/phone`, {
        method: 'POST',
        headers,
        body: { phone, otpCode },
      })
      if (response.success) {
        await fetchMember(headers['X-Member-Token'])
        return { success: true, message: response.message || '手機號碼已更新' }
      }
      return { success: false, message: response.message || '變更手機號碼失敗' }
    } catch (error: unknown) {
      return toProfileApiFailure(error, '變更手機號碼失敗，請稍後再試')
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
    sendPhoneVerification,
    completeProfile,
    changePhone,

    // Logout
    logout,
  }
}
