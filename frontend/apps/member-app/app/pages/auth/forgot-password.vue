<script setup lang="ts">
/**
 * 忘記密碼頁面
 *
 * 輸入 Email 發送密碼重置郵件
 */
definePageMeta({
  layout: false,
  middleware: [],
})

const { forgotPassword } = useMemberAuth()

const email = ref('')
const isLoading = ref(false)
const error = ref('')
const success = ref(false)

// 開發模式顯示重置連結
const devResetUrl = ref('')

const handleSubmit = async () => {
  if (!email.value || !email.value.includes('@')) {
    error.value = '請輸入有效的電子郵件地址'
    return
  }

  error.value = ''
  isLoading.value = true

  const result = await forgotPassword(email.value)

  isLoading.value = false

  if (result.success) {
    success.value = true
    if (result.resetUrl) {
      devResetUrl.value = result.resetUrl
    }
  } else {
    error.value = result.message || '發送失敗，請稍後再試'
  }
}
</script>

<template>
  <div class="forgot-page">
    <!-- 背景裝飾 -->
    <div class="bg-decoration">
      <div class="bg-gradient" />
      <div class="bg-pattern" />
      <div class="bg-glow" />
    </div>

    <!-- 主要內容 -->
    <div class="forgot-wrapper">
      <!-- Header -->
      <header class="forgot-header">
        <NuxtLink to="/login" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回登入
        </NuxtLink>
        <div class="header-content">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1" />
            </svg>
          </div>
          <h1>忘記密碼</h1>
          <p>輸入您的電子郵件，我們將發送密碼重置連結</p>
        </div>
      </header>

      <!-- 表單卡片 -->
      <main class="forgot-card">
        <!-- 成功狀態 -->
        <div v-if="success" class="success-state">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2>郵件已發送</h2>
          <p>
            如果 <strong>{{ email }}</strong> 有註冊帳號，<br>
            您將會收到密碼重置郵件。
          </p>
          <p class="hint">請查看收件匣（或垃圾郵件資料夾）</p>

          <!-- 開發模式顯示連結 -->
          <div v-if="devResetUrl" class="dev-url">
            <p class="dev-label">開發模式：</p>
            <a :href="devResetUrl" class="dev-link">點此重置密碼</a>
          </div>

          <NuxtLink to="/login" class="back-btn">
            返回登入
          </NuxtLink>
        </div>

        <!-- 表單 -->
        <form v-else class="forgot-form" @submit.prevent="handleSubmit">
          <div class="input-group">
            <label for="email">電子郵件</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 6-10 7L2 6" />
              </svg>
              <input
                id="email"
                v-model="email"
                type="email"
                placeholder="your@email.com"
                autocomplete="email"
              >
            </div>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>

          <button type="submit" class="submit-btn" :disabled="isLoading">
            <span v-if="!isLoading">發送重置連結</span>
            <span v-else class="loading-spinner" />
          </button>
        </form>
      </main>

      <!-- Footer -->
      <footer class="forgot-footer">
        <p>© 2025 Gym Nexus. All rights reserved.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   DESIGN SYSTEM - Premium Fitness Aesthetic
   ============================================ */

.forgot-page {
  --accent: #FF6B35;
  --accent-light: #FF8F66;
  --accent-dark: #E55A2B;
  --accent-glow: rgba(255, 107, 53, 0.4);

  --bg-deep: #0A0A0F;
  --bg-card: #141419;
  --bg-input: #1C1C24;
  --bg-hover: #252530;

  --text-primary: #FFFFFF;
  --text-secondary: #8E8E9A;
  --text-muted: #5A5A66;

  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-medium: rgba(255, 255, 255, 0.12);

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

/* Base Layout */
.forgot-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-deep);
  position: relative;
  overflow: hidden;
}

/* Background Decoration */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 107, 53, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(255, 143, 102, 0.08) 0%, transparent 40%);
}

.bg-pattern {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 20%, transparent 70%);
}

.bg-glow {
  position: absolute;
  top: -200px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 60%);
  filter: blur(80px);
  opacity: 0.5;
  animation: pulse-glow 4s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.7; transform: translateX(-50%) scale(1.1); }
}

/* Content Wrapper */
.forgot-wrapper {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
  animation: fade-up 0.6s var(--ease-out) both;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Header */
.forgot-header {
  text-align: center;
  margin-bottom: 24px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  margin-bottom: 24px;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--text-primary);
}

.back-link svg {
  width: 18px;
  height: 18px;
}

.header-content {
  padding-top: 8px;
}

.header-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  color: var(--accent);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.header-icon svg {
  width: 100%;
  height: 100%;
}

.forgot-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.forgot-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Card */
.forgot-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 28px 24px;
  backdrop-filter: blur(20px);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

/* Form */
.forgot-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  width: 20px;
  height: 20px;
  color: var(--text-muted);
  pointer-events: none;
  transition: color 0.2s;
}

.input-wrapper:focus-within .input-icon {
  color: var(--accent);
}

.input-wrapper input {
  width: 100%;
  padding: 14px 14px 14px 46px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 16px;
  color: var(--text-primary);
  transition: all 0.2s var(--ease-out);
  outline: none;
}

.input-wrapper input::placeholder {
  color: var(--text-muted);
}

.input-wrapper input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Error Message */
.error-message {
  font-size: 13px;
  color: #FF4757;
  text-align: center;
  padding: 10px 14px;
  background: rgba(255, 71, 87, 0.1);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 71, 87, 0.2);
  margin: 0;
}

/* Submit Button */
.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px 24px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
  box-shadow:
    0 4px 16px rgba(255, 107, 53, 0.3),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 6px 24px rgba(255, 107, 53, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success State */
.success-state {
  text-align: center;
  padding: 16px 0;
}

.success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  color: #10b981;
}

.success-icon svg {
  width: 100%;
  height: 100%;
}

.success-state h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.success-state p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 8px;
  line-height: 1.6;
}

.success-state .hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  background: var(--bg-input);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}

/* Dev URL (開發模式) */
.dev-url {
  margin: 20px 0;
  padding: 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-md);
}

.dev-label {
  font-size: 12px;
  color: #60a5fa;
  margin: 0 0 8px;
}

.dev-link {
  color: #60a5fa;
  font-size: 13px;
  word-break: break-all;
}

/* Footer */
.forgot-footer {
  text-align: center;
  margin-top: 24px;
}

.forgot-footer p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Safe Area */
@supports (padding: env(safe-area-inset-bottom)) {
  .forgot-page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
}
</style>
