<script setup lang="ts">
import { PAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const { currentEmployee, checkAuth } = useAuth()
const { branches, fetchBranches } = useBranches()
const { todayAttendanceSummary, fetchTodayAttendanceSummary } = useAttendance()
const { pendingApprovals, fetchPendingApprovals } = useLeaveRequests()

const isLoading = ref(true)
const selectedBranch = ref('')

onMounted(async () => {
  await checkAuth()
  await fetchBranches()
  await loadDashboardData()
})

const loadDashboardData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchTodayAttendanceSummary(selectedBranch.value || undefined),
      currentEmployee.value?.id ? fetchPendingApprovals(currentEmployee.value.id) : Promise.resolve()
    ])
  } finally {
    isLoading.value = false
  }
}

watch(selectedBranch, () => {
  loadDashboardData()
})

const hrModules = [
  {
    title: PAGES.HR.ATTENDANCE.TITLE,
    description: PAGES.HR.ATTENDANCE.DESCRIPTION,
    to: '/hr/attendance',
    icon: 'clock',
    gradient: 'from-blue-500 to-cyan-400'
  },
  {
    title: PAGES.HR.LEAVES.TITLE,
    description: PAGES.HR.LEAVES.DESCRIPTION,
    to: '/hr/leaves',
    icon: 'calendar',
    gradient: 'from-emerald-500 to-teal-400'
  },
  {
    title: PAGES.HR.MAKEUP.TITLE,
    description: PAGES.HR.MAKEUP.DESCRIPTION,
    to: '/hr/makeup',
    icon: 'makeup',
    gradient: 'from-rose-500 to-red-400'
  },
  {
    title: '班表管理',
    description: '設定員工上下班時間與加班規則',
    to: '/hr/schedules',
    icon: 'schedule',
    gradient: 'from-purple-500 to-pink-400'
  },
  {
    title: '月度考勤報表',
    description: '查看員工每月出勤統計與分析',
    to: '/hr/reports',
    icon: 'chart',
    gradient: 'from-orange-500 to-amber-400'
  },
  {
    title: '員工管理',
    description: '管理所有員工資料與檔案',
    to: '/hr/employees',
    icon: 'users',
    gradient: 'from-indigo-500 to-blue-400'
  },
  {
    title: '職位管理',
    description: '管理職位與權限設定',
    to: '/hr/job-titles',
    icon: 'shield',
    gradient: 'from-slate-500 to-gray-400'
  }
]

// 計算出勤率
const attendanceRate = computed(() => {
  if (!todayAttendanceSummary.value) return 0
  const { totalEmployees, checkedIn, onLeave } = todayAttendanceSummary.value
  if (totalEmployees === 0) return 0
  return Math.round(((checkedIn + onLeave) / totalEmployees) * 100)
})

// 格式化日期
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  })
}

// 取得假別標籤
const getLeaveTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    ANNUAL: '特休',
    SICK: '病假',
    PERSONAL: '事假',
    MATERNITY: '產假',
    BEREAVEMENT: '喪假',
    OTHER: '其他'
  }
  return map[type] || type
}
</script>

<template>
  <div class="hr-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">{{ PAGES.HR.TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.HR.DESCRIPTION }}</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">全部分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
      </div>
    </header>

    <!-- Today Summary Stats -->
    <section class="stats-section">
      <h2 class="section-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        今日出勤概況
      </h2>

      <div v-if="isLoading" class="stats-loading">
        <div class="loading-spinner"></div>
      </div>

      <div v-else-if="todayAttendanceSummary" class="stats-grid">
        <div class="stat-card stat-total">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.totalEmployees }}</span>
            <span class="stat-label">總員工數</span>
          </div>
        </div>

        <div class="stat-card stat-success">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.checkedIn }}</span>
            <span class="stat-label">已打卡</span>
          </div>
          <div class="stat-rate">{{ attendanceRate }}%</div>
        </div>

        <div class="stat-card stat-warning">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.notCheckedIn }}</span>
            <span class="stat-label">未打卡</span>
          </div>
        </div>

        <div class="stat-card stat-late">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" x2="12" y1="8" y2="12"/>
              <line x1="12" x2="12.01" y1="16" y2="16"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.late }}</span>
            <span class="stat-label">遲到</span>
          </div>
        </div>

        <div class="stat-card stat-leave">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.onLeave }}</span>
            <span class="stat-label">請假</span>
          </div>
        </div>

        <div class="stat-card stat-done">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" x2="9" y1="12" y2="12"/>
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ todayAttendanceSummary.checkedOut }}</span>
            <span class="stat-label">已下班</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Pending Approvals -->
    <section v-if="pendingApprovals.length > 0" class="approvals-section">
      <div class="section-header">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          待審核項目
          <span class="approval-count">{{ pendingApprovals.length }}</span>
        </h2>
        <NuxtLink to="/hr/leaves" class="view-all-link">
          查看全部
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </NuxtLink>
      </div>

      <div class="approvals-list">
        <div
          v-for="(leave, index) in pendingApprovals.slice(0, 3)"
          :key="leave.id"
          class="approval-card"
          :style="{ animationDelay: `${index * 0.1}s` }"
        >
          <div class="approval-avatar">
            {{ ((leave.employee as { full_name: string })?.full_name || '?')[0] }}
          </div>
          <div class="approval-info">
            <span class="approval-name">{{ (leave.employee as { full_name: string })?.full_name }}</span>
            <span class="approval-type">{{ getLeaveTypeLabel(leave.leave_type) }}</span>
          </div>
          <div class="approval-dates">
            {{ formatDate(leave.start_date) }} - {{ formatDate(leave.end_date) }}
          </div>
          <div class="approval-days">{{ leave.days_requested }} 天</div>
        </div>
      </div>
    </section>

    <!-- Module Cards -->
    <section class="modules-section">
      <h2 class="section-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="7" height="7" x="3" y="3" rx="1"/>
          <rect width="7" height="7" x="14" y="3" rx="1"/>
          <rect width="7" height="7" x="14" y="14" rx="1"/>
          <rect width="7" height="7" x="3" y="14" rx="1"/>
        </svg>
        功能模組
      </h2>

      <div class="modules-grid">
        <NuxtLink
          v-for="(module, index) in hrModules"
          :key="module.to"
          :to="module.to"
          class="module-card"
          :style="{ animationDelay: `${index * 0.1}s` }"
        >
          <div class="module-icon" :class="module.gradient">
            <svg v-if="module.icon === 'clock'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <svg v-else-if="module.icon === 'calendar'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
            <svg v-else-if="module.icon === 'schedule'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <line x1="10" x2="10" y1="14" y2="18"/>
              <line x1="14" x2="14" y1="14" y2="18"/>
            </svg>
            <svg v-else-if="module.icon === 'makeup'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
              <path d="M16 21.5c-1.5-2-4-3.5-7-3.5"/>
            </svg>
            <svg v-else-if="module.icon === 'chart'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18"/>
              <path d="m19 9-5 5-4-4-3 3"/>
            </svg>
            <svg v-else-if="module.icon === 'users'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <svg v-else-if="module.icon === 'shield'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div class="module-content">
            <h3 class="module-title">{{ module.title }}</h3>
            <p class="module-desc">{{ module.description }}</p>
          </div>
          <div class="module-arrow">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hr-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-2xl);
  animation: fadeInUp 0.6s var(--ease-out) backwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

