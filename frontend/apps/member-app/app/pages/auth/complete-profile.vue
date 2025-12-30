<script setup lang="ts">
/**
 * 完成資料頁面
 *
 * 社群登入後，若會員資料不完整，導向此頁面補充必要資訊
 * 流程：填寫姓名 → 手機 OTP 驗證 → 選填資訊 → 完成
 */
definePageMeta({
  layout: false,
  middleware: [],
})

const config = useRuntimeConfig()
const apiUrl = config.public.directusUrl

const { loginWithOAuth, sendOtp: sendOtpAuth } = useMemberAuth()
const toast = useToast()
const { handleError } = useApiError()

// 步驟控制
type Step = 'info' | 'verify' | 'optional'
const currentStep = ref<Step>('info')

// 表單資料
interface CompleteProfileForm {
  full_name: string
  phone: string
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
  birthday: string
  branch_id: string
  emergency_contact: string
  emergency_phone: string
}

const form = reactive<CompleteProfileForm>({
  full_name: '',
  phone: '',
  gender: null,
  birthday: '',
  branch_id: '',
  emergency_contact: '',
  emergency_phone: '',
})

// OTP 相關
const otpCode = ref('')
const otpDigits = ref(['', '', '', '', '', ''])
const otpInputRefs = ref<HTMLInputElement[]>([])
const isOtpSending = ref(false)
const isOtpVerifying = ref(false)
const otpCooldown = ref(0)
const otpError = ref('')
let cooldownTimer: ReturnType<typeof setInterval> | null = null

// 狀態
const isLoading = ref(false)
const error = ref('')
const branches = ref<{ id: string; name: string }[]>([])

// 從 OAuth session 預填資料
const prefillFromSession = async () => {
  try {
    const userResponse = await $fetch<{ data: { first_name: string | null; last_name: string | null; email: string | null } }>(
      `${apiUrl}/users/me`,
      { credentials: 'include' }
    )

    if (userResponse.data) {
      const { first_name, last_name } = userResponse.data
      if (first_name || last_name) {
        form.full_name = [last_name, first_name].filter(Boolean).join('')
      }
    }
  }
  catch {
    // 無法取得 session 資料，繼續使用空白表單
  }
}

// 載入分店列表
const fetchBranches = async () => {
  try {
    const response = await $fetch<{ data: { id: string; name: string }[] }>(
      `${apiUrl}/items/branches`,
      {
        credentials: 'include',
        params: {
          fields: 'id,name',
          'filter[status][_eq]': 'active',
          sort: 'name',
        },
      }
    )
    branches.value = response.data || []
  }
  catch {
    // 無法載入分店，使用空列表
  }
}

// 手機格式驗證
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^09\d{8}$/
  return phoneRegex.test(phone.replace(/[-\s]/g, ''))
}

// 發送 OTP
const sendOtp = async () => {
  const cleanPhone = form.phone.replace(/[-\s]/g, '')

  if (!validatePhone(cleanPhone)) {
    error.value = '請輸入有效的手機號碼（09開頭，10位數字）'
    return
  }

  isOtpSending.value = true
  error.value = ''

  try {
    const response = await sendOtpAuth(cleanPhone)

    if (response.success) {
      currentStep.value = 'verify'
      toast.success('驗證碼已發送')

      // 開發模式顯示 OTP
      if (response.otp) {
        console.log('[DEV] OTP:', response.otp)
      }

      // 啟動冷卻計時
      startCooldown()
    } else {
      error.value = response.message || '發送驗證碼失敗'
    }
  } catch (e) {
    handleError(e, { fallbackMessage: '發送驗證碼失敗' })
  } finally {
    isOtpSending.value = false
  }
}

// 重新發送 OTP
const resendOtp = async () => {
  if (otpCooldown.value > 0) return
  await sendOtp()
}

// 冷卻計時器
const startCooldown = () => {
  otpCooldown.value = 60
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    otpCooldown.value--
    if (otpCooldown.value <= 0) {
      if (cooldownTimer) clearInterval(cooldownTimer)
    }
  }, 1000)
}

