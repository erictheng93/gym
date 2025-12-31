<script setup lang="ts">
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const { fetchMonthlyAttendanceStats, fetchEmployeeMonthlyAttendance } = useAttendance()
const { branches, fetchBranches } = useBranches()

const selectedBranch = ref('')
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)
const isLoading = ref(false)
const stats = ref<Awaited<ReturnType<typeof fetchMonthlyAttendanceStats>>>([])
const showDetailModal = ref(false)
const selectedEmployee = ref<{ id: string; name: string } | null>(null)
const employeeAttendances = ref<Awaited<ReturnType<typeof fetchEmployeeMonthlyAttendance>>>([])
const isLoadingDetail = ref(false)

const years = computed(() => {
  const currentYear = new Date().getFullYear()
  return [currentYear, currentYear - 1, currentYear - 2]
})

const months = [
  { value: 1, label: '一月' },
  { value: 2, label: '二月' },
  { value: 3, label: '三月' },
  { value: 4, label: '四月' },
  { value: 5, label: '五月' },
  { value: 6, label: '六月' },
  { value: 7, label: '七月' },
  { value: 8, label: '八月' },
  { value: 9, label: '九月' },
  { value: 10, label: '十月' },
  { value: 11, label: '十一月' },
  { value: 12, label: '十二月' }
]

const loadStats = async () => {
  isLoading.value = true
  try {
    stats.value = await fetchMonthlyAttendanceStats({
      branchId: selectedBranch.value || undefined,
      year: selectedYear.value,
      month: selectedMonth.value
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await fetchBranches()
  await loadStats()
})

watch([selectedBranch, selectedYear, selectedMonth], () => {
  loadStats()
})

const viewDetail = async (employee: { employeeId: string; employeeName: string }) => {
  selectedEmployee.value = { id: employee.employeeId, name: employee.employeeName }
  showDetailModal.value = true
  isLoadingDetail.value = true

  try {
    employeeAttendances.value = await fetchEmployeeMonthlyAttendance(
      employee.employeeId,
      selectedYear.value,
      selectedMonth.value
    )
  } finally {
    isLoadingDetail.value = false
  }
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' })
}

const formatTime = (timeStr: string | null) => {
  if (!timeStr) return '—'
  return new Date(timeStr).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

const formatHours = (hours: number) => {
  return hours.toFixed(1)
}

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} 分鐘`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours} 小時 ${mins} 分鐘`
}

const getStatusLabel = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    PRESENT: { label: '正常', class: 'status-present' },
    ABSENT: { label: '缺勤', class: 'status-absent' },
    LATE: { label: '遲到', class: 'status-late' },
    EARLY_LEAVE: { label: '早退', class: 'status-early' },
    LEAVE: { label: '休假', class: 'status-leave' }
  }
  return map[status] || { label: status, class: '' }
}

// Summary statistics
const summaryStats = computed(() => {
  if (stats.value.length === 0) return null

  const total = stats.value.reduce((acc, s) => ({
    presentDays: acc.presentDays + s.presentDays,
    absentDays: acc.absentDays + s.absentDays,
    lateDays: acc.lateDays + s.lateDays,
    leaveDays: acc.leaveDays + s.leaveDays,
    totalWorkHours: acc.totalWorkHours + s.totalWorkHours,
    totalOvertimeHours: acc.totalOvertimeHours + s.totalOvertimeHours
  }), {
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    leaveDays: 0,
    totalWorkHours: 0,
    totalOvertimeHours: 0
  })

  return {
    ...total,
    employeeCount: stats.value.length,
    avgWorkHours: total.totalWorkHours / stats.value.length
  }
})
</script>

