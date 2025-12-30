import type { Member, Contract } from '@gym-nexus/shared/types'

interface MemberUser {
  id: string
  member_code: string
  full_name: string
  member_status: string
  branch_id: string | null
}

interface CurrentMember {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  branch_id: string | null
  branch_name: string | null
  member_status: Member['member_status']
  activeContract: Contract | null
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

interface MemberProfileResponse {
  success: boolean
  data: CurrentMember & {
    contracts: (Contract & { plan_id?: { name: string; plan_type: string } })[]
  }
}

export const useMemberAuth = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl

  const member = useState<CurrentMember | null>('current_member', () => null)
  const isAuthenticated = computed(() => !!member.value)
  const isLoading = useState('member_auth_loading', () => false)
  const otpLoading = useState('otp_loading', () => false)

  // Token management - secure only in production (HTTPS)
  const isSecure = import.meta.env.PROD
  const accessToken = useCookie('member_access_token', {
    maxAge: 60 * 60 * 24, // 24 hours
    secure: isSecure,
    sameSite: 'lax',
  })

  const refreshToken = useCookie('member_refresh_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: isSecure,
    sameSite: 'lax',
  })

  /**
   * Send OTP to phone number
   */
  const sendOtp = async (phone: string): Promise<{ success: boolean; message: string; otp?: string }> => {
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
      const message = error instanceof Error ? error.message : '發送驗證碼失敗'
      // Handle $fetch error response
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || message,
        }
      }
      return { success: false, message }
    } finally {
      otpLoading.value = false
    }
  }

  /**
   * Verify OTP and login
   */
  const verifyOtp = async (phone: string, code: string): Promise<{ success: boolean; message: string }> => {
    isLoading.value = true
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
        accessToken.value = response.access_token
        refreshToken.value = response.refresh_token

        // Fetch full member profile with the token directly
        await fetchMember(response.access_token)

        return { success: true, message: response.message }
      }

      return { success: false, message: response.message || '驗證失敗' }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '驗證失敗'
      // Handle $fetch error response
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || message,
        }
      }
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Email/Password login - requires member record
   * Uses /gym/auth/login endpoint which validates credentials and returns member token
   */
  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    isLoading.value = true
    try {
      const response = await $fetch<EmailLoginResponse>(`${apiUrl}/gym/auth/login`, {
        method: 'POST',
        body: { email, password },
      })

      if (response.success) {
        // Store tokens
        accessToken.value = response.access_token
        refreshToken.value = response.refresh_token

        // Fetch full member profile with the token directly
        await fetchMember(response.access_token)

        return { success: true, message: response.message }
      }

      return { success: false, message: response.message || '登入失敗' }
    } catch (error: unknown) {
      console.error('Login error:', error)
      // Handle $fetch error response
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || '帳號或密碼錯誤',
        }
      }
      return { success: false, message: '登入發生錯誤，請稍後再試' }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Legacy OTP login method (for backwards compatibility)
   */
  const loginWithOtp = async (phone: string, otp: string) => {
    return await verifyOtp(phone, otp)
  }

  /**
   * Logout and clear tokens
   */
  const logout = async () => {
    accessToken.value = null
    refreshToken.value = null
    member.value = null
    await navigateTo('/login')
  }

  /**
   * Refresh access token
   */
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) return false

    try {
      const response = await $fetch<{
        success: boolean
        access_token: string
        refresh_token: string
      }>(`${apiUrl}/gym/otp/refresh`, {
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
   * Fetch current member profile
   * @param token - Optional token to use instead of reading from cookie
   * @param retryCount - Internal retry counter
   */
  const fetchMember = async (token?: string, retryCount = 0) => {
    const authToken = token || accessToken.value
    console.log('[Auth] fetchMember called, token exists:', !!authToken)
    if (!authToken) {
      member.value = null
      return
    }

    try {
      console.log('[Auth] Fetching member from API...')
      const response = await $fetch<MemberProfileResponse>(`${apiUrl}/gym/member/me`, {
        headers: {
          // Use custom header to avoid Directus intercepting the token
          'X-Member-Token': authToken,
        },
      })

      console.log('[Auth] API response:', response.success, response.data?.id)
      if (response.success && response.data) {
        const data = response.data

        // Find active contract
        const activeContract = data.contracts?.find(
          (c: Contract) => c.contract_status === 'ACTIVE'
        ) || null

        member.value = {
          id: data.id,
          member_code: data.member_code,
          full_name: data.full_name,
          phone: data.phone,
          email: data.email,
          branch_id: data.branch_id,
          branch_name: (data as { branch_id?: { name?: string } }).branch_id?.name || null,
          member_status: data.member_status,
          activeContract,
        }
        console.log('[Auth] Member set:', member.value?.id)
      } else {
        console.log('[Auth] Response not successful or no data')
        member.value = null
      }
    } catch (error) {
      console.error('Failed to fetch member:', error)

      // Try to refresh token (only once to prevent infinite loop)
      if (retryCount < 1) {
        const refreshed = await refreshAccessToken()
        if (refreshed && accessToken.value) {
          // Retry fetching member with the new token
          return await fetchMember(accessToken.value, retryCount + 1)
        }
      }

      member.value = null
    }
  }

  /**
   * Check authentication status
   */
  const checkAuth = async (): Promise<boolean> => {
    console.log('[Auth] checkAuth called, member exists:', !!member.value, 'token exists:', !!accessToken.value)
    if (member.value) {
      console.log('[Auth] Already authenticated')
      return true
    }

    if (accessToken.value) {
      console.log('[Auth] Token found, fetching member...')
      await fetchMember()
      console.log('[Auth] After fetchMember, isAuthenticated:', isAuthenticated.value)
      return isAuthenticated.value
    }

    if (refreshToken.value) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        await fetchMember()
        return isAuthenticated.value
      }
    }

    // Try OAuth session (Directus cookie-based auth)
    try {
      const oauthResult = await loginWithOAuth()
      if (oauthResult.success) {
        return true
      }
    }
    catch {
      // OAuth session invalid, continue
    }

    return false
  }

  /**
   * OAuth login - get member data via Directus session cookie
   * Called after OAuth callback success
   */
  const loginWithOAuth = async (): Promise<{ success: boolean; error?: string; needsRegistration?: boolean }> => {
    isLoading.value = true
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
        // No member record found
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
    }
    catch (error) {
      console.error('OAuth login error:', error)
      const message = error instanceof Error ? error.message : '登入失敗'
      return { success: false, error: message }
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Get authorization header for API calls
   * Uses X-Member-Token to avoid Directus intercepting the token
   */
  const getAuthHeader = () => {
    if (!accessToken.value) return {}
    return {
      'X-Member-Token': accessToken.value,
    }
  }

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
  }): Promise<{ success: boolean; message: string }> => {
    isLoading.value = true
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
    }
    catch (error: unknown) {
      console.error('Complete profile error:', error)
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || '更新資料失敗，請稍後再試',
        }
      }
      return { success: false, message: '更新資料失敗，請稍後再試' }
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    member,
    isAuthenticated,
    isLoading,
    otpLoading,
    accessToken: computed(() => accessToken.value),
    sendOtp,
    verifyOtp,
    login,
    loginWithOtp,
    loginWithOAuth,
    logout,
    fetchMember,
    checkAuth,
    refreshAccessToken,
    getAuthHeader,
    completeProfile,
  }
}
