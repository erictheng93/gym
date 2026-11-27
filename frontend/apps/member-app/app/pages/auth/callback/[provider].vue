<script lang="ts">
const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  line: 'LINE',
  apple: 'Apple',
}
</script>

<script setup lang="ts">
/**
 * OAuth Provider Callback 頁面
 *
 * 處理社群登入 (Google, LINE, Apple) 的 OAuth callback
 * 從 OAuth 提供者導向回來，帶有 code 和 state 參數
 */

// 不需要 auth middleware，這是 callback 頁面
definePageMeta({
  middleware: [],
  layout: false,
})

const route = useRoute()
const { handleCallback, linkSocialAccount } = useSocialAuth()
const { accessToken } = useAuthTokens()
const { completeOAuthLogin } = useMemberAuth()

// 從路徑取得 provider
const provider = computed(() => route.params.provider as string)

// 從 query 取得 OAuth 參數
const code = computed(() => route.query.code as string | undefined)
const state = computed(() => route.query.state as string | undefined)
// Apple 登入特殊處理 - 用戶資訊以 JSON 字串形式返回
const appleUser = computed(() => route.query.user as string | undefined)
// 錯誤參數
const errorParam = computed(() => route.query.error as string | undefined)
const errorDescription = computed(() => route.query.error_description as string | undefined)

// 狀態
const status = ref<'processing' | 'success' | 'linked' | 'needs_registration' | 'error'>('processing')
const errorMessage = ref('')

let redirectTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (redirectTimer) {
    clearTimeout(redirectTimer)
    redirectTimer = null
  }
})

onMounted(async () => {
  // 檢查是否有錯誤參數 (OAuth 失敗)
  if (errorParam.value) {
    status.value = 'error'
    errorMessage.value = errorDescription.value || `${provider.value} 登入失敗`
    return
  }

  // 檢查是否有授權碼
  if (!code.value) {
    status.value = 'error'
    errorMessage.value = '缺少授權碼，請重新登入'
    return
  }

  // 驗證 provider
  const validProviders = ['google', 'line', 'apple']
  if (!validProviders.includes(provider.value)) {
    status.value = 'error'
    errorMessage.value = '不支援的登入方式'
    return
  }

  // 綁定流程 (已登入會員從個人資料發起)：呼叫 /link，不走登入
  const isLink = typeof window !== 'undefined' && sessionStorage.getItem('oauth_intent') === 'link'
  if (isLink) {
    sessionStorage.removeItem('oauth_intent')
    sessionStorage.removeItem('oauth_state')
    sessionStorage.removeItem('oauth_provider')
    if (!accessToken.value) {
      status.value = 'error'
      errorMessage.value = '請先登入會員後再綁定社群帳號'
      return
    }
    const linkResult = await linkSocialAccount(provider.value, code.value, accessToken.value)
    if (!linkResult.success) {
      status.value = 'error'
      errorMessage.value = linkResult.error || '綁定失敗，請重試'
      return
    }
    status.value = 'linked'
    redirectTimer = setTimeout(() => {
      navigateTo('/profile/security')
      redirectTimer = null
    }, 1500)
    return
  }

  try {
    // 處理 OAuth callback
    const result = await handleCallback(
      provider.value,
      code.value,
      state.value,
      appleUser.value,
    )

    if (!result.success) {
      throw new Error(result.error || '登入失敗')
    }

    // 未綁定會員：不開放自助註冊，導引以驗證碼登入後再綁定
    if (result.needsRegistration) {
      status.value = 'needs_registration'
      return
    }

    // 有現有會員，完成登入
    if (result.accessToken && result.refreshToken) {
      const loginResult = await completeOAuthLogin(
        result.accessToken,
        result.refreshToken,
      )

      if (!loginResult.success) {
        throw new Error(loginResult.error || '無法完成登入')
      }
    }

    // 登入成功
    status.value = 'success'

    // 延遲後導向首頁
    if (redirectTimer) clearTimeout(redirectTimer)
    redirectTimer = setTimeout(() => {
      navigateTo('/')
      redirectTimer = null
    }, 1500)
  }
  catch (err) {
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : '登入失敗，請重試'
  }
})

