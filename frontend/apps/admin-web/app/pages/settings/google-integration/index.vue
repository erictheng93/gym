<template>
  <div class="google-integration-settings">
    <div class="header">
      <h1>Google Workspace 整合設定</h1>
      <p>設定 Google Sheets 和 Looker Studio 整合功能</p>
    </div>

    <!-- Configuration Status -->
    <div class="status-card" :class="statusClass">
      <div class="status-icon">
        <svg v-if="configStatus === 'configured'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <svg v-else-if="configStatus === 'not-configured'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <div class="status-content">
        <h3>{{ statusTitle }}</h3>
        <p>{{ statusMessage }}</p>
      </div>
    </div>

    <!-- Configuration Steps -->
    <div class="setup-wizard">
      <h2>設定步驟</h2>

      <!-- Step 1: Create Google Cloud Project -->
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <h3>建立 Google Cloud 專案</h3>
          <ol>
            <li>前往 <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
            <li>點擊「建立專案」或選擇現有專案</li>
            <li>記下專案 ID（例如：my-gym-project-123456）</li>
          </ol>
        </div>
      </div>

      <!-- Step 2: Enable APIs -->
      <div class="step">
        <div class="step-number">2</div>
        <div class="step-content">
          <h3>啟用必要的 API</h3>
          <ol>
            <li>在 Google Cloud Console 中，前往「API 和服務」→「程式庫」</li>
            <li>
              搜尋並啟用以下 API：
              <ul>
                <li>Google Sheets API</li>
                <li>Google Drive API</li>
              </ul>
            </li>
          </ol>
        </div>
      </div>

      <!-- Step 3: Create OAuth Credentials -->
      <div class="step">
        <div class="step-number">3</div>
        <div class="step-content">
          <h3>建立 OAuth 2.0 憑證</h3>
          <ol>
            <li>前往「API 和服務」→「憑證」</li>
            <li>點擊「建立憑證」→「OAuth 用戶端 ID」</li>
            <li>應用程式類型選擇「網頁應用程式」</li>
            <li>
              新增已授權的重新導向 URI：
              <div class="code-block">
                <code>{{ redirectUri }}</code>
                <button class="btn-copy" @click="copyToClipboard(redirectUri)">複製</button>
              </div>
            </li>
            <li>建立後，記下「用戶端 ID」和「用戶端密鑰」</li>
          </ol>
        </div>
      </div>

      <!-- Step 4: Configure Environment Variables -->
      <div class="step">
        <div class="step-number">4</div>
        <div class="step-content">
          <h3>設定環境變數</h3>
          <p>在 <code>.env</code> 檔案中加入以下設定：</p>
          <div class="code-block multi-line">
            <pre>{{ envTemplate }}</pre>
            <button class="btn-copy" @click="copyToClipboard(envTemplate)">複製全部</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Authentication Section -->
    <div class="auth-section">
      <h2>Google 帳號驗證</h2>

      <div v-if="!isAuthenticated" class="auth-required">
        <p>請先驗證 Google 帳號以使用報表匯出功能</p>
        <button class="btn-google" :disabled="!isConfigured || authLoading" @click="authenticate">
          <svg class="google-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {{ authLoading ? '驗證中...' : '使用 Google 帳號登入' }}
        </button>
      </div>

      <div v-else class="auth-success">
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <div class="auth-info">
          <h3>已連接 Google 帳號</h3>
          <p>您可以使用 Google Sheets 匯出功能</p>
        </div>
        <button class="btn-logout" @click="logout">登出</button>
      </div>
    </div>

    <!-- Test Export Section -->
    <div v-if="isAuthenticated" class="test-section">
      <h2>測試匯出</h2>
      <p>測試 Google Sheets 整合是否正常運作</p>

      <div class="test-actions">
        <button class="btn-test" :disabled="testLoading" @click="testExport">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ testLoading ? '測試中...' : '測試匯出' }}
        </button>

        <div v-if="testResult" class="test-result success">
          <svg class="check-icon-small" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>測試成功！</span>
          <a :href="testResult.spreadsheetUrl" target="_blank" class="view-link">查看試算表</a>
        </div>

        <div v-if="testError" class="test-result error">
          <svg class="error-icon-small" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{{ testError }}</span>
        </div>
      </div>
    </div>

    <!-- Looker Studio Guide Link -->
    <div class="looker-section">
      <h2>Looker Studio 整合</h2>
      <p>使用 Looker Studio 建立進階報表儀表板</p>
      <a href="/docs/LOOKER_STUDIO_SETUP.md" target="_blank" class="btn-docs">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        查看 Looker Studio 設定指南
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGoogleSheets } from '~/utils/googleSheets'

const googleSheets = useGoogleSheets()
const config = useRuntimeConfig()

const isAuthenticated = ref(false)
const authLoading = ref(false)
const testLoading = ref(false)
const testResult = ref<any>(null)
const testError = ref<string | null>(null)

const redirectUri = computed(() => {
  return config.public.googleRedirectUri || 'http://localhost:3001/settings/google-integration/callback'
})

const isConfigured = computed(() => {
  const clientId = config.public.googleClientId as string
  return clientId && !clientId.includes('your_client_id')
})

const configStatus = computed(() => {
  if (!isConfigured.value) return 'not-configured'
  if (isAuthenticated.value) return 'configured'
  return 'ready'
})

const statusClass = computed(() => {
  return {
    'status-success': configStatus.value === 'configured',
    'status-warning': configStatus.value === 'ready',
    'status-error': configStatus.value === 'not-configured'
  }
})

const statusTitle = computed(() => {
  switch (configStatus.value) {
    case 'configured': return '✓ 已設定完成'
    case 'ready': return '⚠ 需要驗證'
    case 'not-configured': return '⚠ 未設定'
    default: return ''
  }
})

