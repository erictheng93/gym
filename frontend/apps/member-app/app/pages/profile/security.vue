<script setup lang="ts">
/**
 * 安全設定頁面
 *
 * 允許已登入用戶修改密碼
 */
definePageMeta({
  middleware: 'auth'
})

const { addToast } = useToast()
const { changePassword, member } = useMemberAuth()

// Form state
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

// UI state
const isLoading = ref(false)
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const error = ref('')
const success = ref(false)

// Password strength
const passwordStrength = computed(() => {
  const password = newPassword.value
  if (!password) return { level: 0, label: '', color: '' }

  let score = 0

  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1

  if (score <= 1) return { level: 1, label: '弱', color: 'weak' }
  if (score <= 2) return { level: 2, label: '普通', color: 'fair' }
  if (score <= 3) return { level: 3, label: '良好', color: 'good' }
  return { level: 4, label: '強', color: 'strong' }
})

// Validation
const passwordMeetsRequirements = computed(() => {
  return newPassword.value.length >= 8 && /[0-9]/.test(newPassword.value)
})

const passwordsMatch = computed(() => {
  return confirmPassword.value === '' || confirmPassword.value === newPassword.value
})

const canSubmit = computed(() => {
  return (
    currentPassword.value.length > 0 &&
    passwordMeetsRequirements.value &&
    confirmPassword.value === newPassword.value &&
    !isLoading.value
  )
})

// Submit handler
const handleSubmit = async () => {
  if (!canSubmit.value) return

  error.value = ''
  isLoading.value = true

  const result = await changePassword(currentPassword.value, newPassword.value)

  isLoading.value = false

  if (result.success) {
    success.value = true
    addToast({ message: '密碼已成功變更', type: 'success' })

    // Reset form
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''

    // Redirect after short delay
    setTimeout(() => {
      navigateTo('/profile')
    }, 2000)
  } else {
    error.value = result.message || '密碼變更失敗，請確認當前密碼是否正確'
  }
}
</script>

<template>
  <div class="security-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">安全設定</h1>
    </header>

    <!-- Success State -->
    <div v-if="success" class="success-card">
      <div class="success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2>密碼已變更</h2>
      <p>您的密碼已成功更新，即將返回個人資料頁面。</p>
    </div>

    <!-- Form -->
    <form v-else class="security-form" @submit.prevent="handleSubmit">
      <!-- User Info -->
      <section class="user-info-card">
        <div class="user-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="user-details">
          <p class="user-name">{{ member?.full_name || '會員' }}</p>
          <p class="user-email">{{ member?.email || '-' }}</p>
        </div>
      </section>

      <!-- Password Change Section -->
      <section class="form-section">
        <h2 class="section-title">變更密碼</h2>
        <p class="section-description">為保護您的帳號安全，請定期更換密碼</p>

        <!-- Current Password -->
        <div class="input-group">
          <label for="current-password">當前密碼</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="current-password"
              v-model="currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              placeholder="請輸入當前密碼"
              autocomplete="current-password"
            >
            <button
              type="button"
              class="toggle-visibility"
              @click="showCurrentPassword = !showCurrentPassword"
            >
              <svg v-if="!showCurrentPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

        <!-- New Password -->
        <div class="input-group">
          <label for="new-password">新密碼</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a5 5 0 0 0-5 5v3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2h-3V7a5 5 0 0 0-5-5z" />
              <circle cx="12" cy="16" r="1" />
            </svg>
            <input
              id="new-password"
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              placeholder="請輸入新密碼"
              autocomplete="new-password"
            >
            <button
              type="button"
              class="toggle-visibility"
              @click="showNewPassword = !showNewPassword"
            >
              <svg v-if="!showNewPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>

          <!-- Password Strength Indicator -->
          <div v-if="newPassword" class="password-strength">
            <div class="strength-bars">
              <div class="bar" :class="{ filled: passwordStrength.level >= 1, [passwordStrength.color]: passwordStrength.level >= 1 }" />
              <div class="bar" :class="{ filled: passwordStrength.level >= 2, [passwordStrength.color]: passwordStrength.level >= 2 }" />
              <div class="bar" :class="{ filled: passwordStrength.level >= 3, [passwordStrength.color]: passwordStrength.level >= 3 }" />
              <div class="bar" :class="{ filled: passwordStrength.level >= 4, [passwordStrength.color]: passwordStrength.level >= 4 }" />
            </div>
            <span class="strength-label" :class="passwordStrength.color">{{ passwordStrength.label }}</span>
          </div>

          <!-- Requirements -->
          <div class="password-requirements">
            <div class="requirement" :class="{ met: newPassword.length >= 8 }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>至少 8 個字元</span>
            </div>
            <div class="requirement" :class="{ met: /[0-9]/.test(newPassword) }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>包含數字</span>
            </div>
          </div>
        </div>

        <!-- Confirm Password -->
        <div class="input-group">
          <label for="confirm-password">確認新密碼</label>
          <div class="input-wrapper" :class="{ error: !passwordsMatch }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="請再次輸入新密碼"
              autocomplete="new-password"
            >
            <button
              type="button"
              class="toggle-visibility"
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
          <p v-if="!passwordsMatch" class="field-error">密碼不一致</p>
        </div>
      </section>

      <!-- Error Message -->
      <p v-if="error" class="error-message">{{ error }}</p>

      <!-- Submit Button -->
      <button type="submit" class="submit-btn" :disabled="!canSubmit">
        <span v-if="!isLoading">變更密碼</span>
        <span v-else class="loading-spinner" />
      </button>

      <!-- Security Tips -->
      <div class="security-tips">
        <h3>安全提示</h3>
        <ul>
          <li>請勿使用與其他網站相同的密碼</li>
          <li>避免使用容易被猜到的資訊（如生日、電話）</li>
          <li>建議混合使用大小寫字母、數字和符號</li>
          <li>如果發現帳號有異常活動，請立即變更密碼</li>
        </ul>
      </div>
    </form>
  </div>
