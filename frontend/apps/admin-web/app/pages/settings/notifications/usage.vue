<template>
  <div class="notification-usage">
    <div class="header">
      <div>
        <h1>通知用量統計</h1>
        <p>追蹤 LINE 和簡訊發送用量及費用</p>
      </div>
      <button class="btn-export" :disabled="isExporting" @click="exportCsv">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {{ isExporting ? '匯出中...' : '匯出 CSV' }}
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div v-if="isSystemAdmin" class="filter-group">
        <label>分店</label>
        <select v-model="filters.branchId" @change="loadUsage">
          <option value="">全部分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>時間範圍</label>
        <select v-model="filters.preset" @change="applyPreset">
          <option value="this_month">本月</option>
          <option value="last_month">上月</option>
          <option value="last_7_days">最近 7 天</option>
          <option value="last_30_days">最近 30 天</option>
          <option value="custom">自訂</option>
        </select>
      </div>
      <div v-if="filters.preset === 'custom'" class="filter-group">
        <label>開始日期</label>
        <input v-model="filters.startDate" type="date" @change="loadUsage" />
      </div>
      <div v-if="filters.preset === 'custom'" class="filter-group">
        <label>結束日期</label>
        <input v-model="filters.endDate" type="date" @change="loadUsage" />
      </div>
      <div class="filter-group">
        <label>分組</label>
        <select v-model="filters.groupBy" @change="loadUsage">
          <option value="day">按日</option>
          <option value="month">按月</option>
        </select>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

    <!-- Summary Cards -->
    <div v-else class="summary-grid">
      <!-- SMS Summary -->
      <div class="summary-card sms">
        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3>簡訊</h3>
        </div>
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">{{ summary.sms.total_sent }}</span>
            <span class="stat-label">發送總數</span>
          </div>
          <div class="stat">
            <span class="stat-value success">{{ summary.sms.success_count }}</span>
            <span class="stat-label">成功</span>
          </div>
          <div class="stat">
            <span class="stat-value error">{{ summary.sms.failed_count }}</span>
            <span class="stat-label">失敗</span>
          </div>
          <div class="stat highlight">
            <span class="stat-value">NT$ {{ summary.sms.total_cost.toFixed(2) }}</span>
            <span class="stat-label">費用</span>
          </div>
        </div>
        <div class="card-footer">
          <span>{{ summary.sms.total_segments }} 則簡訊計費單位</span>
        </div>
      </div>

      <!-- LINE Summary -->
      <div class="summary-card line">
        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 5.94 2 10.7c0 4.18 3.71 7.68 8.72 8.52.34.07.8.22.92.51.11.26.07.66.04.93l-.15.91c-.05.28-.22 1.08.95.59 1.17-.49 6.31-3.72 8.61-6.36C22.61 13.13 22 11.02 22 10.7 22 5.94 17.52 2 12 2z" />
            </svg>
          </div>
          <h3>LINE</h3>
        </div>
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">{{ summary.line.total_sent }}</span>
            <span class="stat-label">發送總數</span>
          </div>
          <div class="stat">
            <span class="stat-value success">{{ summary.line.success_count }}</span>
            <span class="stat-label">成功</span>
          </div>
          <div class="stat">
            <span class="stat-value error">{{ summary.line.failed_count }}</span>
            <span class="stat-label">失敗</span>
          </div>
          <div class="stat highlight">
            <span class="stat-value">免費</span>
            <span class="stat-label">費用</span>
          </div>
        </div>
        <div class="card-footer">
          <span>LINE 訊息免費（每月有配額限制）</span>
        </div>
      </div>
    </div>

    <!-- Detailed Table -->
    <div v-if="!isLoading" class="detail-section">
      <div class="section-header">
        <h2>詳細記錄</h2>
        <div class="tab-buttons">
          <button
            :class="{ active: activeTab === 'sms' }"
            @click="activeTab = 'sms'"
          >
            簡訊
          </button>
          <button
            :class="{ active: activeTab === 'line' }"
            @click="activeTab = 'line'"
          >
            LINE
          </button>
          <button
            :class="{ active: activeTab === 'all' }"
            @click="activeTab = 'all'"
          >
            全部通知
          </button>
        </div>
      </div>

      <!-- SMS Details -->
      <div v-if="activeTab === 'sms'" class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th v-if="!filters.branchId">分店</th>
              <th class="text-right">發送數</th>
              <th class="text-right">成功</th>
              <th class="text-right">失敗</th>
              <th class="text-right">則數</th>
              <th class="text-right">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in details.sms" :key="row.period">
              <td>{{ formatPeriod(row.period) }}</td>
              <td v-if="!filters.branchId">{{ getBranchName(row.branch_id) }}</td>
              <td class="text-right">{{ row.total_sent }}</td>
              <td class="text-right text-success">{{ row.success_count }}</td>
              <td class="text-right text-error">{{ row.failed_count }}</td>
              <td class="text-right">{{ row.total_segments }}</td>
              <td class="text-right font-medium">NT$ {{ parseFloat(row.total_cost || 0).toFixed(2) }}</td>
            </tr>
            <tr v-if="details.sms.length === 0">
              <td :colspan="filters.branchId ? 6 : 7" class="empty-row">
                無資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- LINE Details -->
      <div v-if="activeTab === 'line'" class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th v-if="!filters.branchId">分店</th>
              <th>訊息類型</th>
              <th class="text-right">發送數</th>
              <th class="text-right">成功</th>
              <th class="text-right">失敗</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in details.line" :key="`${row.period}-${row.message_type}`">
              <td>{{ formatPeriod(row.period) }}</td>
              <td v-if="!filters.branchId">{{ getBranchName(row.branch_id) }}</td>
              <td>{{ getMessageTypeLabel(row.message_type) }}</td>
              <td class="text-right">{{ row.total_sent }}</td>
              <td class="text-right text-success">{{ row.success_count }}</td>
              <td class="text-right text-error">{{ row.failed_count }}</td>
            </tr>
            <tr v-if="details.line.length === 0">
              <td :colspan="filters.branchId ? 5 : 6" class="empty-row">
                無資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- All Notifications -->
      <div v-if="activeTab === 'all'" class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>通知類型</th>
              <th>使用通道</th>
              <th>狀態</th>
              <th class="text-right">數量</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in details.notifications" :key="idx">
              <td>{{ formatPeriod(row.period) }}</td>
              <td>{{ getNotificationTypeLabel(row.notification_type) }}</td>
              <td>{{ getChannelLabel(row.successful_channel) }}</td>
              <td>
                <span class="status-badge" :class="row.overall_status">
                  {{ getStatusLabel(row.overall_status) }}
                </span>
              </td>
              <td class="text-right">{{ row.count }}</td>
            </tr>
            <tr v-if="details.notifications.length === 0">
              <td colspan="5" class="empty-row">
                無資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const { addToast } = useToast()