<template>
  <div class="reports-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/hr" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          人資管理
        </NuxtLink>
        <h1 class="text-headline">月度考勤報表</h1>
        <p class="text-body text-secondary">查看員工每月出勤統計</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <select v-model="selectedYear" class="input filter-select">
          <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option>
        </select>
        <select v-model="selectedMonth" class="input filter-select">
          <option v-for="month in months" :key="month.value" :value="month.value">
            {{ month.label }}
          </option>
        </select>
      </div>
    </header>

    <!-- Summary Cards -->
    <div v-if="summaryStats" class="summary-grid">
      <div class="summary-card">
        <div class="summary-icon blue">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="summary-content">
          <span class="summary-value">{{ summaryStats.employeeCount }}</span>
          <span class="summary-label">員工人數</span>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon green">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="summary-content">
          <span class="summary-value">{{ summaryStats.presentDays }}</span>
          <span class="summary-label">總出勤天數</span>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon orange">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="summary-content">
          <span class="summary-value">{{ formatHours(summaryStats.totalWorkHours) }}</span>
          <span class="summary-label">總工時（小時）</span>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-icon purple">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="summary-content">
          <span class="summary-value">{{ formatHours(summaryStats.totalOvertimeHours) }}</span>
          <span class="summary-label">總加班（小時）</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="stats.length === 0" class="empty-state card">
      <div class="empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"/>
          <path d="m19 9-5 5-4-4-3 3"/>
        </svg>
      </div>
      <h3>無考勤資料</h3>
      <p class="text-secondary">選定的期間內沒有考勤紀錄</p>
    </div>

    <!-- Data Table -->
    <div v-else class="table-card card">
      <table class="data-table">
        <thead>
          <tr>
            <th>員工</th>
            <th>出勤天數</th>
            <th>缺勤</th>
            <th>遲到</th>
            <th>休假</th>
            <th>工時（小時）</th>
            <th>加班（小時）</th>
            <th>遲到時數</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in stats" :key="row.employeeId" :style="{ animationDelay: `${index * 0.03}s` }">
            <td>
              <div class="employee-cell">
                <div class="employee-avatar">{{ row.employeeName[0] }}</div>
                <div class="employee-info">
                  <span class="employee-name">{{ row.employeeName }}</span>
                  <span class="employee-code">{{ row.employeeCode }}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="stat-value success">{{ row.presentDays }}</span>
            </td>
            <td>
              <span class="stat-value" :class="{ error: row.absentDays > 0 }">{{ row.absentDays }}</span>
            </td>
            <td>
              <span class="stat-value" :class="{ warning: row.lateDays > 0 }">{{ row.lateDays }}</span>
            </td>
            <td>
              <span class="stat-value">{{ row.leaveDays }}</span>
            </td>
            <td>
              <span class="stat-value mono">{{ formatHours(row.totalWorkHours) }}</span>
            </td>
            <td>
              <span class="stat-value mono" :class="{ accent: row.totalOvertimeHours > 0 }">
                {{ formatHours(row.totalOvertimeHours) }}
              </span>
            </td>
            <td>
              <span class="stat-value mono" :class="{ warning: row.totalLateMinutes > 30 }">
                {{ formatMinutes(row.totalLateMinutes) }}
              </span>
            </td>
            <td>
              <button class="action-btn" title="查看詳情" @click="viewDetail(row)">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetailModal" class="modal-overlay" @click.self="showDetailModal = false">
        <div class="modal-content glass-card modal-large">
          <div class="modal-header">
            <h3 class="modal-title">
              {{ selectedEmployee?.name }} - {{ selectedYear }}年{{ selectedMonth }}月 考勤明細
            </h3>
            <button class="modal-close" @click="showDetailModal = false">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div v-if="isLoadingDetail" class="loading-state">
            <div class="loading-spinner" />
          </div>

          <div v-else-if="employeeAttendances.length === 0" class="empty-state-small">
            <p class="text-secondary">此月份無考勤紀錄</p>
          </div>

          <div v-else class="detail-table-wrapper">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>狀態</th>
                  <th>上班</th>
                  <th>下班</th>
                  <th>工時</th>
                  <th>加班</th>
                  <th>遲到</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="att in employeeAttendances" :key="att.id">
                  <td>{{ formatDate(att.attendance_date) }}</td>
                  <td>
                    <span class="status-badge" :class="getStatusLabel(att.attendance_status).class">
                      {{ getStatusLabel(att.attendance_status).label }}
                    </span>
                  </td>
                  <td class="mono">{{ formatTime(att.check_in) }}</td>
                  <td class="mono">{{ formatTime(att.check_out) }}</td>
                  <td class="mono">{{ att.work_hours ? formatHours(att.work_hours) : '—' }}</td>
                  <td class="mono">{{ att.overtime_hours ? formatHours(att.overtime_hours) : '—' }}</td>
                  <td class="mono">{{ att.late_minutes ? `${att.late_minutes} 分` : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.reports-page {
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  animation: fadeInUp 0.6s var(--ease-out) backwards;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--space-sm);
}

.back-link:hover {
  text-decoration: underline;
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

.header-actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.filter-select {
  min-width: 120px;
}

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.summary-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  animation: cardAppear 0.5s var(--ease-out) backwards;
}

@keyframes cardAppear {
  from { opacity: 0; transform: translateY(20px); }
}

.summary-card:nth-child(1) { animation-delay: 0.1s; }
.summary-card:nth-child(2) { animation-delay: 0.15s; }
.summary-card:nth-child(3) { animation-delay: 0.2s; }
.summary-card:nth-child(4) { animation-delay: 0.25s; }

.summary-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.summary-icon.blue {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.summary-icon.green {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.summary-icon.orange {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.summary-icon.purple {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.summary-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Loading & Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.loading-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-lg);
}

.empty-state-small {
  padding: var(--space-xl);
  text-align: center;
}

/* Data Table */
.table-card {
  overflow: hidden;
  animation: cardAppear 0.5s var(--ease-out) 0.3s backwards;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: var(--space-md) var(--space-lg);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-divider);
}

.data-table td {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-divider);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr {
  animation: rowAppear 0.4s var(--ease-out) backwards;
}

@keyframes rowAppear {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.data-table tbody tr:hover {
  background: var(--color-bg-secondary);
}

/* Employee Cell */
.employee-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.employee-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.employee-info {
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.employee-code {
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

/* Stat Values */
.stat-value {
  font-weight: 500;
}

.stat-value.mono {
  font-family: var(--font-mono);
}

.stat-value.success {
  color: var(--color-success);
}

.stat-value.error {
  color: var(--color-error);
}

.stat-value.warning {
  color: #ff9500;
}

.stat-value.accent {
  color: var(--color-accent);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-lg);
}

.modal-content {
  width: 100%;
  max-width: 900px;
  max-height: 80vh;
  overflow-y: auto;
  padding: var(--space-xl);
  animation: modalIn 0.3s var(--ease-spring);
}

.modal-large {
  max-width: 900px;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.modal-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

/* Detail Table */
.detail-table-wrapper {
  overflow-x: auto;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.detail-table th {
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-divider);
}

.detail-table td {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-divider);
}

.detail-table .mono {
  font-family: var(--font-mono);
}

/* Status Badge */
.status-badge {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.status-present {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.status-absent {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.status-late {
  background: rgba(255, 149, 0, 0.15);
  color: #ff9500;
}

.status-early {
  background: rgba(255, 204, 0, 0.15);
  color: #cc9a00;
}

.status-leave {
  background: rgba(0, 113, 227, 0.15);
  color: var(--color-accent);
}

/* Responsive */
@media (max-width: 1024px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