// OTP 輸入處理
const handleOtpInput = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement
  const value = input.value

  // 只接受數字
  if (!/^\d*$/.test(value)) {
    input.value = otpDigits.value[index]
    return
  }

  // 處理貼上
  if (value.length > 1) {
    const digits = value.slice(0, 6).split('')
    digits.forEach((digit, i) => {
      if (i < 6) otpDigits.value[i] = digit
    })
    const nextIndex = Math.min(digits.length, 5)
    otpInputRefs.value[nextIndex]?.focus()
  } else {
    otpDigits.value[index] = value
    if (value && index < 5) {
      otpInputRefs.value[index + 1]?.focus()
    }
  }

  // 自動提交
  if (otpDigits.value.every(d => d)) {
    verifyOtp()
  }
}

const handleOtpKeydown = (index: number, event: KeyboardEvent) => {
  if (event.key === 'Backspace' && !otpDigits.value[index] && index > 0) {
    otpInputRefs.value[index - 1]?.focus()
  }
}

// 驗證 OTP
const verifyOtp = async () => {
  const code = otpDigits.value.join('')
  if (code.length !== 6) {
    otpError.value = '請輸入完整的驗證碼'
    return
  }

  isOtpVerifying.value = true
  otpError.value = ''

  try {
    // 驗證 OTP（不登入，只驗證）
    const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/otp/verify-only`, {
      method: 'POST',
      credentials: 'include',
      body: {
        identifier: form.phone.replace(/[-\s]/g, ''),
        type: 'phone',
        code,
      },
    })

    if (response.success) {
      currentStep.value = 'optional'
      toast.success('手機號碼驗證成功')
    } else {
      otpError.value = response.message || '驗證碼錯誤'
      // 清空輸入
      otpDigits.value = ['', '', '', '', '', '']
      otpInputRefs.value[0]?.focus()
    }
  } catch (e) {
    const msg = handleError(e, { showToast: false, fallbackMessage: '驗證失敗' })
    otpError.value = msg
  } finally {
    isOtpVerifying.value = false
  }
}

// 提交表單
const handleSubmit = async () => {
  error.value = ''
  isLoading.value = true

  try {
    // 準備要提交的資料
    const submitData: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone: form.phone.replace(/[-\s]/g, ''),
    }

    // 添加選填欄位
    if (form.gender) submitData.gender = form.gender
    if (form.birthday) submitData.birthday = form.birthday
    if (form.branch_id) submitData.branch_id = form.branch_id
    if (form.emergency_contact.trim()) submitData.emergency_contact = form.emergency_contact.trim()
    if (form.emergency_phone.trim()) submitData.emergency_phone = form.emergency_phone.replace(/[-\s]/g, '')

    // 提交到後端
    const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/member/complete-profile`, {
      method: 'POST',
      credentials: 'include',
      body: submitData,
    })

    if (response.success) {
      toast.success('註冊完成！')
      await loginWithOAuth()
      await navigateTo('/')
    } else {
      error.value = response.message || '更新資料失敗'
    }
  } catch (e) {
    handleError(e, { fallbackMessage: '更新資料失敗' })
  } finally {
    isLoading.value = false
  }
}

// 返回上一步
const goBack = () => {
  if (currentStep.value === 'verify') {
    currentStep.value = 'info'
    otpDigits.value = ['', '', '', '', '', '']
    otpError.value = ''
  } else if (currentStep.value === 'optional') {
    currentStep.value = 'verify'
  }
}

// 跳過選填
const skipOptional = () => {
  handleSubmit()
}

// 第一步驗證
const proceedToVerify = () => {
  if (!form.full_name.trim()) {
    error.value = '請輸入您的姓名'
    return
  }
  if (!form.phone.trim()) {
    error.value = '請輸入您的手機號碼'
    return
  }
  error.value = ''
  sendOtp()
}

// 計算生日的最大日期（至少 16 歲）
const maxBirthday = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 16)
  return date.toISOString().split('T')[0]
})

// 步驟進度
const stepProgress = computed(() => {
  if (currentStep.value === 'info') return 33
  if (currentStep.value === 'verify') return 66
  return 100
})

