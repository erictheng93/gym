<template>
  <div class="notification-settings">
    <div class="header">
      <h1>通知服務設定</h1>
      <p>設定分店的 LINE Messaging API 和簡訊服務</p>
    </div>

    <!-- Branch Selector (Admin only) -->
    <div v-if="isSystemAdmin" class="branch-selector">
      <label>選擇分店</label>
      <select v-model="selectedBranchId" @change="loadBranchConfig">
        <option value="">-- 請選擇分店 --</option>
        <option v-for="branch in branches" :key="branch.branch_id" :value="branch.branch_id">
          {{ branch.branch_name }}
          <template v-if="branch.has_line_config || branch.has_sms_config">
            (已設定)
          </template>
        </option>
      </select>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

    <!-- Configuration Form -->
    <div v-else-if="selectedBranchId || !isSystemAdmin" class="config-sections">
      <!-- LINE Configuration -->
      <section class="config-section">
        <div class="section-header">
          <div class="section-icon line">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 5.94 2 10.7c0 4.18 3.71 7.68 8.72 8.52.34.07.8.22.92.51.11.26.07.66.04.93l-.15.91c-.05.28-.22 1.08.95.59 1.17-.49 6.31-3.72 8.61-6.36C22.61 13.13 22 11.02 22 10.7 22 5.94 17.52 2 12 2z" />
            </svg>
          </div>
          <div>
            <h2>LINE Messaging API</h2>
            <p>用於發送 LINE 通知給已綁定的會員</p>
          </div>
          <div class="status-badge" :class="notificationConfig.has_line_config ? 'configured' : 'not-configured'">
            {{ notificationConfig.has_line_config ? '已設定' : '未設定' }}
          </div>
        </div>

        <div class="form-group">
          <label>Channel Access Token</label>
          <div class="input-with-action">
            <input
              v-model="lineConfig.access_token"
              :type="showLineToken ? 'text' : 'password'"
              placeholder="輸入 LINE Channel Access Token"
            />
            <button type="button" class="btn-icon" @click="showLineToken = !showLineToken">
              <svg v-if="showLineToken" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          <small v-if="notificationConfig.line_channel_access_token_preview">
            目前設定: {{ notificationConfig.line_channel_access_token_preview }}
          </small>
        </div>

        <div class="form-group">
          <label>Channel Secret (選填)</label>
          <input
            v-model="lineConfig.channel_secret"
            type="password"
            placeholder="輸入 LINE Channel Secret"
          />
        </div>

        <div class="form-actions">
          <button class="btn-secondary" :disabled="isTesting" @click="testLineConfig">
            {{ isTesting ? '測試中...' : '測試連線' }}
          </button>
          <button class="btn-primary" :disabled="isSaving" @click="saveLineConfig">
            {{ isSaving ? '儲存中...' : '儲存設定' }}
          </button>
        </div>

        <!-- Test Result -->
        <div v-if="lineTestResult" class="test-result" :class="lineTestResult.success ? 'success' : 'error'">
          <strong>{{ lineTestResult.message }}</strong>
          <p v-if="lineTestResult.details">
            Bot 名稱: {{ lineTestResult.details.botName }}
          </p>
          <p v-if="lineTestResult.error">錯誤: {{ lineTestResult.error }}</p>
        </div>
      </section>

      <!-- SMS Configuration -->
      <section class="config-section">
        <div class="section-header">
          <div class="section-icon sms">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h2>三竹簡訊 (Mitake)</h2>
            <p>用於發送 OTP 驗證碼和重要通知的備用通道</p>
          </div>
          <div class="status-badge" :class="notificationConfig.has_sms_config ? 'configured' : 'not-configured'">
            {{ notificationConfig.has_sms_config ? '已設定' : '未設定' }}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>帳號</label>
            <input
              v-model="smsConfig.username"
              type="text"
              placeholder="三竹簡訊帳號"
            />
            <small v-if="notificationConfig.mitake_username">目前設定: {{ notificationConfig.mitake_username }}</small>
          </div>
          <div class="form-group">
            <label>密碼</label>
            <input
              v-model="smsConfig.password"
              type="password"
              placeholder="三竹簡訊密碼"
            />
          </div>
        </div>

        <div class="form-group">
          <label>發送者名稱 (選填)</label>
          <input
            v-model="smsConfig.sender_name"
            type="text"
            placeholder="顯示在簡訊上的發送者名稱"
            maxlength="11"
          />
          <small>最多 11 個字元，僅支援英文和數字</small>
        </div>

        <div class="form-actions">
          <button class="btn-secondary" :disabled="isTesting" @click="testSmsConfig">
            {{ isTesting ? '測試中...' : '測試連線' }}
          </button>
          <button class="btn-primary" :disabled="isSaving" @click="saveSmsConfig">
            {{ isSaving ? '儲存中...' : '儲存設定' }}
          </button>
        </div>

        <!-- Test Result -->
        <div v-if="smsTestResult" class="test-result" :class="smsTestResult.success ? 'success' : 'error'">
          <strong>{{ smsTestResult.message }}</strong>
          <p v-if="smsTestResult.details">
            餘額: {{ smsTestResult.details.balance }} 點
          </p>
          <p v-if="smsTestResult.error">錯誤: {{ smsTestResult.error }}</p>
        </div>
      </section>

      <!-- Configuration Status -->
      <section class="config-section status-section">
        <h2>設定狀態</h2>
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">設定啟用</span>
            <label class="toggle">
              <input v-model="notificationConfig.is_active" type="checkbox" @change="toggleActive" />
              <span class="slider"></span>
            </label>
          </div>
          <div class="status-item">
            <span class="status-label">最後更新</span>
            <span class="status-value">{{ formatDate(notificationConfig.date_updated) }}</span>
          </div>
        </div>
      </section>

      <!-- Help Section -->
      <section class="help-section">
        <h3>設定說明</h3>
        <div class="help-content">
          <details>
            <summary>如何取得 LINE Channel Access Token?</summary>
            <ol>
              <li>前往 <a href="https://developers.line.biz/console/" target="_blank">LINE Developers Console</a></li>
              <li>建立或選擇一個 Provider</li>
              <li>建立一個 <strong>Messaging API</strong> Channel（不是 LINE Login）</li>
              <li>在 Channel 設定頁面中，找到「Messaging API」標籤</li>
              <li>點擊「Issue」產生 Channel Access Token（長效）</li>
            </ol>
          </details>
          <details>
            <summary>如何申請三竹簡訊帳號?</summary>
            <ol>
              <li>前往 <a href="https://sms.mitake.com.tw/" target="_blank">三竹簡訊官網</a></li>
              <li>點擊「免費試用」或聯繫業務申請帳號</li>
              <li>取得帳號和密碼後填入上方表單</li>
              <li>簡訊費用約 NT$0.5-1.0/則，採用 Pay As You Go 模式</li>
            </ol>
          </details>
        </div>
      </section>
    </div>

    <!-- No Branch Selected -->
    <div v-else class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
      <p>請選擇要設定的分店</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const { addToast } = useToast()
