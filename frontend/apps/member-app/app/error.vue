<script setup lang="ts">
/**
 * Global Error Page
 * Handles unrecoverable errors at the application level
 */
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const isNetworkError = computed(() => {
  const message = props.error.message?.toLowerCase() || ''
  return message.includes('network') || message.includes('fetch') || props.error.statusCode === 0
})

const isAuthError = computed(() => {
  return props.error.statusCode === 401 || props.error.statusCode === 403
})

const isNotFound = computed(() => {
  return props.error.statusCode === 404
})

const errorTitle = computed(() => {
  if (isNotFound.value) return '找不到頁面'
  if (isAuthError.value) return '請重新登入'
  if (isNetworkError.value) return '網路連線失敗'
  return '發生錯誤'
})

const errorDescription = computed(() => {
  if (isNotFound.value) return '您要找的頁面不存在或已被移除'
  if (isAuthError.value) return '您的登入已過期，請重新登入'
  if (isNetworkError.value) return '請檢查網路連線後再試'
  return props.error.message || '發生未預期的錯誤，請稍後再試'
})

const handleError = () => {
  if (isAuthError.value) {
    // Clear auth state and redirect to login
    clearError({ redirect: '/login' })
  } else {
    // Go back to home
    clearError({ redirect: '/' })
  }
}

const handleRetry = () => {
  // Reload the current page
  window.location.reload()
}
</script>

<template>
  <div class="error-page">
    <div class="error-container">
      <!-- Error Icon -->
      <div class="error-icon" :class="{ 'network': isNetworkError, 'auth': isAuthError, 'notfound': isNotFound }">
        <!-- Network Error Icon -->
        <svg v-if="isNetworkError" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>

        <!-- Auth Error Icon -->
        <svg v-else-if="isAuthError" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
          <circle cx="12" cy="16" r="1" />
        </svg>

        <!-- Not Found Icon -->
        <svg v-else-if="isNotFound" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
          <path d="M11 8v2M11 14h.01" />
        </svg>

        <!-- Generic Error Icon -->
        <svg v-else width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <!-- Error Content -->
      <h1 class="error-title">{{ errorTitle }}</h1>
      <p class="error-description">{{ errorDescription }}</p>

      <!-- Error Code -->
      <p v-if="error.statusCode && error.statusCode !== 500" class="error-code">
        錯誤代碼: {{ error.statusCode }}
      </p>

      <!-- Actions -->
      <div class="error-actions">
        <button
          v-if="isNetworkError"
          class="btn-primary"
          type="button"
          @click="handleRetry"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          重試
        </button>

        <button
          v-else-if="isAuthError"
          class="btn-primary"
          type="button"
          @click="handleError"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          前往登入
        </button>

        <button
          v-else
          class="btn-primary"
          type="button"
          @click="handleError"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          回首頁
        </button>
      </div>

      <!-- Support Link -->
      <p class="support-text">
        持續發生問題？
        <NuxtLink to="/profile/support" class="support-link" @click="clearError()">
          聯絡客服
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--color-background, #f9fafb);
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 400px;
}

.error-icon {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--color-error, #ef4444);
  margin-bottom: 24px;
}

.error-icon.network {
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.error-icon.auth {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.error-icon.notfound {
  background-color: rgba(107, 114, 128, 0.1);
  color: var(--color-text-secondary, #6b7280);
}

.error-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
  margin-bottom: 12px;
}

.error-description {
  font-size: 16px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.6;
  margin-bottom: 8px;
}

.error-code {
  font-size: 13px;
  color: var(--color-text-tertiary, #9ca3af);
  font-family: monospace;
  margin-bottom: 24px;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  background-color: var(--color-primary, #10b981);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.btn-primary:active {
  opacity: 0.9;
  transform: scale(0.98);
}

.support-text {
  font-size: 14px;
  color: var(--color-text-secondary, #6b7280);
}

.support-link {
  color: var(--color-primary, #10b981);
  text-decoration: none;
  font-weight: 500;
}

.support-link:hover {
  text-decoration: underline;
}
</style>
