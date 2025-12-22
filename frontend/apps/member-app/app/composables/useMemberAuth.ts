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
  // User info for admin users without member records
  const user = useState<{ id: string; email: string; name: string } | null>('current_user', () => null)
  const isAuthenticated = computed(() => !!member.value || !!user.value)
  const isLoading = useState('member_auth_loading', () => false)
  const otpLoading = useState('otp_loading', () => false)

  // Token management
  const accessToken = useCookie('member_access_token', {
    maxAge: 60 * 60 * 24, // 24 hours
    secure: true,
    sameSite: 'strict',
  })

  const refreshToken = useCookie('member_refresh_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: true,
    sameSite: 'strict',
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

        // Fetch full member profile
        await fetchMember()

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
   * Email/Password login using Directus auth
   */
  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    isLoading.value = true
    try {
      // Directus standard login
      const response = await $fetch<{
        data: {
          access_token: string
          refresh_token: string
          expires: number
        }
      }>(`${apiUrl}/auth/login`, {
        method: 'POST',
        body: { email, password },
      })

      if (response.data?.access_token) {
        // Store tokens
        accessToken.value = response.data.access_token
        refreshToken.value = response.data.refresh_token

        // Try to fetch member profile (may not exist for admin users)
        await fetchMember()

        // If no member record, fetch basic user info for admin users
        if (!member.value) {
          await fetchUser()
        }

        // Login successful - admin users may not have member records
        return { success: true, message: '登入成功' }
      }

      return { success: false, message: '登入失敗' }
    } catch (error: unknown) {
      console.error('Login error:', error)
      // Handle $fetch error response
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { errors?: Array<{ message?: string }> } }
        const errorMessage = fetchError.data?.errors?.[0]?.message || '帳號或密碼錯誤'
        return { success: false, message: errorMessage }
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
    user.value = null
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
   */
  const fetchMember = async () => {
    if (!accessToken.value) {
      member.value = null
      return
    }

    try {
      const response = await $fetch<MemberProfileResponse>(`${apiUrl}/gym/member/me`, {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      })

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
      } else {
        member.value = null
      }
    } catch (error) {
      console.error('Failed to fetch member:', error)

      // Try to refresh token
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        // Retry fetching member
        return await fetchMember()
      }

      member.value = null
    }
  }

  /**
   * Fetch current user info (for admin users without member records)
   */
  const fetchUser = async () => {
    if (!accessToken.value) {
      user.value = null
      return
    }

    try {
      const response = await $fetch<{
        data: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
        }
      }>(`${apiUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      })

      if (response.data?.id) {
        user.value = {
          id: response.data.id,
          email: response.data.email,
          name: [response.data.first_name, response.data.last_name].filter(Boolean).join(' ') || response.data.email,
        }
      } else {
        user.value = null
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      user.value = null
    }
  }

  /**
   * Check authentication status
   */
  const checkAuth = async (): Promise<boolean> => {
    if (member.value || user.value) {
      return true
    }

    if (accessToken.value) {
      await fetchMember()
      if (!member.value) {
        await fetchUser()
      }
      return isAuthenticated.value
    }

    if (refreshToken.value) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        await fetchMember()
        if (!member.value) {
          await fetchUser()
        }
        return isAuthenticated.value
      }
    }

    // 嘗試 OAuth session (Directus cookie-based auth)
    try {
      const oauthResult = await loginWithOAuth()
      if (oauthResult.success) {
        return true
      }
    }
    catch {
      // OAuth session 無效，繼續
    }

    return false
  }

  /**
   * OAuth 登入 - 透過 Directus session cookie 取得會員資料
   * 在 OAuth callback 成功後呼叫此方法
   */
  const loginWithOAuth = async (): Promise<{ success: boolean; error?: string; needsRegistration?: boolean }> => {
    isLoading.value = true
    try {
      // 使用 Directus session cookie 取得當前用戶
      const userResponse = await $fetch<{ data: { id: string; email: string; first_name: string | null; last_name: string | null } }>(`${apiUrl}/users/me`, {
        credentials: 'include',
      })

      if (!userResponse.data?.id) {
        return { success: false, error: '無法取得用戶資料' }
      }

      const userId = userResponse.data.id

      // 透過 user_id 查詢會員資料
      const membersResponse = await $fetch<{ data: (CurrentMember & { branch: { name: string } | null; contracts: Contract[] })[] }>(`${apiUrl}/items/members`, {
        credentials: 'include',
        params: {
          'filter[user_id][_eq]': userId,
          'fields': 'id,member_code,full_name,phone,email,branch_id,member_status,branch.name,contracts.id,contracts.contract_status,contracts.end_date,contracts.remaining_counts,contracts.plan_id.name,contracts.plan_id.plan_type',
          'limit': 1,
        },
      })

      if (!membersResponse.data || membersResponse.data.length === 0) {
        // 沒有找到會員記錄 - 可能 hook 還沒建立
        return {
          success: false,
          error: '找不到會員資料，請稍後再試',
          needsRegistration: true,
        }
      }

      const memberData = membersResponse.data[0]

      // 找到有效合約
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
   */
  const getAuthHeader = () => {
    if (!accessToken.value) return {}
    return {
      Authorization: `Bearer ${accessToken.value}`,
    }
  }

  return {
    member,
    user,
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
    fetchUser,
    checkAuth,
    refreshAccessToken,
    getAuthHeader,
  }
}
