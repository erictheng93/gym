<script setup lang="ts">
/**
 * 完成資料頁面
 *
 * 社群登入後，若會員資料不完整，導向此頁面補充必要資訊。
 * 流程：輸入手機 → POST /api/member/me/phone/otp 發送驗證碼
 *     → 輸入驗證碼與選填資料 → POST /api/member/me/complete-profile（伺服器端驗證驗證碼）
 * 需要會員登入（X-Member-Token）；尚未綁定會員的社群帳號會看到登入指引。
 */
import type { CompleteProfileInput } from '../../types/auth'

definePageMeta({
  layout: false,
  middleware: [],
})

type Step = 'checking' | 'no-session' | 'phone' | 'verify'

const PHONE_PATTERN = /^09\d{8}$/
const EMERGENCY_PHONE_PATTERN = /^0\d{8,9}$/
const RESEND_COOLDOWN_SECONDS = 60

const { member, checkAuth, sendPhoneVerification, completeProfile } = useMemberAuth()
const toast = useToast()

const step = ref<Step>('checking')
const form = reactive({
  fullName: '',
  phone: '',
  otpCode: '',
  gender: '' as '' | 'MALE' | 'FEMALE' | 'OTHER',
  birthday: '',
  emergencyContact: '',
  emergencyPhone: '',
})

const phoneError = ref('')
const codeError = ref('')
const formError = ref('')
const devCode = ref('')
const isSending = ref(false)
const isSubmitting = ref(false)
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const cleanPhone = computed(() => form.phone.replace(/[-\s]/g, ''))

const maxBirthday = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 16)
  return date.toISOString().slice(0, 10)
})

