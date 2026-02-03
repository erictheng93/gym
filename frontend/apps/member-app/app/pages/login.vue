<script setup lang="ts">
/**
 * 會員登入頁面
 * 支援：Email/密碼登入、手機 OTP 登入、社群登入 (LINE, Google, Apple)
 */
import { loginSchema, otpRequestSchema, otpVerifySchema } from '../schemas/auth.schema'
import { useFormValidation } from '../composables/useFormValidation'

definePageMeta({
  layout: false
})

const { sendOtp: sendOtpApi, verifyOtp, login, isLoading, otpLoading } = useMemberAuth()
const { availableProviders, loadingProvider, loginWithProvider } = useSocialAuth()

// Form validation
const emailForm = useFormValidation(loginSchema)
const phoneForm = useFormValidation(otpRequestSchema)
const otpForm = useFormValidation(otpVerifySchema)

// 登入方式切換
type LoginMethod = 'email' | 'phone'
const loginMethod = ref<LoginMethod>('email')

// Email 登入
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const emailLoading = ref(false)

// Phone OTP 登入
const phone = ref('')
const otp = ref('')
const otpStep = ref<'phone' | 'otp'>('phone')
const otpSent = ref(false)
const countdown = ref(0)
const devOtp = ref('')

let countdownTimer: ReturnType<typeof setInterval> | null = null

const error = ref('')

// Email 登入處理
const handleEmailLogin = async () => {
  const result = emailForm.validate({ email: email.value, password: password.value })

  if (!result.success) {
    // Show first validation error
    const firstError = Object.values(emailForm.errors.value)[0]
    error.value = firstError || '請檢查輸入資料'
    return
  }

  error.value = ''
  emailLoading.value = true

  try {
    const loginResult = await login(result.data.email as string, result.data.password as string)

    if (loginResult.success) {
      await navigateTo('/')
    } else {
      error.value = loginResult.message || '登入失敗，請檢查帳號密碼'
    }
  } catch {
    error.value = '登入發生錯誤，請稍後再試'
  } finally {
    emailLoading.value = false
  }
}

// Phone OTP 發送
const sendOtp = async () => {
  const result = phoneForm.validate({ phone: phone.value })

  if (!result.success) {
    const firstError = Object.values(phoneForm.errors.value)[0]
    error.value = firstError || '請輸入有效的手機號碼'
    return
  }

  error.value = ''
  const sendResult = await sendOtpApi(result.data.phone as string)

  if (sendResult.success) {
    otpSent.value = true
    otpStep.value = 'otp'

    if (sendResult.otp) {
      devOtp.value = sendResult.otp
    }

    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  } else {
    error.value = sendResult.message || '發送驗證碼失敗'
  }
}

// Phone OTP 驗證
const handleOtpLogin = async () => {
  const result = otpForm.validate({ phone: phone.value, code: otp.value })

  if (!result.success) {
    const firstError = Object.values(otpForm.errors.value)[0]
    error.value = firstError || '請輸入驗證碼'
    return
  }

  error.value = ''
  const verifyResult = await verifyOtp(result.data.phone as string, result.data.code as string)

  if (verifyResult.success) {
    await navigateTo('/')
  } else {
    error.value = verifyResult.message || '驗證碼錯誤'
  }
}

// 返回手機輸入
const goBackToPhone = () => {
  otpStep.value = 'phone'
  otp.value = ''
  error.value = ''
}

// 切換登入方式時清除錯誤
watch(loginMethod, () => {
  error.value = ''
  emailForm.clearErrors()
  phoneForm.clearErrors()
  otpForm.clearErrors()
})

// 社群登入
const handleSocialLogin = (providerId: string) => {
  loginWithProvider(providerId)
}

