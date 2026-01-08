<template>
  <div class="google-sheets-export">
    <!-- Export Button -->
    <button
      :disabled="loading || !data || data.length === 0"
      class="export-button"
      :class="{ loading }"
      @click="handleExport"
    >
      <svg v-if="!loading" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span v-if="loading" class="spinner"></span>
      <span>{{ loading ? '匯出中...' : '匯出至 Google Sheets' }}</span>
    </button>

    <!-- Success Message -->
    <div v-if="exportResult" class="export-success">
      <div class="success-message">
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>匯出成功！</span>
      </div>
      <a :href="exportResult.spreadsheetUrl" target="_blank" class="view-link">
        在 Google Sheets 中開啟
        <svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="export-error">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{{ error }}</span>
      <button class="close-error" @click="error = null">×</button>
    </div>

    <!-- Auth Required Modal -->
    <div v-if="showAuthModal" class="modal-overlay" @click.self="showAuthModal = false">
      <div class="modal">
        <h3>需要 Google 帳號授權</h3>
        <p>首次使用需要授權 Google Sheets 存取權限。</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showAuthModal = false">取消</button>
          <button class="btn-primary" @click="authenticateAndExport">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            使用 Google 帳號登入
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useGoogleSheets } from '~/utils/googleSheets'

interface Props {
  data: any[]
  reportType: 'revenue' | 'member-growth' | 'contract-expiry' | 'member-activity'
  filename?: string
}

const props = defineProps<Props>()

const googleSheets = useGoogleSheets()
const loading = ref(false)
const error = ref<string | null>(null)
const exportResult = ref<any>(null)
const showAuthModal = ref(false)

const handleExport = async () => {
  if (!props.data || props.data.length === 0) {
    error.value = '沒有資料可匯出'
    return
  }

  // Check if authenticated
  if (!googleSheets.isAuthenticated()) {
    showAuthModal.value = true
    return
  }

  await performExport()
}

const authenticateAndExport = async () => {
  try {
    loading.value = true
    await googleSheets.authenticate()
    showAuthModal.value = false
    await performExport()
  } catch (err: any) {
    error.value = err.message || '驗證失敗'
    showAuthModal.value = false
  } finally {
    loading.value = false
  }
}

const performExport = async () => {
  try {
    loading.value = true
    error.value = null
    exportResult.value = null

    let result
    switch (props.reportType) {
      case 'revenue':
        result = await googleSheets.exportRevenueReport(props.data, props.filename)
        break
      case 'member-growth':
        result = await googleSheets.exportMemberGrowthReport(props.data, props.filename)
        break
      case 'contract-expiry':
        result = await googleSheets.exportContractExpiryReport(props.data, props.filename)
        break
      case 'member-activity':
        result = await googleSheets.exportMemberActivityReport(props.data, props.filename)
        break
      default:
        throw new Error('未知的報表類型')
    }

    exportResult.value = result

    // Auto-hide success message after 10 seconds
    setTimeout(() => {
      exportResult.value = null
    }, 10000)
  } catch (err: any) {
    error.value = err.message || '匯出失敗'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.google-sheets-export {
  display: inline-block;
  position: relative;
}

.export-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: #0f9d58;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.export-button:hover:not(:disabled) {
  background: #0d8a4d;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 157, 88, 0.3);
}

.export-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.export-button.loading {
  background: #0d8a4d;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.export-success {
  margin-top: 1rem;
  padding: 1rem;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #155724;
  font-weight: 500;
}

.check-icon {
  width: 1.5rem;
  height: 1.5rem;
  stroke: #28a745;
}

.view-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #0071e3;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
}

.view-link:hover {
  text-decoration: underline;
}

.external-icon {
  width: 1rem;
  height: 1rem;
}

.export-error {
  margin-top: 1rem;
  padding: 1rem;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #721c24;
  position: relative;
}

.error-icon {
  width: 1.5rem;
  height: 1.5rem;
  stroke: #dc3545;
  flex-shrink: 0;
}

.close-error {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #721c24;
  cursor: pointer;
  padding: 0 0.5rem;
}

.close-error:hover {
  color: #dc3545;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 2rem;
  border-radius: 0.75rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.5rem;
}

.modal p {
  margin: 0 0 1.5rem 0;
  color: #666;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.btn-secondary, .btn-primary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #e9ecef;
  color: #495057;
}

.btn-secondary:hover {
  background: #dee2e6;
}

.btn-primary {
  background: #4285f4;
  color: white;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary:hover {
  background: #357ae8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
}

.btn-primary .icon {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