const runtimeConfig = useRuntimeConfig()
const apiUrl = runtimeConfig.public.apiBaseUrl

// State
const isSystemAdmin = ref(false)
const branches = ref<any[]>([])
const selectedBranchId = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
const showLineToken = ref(false)

const configData = ref({
  has_line_config: false,
  line_channel_access_token_preview: null,
  has_sms_config: false,
  mitake_username: null,
  sms_sender_name: null,
  is_active: true,
  date_updated: null,
})

const lineConfig = ref({
  access_token: '',
  channel_secret: '',
})

const smsConfig = ref({
  username: '',
  password: '',
  sender_name: '',
})

const lineTestResult = ref<any>(null)
const smsTestResult = ref<any>(null)

// Use a getter for template binding
const notificationConfig = computed({
  get: () => configData.value,
  set: (val) => { configData.value = val }
})

// Load initial data
onMounted(async () => {
  await loadBranches()
})

async function loadBranches() {
  try {
    isLoading.value = true
    const token = useCookie('directus_session_token')

    const response = await $fetch<any>(`${apiUrl}/api/admin/notification-config`, {
      headers: { Authorization: `Bearer ${token.value}` },
      credentials: 'include',
    })

    if (response.branches) {
      // System admin - show branch list
      isSystemAdmin.value = true
      branches.value = response.branches
    } else if (response.config) {
      // Branch admin - show their config directly
      isSystemAdmin.value = false
      configData.value = response.config
      selectedBranchId.value = response.config.branch_id
    }
  } catch (error: any) {
    addToast({ message: error.message || '載入失敗', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

async function loadBranchConfig() {
  if (!selectedBranchId.value) return

  try {
    isLoading.value = true
    const token = useCookie('directus_session_token')

    const response = await $fetch<any>(`${apiUrl}/api/admin/notification-config?branch_id=${selectedBranchId.value}`, {
      headers: { Authorization: `Bearer ${token.value}` },
      credentials: 'include',
    })

    if (response.config) {
      configData.value = response.config
    }

    // Reset test results
    lineTestResult.value = null
    smsTestResult.value = null
  } catch (error: any) {
    addToast({ message: error.message || '載入失敗', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

async function saveLineConfig() {
  if (!lineConfig.value.access_token && !lineConfig.value.channel_secret) {
    addToast({ message: '請輸入至少一個欄位', type: 'warning' })
    return
  }

  try {
    isSaving.value = true
    const token = useCookie('directus_session_token')

    await $fetch(`${apiUrl}/api/admin/notification-config`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: {
        branch_id: selectedBranchId.value || undefined,
        line_channel_access_token: lineConfig.value.access_token || undefined,
        line_channel_secret: lineConfig.value.channel_secret || undefined,
      },
    })

    addToast({ message: 'LINE 設定已儲存', type: 'success' })
    lineConfig.value = { access_token: '', channel_secret: '' }
    await loadBranchConfig()
  } catch (error: any) {
    addToast({ message: error.message || '儲存失敗', type: 'error' })
  } finally {
    isSaving.value = false
  }
}

async function saveSmsConfig() {
  if (!smsConfig.value.username && !smsConfig.value.password) {
    addToast({ message: '請輸入帳號和密碼', type: 'warning' })
    return
  }

  try {
    isSaving.value = true
    const token = useCookie('directus_session_token')

    await $fetch(`${apiUrl}/api/admin/notification-config`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: {
        branch_id: selectedBranchId.value || undefined,
        mitake_username: smsConfig.value.username || undefined,
        mitake_password: smsConfig.value.password || undefined,
        sms_sender_name: smsConfig.value.sender_name || undefined,
      },
    })

    addToast({ message: '簡訊設定已儲存', type: 'success' })
    smsConfig.value = { username: '', password: '', sender_name: '' }
    await loadBranchConfig()
  } catch (error: any) {
    addToast({ message: error.message || '儲存失敗', type: 'error' })
  } finally {
    isSaving.value = false
  }
}

async function testLineConfig() {
  try {
    isTesting.value = true
    lineTestResult.value = null
    const token = useCookie('directus_session_token')

    const response = await $fetch<any>(`${apiUrl}/api/admin/notification-config/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: {
        branch_id: selectedBranchId.value || undefined,
        channel: 'line',
      },
    })

    lineTestResult.value = response
  } catch (error: any) {
    lineTestResult.value = { success: false, message: '測試失敗', error: error.message }
  } finally {
    isTesting.value = false
  }
}

async function testSmsConfig() {
  try {
    isTesting.value = true
    smsTestResult.value = null
    const token = useCookie('directus_session_token')

    const response = await $fetch<any>(`${apiUrl}/api/admin/notification-config/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: {
        branch_id: selectedBranchId.value || undefined,
        channel: 'sms',
      },
    })

    smsTestResult.value = response
  } catch (error: any) {
    smsTestResult.value = { success: false, message: '測試失敗', error: error.message }
  } finally {
    isTesting.value = false
  }
}

async function toggleActive() {
  try {
    const token = useCookie('directus_session_token')

    await $fetch(`${apiUrl}/api/admin/notification-config`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: {
        branch_id: selectedBranchId.value || undefined,
        is_active: configData.value.is_active,
      },
    })

    addToast({
      message: configData.value.is_active ? '通知服務已啟用' : '通知服務已停用',
      type: 'success'
    })
  } catch (error: any) {
    addToast({ message: error.message || '更新失敗', type: 'error' })
    configData.value.is_active = !configData.value.is_active
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '從未'
  return new Date(dateStr).toLocaleString('zh-TW')
}
</script>

<style scoped>
.notification-settings {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  margin-bottom: 32px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.header p {
  color: var(--color-text-secondary);
}

/* Branch Selector */
.branch-selector {
  margin-bottom: 24px;
}

.branch-selector label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
}

.branch-selector select {
  width: 100%;
  max-width: 400px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 15px;
  background-color: var(--color-surface);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Config Sections */
.config-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.config-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.section-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-icon svg {
  width: 24px;
  height: 24px;
}

.section-icon.line {
  background-color: #06C755;
  color: white;
}

.section-icon.sms {
  background-color: #5865F2;
  color: white;
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.section-header > div:nth-child(2) {
  flex: 1;
}

.section-header p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.status-badge.configured {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.status-badge.not-configured {
  background-color: rgba(156, 163, 175, 0.1);
  color: #6b7280;
}

/* Form */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 15px;
  background-color: var(--color-background);
}

.form-group small {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.input-with-action {
  display: flex;
  gap: 8px;
}

.input-with-action input {
  flex: 1;
}

.btn-icon {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon svg {
  width: 20px;
  height: 20px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary,
.btn-secondary {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background-color: #059669;
}

.btn-secondary {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-background);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Test Result */
.test-result {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
}

.test-result.success {
  background-color: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.test-result.error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.test-result p {
  margin: 8px 0 0 0;
  font-size: 14px;
}

/* Status Section */
.status-section h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.status-grid {
  display: flex;
  gap: 32px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-value {
  font-size: 14px;
}

/* Toggle */
.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 28px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border);
  transition: 0.3s;
  border-radius: 28px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle input:checked + .slider {
  background-color: var(--color-primary);
}

.toggle input:checked + .slider:before {
  transform: translateX(20px);
}

/* Help Section */
.help-section {
  background: var(--color-surface-secondary);
  border-radius: 12px;
  padding: 20px;
}

.help-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.help-content details {
  margin-bottom: 12px;
}

.help-content summary {
  cursor: pointer;
  font-weight: 500;
  padding: 8px 0;
}

.help-content ol {
  margin: 12px 0 0 20px;
  line-height: 1.8;
}

.help-content a {
  color: var(--color-primary);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--color-text-tertiary);
}

.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 16px;
}

/* Responsive */
@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .status-grid {
    flex-direction: column;
    gap: 16px;
  }

  .form-actions {
    flex-direction: column;
  }
}
</style>