const config = useRuntimeConfig()
const apiUrl = config.public.apiBaseUrl

// State
const isSystemAdmin = ref(false)
const branches = ref<any[]>([])
const isLoading = ref(false)
const isExporting = ref(false)
const activeTab = ref<'sms' | 'line' | 'all'>('sms')

const filters = ref({
  branchId: '',
  preset: 'this_month',
  startDate: '',
  endDate: '',
  groupBy: 'day',
})

const summary = ref({
  sms: { total_sent: 0, success_count: 0, failed_count: 0, total_cost: 0, total_segments: 0 },
  line: { total_sent: 0, success_count: 0, failed_count: 0 },
})

const details = ref({
  sms: [] as any[],
  line: [] as any[],
  notifications: [] as any[],
})

// Load initial data
onMounted(async () => {
  await loadBranches()
  applyPreset()
})

async function loadBranches() {
  try {
    // Check if admin by trying to get all branches
    const response = await $fetch<any>(`${apiUrl}/api/branches?status=active`, {
      credentials: 'include',
    })

    if (response.success && response.data && response.data.length > 1) {
      isSystemAdmin.value = true
      branches.value = response.data
    }
  } catch (error) {
    // Not admin or no access to branches
    isSystemAdmin.value = false
  }
}

function applyPreset() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  switch (filters.value.preset) {
    case 'this_month':
      filters.value.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      filters.value.endDate = today
      break
    case 'last_month':
      filters.value.startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      filters.value.endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
      break
    case 'last_7_days':
      filters.value.startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      filters.value.endDate = today
      break
    case 'last_30_days':
      filters.value.startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      filters.value.endDate = today
      break
  }

  loadUsage()
}