// 社群圖標 SVG
const socialIcons = {
  line: `<path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>`,
  google: `<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`,
  apple: `<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>`,
}

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<template>
  <div class="login-page">
    <!-- 背景裝飾 -->
    <div class="bg-decoration">
      <div class="bg-gradient"></div>
      <div class="bg-pattern"></div>
      <div class="bg-glow"></div>
    </div>

    <!-- 主要內容 -->
    <div class="login-wrapper">
      <!-- Logo 區域 -->
      <header class="login-header">
        <div class="logo-container">
          <div class="logo-icon">
            <!-- 健身啞鈴圖標 -->
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="4" y="18" width="8" height="12" rx="2" fill="currentColor" />
              <rect x="36" y="18" width="8" height="12" rx="2" fill="currentColor" />
              <rect x="10" y="14" width="6" height="20" rx="2" fill="currentColor" />
              <rect x="32" y="14" width="6" height="20" rx="2" fill="currentColor" />
              <rect x="14" y="21" width="20" height="6" rx="1" fill="currentColor" />
            </svg>
          </div>
          <div class="logo-text">
            <h1>GYM NEXUS</h1>
            <p>會員登入</p>
          </div>
        </div>
      </header>

      <!-- 登入卡片 -->
      <main class="login-card">
        <!-- 登入方式切換 Tab -->
        <div class="login-tabs">
          <button
            class="tab-btn"
            :class="{ active: loginMethod === 'email' }"
            @click="loginMethod = 'email'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 6-10 7L2 6" />
            </svg>
            電子郵件
          </button>
          <button
            class="tab-btn"
            :class="{ active: loginMethod === 'phone' }"
            @click="loginMethod = 'phone'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12" y2="18" />
            </svg>
            手機驗證
          </button>
          <div class="tab-indicator" :class="loginMethod"></div>
        </div>

        <!-- Email 登入表單 -->
        <Transition name="fade-slide" mode="out-in">
          <form
            v-if="loginMethod === 'email'"
            key="email"
            class="login-form"
            @submit.prevent="handleEmailLogin"
          >
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
                />
              </div>
            </div>

            <div class="input-group">
              <label for="password">密碼</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="••••••••"
                  autocomplete="current-password"
                />
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
            </div>

            <div class="form-footer">
              <NuxtLink to="/auth/forgot-password" class="forgot-link">忘記密碼？</NuxtLink>
            </div>

            <p v-if="error" class="error-message">{{ error }}</p>

            <button type="submit" class="submit-btn" :disabled="emailLoading">
              <span v-if="!emailLoading">登入</span>
              <span v-else class="loading-spinner"></span>
            </button>
          </form>

          <!-- Phone OTP 表單 -->
          <form
            v-else
            key="phone"
            class="login-form"
            @submit.prevent="otpStep === 'phone' ? sendOtp() : handleOtpLogin()"
          >
            <!-- 手機號碼輸入 -->
            <template v-if="otpStep === 'phone'">
              <div class="input-group">
                <label for="phone">手機號碼</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" />
                  </svg>
                  <input
                    id="phone"
                    v-model="phone"
                    type="tel"
                    placeholder="0912 345 678"
                    inputmode="tel"
                    autocomplete="tel"
                  />
                </div>
              </div>

              <p v-if="error" class="error-message">{{ error }}</p>

              <button type="submit" class="submit-btn" :disabled="otpLoading">
                <span v-if="!otpLoading">發送驗證碼</span>
                <span v-else class="loading-spinner"></span>
              </button>
            </template>

            <!-- OTP 驗證碼輸入 -->
            <template v-else>
              <button type="button" class="back-btn" @click="goBackToPhone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                返回
              </button>

              <p class="otp-sent-hint">
                驗證碼已發送至 <strong>{{ phone }}</strong>
              </p>

              <div class="input-group">
                <label for="otp">驗證碼</label>
                <div class="input-wrapper otp-input-wrapper">
                  <input
                    id="otp"
                    v-model="otp"
                    type="text"
                    class="otp-input"
                    placeholder="• • • •"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="6"
                    autocomplete="one-time-code"
                  />
                </div>
              </div>

              <p v-if="error" class="error-message">{{ error }}</p>

              <button type="submit" class="submit-btn" :disabled="isLoading">
                <span v-if="!isLoading">驗證並登入</span>
                <span v-else class="loading-spinner"></span>
              </button>

              <div class="resend-section">
                <button
                  v-if="countdown <= 0"
                  type="button"
                  class="resend-btn"
                  @click="sendOtp"
                >
                  重新發送驗證碼
                </button>
                <p v-else class="countdown-text">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12,6 12,12 16,14" />
                  </svg>
                  {{ countdown }} 秒後可重新發送
                </p>
              </div>
            </template>
          </form>
        </Transition>

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
            :class="`social-btn-${provider.id}`"
            :disabled="loadingProvider !== null"
            @click="handleSocialLogin(provider.id)"
          >
            <svg
              class="social-icon"
              viewBox="0 0 24 24"
              :fill="provider.id === 'google' ? 'none' : 'currentColor'"
              v-html="socialIcons[provider.id as keyof typeof socialIcons]"
            />
            <span class="social-label">{{ provider.name }}</span>
          </button>
        </div>

        <!-- 註冊提示 -->
        <p class="signup-hint">
          還沒有帳號？<a href="#">聯繫客服開通</a>
        </p>
      </main>

      <!-- Footer -->
      <footer class="login-footer">
        <p>© 2025 Gym Nexus. All rights reserved.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
