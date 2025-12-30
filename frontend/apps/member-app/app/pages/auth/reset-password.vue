<script setup lang="ts">
/**
 * 重置密碼頁面
 *
 * 從 URL 取得 token，設定新密碼
 */
definePageMeta({
  layout: false,
  middleware: [],
})

const { resetPassword } = useMemberAuth()
const route = useRoute()

const token = computed(() => route.query.token as string)
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const error = ref('')
const success = ref(false)

// 密碼強度檢查
const passwordStrength = computed(() => {
  const pwd = password.value
  if (!pwd) return { level: 0, text: '', color: '' }

  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/\d/.test(pwd)) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd)) score++

  if (score <= 1) return { level: 1, text: '弱', color: '#ef4444' }
  if (score <= 2) return { level: 2, text: '普通', color: '#f59e0b' }
  if (score <= 3) return { level: 3, text: '良好', color: '#10b981' }
  return { level: 4, text: '強', color: '#3b82f6' }
})

const handleSubmit = async () => {
  error.value = ''

  // 驗證 token
  if (!token.value) {
    error.value = '無效的重置連結，請重新申請'
    return
  }

  // 驗證密碼
  if (!password.value) {
    error.value = '請輸入新密碼'
    return
  }

  if (password.value.length < 8) {
    error.value = '密碼至少需要 8 個字元'
    return
  }

  if (!/\d/.test(password.value)) {
    error.value = '密碼需要包含至少一個數字'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = '兩次輸入的密碼不一致'
    return
  }

  isLoading.value = true

  const result = await resetPassword(token.value, password.value)

  isLoading.value = false

  if (result.success) {
    success.value = true
  } else {
    error.value = result.message || '重置失敗，請稍後再試'
  }
}
</script>

<template>
  <div class="reset-page">
    <!-- 背景裝飾 -->
    <div class="bg-decoration">
      <div class="bg-gradient" />
      <div class="bg-pattern" />
      <div class="bg-glow" />
    </div>

    <!-- 主要內容 -->
    <div class="reset-wrapper">
      <!-- Header -->
      <header class="reset-header">
        <div class="header-content">
          <div class="header-icon">
            <svg v-if="!success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1>{{ success ? '密碼重置成功' : '設定新密碼' }}</h1>
          <p>{{ success ? '您現在可以使用新密碼登入' : '請設定您的新密碼' }}</p>
        </div>
      </header>

      <!-- 表單卡片 -->
      <main class="reset-card">
        <!-- Token 無效 -->
        <div v-if="!token" class="error-state">
          <div class="error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2>連結無效</h2>
          <p>此重置連結無效或已過期。</p>
          <NuxtLink to="/auth/forgot-password" class="action-btn">
            重新申請
          </NuxtLink>
        </div>

        <!-- 成功狀態 -->
        <div v-else-if="success" class="success-state">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2>密碼已更新</h2>
          <p>您的密碼已成功重置。</p>
          <NuxtLink to="/login" class="action-btn primary">
            前往登入
          </NuxtLink>
        </div>

        <!-- 表單 -->
        <form v-else class="reset-form" @submit.prevent="handleSubmit">
          <div class="input-group">
            <label for="password">新密碼</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="至少 8 個字元"
                autocomplete="new-password"
              >
              <button
                type="button"
                class="password-toggle"
                @click="showPassword = !showPassword"
              >
                <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>

            <!-- 密碼強度 -->
            <div v-if="password" class="password-strength">
              <div class="strength-bar">
                <div
                  class="strength-fill"
                  :style="{
                    width: `${passwordStrength.level * 25}%`,
                    backgroundColor: passwordStrength.color
                  }"
                />
              </div>
              <span class="strength-text" :style="{ color: passwordStrength.color }">
                {{ passwordStrength.text }}
              </span>
            </div>
          </div>

          <div class="input-group">
            <label for="confirmPassword">確認密碼</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="再次輸入密碼"
                autocomplete="new-password"
              >
              <button
                type="button"
                class="password-toggle"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <svg v-if="!showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
            <div v-if="confirmPassword && password !== confirmPassword" class="match-error">
              密碼不一致
            </div>
          </div>

          <div class="password-requirements">
            <p>密碼要求：</p>
            <ul>
              <li :class="{ met: password.length >= 8 }">至少 8 個字元</li>
              <li :class="{ met: /\d/.test(password) }">包含數字</li>
            </ul>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>

          <button type="submit" class="submit-btn" :disabled="isLoading">
            <span v-if="!isLoading">重置密碼</span>
            <span v-else class="loading-spinner" />
          </button>
        </form>
      </main>

      <!-- Footer -->
      <footer class="reset-footer">
        <p>© 2025 Gym Nexus. All rights reserved.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   DESIGN SYSTEM - Premium Fitness Aesthetic
   ============================================ */

.reset-page {
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
.reset-page {
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
}

/* Content Wrapper */
.reset-wrapper {
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
.reset-header {
  text-align: center;
  margin-bottom: 24px;
}

.header-content {
  padding-top: 8px;
}

.header-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  color: var(--accent);
}

.header-icon svg {
  width: 100%;
  height: 100%;
}

.reset-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.reset-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* Card */
.reset-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 28px 24px;
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

/* Form */
.reset-form {
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
  padding: 14px 46px;
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

.password-toggle {
  position: absolute;
  right: 12px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.2s;
}

.password-toggle:hover {
  color: var(--text-secondary);
}

.password-toggle svg {
  width: 20px;
  height: 20px;
}

/* Password Strength */
.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.strength-text {
  font-size: 12px;
  font-weight: 500;
  min-width: 32px;
}

.match-error {
  font-size: 12px;
  color: #ef4444;
}

/* Password Requirements */
.password-requirements {
  padding: 12px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
}

.password-requirements p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.password-requirements ul {
  margin: 0;
  padding: 0 0 0 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.password-requirements li {
  margin-bottom: 4px;
  transition: color 0.2s;
}

.password-requirements li.met {
  color: #10b981;
}

.password-requirements li.met::marker {
  content: '✓ ';
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
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.3);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(255, 107, 53, 0.4);
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

/* Success/Error States */
.success-state,
.error-state {
  text-align: center;
  padding: 16px 0;
}

.success-icon,
.error-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
}

.success-icon {
  color: #10b981;
}

.error-icon {
  color: #ef4444;
}

.success-icon svg,
.error-icon svg {
  width: 100%;
  height: 100%;
}

.success-state h2,
.error-state h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.success-state p,
.error-state p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.action-btn {
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

.action-btn:hover {
  background: var(--bg-hover);
}

.action-btn.primary {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
  border: none;
  color: white;
}

.action-btn.primary:hover {
  transform: translateY(-2px);
}

/* Footer */
.reset-footer {
  text-align: center;
  margin-top: 24px;
}

.reset-footer p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Safe Area */
@supports (padding: env(safe-area-inset-bottom)) {
  .reset-page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
}
</style>