async function loadUsage() {
  try {
    isLoading.value = true

    const params = new URLSearchParams({
      start_date: filters.value.startDate,
      end_date: filters.value.endDate,
      group_by: filters.value.groupBy,
    })

    if (filters.value.branchId) {
      params.set('branch_id', filters.value.branchId)
    }

    const response = await $fetch<any>(`${apiUrl}/api/admin/notification-usage?${params}`, {
      credentials: 'include',
    })

    if (response.success) {
      summary.value = response.summary
      details.value = response.details
    }
  } catch (error: any) {
    addToast({ message: error.message || '載入失敗', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

async function exportCsv() {
  try {
    isExporting.value = true

    const params = new URLSearchParams({
      start_date: filters.value.startDate,
      end_date: filters.value.endDate,
      format: 'csv',
    })

    if (filters.value.branchId) {
      params.set('branch_id', filters.value.branchId)
    }

    // Fetch CSV and download
    const response = await fetch(`${apiUrl}/api/admin/notification-usage/export?${params}`, {
      credentials: 'include',
    })

    if (!response.ok) throw new Error('匯出失敗')

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sms-usage-${filters.value.startDate}-${filters.value.endDate}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    addToast({ message: 'CSV 已匯出', type: 'success' })
  } catch (error: any) {
    addToast({ message: error.message || '匯出失敗', type: 'error' })
  } finally {
    isExporting.value = false
  }
}

function formatPeriod(period: string) {
  if (!period) return '-'
  const date = new Date(period)
  if (filters.value.groupBy === 'month') {
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })
  }
  return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
}

function getBranchName(branchId: string) {
  const branch = branches.value.find(b => b.id === branchId)
  return branch?.name || branchId || '-'
}

function getMessageTypeLabel(type: string) {
  const labels: Record<string, string> = {
    text: '文字',
    flex: 'Flex Message',
  }
  return labels[type] || type
}

function getNotificationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    booking_confirmation: '預約確認',
    booking_reminder_24h: '課程提醒 (24h)',
    booking_reminder_2h: '課程提醒 (2h)',
    booking_cancelled: '預約取消',
    class_cancelled: '課程取消',
    contract_expiry_7d: '會籍到期 (7天)',
    contract_expiry_3d: '會籍到期 (3天)',
    contract_expiry_1d: '會籍到期 (1天)',
    payment_confirmation: '付款確認',
    welcome: '歡迎訊息',
    otp: 'OTP 驗證碼',
    test: '測試',
  }
  return labels[type] || type
}

function getChannelLabel(channel: string | null) {
  if (!channel) return '-'
  const labels: Record<string, string> = {
    line: 'LINE',
    push: '推播',
    email: 'Email',
    sms: '簡訊',
  }
  return labels[channel] || channel
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    sent: '已發送',
    delivered: '已送達',
    failed: '失敗',
    pending: '待處理',
  }
  return labels[status] || status
}
</script>

<style scoped>
.notification-usage {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.header p {
  color: var(--color-text-secondary);
}

.btn-export {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-export svg {
  width: 18px;
  height: 18px;
}

.btn-export:hover:not(:disabled) {
  background-color: var(--color-background);
}

.btn-export:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Filters */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.filter-group select,
.filter-group input {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  background-color: var(--color-background);
  min-width: 150px;
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

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.summary-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon svg {
  width: 22px;
  height: 22px;
}

.summary-card.sms .card-icon {
  background-color: #5865F2;
  color: white;
}

.summary-card.line .card-icon {
  background-color: #06C755;
  color: white;
}

.card-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.card-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.stat-value.success {
  color: #10b981;
}

.stat-value.error {
  color: #ef4444;
}

.stat.highlight .stat-value {
  color: var(--color-primary);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

.card-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Detail Section */
.detail-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.tab-buttons {
  display: flex;
  gap: 8px;
}

.tab-buttons button {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-buttons button.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

/* Data Table */
.data-table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 20px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background-color: var(--color-surface-secondary);
}

.data-table td {
  font-size: 14px;
}

.text-right {
  text-align: right;
}

.text-success {
  color: #10b981;
}

.text-error {
  color: #ef4444;
}

.font-medium {
  font-weight: 500;
}

.empty-row {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 40px 20px !important;
}

/* Status Badge */
.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.sent,
.status-badge.delivered {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.status-badge.failed {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.status-badge.pending {
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

/* Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 16px;
  }

  .filters {
    flex-direction: column;
  }

  .filter-group select,
  .filter-group input {
    width: 100%;
  }

  .card-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .section-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
</style>