@import url('https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap');

/* ============================================
   DESIGN SYSTEM - Premium Fitness Aesthetic
   ============================================ */

/* Custom Properties */
.login-page {
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
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Font Import - Clash Display */
  font-family: 'Clash Display', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}


/* Base Layout */
.login-page {
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
.login-wrapper {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
  animation: fade-up 0.6s var(--ease-out) both;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  color: var(--accent);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.logo-icon svg {
  width: 100%;
  height: 100%;
}

.logo-text h1 {
  font-family: 'Clash Display', sans-serif;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-primary);
  margin: 0;
}

.logo-text p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 4px 0 0;
  letter-spacing: 0.05em;
}

/* Login Card */
.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 32px 28px;
  backdrop-filter: blur(20px);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

/* Login Tabs */
.login-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  position: relative;
  margin-bottom: 28px;
}

.tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  position: relative;
  z-index: 1;
}

.tab-btn svg {
  width: 18px;
  height: 18px;
}

.tab-btn.active {
  color: var(--text-primary);
}

.tab-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  transition: transform 0.3s var(--ease-spring);
}

.tab-indicator.phone {
  transform: translateX(100%);
}

/* Form Styles */
.login-form {
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

.form-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: -8px;
}

.forgot-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  transition: opacity 0.2s;
}

.forgot-link:hover {
  opacity: 0.8;
}

/* OTP Input */
.otp-input-wrapper {
  justify-content: center;
}

.otp-input {
  text-align: center;
  font-size: 28px !important;
  font-weight: 600;
  letter-spacing: 12px;
  padding: 16px 20px !important;
  font-family: 'Clash Display', monospace;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
  transition: color 0.2s;
}

.back-btn:hover {
  color: var(--text-primary);
}

.back-btn svg {
  width: 18px;
  height: 18px;
}

.otp-sent-hint {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 8px;
}

.otp-sent-hint strong {
  color: var(--text-primary);
}

.resend-section {
  text-align: center;
}

.resend-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.resend-btn:hover {
  opacity: 0.8;
}

.countdown-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.countdown-text svg {
  width: 16px;
  height: 16px;
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

/* Divider */
.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 28px 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-medium);
}

.divider span {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Social Buttons */
.social-buttons {
  display: flex;
  gap: 12px;
}

.social-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.social-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-medium);
  transform: translateY(-2px);
}

.social-btn:active:not(:disabled) {
  transform: translateY(0);
}

.social-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.social-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.social-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Social Button Colors */
.social-btn-line {
  color: #06C755;
}

.social-btn-google .social-icon {
  color: var(--text-primary);
}

.social-btn-apple {
  color: var(--text-primary);
}

/* Hide labels on small screens */
@media (max-width: 380px) {
  .social-label {
    display: none;
  }

  .social-btn {
    padding: 14px;
  }
}

/* Signup Hint */
.signup-hint {
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 24px;
}

.signup-hint a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.signup-hint a:hover {
  text-decoration: underline;
}

/* Footer */
.login-footer {
  text-align: center;
  margin-top: 32px;
}

.login-footer p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s var(--ease-out);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}

/* Safe Area */
@supports (padding: env(safe-area-inset-bottom)) {
  .login-page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
}

/* PWA Standalone */
@media (display-mode: standalone) {
  .login-header {
    padding-top: env(safe-area-inset-top);
  }
}
</style>
