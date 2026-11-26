<script setup lang="ts">
/**
 * 變更 Email（兩步驟）
 * 1. 輸入新 Email → 發送驗證信（POST /api/member/me/email/otp）
 * 2. 輸入驗證碼 → 確認變更（POST /api/member/me/email）
 */
const props = defineProps<{ currentEmail: string | null }>()
const emit = defineEmits<{ changed: [email: string]; cancel: [] }>()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_COOLDOWN_SECONDS = 60

const { sendEmailVerification, changeEmail } = useMemberAuth()
const toast = useToast()

const step = ref<'email' | 'verify'>('email')
const email = ref('')
const otpCode = ref('')
const emailError = ref('')
const codeError = ref('')
const devCode = ref('')
const isSending = ref(false)
const isSubmitting = ref(false)
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const cleanEmail = computed(() => email.value.trim().toLowerCase())

const startCooldown = () => {
  cooldown.value = RESEND_COOLDOWN_SECONDS
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const sendCode = async () => {
  emailError.value = ''
  if (!EMAIL_PATTERN.test(cleanEmail.value)) {
    emailError.value = '請輸入有效的 Email'
    return
  }
  if (cleanEmail.value === (props.currentEmail || '').trim().toLowerCase()) {
    emailError.value = '這是您目前的 Email'
    return
  }

  isSending.value = true
  try {
    const result = await sendEmailVerification(cleanEmail.value)
    if (!result.success) {
      emailError.value = result.message
      return
    }
    devCode.value = result.otp || ''
    otpCode.value = ''
    codeError.value = ''
    step.value = 'verify'
    startCooldown()
    toast.success('驗證碼已發送')
  } finally {
    isSending.value = false
  }
}

const resendCode = async () => {
  if (cooldown.value > 0 || isSending.value) return
  await sendCode()
}

const editEmail = () => {
  step.value = 'email'
  codeError.value = ''
}

const submit = async () => {
  codeError.value = ''
  const code = otpCode.value.trim()
  if (!/^\d{6}$/.test(code)) {
    codeError.value = '請輸入 6 位數驗證碼'
    return
  }

  isSubmitting.value = true
  try {
    const result = await changeEmail(cleanEmail.value, code)
    if (result.success) {
      toast.success('Email 已更新')
      emit('changed', cleanEmail.value)
      return
    }

    switch (result.code) {
      case 'WRONG_CODE':
        codeError.value = result.attemptsRemaining
          ? `驗證碼錯誤，還可再試 ${result.attemptsRemaining} 次`
          : '驗證碼錯誤次數過多，請重新發送驗證碼'
        otpCode.value = ''
        break
      case 'INVALID_OTP':
      case 'MAX_ATTEMPTS':
        codeError.value = `${result.message}，請重新發送驗證碼`
        otpCode.value = ''
        break
      case 'EMAIL_TAKEN':
        step.value = 'email'
        emailError.value = result.message
        break
      default:
        codeError.value = result.message
    }
  } finally {
    isSubmitting.value = false
  }
}

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="email-card" aria-live="polite">
    <!-- 步驟 1：新 Email -->
    <form v-if="step === 'email'" novalidate @submit.prevent="sendCode">
      <p class="email-intro">
        目前 Email <span class="email-current">{{ currentEmail || '未設定' }}</span>，
        變更前需驗證新信箱。
      </p>
      <div class="input-group">
        <label for="change-email">新 Email</label>
        <input
          id="change-email"
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="example@email.com"
          :aria-invalid="!!emailError"
          aria-describedby="change-email-error"
        >
        <p v-if="emailError" id="change-email-error" class="field-error" role="alert">{{ emailError }}</p>
      </div>
      <div class="email-actions">
        <button type="button" class="btn-secondary" :disabled="isSending" @click="emit('cancel')">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="isSending">
          <span v-if="!isSending">發送驗證碼</span>
          <span v-else class="spinner" aria-label="發送中" />
        </button>
      </div>
    </form>

    <!-- 步驟 2：驗證碼 -->
    <form v-else novalidate @submit.prevent="submit">
      <p class="email-intro">
        驗證碼已寄至 <span class="email-current">{{ cleanEmail }}</span>
        <button type="button" class="link-btn" @click="editEmail">更改 Email</button>
      </p>
      <div class="input-group">
        <label for="change-email-code">Email 驗證碼</label>
        <input
          id="change-email-code"
          v-model="otpCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="6 位數驗證碼"
          class="code-input"
          :aria-invalid="!!codeError"
          aria-describedby="change-email-code-error"
        >
        <p v-if="codeError" id="change-email-code-error" class="field-error" role="alert">{{ codeError }}</p>
        <p v-if="devCode" class="dev-code">開發模式驗證碼：{{ devCode }}</p>
      </div>
      <button
        type="button"
        class="link-btn resend"
        :disabled="cooldown > 0 || isSending"
        @click="resendCode"
      >
        {{ cooldown > 0 ? `${cooldown} 秒後可重新發送` : '重新發送驗證碼' }}
      </button>
      <div class="email-actions">
        <button type="button" class="btn-secondary" :disabled="isSubmitting" @click="emit('cancel')">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="isSubmitting">
          <span v-if="!isSubmitting">確認變更</span>
          <span v-else class="spinner" aria-label="處理中" />
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.email-card {
  background: var(--color-surface);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.email-intro {
  margin: 0 0 16px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.email-current {
  color: var(--color-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.input-group {
  margin-bottom: 12px;
}

.input-group label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  padding-left: 4px;
}

.input-group input {
  width: 100%;
  padding: 12px 14px;
  background-color: var(--color-background);
  border: none;
  border-radius: 12px;
  font-size: 17px;
  color: var(--color-text);
  transition: box-shadow 200ms ease-out;
}

:root.theme-dark .input-group input {
  background-color: rgba(118, 118, 128, 0.24);
}

.input-group input:focus {
  outline: none;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2);
}

.input-group input::placeholder {
  color: var(--color-text-secondary);
}

.code-input {
  letter-spacing: 6px;
  font-variant-numeric: tabular-nums;
}

.field-error {
  margin: 6px 0 0;
  padding-left: 4px;
  font-size: 13px;
  color: #ff3b30;
}

.dev-code {
  margin: 6px 0 0;
  padding-left: 4px;
  font-size: 13px;
  color: #ff9500;
}

.link-btn {
  background: none;
  border: none;
  padding: 0 4px;
  font-size: 15px;
  color: #007aff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.link-btn:disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.resend {
  display: block;
  margin: 0 0 4px;
  font-size: 14px;
}

.email-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn-primary,
.btn-secondary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 12px;
  border: none;
  border-radius: 9999px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 200ms ease-out, background-color 200ms ease-out;
  -webkit-tap-highlight-color: transparent;
}

.btn-primary {
  background-color: #007aff;
  color: #fff;
}

.btn-primary:active:not(:disabled) {
  background-color: #0055cc;
}

.btn-secondary {
  background-color: var(--color-background);
  color: #007aff;
}

.btn-secondary:active:not(:disabled) {
  opacity: 0.7;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2s; }
}
</style>
