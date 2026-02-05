<script setup lang="ts">
/**
 * Admin System Settings Page
 * 系統設定頁面
 */

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const isSaving = ref(false)

// General settings
const generalSettings = ref({
  siteName: 'Gym Nexus',
  timezone: 'Asia/Taipei',
  dateFormat: 'YYYY-MM-DD',
  currency: 'TWD',
  language: 'zh-TW'
})

// Notification settings
const notificationSettings = ref({
  emailEnabled: true,
  pushEnabled: true,
  lineEnabled: false,
  smsEnabled: false,
  contractExpiryDays: 7,
  paymentReminderDays: 3
})

// Security settings
const securitySettings = ref({
  sessionTimeout: 480,
  maxLoginAttempts: 5,
  passwordMinLength: 8,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChars: false
})

// Business settings
const businessSettings = ref({
  defaultContractDuration: 12,
  allowCrossBranchEntry: true,
  requireContractSignature: true,
  autoExtendPauseDays: true,
  maxPauseDaysPerYear: 30
})

const timezones = [
  { value: 'Asia/Taipei', label: '台北時間 (UTC+8)' },
  { value: 'Asia/Tokyo', label: '東京時間 (UTC+9)' },
  { value: 'Asia/Hong_Kong', label: '香港時間 (UTC+8)' },
  { value: 'Asia/Singapore', label: '新加坡時間 (UTC+8)' }
]

const dateFormats = [
  { value: 'YYYY-MM-DD', label: '2024-01-15' },
  { value: 'DD/MM/YYYY', label: '15/01/2024' },
  { value: 'MM/DD/YYYY', label: '01/15/2024' },
  { value: 'YYYY/MM/DD', label: '2024/01/15' }
]

const currencies = [
  { value: 'TWD', label: '新台幣 (TWD)' },
  { value: 'USD', label: '美元 (USD)' },
  { value: 'JPY', label: '日圓 (JPY)' },
  { value: 'HKD', label: '港幣 (HKD)' }
]

const languages = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' }
]