const statusMessage = computed(() => {
  switch (configStatus.value) {
    case 'configured': return 'Google Workspace 整合已設定並驗證完成，可以開始使用報表匯出功能'
    case 'ready': return '環境變數已設定，請驗證 Google 帳號以完成設定'
    case 'not-configured': return '請按照下方步驟設定 Google Cloud 專案和 OAuth 憑證'
    default: return ''
  }
})

const envTemplate = computed(() => {
  return `NUXT_PUBLIC_GOOGLE_PROJECT_ID=your_project_id_here
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
NUXT_PUBLIC_GOOGLE_REDIRECT_URI=${redirectUri.value}
NUXT_PUBLIC_GOOGLE_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.file`
})

onMounted(() => {
  checkAuthStatus()
})

const checkAuthStatus = () => {
  isAuthenticated.value = googleSheets.isAuthenticated()
}

const authenticate = async () => {
  try {
    authLoading.value = true
    await googleSheets.authenticate()
    isAuthenticated.value = true
  } catch (err: any) {
    alert(err.message || '驗證失敗')
  } finally {
    authLoading.value = false
  }
}

const logout = () => {
  googleSheets.logout()
  isAuthenticated.value = false
  testResult.value = null
}

const testExport = async () => {
  try {
    testLoading.value = true
    testError.value = null
    testResult.value = null

    const testData = [
      { 日期: '2025-12-26', 分店: '測試分店', 營收: '10000', 會員數: '50' },
      { 日期: '2025-12-25', 分店: '測試分店', 營收: '12000', 會員數: '52' }
    ]

    const result = await googleSheets.createSpreadsheet(
      '測試報表_' + new Date().toISOString(),
      '測試資料',
      testData
    )

    testResult.value = result
  } catch (err: any) {
    testError.value = err.message || '測試失敗'
  } finally {
    testLoading.value = false
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    alert('已複製到剪貼簿')
  } catch {
    alert('複製失敗，請手動複製')
  }
}
</script>

<style scoped>
.google-integration-settings {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2rem;
  color: #333;
  margin: 0 0 0.5rem 0;
}

.header p {
  color: #666;
  margin: 0;
  font-size: 1.1rem;
}

.status-card {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 0.75rem;
  margin-bottom: 2rem;
  border: 2px solid;
}

.status-success {
  background: #d4edda;
  border-color: #28a745;
}

.status-warning {
  background: #fff3cd;
  border-color: #ffc107;
}

.status-error {
  background: #f8d7da;
  border-color: #dc3545;
}

.status-icon svg {
  width: 3rem;
  height: 3rem;
}

.status-success .status-icon svg {
  stroke: #28a745;
}

.status-warning .status-icon svg {
  stroke: #ffc107;
}

.status-error .status-icon svg {
  stroke: #dc3545;
}

.status-content h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #333;
}

.status-content p {
  margin: 0;
  color: #666;
  line-height: 1.6;
}

.setup-wizard {
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.setup-wizard h2 {
  margin: 0 0 1.5rem 0;
  color: #333;
  font-size: 1.5rem;
}

.step {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #e0e0e0;
}

.step:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.step-number {
  width: 2.5rem;
  height: 2.5rem;
  background: #667eea;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.15rem;
}

.step-content ol, .step-content ul {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.step-content li {
  margin-bottom: 0.5rem;
  color: #555;
  line-height: 1.6;
}

.step-content a {
  color: #667eea;
  text-decoration: none;
}

.step-content a:hover {
  text-decoration: underline;
}

.code-block {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 0.75rem 0;
  position: relative;
  font-family: 'Courier New', monospace;
}

.code-block code {
  color: #333;
  word-break: break-all;
}

.code-block.multi-line pre {
  margin: 0;
  white-space: pre-wrap;
  color: #333;
}

.btn-copy {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.5rem 1rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-copy:hover {
  background: #5568d3;
}

.auth-section, .test-section, .looker-section {
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auth-section h2, .test-section h2, .looker-section h2 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.5rem;
}

.auth-required, .auth-success {
  padding: 1.5rem;
  border: 2px dashed #ddd;
  border-radius: 0.5rem;
  text-align: center;
}

.auth-required p {
  margin: 0 0 1.5rem 0;
  color: #666;
}

.btn-google {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 2rem;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-google:hover:not(:disabled) {
  background: #357ae8;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.4);
}

.btn-google:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.google-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.auth-success {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  border-color: #28a745;
  background: #d4edda;
}

.check-icon {
  width: 3rem;
  height: 3rem;
  stroke: #28a745;
  flex-shrink: 0;
}

.auth-info {
  flex: 1;
  text-align: left;
}

.auth-info h3 {
  margin: 0 0 0.25rem 0;
  color: #155724;
  font-size: 1.1rem;
}

.auth-info p {
  margin: 0;
  color: #155724;
  font-size: 0.95rem;
}

.btn-logout {
  padding: 0.75rem 1.5rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #c82333;
}

.test-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.btn-test {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: #0f9d58;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
}

.btn-test:hover:not(:disabled) {
  background: #0d8a4d;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.5rem;
}

.test-result.success {
  background: #d4edda;
  color: #155724;
}

.test-result.error {
  background: #f8d7da;
  color: #721c24;
}

.check-icon-small, .error-icon-small {
  width: 1.5rem;
  height: 1.5rem;
}

.check-icon-small {
  stroke: #28a745;
}

.error-icon-small {
  stroke: #dc3545;
}

.view-link {
  margin-left: auto;
  color: #0071e3;
  text-decoration: none;
  font-weight: 500;
}

.view-link:hover {
  text-decoration: underline;
}

.btn-docs {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: #667eea;
  color: white;
  border-radius: 0.5rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-docs:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
