/**
 * Social Authentication Composable
 *
 * 處理社群登入 (Google, LINE, Apple) 的 OAuth 流程
 * 使用 backend-v2 OAuth 端點進行認證
 */

export interface SocialProvider {
  id: string
  name: string
  icon: string
  color: string
  textColor: string
}

export interface SocialAuthResult {
  success: boolean
  isNewMember?: boolean
  needsRegistration?: boolean
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  member?: {
    id: string
    memberCode: string
    fullName: string
    status: string
  }
  branch?: {
    name: string
  }
  socialInfo?: {
    provider: string
    providerUserId: string
    email?: string
    displayName?: string
    avatarUrl?: string
  }
  error?: string
}

// 可用的社群登入提供者
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: 'line',
    name: 'LINE',
    icon: 'line',
    color: '#00c300',
    textColor: '#ffffff',
  },
  {
    id: 'google',
    name: 'Google',
    icon: 'google',
    color: '#ffffff',
    textColor: '#757575',
  },
  {
    id: 'apple',
    name: 'Apple',
    icon: 'apple',
    color: '#000000',
    textColor: '#ffffff',
  },
]

export const useSocialAuth = () => {
  const config = useRuntimeConfig()
  const apiBaseUrl = config.public.apiBaseUrl as string

  // 正在處理的 provider
  const loadingProvider = ref<string | null>(null)

  // 錯誤訊息
  const error = ref<string | null>(null)

  // 儲存 OAuth state 用於驗證
  const oauthState = ref<string | null>(null)

  /**
   * 取得可用的社群登入提供者
   * 從後端 API 獲取已啟用的提供者
   */
  const availableProviders = computed(() => {
    // 啟用 LINE、Google、Apple 登入
    const enabledProviders = ['line', 'google', 'apple']
    return SOCIAL_PROVIDERS.filter(p => enabledProviders.includes(p.id))
  })

  /**
   * 從 API 獲取已啟用的提供者列表
   */
  const fetchEnabledProviders = async (): Promise<SocialProvider[]> => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/member/oauth/providers`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        return []
      }

      const result = await response.json()
      if (result.success && result.data?.providers) {
        const enabledIds = result.data.providers.map((p: { provider: string }) => p.provider)
        return SOCIAL_PROVIDERS.filter(p => enabledIds.includes(p.id))
      }

      return []
    }
    catch {
      return []
    }
  }

  /**
   * 開始 OAuth 登入流程
   * 從 backend-v2 獲取授權 URL 後導向
   *
   * @param providerId - 提供者 ID (google, line, apple)
   */
  const loginWithProvider = async (providerId: string) => {
    error.value = null
    loadingProvider.value = providerId

    try {
      // 計算 redirect URL (OAuth 完成後返回的頁面)
      const currentOrigin = window.location.origin
      const redirectUrl = `${currentOrigin}/auth/callback/${providerId}`

      // 從 backend-v2 獲取 OAuth 授權 URL
      const response = await fetch(
        `${apiBaseUrl}/api/member/oauth/${providerId}/init?redirect=${encodeURIComponent(redirectUrl)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `${providerId} 登入尚未設定`)
      }

      const result = await response.json()

      if (!result.success || !result.data?.authUrl) {
        throw new Error(result.error || '無法取得授權 URL')
      }

      // 儲存 state 用於 callback 驗證
      oauthState.value = result.data.state

      // 儲存 state 到 sessionStorage (用於跨頁面傳遞)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('oauth_state', result.data.state)
        sessionStorage.setItem('oauth_provider', providerId)
      }

      // 使用 location.href 進行導向 (PWA 相容，避免 popup)
      window.location.href = result.data.authUrl
    }
    catch (err) {
      const message = err instanceof Error ? err.message : '登入失敗，請重試'
      error.value = message
      loadingProvider.value = null
    }
  }

  /**
   * 處理 OAuth callback
   * 在 /auth/callback/:provider 頁面呼叫
   *
   * @param providerId - 提供者 ID
   * @param code - OAuth 授權碼
   * @param state - OAuth state (用於驗證)
   * @param appleUser - Apple 登入時的用戶資訊 (僅首次授權)
   */
  const handleCallback = async (
    providerId: string,
    code: string,
    state?: string,
    appleUser?: string,
  ): Promise<SocialAuthResult> => {
    loadingProvider.value = providerId

    try {
      // 從 sessionStorage 獲取儲存的 state
      const storedState = typeof window !== 'undefined'
        ? sessionStorage.getItem('oauth_state')
        : null

      // 驗證 state (如果有提供)
      if (state && storedState && state !== storedState) {
        throw new Error('授權狀態無效，請重新登入')
      }

      // 呼叫 backend-v2 處理 OAuth callback
      const response = await fetch(`${apiBaseUrl}/api/member/oauth/${providerId}/callback`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          state: state || storedState,
          user: appleUser, // Apple 登入時的用戶資訊
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '登入失敗')
      }

      // 清除 sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('oauth_state')
        sessionStorage.removeItem('oauth_provider')
      }

      // 返回結果
      return {
        success: true,
        isNewMember: result.data.isNewMember,
        needsRegistration: result.data.needsRegistration,
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresIn: result.data.expiresIn,
        member: result.data.member,
        branch: result.data.branch,
        socialInfo: result.data.socialInfo,
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : '登入失敗，請重試'
      error.value = message
      return { success: false, error: message }
    }
    finally {
      loadingProvider.value = null
    }
  }

  /**
   * 連結社交帳號 (已登入的會員)
   *
   * @param providerId - 提供者 ID
   * @param code - OAuth 授權碼
   * @param memberToken - 會員 JWT token
   */
  const linkSocialAccount = async (
    providerId: string,
    code: string,
    memberToken: string,
  ): Promise<{ success: boolean; error?: string }> => {
    loadingProvider.value = providerId

    try {
      const response = await fetch(`${apiBaseUrl}/api/member/oauth/link`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Member-Token': memberToken,
        },
        body: JSON.stringify({
          provider: providerId,
          code,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '連結失敗')
      }

      return { success: true }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : '連結失敗，請重試'
      error.value = message
      return { success: false, error: message }
    }
    finally {
      loadingProvider.value = null
    }
  }

  /**
   * 取消連結社交帳號
   *
   * @param providerId - 提供者 ID
   * @param memberToken - 會員 JWT token
   */
  const unlinkSocialAccount = async (
    providerId: string,
    memberToken: string,
  ): Promise<{ success: boolean; error?: string }> => {
    loadingProvider.value = providerId

    try {
      const response = await fetch(`${apiBaseUrl}/api/member/oauth/${providerId}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-Member-Token': memberToken,
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '取消連結失敗')
      }

      return { success: true }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : '取消連結失敗，請重試'
      error.value = message
      return { success: false, error: message }
    }
    finally {
      loadingProvider.value = null
    }
  }

  /**
   * 清除錯誤狀態
   */
  const clearError = () => {
    error.value = null
  }

  return {
    // State
    loadingProvider: readonly(loadingProvider),
    error: readonly(error),
    availableProviders,

    // Methods
    loginWithProvider,
    handleCallback,
    linkSocialAccount,
    unlinkSocialAccount,
    fetchEnabledProviders,
    clearError,
  }
}
