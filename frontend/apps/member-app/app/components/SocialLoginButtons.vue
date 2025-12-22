<script setup lang="ts">
/**
 * 社群登入按鈕組件
 *
 * 顯示可用的社群登入選項 (LINE, Google, Apple, Facebook)
 * 點擊後會導向到對應的 OAuth 流程
 */

const { availableProviders, loadingProvider, loginWithProvider } = useSocialAuth()

const handleLogin = (providerId: string) => {
  loginWithProvider(providerId)
}

// SVG 圖標
const icons = {
  line: `<path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>`,
  google: `<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`,
  apple: `<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>`,
  facebook: `<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>`,
}
</script>

<template>
  <div class="social-login">
    <!-- 分隔線 -->
    <div class="divider">
      <span>或使用以下方式登入</span>
    </div>

    <!-- 社群登入按鈕 -->
    <div class="social-buttons">
      <button
        v-for="provider in availableProviders"
        :key="provider.id"
        class="social-btn"
        :class="{ 'social-btn-outline': provider.id === 'google' }"
        :style="{
          backgroundColor: provider.color,
          color: provider.textColor,
        }"
        :disabled="loadingProvider !== null"
        @click="handleLogin(provider.id)"
      >
        <!-- 圖標 -->
        <svg
          class="social-icon"
          viewBox="0 0 24 24"
          :fill="provider.id === 'google' ? 'none' : 'currentColor'"
          v-html="icons[provider.id as keyof typeof icons]"
        />

        <!-- 文字 -->
        <span>
          {{ loadingProvider === provider.id ? '登入中...' : `使用 ${provider.name} 登入` }}
        </span>
      </button>
    </div>

    <!-- 提示文字 -->
    <p class="social-hint">
      首次登入將自動建立會員帳號
    </p>
  </div>
</template>

<style scoped>
.social-login {
  margin-top: 32px;
}

.divider {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background-color: rgba(255, 255, 255, 0.3);
}

.divider span {
  padding: 0 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.social-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.social-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 14px 20px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.social-btn-outline {
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.social-btn:active {
  transform: scale(0.98);
}

.social-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.social-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.social-hint {
  margin-top: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

/* 深色模式調整 */
@media (prefers-color-scheme: dark) {
  .divider::before,
  .divider::after {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .social-btn-outline {
    border-color: rgba(255, 255, 255, 0.2);
  }
}
</style>
