<script setup lang="ts">
/**
 * 完成資料頁面
 *
 * 社群登入後，若會員資料不完整，導向此頁面補充必要資訊
 * 必填：姓名、手機
 * 選填：性別、生日、分店、緊急聯絡人
 */
definePageMeta({
  layout: false,
  middleware: [],
})

const config = useRuntimeConfig()
const apiUrl = config.public.directusUrl

const { loginWithOAuth, fetchMember } = useMemberAuth()

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

// 狀態
const isLoading = ref(false)
const error = ref('')
const showOptional = ref(false)
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
  // 台灣手機格式：09xx-xxx-xxx 或 09xxxxxxxx
  const phoneRegex = /^09\d{8}$/
  return phoneRegex.test(phone.replace(/[-\s]/g, ''))
}

// 提交表單
const handleSubmit = async () => {
  // 驗證必填欄位
  if (!form.full_name.trim()) {
    error.value = '請輸入您的姓名'
    return
  }

  if (!form.phone.trim()) {
    error.value = '請輸入您的手機號碼'
    return
  }

  // 清理手機號碼格式
  const cleanPhone = form.phone.replace(/[-\s]/g, '')
  if (!validatePhone(cleanPhone)) {
    error.value = '請輸入有效的手機號碼（09開頭，10位數字）'
    return
  }

  error.value = ''
  isLoading.value = true

  try {
    // 準備要提交的資料
    const submitData: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone: cleanPhone,
    }

    // 添加選填欄位（如果有填寫）
    if (form.gender) {
      submitData.gender = form.gender
    }
    if (form.birthday) {
      submitData.birthday = form.birthday
    }
    if (form.branch_id) {
      submitData.branch_id = form.branch_id
    }
    if (form.emergency_contact.trim()) {
      submitData.emergency_contact = form.emergency_contact.trim()
    }
    if (form.emergency_phone.trim()) {
      submitData.emergency_phone = form.emergency_phone.replace(/[-\s]/g, '')
    }

    // 提交到後端
    const response = await $fetch<{ success: boolean; message: string }>(`${apiUrl}/gym/member/complete-profile`, {
      method: 'POST',
      credentials: 'include',
      body: submitData,
    })

    if (response.success) {
      // 重新取得會員資料
      await loginWithOAuth()

      // 導向首頁
      await navigateTo('/')
    }
    else {
      error.value = response.message || '更新資料失敗，請稍後再試'
    }
  }
  catch (e) {
    console.error('Complete profile error:', e)
    if (typeof e === 'object' && e !== null && 'data' in e) {
      const fetchError = e as { data?: { message?: string } }
      error.value = fetchError.data?.message || '更新資料失敗，請稍後再試'
    }
    else {
      error.value = '更新資料失敗，請稍後再試'
    }
  }
  finally {
    isLoading.value = false
  }
}

// 計算生日的最大日期（至少 16 歲）
const maxBirthday = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 16)
  return date.toISOString().split('T')[0]
})

onMounted(async () => {
  await Promise.all([
    prefillFromSession(),
    fetchBranches(),
  ])
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
      <!-- Header -->
      <header class="profile-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1>完善您的資料</h1>
        <p>為您提供更好的服務體驗</p>
      </header>

      <!-- 表單卡片 -->
      <main class="profile-card">
        <form class="profile-form" @submit.prevent="handleSubmit">
          <!-- 姓名（必填） -->
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

          <!-- 手機（必填） -->
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
          </div>

          <!-- 選填區塊切換 -->
          <button
            type="button"
            class="toggle-optional"
            @click="showOptional = !showOptional"
          >
            <span>選填資訊</span>
            <svg
              class="toggle-icon"
              :class="{ expanded: showOptional }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <!-- 選填區塊 -->
          <Transition name="expand">
            <div v-if="showOptional" class="optional-section">
              <!-- 性別 -->
              <div class="input-group">
                <label>性別</label>
                <div class="gender-group">
                  <label class="gender-option">
                    <input
                      v-model="form.gender"
                      type="radio"
                      name="gender"
                      value="MALE"
                    >
                    <span class="gender-label">男</span>
                  </label>
                  <label class="gender-option">
                    <input
                      v-model="form.gender"
                      type="radio"
                      name="gender"
                      value="FEMALE"
                    >
                    <span class="gender-label">女</span>
                  </label>
                  <label class="gender-option">
                    <input
                      v-model="form.gender"
                      type="radio"
                      name="gender"
                      value="OTHER"
                    >
                    <span class="gender-label">其他</span>
                  </label>
                </div>
              </div>

              <!-- 生日 -->
              <div class="input-group">
                <label for="birthday">生日</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <input
                    id="birthday"
                    v-model="form.birthday"
                    type="date"
                    :max="maxBirthday"
                  >
                </div>
              </div>

              <!-- 分店 -->
              <div class="input-group">
                <label for="branch">偏好分店</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <select id="branch" v-model="form.branch_id">
                    <option value="">
                      請選擇分店
                    </option>
                    <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                      {{ branch.name }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- 緊急聯絡人 -->
              <div class="input-group">
                <label for="emergency_contact">緊急聯絡人</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <input
                    id="emergency_contact"
                    v-model="form.emergency_contact"
                    type="text"
                    placeholder="聯絡人姓名"
                    autocomplete="off"
                  >
                </div>
              </div>

              <!-- 緊急電話 -->
              <div class="input-group">
                <label for="emergency_phone">緊急聯絡電話</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <input
                    id="emergency_phone"
                    v-model="form.emergency_phone"
                    type="tel"
                    placeholder="0912 345 678"
                    inputmode="tel"
                    autocomplete="off"
                  >
                </div>
              </div>
            </div>
          </Transition>

          <!-- 錯誤訊息 -->
          <p v-if="error" class="error-message">
            {{ error }}
          </p>

          <!-- 提交按鈕 -->
          <button type="submit" class="submit-btn" :disabled="isLoading">
            <span v-if="!isLoading">完成註冊</span>
            <span v-else class="loading-spinner" />
          </button>
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

/* Custom Properties */
.profile-page {
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

  font-family: 'Clash Display', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

@import url('https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap');

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
.profile-wrapper {
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
.profile-header {
  text-align: center;
  margin-bottom: 32px;
}

.header-icon {
  width: 64px;
  height: 64px;
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
  font-family: 'Clash Display', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.profile-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* Profile Card */
.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 32px 28px;
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

/* Date input fix */
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

/* Toggle Optional */
.toggle-optional {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: transparent;
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.toggle-optional:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.toggle-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s var(--ease-spring);
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

/* Optional Section */
.optional-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 8px;
}

/* Expand Transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s var(--ease-out);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  margin-top: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
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

/* Footer */
.profile-footer {
  text-align: center;
  margin-top: 32px;
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

/* PWA Standalone */
@media (display-mode: standalone) {
  .profile-header {
    padding-top: env(safe-area-inset-top);
  }
}
</style>