const handleSave = async () => {
  isSaving.value = true
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    toast.success('設定已儲存')
  } catch {
    toast.error('儲存失敗，請稍後再試')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1>系統設定</h1>
        <p class="header-description">管理系統全域設定和偏好</p>
      </div>
      <button class="btn btn-primary" :disabled="isSaving" @click="handleSave">
        <span v-if="isSaving" class="spinner-sm"></span>
        {{ isSaving ? '儲存中...' : '儲存變更' }}
      </button>
    </header>

    <!-- Quick Links -->
    <div class="quick-links">
      <NuxtLink to="/admin/branding" class="quick-link-card">
        <div class="quick-link-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
          </svg>
        </div>
        <div class="quick-link-content">
          <span class="quick-link-title">品牌設定</span>
          <span class="quick-link-description">自訂 Launch Screen 的品牌名稱和顏色</span>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" class="quick-link-arrow">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </NuxtLink>
    </div>

    <div class="settings-grid">
      <!-- General Settings -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <h2 class="section-title">一般設定</h2>
            <p class="section-description">基本系統配置</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">系統名稱</label>
            <input v-model="generalSettings.siteName" type="text" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label">時區</label>
            <select v-model="generalSettings.timezone" class="form-input">
              <option v-for="tz in timezones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">日期格式</label>
            <select v-model="generalSettings.dateFormat" class="form-input">
              <option v-for="fmt in dateFormats" :key="fmt.value" :value="fmt.value">{{ fmt.label }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">貨幣</label>
            <select v-model="generalSettings.currency" class="form-input">
              <option v-for="cur in currencies" :key="cur.value" :value="cur.value">{{ cur.label }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">系統語言</label>
            <select v-model="generalSettings.language" class="form-input">
              <option v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Notification Settings -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </div>
          <div>
            <h2 class="section-title">通知設定</h2>
            <p class="section-description">配置通知管道和提醒</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">Email 通知</span>
              <input v-model="notificationSettings.emailEnabled" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">推播通知</span>
              <input v-model="notificationSettings.pushEnabled" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">LINE 通知</span>
              <input v-model="notificationSettings.lineEnabled" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">簡訊通知</span>
              <input v-model="notificationSettings.smsEnabled" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">合約到期提醒 (天前)</label>
            <input v-model.number="notificationSettings.contractExpiryDays" type="number" class="form-input" min="1" max="30" />
          </div>

          <div class="form-group">
            <label class="form-label">付款提醒 (天前)</label>
            <input v-model.number="notificationSettings.paymentReminderDays" type="number" class="form-input" min="1" max="14" />
          </div>
        </div>
      </section>

      <!-- Security Settings -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            </svg>
          </div>
          <div>
            <h2 class="section-title">安全設定</h2>
            <p class="section-description">帳號安全和密碼政策</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Session 逾時 (分鐘)</label>
            <input v-model.number="securitySettings.sessionTimeout" type="number" class="form-input" min="15" max="1440" />
          </div>

          <div class="form-group">
            <label class="form-label">最大登入嘗試次數</label>
            <input v-model.number="securitySettings.maxLoginAttempts" type="number" class="form-input" min="3" max="10" />
          </div>

          <div class="form-group">
            <label class="form-label">密碼最小長度</label>
            <input v-model.number="securitySettings.passwordMinLength" type="number" class="form-input" min="6" max="20" />
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">需包含大寫字母</span>
              <input v-model="securitySettings.requireUppercase" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">需包含數字</span>
              <input v-model="securitySettings.requireNumbers" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">需包含特殊字元</span>
              <input v-model="securitySettings.requireSpecialChars" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>
        </div>
      </section>

      <!-- Business Settings -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div>
            <h2 class="section-title">業務設定</h2>
            <p class="section-description">合約和會籍相關設定</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">預設合約期限 (月)</label>
            <input v-model.number="businessSettings.defaultContractDuration" type="number" class="form-input" min="1" max="36" />
          </div>

          <div class="form-group">
            <label class="form-label">每年最大暫停天數</label>
            <input v-model.number="businessSettings.maxPauseDaysPerYear" type="number" class="form-input" min="0" max="90" />
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">允許跨店進場</span>
              <input v-model="businessSettings.allowCrossBranchEntry" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">合約需簽名</span>
              <input v-model="businessSettings.requireContractSignature" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div class="form-group toggle-group">
            <label class="toggle-label">
              <span class="toggle-text">暫停自動延長到期日</span>
              <input v-model="businessSettings.autoExtendPauseDays" type="checkbox" class="toggle-input" />
              <span class="toggle-switch"></span>
            </label>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: var(--space-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  margin: 0 0 var(--space-xs);
  font-size: 1.5rem;
  font-weight: 600;
}

.header-description {
  margin: 0;
  color: var(--color-text-secondary);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.btn-primary {
  background: var(--color-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-xl);
}

.settings-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.section-header {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-accent-light);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-title {
  margin: 0 0 2px;
  font-size: 1rem;
  font-weight: 600;
}

.section-description {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  transition: border-color var(--duration-fast) ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Toggle Switch */
.toggle-group {
  grid-column: span 1;
}

.toggle-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: var(--space-sm) 0;
}

.toggle-text {
  font-size: 0.875rem;
  font-weight: 500;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: 12px;
  transition: background var(--duration-fast) ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform var(--duration-fast) ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.toggle-input:checked + .toggle-switch {
  background: var(--color-accent);
}

.toggle-input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

/* Quick Links */
.quick-links {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.quick-link-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  transition: all var(--duration-fast) ease;
}

.quick-link-card:hover {
  border-color: var(--color-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.quick-link-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--color-accent-light);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quick-link-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.quick-link-title {
  font-weight: 600;
  font-size: 0.9375rem;
}

.quick-link-description {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.quick-link-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .settings-page {
    padding: var(--space-md);
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-header .btn {
    width: 100%;
  }

  .quick-links {
    flex-direction: column;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
