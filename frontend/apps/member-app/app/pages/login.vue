<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const { sendOtp: sendOtpApi, verifyOtp, isLoading, otpLoading } = useMemberAuth()

const phone = ref('')
const otp = ref('')
const step = ref<'phone' | 'otp'>('phone')
const error = ref('')
const otpSent = ref(false)
const countdown = ref(0)
const devOtp = ref('') // For development: show OTP in console

let countdownTimer: ReturnType<typeof setInterval> | null = null

const sendOtp = async () => {
  if (!phone.value || phone.value.length < 10) {
    error.value = '請輸入有效的手機號碼'
    return
  }

  error.value = ''

  const result = await sendOtpApi(phone.value)

  if (result.success) {
    otpSent.value = true
    step.value = 'otp'

    // For development: auto-fill OTP if returned
    if (result.otp) {
      devOtp.value = result.otp
      console.log(`[DEV] OTP: ${result.otp}`)
    }

    // Start countdown
    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  } else {
    error.value = result.message || '發送驗證碼失敗'
  }
}

const handleLogin = async () => {
  if (!otp.value || otp.value.length < 4) {
    error.value = '請輸入驗證碼'
    return
  }

  error.value = ''
  const result = await verifyOtp(phone.value, otp.value)

  if (result.success) {
    await navigateTo('/')
  } else {
    error.value = result.message || '登入失敗'
  }
}

const goBack = () => {
  step.value = 'phone'
  otp.value = ''
  error.value = ''
}

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- Logo -->
      <div class="logo-section">
        <div class="logo">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="16" fill="#10b981" />
            <path
              d="M20 32h24M32 20v24M24 24l16 16M40 24L24 40"
              stroke="white"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <h1 class="app-name">Gym Nexus</h1>
        <p class="app-tagline">會員入場系統</p>
      </div>

      <!-- Phone Step -->
      <form v-if="step === 'phone'" class="login-form" @submit.prevent="sendOtp">
        <div class="form-group">
          <label class="form-label">手機號碼</label>
          <input
            v-model="phone"
            type="tel"
            class="input"
            placeholder="0912345678"
            inputmode="tel"
            autocomplete="tel"
          />
        </div>

        <p v-if="error" class="error-message">{{ error }}</p>

        <button type="submit" class="btn btn-primary btn-block" :disabled="otpLoading">
          {{ otpLoading ? '發送中...' : '發送驗證碼' }}
        </button>
      </form>

      <!-- Social Login (只在手機步驟顯示) -->
      <SocialLoginButtons v-if="step === 'phone'" />

      <!-- OTP Step -->
      <form v-else class="login-form" @submit.prevent="handleLogin">
        <button type="button" class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </button>

        <p class="otp-hint">
          驗證碼已發送至 <strong>{{ phone }}</strong>
        </p>

        <div class="form-group">
          <label class="form-label">驗證碼</label>
          <input
            v-model="otp"
            type="text"
            class="input otp-input"
            placeholder="請輸入 4 位數驗證碼"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            autocomplete="one-time-code"
          />
        </div>

        <p v-if="error" class="error-message">{{ error }}</p>

        <button
          type="submit"
          class="btn btn-primary btn-block"
          :disabled="isLoading"
        >
          {{ isLoading ? '登入中...' : '登入' }}
        </button>

        <button
          v-if="countdown <= 0"
          type="button"
          class="resend-btn"
          @click="sendOtp"
        >
          重新發送驗證碼
        </button>
        <p v-else class="countdown-text">
          {{ countdown }} 秒後可重新發送
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
}

.login-container {
  width: 100%;
  max-width: 400px;
  background-color: var(--color-background);
  border-radius: 24px;
  padding: 40px 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.logo-section {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  display: inline-block;
  margin-bottom: 16px;
}

.app-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.app-tagline {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.otp-input {
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
}

.btn-block {
  width: 100%;
}

.error-message {
  color: var(--color-error);
  font-size: 14px;
  text-align: center;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}

.otp-hint {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
}

.otp-hint strong {
  color: var(--color-text);
}

.resend-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
}

.countdown-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
}
</style>
