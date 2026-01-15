/**
 * useAuthMethods - Authentication Methods Composable
 *
 * Provides all authentication methods: email/password, OTP, OAuth.
 * Also handles password reset and profile completion.
 */

import type { Contract } from '@gym-nexus/shared/types'
import { extractErrorMessage } from '../utils/apiHelpers'
import type { CurrentMember, AuthResult, OtpSendResult, OAuthResult } from '../types/auth'

interface MemberUser {
  id: string
  member_code: string
  full_name: string
  member_status: string
  branch_id: string | null
}

interface OtpSendResponse {
  success: boolean
  message: string
  expiresIn: number
  otp?: string // Only in development
}

interface OtpVerifyResponse {
  success: boolean
  message: string
  member: MemberUser
  access_token: string
  refresh_token: string
  expires_in: number
}

interface EmailLoginResponse {
  success: boolean
  message: string
  member: MemberUser
  access_token: string
  refresh_token: string
  expires_in: number
}

export const useAuthMethods = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl

  const { setTokens, clearTokens, getAuthHeader } = useAuthTokens()
  const { fetchMember, clearSession, setLoading, member } = useAuthSession()

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
      const response = await $fetch<OtpSendResponse>(`${apiUrl}/gym/otp/send`, {
        method: 'POST',
        body: {
          identifier: phone,
          type: 'phone',
        },
      })

      return {
        success: response.success,
        message: response.message,
        otp: response.otp, // For development testing
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
      const response = await $fetch<OtpVerifyResponse>(`${apiUrl}/gym/otp/verify`, {
        method: 'POST',
        body: {
          identifier: phone,
          type: 'phone',
          code,
        },
      })

      if (response.success) {
        // Store tokens
        setTokens(response.access_token, response.refresh_token)

        // Fetch full member profile with the token directly
        await fetchMember(response.access_token)

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
      const response = await $fetch<EmailLoginResponse>(`${apiUrl}/gym/auth/login`, {
        method: 'POST',
        body: { email, password },
      })

      if (response.success) {
        // Store tokens
        setTokens(response.access_token, response.refresh_token)

        // Fetch full member profile with the token directly
        await fetchMember(response.access_token)

        return { success: true, message: response.message }
      }

      return { success: false, message: response.message || '登入失敗' }
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
   * OAuth login - get member data via Directus session cookie
   * Called after OAuth callback success
   */
  const loginWithOAuth = async (): Promise<OAuthResult> => {
    setLoading(true)
    try {
      // Use Directus session cookie to get current user
      const userResponse = await $fetch<{ data: { id: string; email: string; first_name: string | null; last_name: string | null } }>(`${apiUrl}/users/me`, {
        credentials: 'include',
      })

      if (!userResponse.data?.id) {
        return { success: false, error: '無法取得用戶資料' }
      }

      const userId = userResponse.data.id

      // Query member data by user_id
      const membersResponse = await $fetch<{ data: (CurrentMember & { branch: { name: string } | null; contracts: Contract[] })[] }>(`${apiUrl}/items/members`, {
        credentials: 'include',
        params: {
          'filter[user_id][_eq]': userId,
          'fields': 'id,member_code,full_name,phone,email,branch_id,member_status,branch.name,contracts.id,contracts.contract_status,contracts.end_date,contracts.remaining_counts,contracts.plan_id.name,contracts.plan_id.plan_type',
          'limit': 1,
        },
      })

      if (!membersResponse.data || membersResponse.data.length === 0) {
        return {
          success: false,
          error: '找不到會員資料，請稍後再試',
          needsRegistration: true,
        }
      }

      const memberData = membersResponse.data[0]

      // Find active contract
      const activeContract = memberData.contracts?.find(
        (c: Contract) => c.contract_status === 'ACTIVE'
      ) || null

      // Update member state
      member.value = {
        id: memberData.id,
        member_code: memberData.member_code,
        full_name: memberData.full_name,
        phone: memberData.phone,
        email: memberData.email,
        branch_id: memberData.branch_id,
        branch_name: memberData.branch?.name || null,
        member_status: memberData.member_status,
        activeContract,
      }

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
      const response = await $fetch<{ success: boolean; message: string; resetUrl?: string }>(`${apiUrl}/gym/auth/forgot-password`, {
        method: 'POST',
        body: { email },
      })

      return {
        success: response.success,
        message: response.message,
        resetUrl: response.resetUrl, // Only in development
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
      const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/auth/reset-password`, {
        method: 'POST',
        body: {
          token,
          new_password: newPassword,
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
      const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/auth/change-password`, {
        method: 'POST',
        headers,
        body: {
          current_password: currentPassword,
          new_password: newPassword,
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
    full_name: string
    phone: string
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | null
    birthday?: string
    branch_id?: string
    emergency_contact?: string
    emergency_phone?: string
  }): Promise<AuthResult> => {
    setLoading(true)
    try {
      const response = await $fetch<{ success: boolean; message: string; member?: CurrentMember }>(`${apiUrl}/gym/member/complete-profile`, {
        method: 'POST',
        credentials: 'include',
        body: data,
      })

      if (response.success) {
        // Refresh member data
        await loginWithOAuth()
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
    loginWithOAuth,

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