const goToLogin = () => {
  navigateTo('/login')
}

const goToOtpLogin = () => {
  navigateTo('/login?method=phone')
}

// Provider 名稱對應
const providerName = computed(() => {
  return PROVIDER_NAMES[provider.value] || provider.value
})
</script>

<template>
  <div class="callback-page">
    <div class="callback-container">
      <!-- 處理中 -->
      <div v-if="status === 'processing'" class="callback-content">
        <div class="spinner" />
        <p class="callback-text">
          正在處理 {{ providerName }} 登入...
        </p>
      </div>

      <!-- 成功 -->
      <div v-else-if="status === 'success'" class="callback-content">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <p class="callback-text success">
          登入成功！
        </p>
        <p class="callback-subtext">
          正在前往首頁...
        </p>
      </div>

      <!-- 綁定成功 -->
      <div v-else-if="status === 'linked'" class="callback-content">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <p class="callback-text success">
          已綁定 {{ providerName }} 帳號
        </p>
      </div>

      <!-- 尚未綁定會員 -->
      <div v-else-if="status === 'needs_registration'" class="callback-content" data-testid="needs-binding">
        <div class="info-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <p class="callback-text info">
          此 {{ providerName }} 帳號尚未綁定會員
        </p>
        <p class="callback-subtext">
          會員資料由場館於簽約時建立，無法自行註冊。<br>
          若您已是會員，請先以手機或 Email 驗證碼登入，再到「個人資料 &gt; 安全設定」綁定 {{ providerName }}；
          尚未成為會員請洽櫃台辦理。
        </p>
        <button class="btn btn-primary" @click="goToOtpLogin">
          以手機/Email 驗證碼登入
        </button>
      </div>

      <!-- 錯誤 -->
      <div v-else class="callback-content">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p class="callback-text error">
          {{ errorMessage }}
        </p>
        <button class="btn btn-primary" @click="goToLogin">
          返回登入頁面
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.callback-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.callback-container {
  width: 100%;
  max-width: 360px;
  background-color: #ffffff;
  border-radius: 24px;
  padding: 48px 24px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
}

.callback-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

/* Spinner */
.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #e5e7eb;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Text styles */
.callback-text {
  font-size: 18px;
  font-weight: 500;
  color: #111827;
  margin: 0;
}

.callback-text.success {
  color: #10b981;
}

.callback-text.error {
  color: #ef4444;
}

.callback-text.info {
  color: #3b82f6;
}

.callback-subtext {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}

/* Social info */
.social-info {
  background-color: #f3f4f6;
  border-radius: 12px;
  padding: 12px 16px;
  width: 100%;
}

.social-info p {
  margin: 0;
  font-size: 14px;
  color: #374151;
}

.social-email {
  color: #6b7280 !important;
  font-size: 13px !important;
  margin-top: 4px !important;
}

/* Icons */
.success-icon {
  color: #10b981;
}

.error-icon {
  color: #ef4444;
}

.info-icon {
  color: #3b82f6;
}

/* Button */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  -webkit-tap-highlight-color: transparent;
}

.btn-primary {
  background-color: #10b981;
  color: #ffffff;
}

.btn-primary:active {
  transform: scale(0.98);
  background-color: #059669;
}

/* Dark mode */
:root.theme-dark .callback-container {
  background-color: #1f2937;
}

:root.theme-dark .callback-text {
  color: #f9fafb;
}

:root.theme-dark .callback-subtext {
  color: #9ca3af;
}

:root.theme-dark .spinner {
  border-color: #374151;
  border-top-color: #10b981;
}

:root.theme-dark .social-info {
  background-color: #374151;
}

:root.theme-dark .social-info p {
  color: #f3f4f6;
}

:root.theme-dark .social-email {
  color: #9ca3af !important;
}
</style>
