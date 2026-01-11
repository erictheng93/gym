<script setup lang="ts">
/**
 * OAuth Callback 頁面
 *
 * 處理社群登入 (Google, LINE, Apple, Facebook) 的 OAuth callback
 * Directus 會在 OAuth 完成後導向到這個頁面
 */

// 不需要 auth middleware，這是 callback 頁面
definePageMeta({
  middleware: [],
  layout: false,
})

const { handleCallback } = useSocialAuth()
const { loginWithOAuth } = useMemberAuth()

// 狀態
const status = ref<'processing' | 'success' | 'error'>('processing')
const errorMessage = ref('')

onMounted(async () => {
  try {
    // 步驟 1: 處理 OAuth callback (刷新 session)
    const callbackResult = await handleCallback()

    if (!callbackResult.success) {
      throw new Error(callbackResult.error || '登入失敗')
    }

    // 步驟 2: 完成登入並取得會員資料
    const loginResult = await loginWithOAuth()

    if (!loginResult.success) {
      // 特殊處理：需要完成註冊
      if (loginResult.needsRegistration) {
        // TODO: 導向到完成資料頁面
        await navigateTo('/auth/complete-profile')
        return
      }
      throw new Error(loginResult.error || '無法取得會員資料')
    }

    // 登入成功
    status.value = 'success'

    // 延遲後導向首頁
    setTimeout(() => {
      navigateTo('/')
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
</script>

<template>
  <div class="callback-page">
    <div class="callback-container">
      <!-- 處理中 -->
      <div v-if="status === 'processing'" class="callback-content">
        <div class="spinner" />
        <p class="callback-text">
          正在登入...
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

.callback-subtext {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

/* Icons */
.success-icon {
  color: #10b981;
}

.error-icon {
  color: #ef4444;
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
@media (prefers-color-scheme: dark) {
  .callback-container {
    background-color: #1f2937;
  }

  .callback-text {
    color: #f9fafb;
  }

  .callback-subtext {
    color: #9ca3af;
  }

  .spinner {
    border-color: #374151;
    border-top-color: #10b981;
  }
}
</style>