.header-actions {
  display: flex;
  gap: var(--space-md);
}

.filter-select {
  min-width: 140px;
}

/* Section Title */
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-lg);
}

.section-title svg {
  color: var(--color-accent);
}

/* Stats Section */
.stats-section {
  margin-bottom: var(--space-2xl);
  animation: fadeInUp 0.6s var(--ease-out) 0.1s backwards;
}

.stats-loading {
  display: flex;
  justify-content: center;
  padding: var(--space-2xl);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-md);
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  position: relative;
  transition: all var(--duration-normal) var(--ease-out);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-sm);
}

.stat-total .stat-icon {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-accent);
}

.stat-success .stat-icon {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.stat-warning .stat-icon {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.stat-late .stat-icon {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.stat-leave .stat-icon {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.stat-done .stat-icon {
  background: rgba(88, 86, 214, 0.1);
  color: #5856d6;
}

.stat-content {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-rate {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  color: #34c759;
  background: rgba(52, 199, 89, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

/* Approvals Section */
.approvals-section {
  margin-bottom: var(--space-2xl);
  animation: fadeInUp 0.6s var(--ease-out) 0.2s backwards;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.approval-count {
  background: var(--color-error);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-left: var(--space-sm);
}

.view-all-link {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: opacity var(--duration-fast);
}

.view-all-link:hover {
  opacity: 0.7;
}

.approvals-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.approval-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  animation: cardAppear 0.4s var(--ease-out) backwards;
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
}

.approval-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #5856d6, #af52de);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.approval-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.approval-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.approval-type {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.approval-dates {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.approval-days {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
  background: var(--color-accent-light);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
}

/* Modules Section */
.modules-section {
  animation: fadeInUp 0.6s var(--ease-out) 0.3s backwards;
}

/* Modules Grid */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-xl);
}

.module-card {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  text-decoration: none;
  transition: all var(--duration-normal) var(--ease-out);
  animation: cardAppear 0.6s var(--ease-out) backwards;
}

.module-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.15);
  border-color: var(--color-accent);
}

.module-icon {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to));
}

.module-icon.from-blue-500 {
  --tw-gradient-from: #3b82f6;
  --tw-gradient-to: #22d3ee;
}

.module-icon.from-emerald-500 {
  --tw-gradient-from: #10b981;
  --tw-gradient-to: #2dd4bf;
}

.module-icon.from-purple-500 {
  --tw-gradient-from: #8b5cf6;
  --tw-gradient-to: #ec4899;
}

.module-icon.from-orange-500 {
  --tw-gradient-from: #f97316;
  --tw-gradient-to: #f59e0b;
}

.module-icon.from-rose-500 {
  --tw-gradient-from: #f43f5e;
  --tw-gradient-to: #ef4444;
}

.module-icon.from-indigo-500 {
  --tw-gradient-from: #6366f1;
  --tw-gradient-to: #3b82f6;
}

.module-icon.from-slate-500 {
  --tw-gradient-from: #64748b;
  --tw-gradient-to: #94a3b8;
}

.module-content {
  flex: 1;
  min-width: 0;
}

.module-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.module-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.module-arrow {
  color: var(--color-text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}

.module-card:hover .module-arrow {
  color: var(--color-accent);
  transform: translateX(4px);
}

/* Responsive */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .header-actions {
    width: 100%;
  }

  .filter-select {
    width: 100%;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .approval-card {
    flex-wrap: wrap;
  }

  .approval-dates {
    order: 1;
    width: 100%;
    margin-top: var(--space-sm);
    padding-left: calc(40px + var(--space-md));
  }
}

@media (max-width: 640px) {
  .modules-grid {
    grid-template-columns: 1fr;
  }

  .module-card {
    padding: var(--space-lg);
    gap: var(--space-lg);
  }

  .module-icon {
    width: 56px;
    height: 56px;
  }

  .module-icon svg {
    width: 24px;
    height: 24px;
  }
}
</style>