onMounted(async () => {
  await Promise.all([
    prefillFromSession(),
    fetchBranches(),
  ])
})

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="profile-page">
    <!-- 背景裝飾 -->
    <div class="bg-decoration">
      <div class="bg-gradient" />
      <div class="bg-pattern" />
      <div class="bg-glow" />
    </div>

    <!-- 主要內容 -->
    <div class="profile-wrapper">
      <!-- Progress Bar -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${stepProgress}%` }" />
      </div>

      <!-- Header -->
      <header class="profile-header">
        <button v-if="currentStep !== 'info'" class="back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="header-content">
          <div class="header-icon">
            <svg v-if="currentStep === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <svg v-else-if="currentStep === 'verify'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12" y2="18" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1>
            {{ currentStep === 'info' ? '建立您的帳戶' : currentStep === 'verify' ? '驗證手機號碼' : '選填資訊' }}
          </h1>
          <p>
            {{
              currentStep === 'info'
                ? '請填寫基本資料以完成註冊'
                : currentStep === 'verify'
                  ? `我們已發送驗證碼至 ${form.phone}`
                  : '補充資料可獲得更好的服務體驗'
            }}
          </p>
        </div>
      </header>

      <!-- 表單卡片 -->
      <main class="profile-card">
        <!-- Step 1: 基本資料 -->
        <form v-if="currentStep === 'info'" class="profile-form" @submit.prevent="proceedToVerify">
          <div class="input-group">
            <label for="full_name">
              姓名
              <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="full_name"
                v-model="form.full_name"
                type="text"
                placeholder="請輸入您的姓名"
                autocomplete="name"
              >
            </div>
          </div>

          <div class="input-group">
            <label for="phone">
              手機號碼
              <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12" y2="18" />
              </svg>
              <input
                id="phone"
                v-model="form.phone"
                type="tel"
                placeholder="0912 345 678"
                inputmode="tel"
                autocomplete="tel"
              >
            </div>
            <p class="input-hint">我們將發送驗證碼確認您的手機</p>
          </div>

          <p v-if="error" class="error-message">
            {{ error }}
          </p>

          <button type="submit" class="submit-btn" :disabled="isOtpSending">
            <span v-if="!isOtpSending">繼續</span>
            <span v-else class="loading-spinner" />
          </button>
        </form>

        <!-- Step 2: OTP 驗證 -->
        <div v-else-if="currentStep === 'verify'" class="verify-section">
          <div class="otp-input-group">
            <div class="otp-inputs">
              <input
                v-for="(_, index) in 6"
                :key="index"
                :ref="(el) => { if (el) otpInputRefs[index] = el as HTMLInputElement }"
                v-model="otpDigits[index]"
                type="text"
                inputmode="numeric"
                maxlength="6"
                class="otp-input"
                :class="{ error: otpError }"
                @input="handleOtpInput(index, $event)"
                @keydown="handleOtpKeydown(index, $event)"
                @focus="($event.target as HTMLInputElement).select()"
              >
            </div>
            <p v-if="otpError" class="otp-error">{{ otpError }}</p>
          </div>

          <div class="resend-section">
            <p class="resend-text">沒收到驗證碼？</p>
            <button
              class="resend-btn"
              :disabled="otpCooldown > 0 || isOtpSending"
              @click="resendOtp"
            >
              {{ otpCooldown > 0 ? `${otpCooldown} 秒後重新發送` : '重新發送' }}
            </button>
          </div>

          <button
            class="submit-btn"
            :disabled="isOtpVerifying || otpDigits.some(d => !d)"
            @click="verifyOtp"
          >
            <span v-if="!isOtpVerifying">驗證</span>
            <span v-else class="loading-spinner" />
          </button>
        </div>

        <!-- Step 3: 選填資訊 -->
        <form v-else class="profile-form" @submit.prevent="handleSubmit">
          <div class="optional-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>以下資訊為選填，可稍後補充</span>
          </div>

          <div class="input-group">
            <label>性別</label>
            <div class="gender-group">
              <label class="gender-option">
                <input v-model="form.gender" type="radio" name="gender" value="MALE">
                <span class="gender-label">男</span>
              </label>
              <label class="gender-option">
                <input v-model="form.gender" type="radio" name="gender" value="FEMALE">
                <span class="gender-label">女</span>
              </label>
              <label class="gender-option">
                <input v-model="form.gender" type="radio" name="gender" value="OTHER">
                <span class="gender-label">其他</span>
              </label>
            </div>
          </div>

          <div class="input-group">
            <label for="birthday">生日</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <input id="birthday" v-model="form.birthday" type="date" :max="maxBirthday">
            </div>
          </div>

          <div class="input-group">
            <label for="branch">偏好分店</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <select id="branch" v-model="form.branch_id">
                <option value="">請選擇分店</option>
                <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                  {{ branch.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="input-group">
            <label for="emergency_contact">緊急聯絡人</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <input id="emergency_contact" v-model="form.emergency_contact" type="text" placeholder="聯絡人姓名">
            </div>
          </div>

          <div class="input-group">
            <label for="emergency_phone">緊急聯絡電話</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <input id="emergency_phone" v-model="form.emergency_phone" type="tel" placeholder="0912 345 678" inputmode="tel">
            </div>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>

          <div class="action-buttons">
            <button type="button" class="skip-btn" :disabled="isLoading" @click="skipOptional">
              跳過
            </button>
            <button type="submit" class="submit-btn" :disabled="isLoading">
              <span v-if="!isLoading">完成註冊</span>
              <span v-else class="loading-spinner" />
            </button>
          </div>
        </form>
      </main>

      <!-- Footer -->
      <footer class="profile-footer">
        <p>© 2025 Gym Nexus. All rights reserved.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   DESIGN SYSTEM - Premium Fitness Aesthetic
   ============================================ */

.profile-page {
  --accent: #10b981;
  --accent-light: #34d399;
  --accent-dark: #059669;
  --accent-glow: rgba(16, 185, 129, 0.4);

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

  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

/* Base Layout */
.profile-page {
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
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(52, 211, 153, 0.08) 0%, transparent 40%);
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
.profile-wrapper {
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

/* Progress Bar */
.progress-bar {
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  margin-bottom: 24px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 2px;
  transition: width 0.4s var(--ease-out);
}

/* Header */
.profile-header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
}

.back-btn {
  position: absolute;
  left: 0;
  top: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.back-btn svg {
  width: 20px;
  height: 20px;
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

.profile-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.profile-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Profile Card */
.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 28px 24px;
  backdrop-filter: blur(20px);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

/* Form Styles */
.profile-form {
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

.required {
  color: var(--accent);
  margin-left: 2px;
}

.input-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
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

.input-wrapper input,
.input-wrapper select {
  width: 100%;
  padding: 14px 14px 14px 46px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 16px;
  color: var(--text-primary);
  transition: all 0.2s var(--ease-out);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.input-wrapper select {
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%238E8E9A' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 20px;
  padding-right: 40px;
}

.input-wrapper input::placeholder {
  color: var(--text-muted);
}

.input-wrapper input:focus,
.input-wrapper select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.input-wrapper input[type="date"] {
  color-scheme: dark;
}

.input-wrapper input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.5;
  cursor: pointer;
}

/* Gender Group */
.gender-group {
  display: flex;
  gap: 12px;
}

.gender-option {
  flex: 1;
  position: relative;
}

.gender-option input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.gender-label {
  display: block;
  padding: 12px 16px;
  text-align: center;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.gender-option input:checked + .gender-label {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.gender-option input:focus + .gender-label {
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* OTP Section */
.verify-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.otp-input-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.otp-inputs {
  display: flex;
  gap: 8px;
}

.otp-input {
  width: 48px;
  height: 56px;
  text-align: center;
  font-size: 24px;
  font-weight: 600;
  background: var(--bg-input);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  transition: all 0.2s;
  outline: none;
}

.otp-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.otp-input.error {
  border-color: #ef4444;
  animation: shake 0.4s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.otp-error {
  font-size: 13px;
  color: #ef4444;
  margin: 0;
}

.resend-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.resend-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.resend-btn {
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
  cursor: pointer;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.resend-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.1);
}

.resend-btn:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Optional Badge */
.optional-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--accent);
}

.optional-badge svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Error Message */
.error-message {
  font-size: 13px;
  color: #ef4444;
  text-align: center;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(239, 68, 68, 0.2);
  margin: 0;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 12px;
}

.skip-btn {
  flex: 1;
  padding: 14px 24px;
  background: transparent;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.skip-btn:hover:not(:disabled) {
  border-color: var(--text-secondary);
}

.skip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Submit Button */
.submit-btn {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 24px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
  box-shadow:
    0 4px 16px rgba(16, 185, 129, 0.3),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 6px 24px rgba(16, 185, 129, 0.4),
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

/* Footer */
.profile-footer {
  text-align: center;
  margin-top: 24px;
}

.profile-footer p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Safe Area */
@supports (padding: env(safe-area-inset-bottom)) {
  .profile-page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
}
</style>
