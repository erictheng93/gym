/**
 * Social Authentication Composable
 *
 * 處理社群登入 (Google, LINE, Apple, Facebook) 的 OAuth 流程
 * 使用 Directus SSO 端點進行認證
 */

export interface SocialProvider {
  id: string
  name: string
  icon: string
  color: string
  textColor: string
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
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    color: '#1877f2',
    textColor: '#ffffff',
  },
]

export const useSocialAuth = () => {
  const config = useRuntimeConfig()
  const directusUrl = config.public.directusUrl as string

  // 正在處理的 provider
  const loadingProvider = ref<string | null>(null)

  // 錯誤訊息
  const error = ref<string | null>(null)

  /**
   * 取得可用的社群登入提供者
   * 可以根據環境設定過濾
   */
  const availableProviders = computed(() => {
    // 預設只啟用 LINE 和 Google（第一階段）
    const enabledProviders = ['line', 'google']
    return SOCIAL_PROVIDERS.filter(p => enabledProviders.includes(p.id))
  })

  /**
   * 開始 OAuth 登入流程
   * 導向到 Directus SSO 端點
   *
   * @param providerId - 提供者 ID (google, line, apple, facebook)
   */
  const loginWithProvider = (providerId: string) => {
    error.value = null
    loadingProvider.value = providerId

    // 計算 redirect URL (OAuth 完成後返回的頁面)
    const currentOrigin = window.location.origin
    const redirectUrl = `${currentOrigin}/auth/callback`

    // 建構 Directus SSO 登入 URL
    // Directus 會處理 OAuth 流程並設定 session cookie
    const authUrl = `${directusUrl}/auth/login/${providerId}?redirect=${encodeURIComponent(redirectUrl)}`

    // 使用 location.href 進行導向 (PWA 相容，避免 popup)
    window.location.href = authUrl
  }

  /**
   * 處理 OAuth callback
   * 在 /auth/callback 頁面呼叫，用於刷新 session
   */
  const handleCallback = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      // Directus 在 OAuth 流程中已設定 session cookie
      // 我們需要呼叫 refresh 來確保 session 有效
      const response = await fetch(`${directusUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'session' }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.errors?.[0]?.message || '登入失敗')
      }

      return { success: true }
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
    clearError,
  }
}