const socialDisplayName = (): string => {
  try {
    const raw = sessionStorage.getItem('oauth_social_info')
    const info = raw ? JSON.parse(raw) as { displayName?: string } : null
    return info?.displayName || ''
  } catch {
    return ''
  }
}

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
  phoneError.value = ''
  formError.value = ''
  if (!PHONE_PATTERN.test(cleanPhone.value)) {
    phoneError.value = '請輸入有效的手機號碼（09 開頭，共 10 碼）'
    return
  }

  isSending.value = true
  try {
    const result = await sendPhoneVerification(cleanPhone.value)
    if (!result.success) {
      phoneError.value = result.message
      if (result.code === 'UNAUTHORIZED') step.value = 'no-session'
      return
    }
    devCode.value = result.otp || ''
    form.otpCode = ''
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

const changePhone = () => {
  step.value = 'phone'
  codeError.value = ''
  formError.value = ''
}

const buildBody = (): CompleteProfileInput => {
  const body: CompleteProfileInput = { phone: cleanPhone.value, otpCode: form.otpCode.trim() }
  const fullName = form.fullName.trim()
  if (fullName) body.fullName = fullName
  if (form.gender) body.gender = form.gender
  if (form.birthday) body.birthday = form.birthday
  if (form.emergencyContact.trim()) body.emergencyContact = form.emergencyContact.trim()
  const emergencyPhone = form.emergencyPhone.replace(/[-\s]/g, '')
  if (emergencyPhone) body.emergencyPhone = emergencyPhone
  return body
}

const submit = async () => {
  codeError.value = ''
  formError.value = ''
  if (!/^\d{6}$/.test(form.otpCode.trim())) {
    codeError.value = '請輸入 6 位數驗證碼'
    return
  }
  const fullName = form.fullName.trim()
  if (fullName && fullName.length < 2) {
    formError.value = '姓名至少 2 個字元'
    return
  }
  const emergencyPhone = form.emergencyPhone.replace(/[-\s]/g, '')
  if (emergencyPhone && !EMERGENCY_PHONE_PATTERN.test(emergencyPhone)) {
    formError.value = '請輸入有效的緊急聯絡電話'
    return
  }

  isSubmitting.value = true
  try {
    const result = await completeProfile(buildBody())
    if (result.success) {
      sessionStorage.removeItem('oauth_social_info')
      toast.success('資料已完成')
      await navigateTo('/')
      return
    }

    switch (result.code) {
      case 'WRONG_CODE':
        codeError.value = result.attemptsRemaining
          ? `驗證碼錯誤，還可再試 ${result.attemptsRemaining} 次`
          : '驗證碼錯誤次數過多，請重新發送驗證碼'
        form.otpCode = ''
        break
      case 'INVALID_OTP':
      case 'MAX_ATTEMPTS':
        codeError.value = `${result.message}，請重新發送驗證碼`
        form.otpCode = ''
        break
      case 'PHONE_TAKEN':
        step.value = 'phone'
        phoneError.value = result.message
        break
      case 'UNAUTHORIZED':
        step.value = 'no-session'
        break
      default:
        formError.value = result.message
    }
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  const authenticated = await checkAuth()
  if (!authenticated || !member.value) {
    step.value = 'no-session'
    return
  }
  form.fullName = member.value.full_name || socialDisplayName()
  form.phone = member.value.phone || ''
  step.value = 'phone'
})

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="complete-page">
    <main class="complete-card" aria-live="polite">
      <!-- 檢查登入狀態 -->
      <div v-if="step === 'checking'" class="state-block">
        <div class="spinner" role="status" aria-label="載入中" />
      </div>

      <!-- 尚未登入 / 尚未綁定會員 -->
      <section v-else-if="step === 'no-session'" class="state-block" data-testid="no-session">
        <h1 class="title">
          尚未綁定會員
        </h1>
        <p class="subtitle">
          此社群帳號尚未連結任何會員資料。請先使用會員手機號碼登入；如尚未成為會員，請洽櫃台辦理。
        </p>
        <NuxtLink to="/login" class="btn btn-primary">
          前往登入
        </NuxtLink>
      </section>

      <!-- Step 1：手機號碼 -->
      <form v-else-if="step === 'phone'" class="form" novalidate @submit.prevent="sendCode">
        <header class="header">
          <p class="step-label">
            步驟 1 / 2
          </p>
          <h1 class="title">
            完成會員資料
          </h1>
          <p class="subtitle">
            請驗證您的手機號碼，我們會發送 6 位數驗證碼。
          </p>
        </header>

        <label class="field">
          <span class="field-label">姓名</span>
          <input v-model="form.fullName" class="input" type="text" autocomplete="name" placeholder="請輸入您的姓名">
        </label>

        <label class="field">
          <span class="field-label">手機號碼 <span class="required">*</span></span>
          <input
            v-model="form.phone"
            class="input"
            :class="{ 'input-error': phoneError }"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="0912 345 678"
            :aria-invalid="!!phoneError"
            aria-describedby="phone-error"
          >
          <span v-if="phoneError" id="phone-error" class="error-text" role="alert">{{ phoneError }}</span>
        </label>

        <button type="submit" class="btn btn-primary" :disabled="isSending">
          {{ isSending ? '發送中…' : '發送驗證碼' }}
        </button>
      </form>

      <!-- Step 2：驗證碼 + 選填資料 -->
      <form v-else class="form" novalidate @submit.prevent="submit">
        <header class="header">
          <p class="step-label">
            步驟 2 / 2
          </p>
          <h1 class="title">
            輸入驗證碼
          </h1>
          <p class="subtitle">
            驗證碼已發送至 {{ cleanPhone }}，5 分鐘內有效。
            <button type="button" class="link-btn" @click="changePhone">
              更改號碼
            </button>
          </p>
        </header>

        <label class="field">
          <span class="field-label">驗證碼 <span class="required">*</span></span>
          <input
            v-model="form.otpCode"
            class="input input-code"
            :class="{ 'input-error': codeError }"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            :aria-invalid="!!codeError"
            aria-describedby="code-error"
          >
          <span v-if="codeError" id="code-error" class="error-text" role="alert">{{ codeError }}</span>
          <span v-if="devCode" class="hint-text">開發模式驗證碼：{{ devCode }}</span>
        </label>

        <button type="button" class="link-btn resend" :disabled="cooldown > 0 || isSending" @click="resendCode">
          {{ cooldown > 0 ? `${cooldown} 秒後可重新發送` : '重新發送驗證碼' }}
        </button>

        <fieldset class="optional">
          <legend class="optional-title">
            選填資料
          </legend>

          <div class="field">
            <span class="field-label">性別</span>
            <div class="segmented" role="radiogroup" aria-label="性別">
              <label v-for="option in [{ value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }, { value: 'OTHER', label: '其他' }]" :key="option.value" class="segment" :class="{ active: form.gender === option.value }">
                <input v-model="form.gender" type="radio" name="gender" :value="option.value" class="visually-hidden">
                {{ option.label }}
              </label>
            </div>
          </div>

          <label class="field">
            <span class="field-label">生日</span>
            <input v-model="form.birthday" class="input" type="date" :max="maxBirthday">
          </label>

          <label class="field">
            <span class="field-label">緊急聯絡人</span>
            <input v-model="form.emergencyContact" class="input" type="text" maxlength="100" placeholder="聯絡人姓名">
          </label>

          <label class="field">
            <span class="field-label">緊急聯絡電話</span>
            <input v-model="form.emergencyPhone" class="input" type="tel" inputmode="tel" placeholder="0912 345 678">
          </label>
        </fieldset>

        <p v-if="formError" class="error-text" role="alert">
          {{ formError }}
        </p>

        <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? '送出中…' : '完成' }}
        </button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.complete-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  padding-top: calc(20px + var(--safe-area-top));
  padding-bottom: calc(20px + var(--safe-area-bottom));
  background: var(--color-background);
  font-family: var(--font-body);
  color: var(--color-text);
}

.complete-card {
  width: 100%;
  max-width: 420px;
  padding: var(--space-lg);
  background: var(--color-surface);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-sm);
}

.state-block,
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.state-block {
  align-items: center;
  text-align: center;
}

.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.step-label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.subtitle {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.required {
  color: var(--color-error);
}

.input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  font-size: 16px;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-background);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out);
}

.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}

.input-error {
  border-color: var(--color-error);
}

.input-code {
  font-size: 22px;
  letter-spacing: 0.4em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: var(--color-error);
}

.hint-text {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.optional {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin: 0;
  padding: var(--space-md) 0 0;
  border: none;
  border-top: 1px solid var(--color-divider);
}

.optional-title {
  padding: 0;
  margin-bottom: var(--space-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.segmented {
  display: flex;
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--color-background);
  border-radius: var(--radius-full);
}

.segment {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-secondary);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out);
}

.segment.active {
  background: var(--color-surface-secondary);
  color: var(--color-text);
  font-weight: 600;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  text-decoration: none;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out), opacity var(--duration-normal) var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-accent);
  color: #ffffff;
}

.link-btn {
  padding: 0;
  font-size: 14px;
  font-family: inherit;
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
}

.link-btn:disabled {
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}

.resend {
  align-self: flex-start;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-surface-secondary);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