</template>

<style scoped>
.security-page {
  padding: 16px;
  padding-bottom: 100px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--color-surface);
  border-radius: 12px;
  color: var(--color-text);
  text-decoration: none;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

/* Success Card */
.success-card {
  text-align: center;
  padding: 40px 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  color: var(--color-primary);
}

.success-icon svg {
  width: 100%;
  height: 100%;
}

.success-card h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.success-card p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Form */
.security-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* User Info Card */
.user-info-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: var(--color-surface-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
}

.user-avatar svg {
  width: 28px;
  height: 28px;
}

.user-details {
  flex: 1;
}

.user-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px;
}

.user-email {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Form Section */
.form-section {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px;
}

.section-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 20px;
}

/* Input Group */
.input-group {
  margin-bottom: 20px;
}

.input-group:last-child {
  margin-bottom: 0;
}

.input-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
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
  color: var(--color-text-tertiary);
  pointer-events: none;
  transition: color 0.2s;
}

.input-wrapper:focus-within .input-icon {
  color: var(--color-primary);
}

.input-wrapper input {
  width: 100%;
  padding: 14px 46px;
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 16px;
  color: var(--color-text);
  transition: all 0.2s;
}

.input-wrapper input::placeholder {
  color: var(--color-text-tertiary);
}

.input-wrapper input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.input-wrapper.error input {
  border-color: var(--color-error);
}

.toggle-visibility {
  position: absolute;
  right: 14px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.toggle-visibility svg {
  width: 20px;
  height: 20px;
}

.field-error {
  font-size: 12px;
  color: var(--color-error);
  margin: 6px 0 0;
}

/* Password Strength */
.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.strength-bars {
  display: flex;
  gap: 4px;
  flex: 1;
}

.bar {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  background-color: var(--color-border);
  transition: all 0.3s;
}

.bar.filled.weak {
  background-color: #ef4444;
}

.bar.filled.fair {
  background-color: #f59e0b;
}

.bar.filled.good {
  background-color: #22c55e;
}

.bar.filled.strong {
  background-color: #10b981;
}

.strength-label {
  font-size: 12px;
  font-weight: 500;
  min-width: 40px;
}

.strength-label.weak { color: #ef4444; }
.strength-label.fair { color: #f59e0b; }
.strength-label.good { color: #22c55e; }
.strength-label.strong { color: #10b981; }

/* Password Requirements */
.password-requirements {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.requirement {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.requirement svg {
  width: 14px;
  height: 14px;
  color: var(--color-text-tertiary);
}

.requirement.met {
  color: var(--color-primary);
}

.requirement.met svg {
  color: var(--color-primary);
}

/* Error Message */
.error-message {
  font-size: 14px;
  color: var(--color-error);
  text-align: center;
  padding: 12px 16px;
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
  margin: 0;
}

/* Submit Button */
.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px 24px;
  background: var(--color-primary);
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.submit-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.5;
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

/* Security Tips */
.security-tips {
  padding: 16px 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.security-tips h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px;
}

.security-tips ul {
  margin: 0;
  padding-left: 20px;
}

.security-tips li {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.security-tips li:last-child {
  margin-bottom: 0;
}
</style>
