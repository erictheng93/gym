<script lang="ts">
const currencyFormatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 })
const numberFormatter = new Intl.NumberFormat('zh-TW')
</script>

<script setup lang="ts">
import { MESSAGES, PAGES } from '~/constants'
import { useReports } from '~/composables/useReports'
import type { RevenueReport, MemberGrowthReport, ExpiringContract, MemberActivityReport, RevenueTrendPoint, ExportableReport, ExportFormat } from '~/composables/useReports'
import { toLocalDateString } from '~/utils/date'

const { branches, fetchBranches } = useBranches()
const {
  getRevenueReport,
  getMemberGrowthReport,
  getContractExpiryReport,
  getMemberActivityReport,
  getRevenueTrend,
  downloadReport
} = useReports()

const EXPIRY_DAYS = 30

const selectedBranch = ref('')
const selectedPeriod = ref<'week' | 'month' | 'year'>('month')
const loading = ref(true)
const downloading = ref('')

// Current period
const revenueReport = ref<RevenueReport | null>(null)
const memberGrowthReport = ref<MemberGrowthReport | null>(null)
const expiringContracts = ref<ExpiringContract[] | null>(null)
const memberActivityReport = ref<MemberActivityReport | null>(null)
const revenueTrend = ref<RevenueTrendPoint[]>([])

// Previous period of the same length, for the change percentages
const prevRevenueReport = ref<RevenueReport | null>(null)
const prevMemberGrowthReport = ref<MemberGrowthReport | null>(null)
const prevMemberActivityReport = ref<MemberActivityReport | null>(null)

/** The selected window and the one right before it, as YYYY-MM-DD (end day inclusive) */
const currentWindow = ref({ startDate: '', endDate: '' })

const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

const stats = computed(() => {
  const revenue = revenueReport.value?.total ?? 0
  const newMembers = memberGrowthReport.value?.newMembers ?? 0
  const checkins = memberActivityReport.value?.totalCheckIns ?? 0

  return {
    revenue,
    revenueChange: calculateChange(revenue, prevRevenueReport.value?.total ?? 0),
    newMembers,
    newMembersChange: calculateChange(newMembers, prevMemberGrowthReport.value?.newMembers ?? 0),
    expiringContracts: expiringContracts.value?.length ?? 0,
    checkins,
    checkinsChange: calculateChange(checkins, prevMemberActivityReport.value?.totalCheckIns ?? 0)
  }
})

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'] as const

// Last 6 months of COMPLETED income (GET /dashboard/revenue-trend?period=monthly)
const revenueByMonth = computed(() =>
  revenueTrend.value.slice(-6).map(point => {
    const month = Number(point.period.split('-')[1])
    return { month: MONTH_NAMES[month - 1] ?? point.period, revenue: point.amount }
  })
)

const shiftDays = (date: Date, days: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** [start, end] of the selected period ending today, and the previous one of equal length */
const periodWindows = (period: 'week' | 'month' | 'year') => {
  const end = new Date()
  const start = new Date(end)
  if (period === 'week') start.setDate(start.getDate() - 6)
  else if (period === 'year') start.setFullYear(start.getFullYear() - 1)
  else start.setMonth(start.getMonth() - 1)

  const lengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  const prevEnd = shiftDays(start, -1)
  const prevStart = shiftDays(prevEnd, -lengthDays)

  return {
    current: { startDate: toLocalDateString(start), endDate: toLocalDateString(end) },
    previous: { startDate: toLocalDateString(prevStart), endDate: toLocalDateString(prevEnd) }
  }
}

const loadReports = async () => {
  loading.value = true
  try {
    const { current, previous } = periodWindows(selectedPeriod.value)
    const branchId = selectedBranch.value || undefined
    currentWindow.value = current

    const [revenue, growth, expiry, activity, trend, prevRevenue, prevGrowth, prevActivity] = await Promise.all([
      getRevenueReport({ ...current, branchId }),
      getMemberGrowthReport({ ...current, branchId }),
      getContractExpiryReport(EXPIRY_DAYS, branchId),
      getMemberActivityReport({ ...current, branchId }),
      getRevenueTrend('monthly', branchId),
      getRevenueReport({ ...previous, branchId }),
      getMemberGrowthReport({ ...previous, branchId }),
      getMemberActivityReport({ ...previous, branchId })
    ])

    revenueReport.value = revenue
    memberGrowthReport.value = growth
    expiringContracts.value = expiry
    memberActivityReport.value = activity
    revenueTrend.value = trend ?? []
    prevRevenueReport.value = prevRevenue
    prevMemberGrowthReport.value = prevGrowth
    prevMemberActivityReport.value = prevActivity
  } finally {
    loading.value = false
  }
}

const EXPORTS: Array<{ type: ExportableReport; label: string }> = [
  { type: 'revenue', label: '營收報表' },
  { type: 'member-growth', label: '會員成長' },
  { type: 'contract-expiry', label: `${EXPIRY_DAYS} 天內到期合約` },
  { type: 'member-activity', label: '入場統計' }
]

const exportParams = (type: ExportableReport) => {
  const branchId = selectedBranch.value || undefined
  if (type === 'contract-expiry') return { days: EXPIRY_DAYS, branchId }
  // The member-growth export is per month, the activity export takes a day count
  if (type === 'member-growth') return { months: selectedPeriod.value === 'year' ? 12 : 6, branchId }
  const { startDate, endDate } = currentWindow.value
  if (type === 'member-activity') {
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1
    return { days, branchId }
  }
  return { startDate, endDate, branchId }
}

const handleDownload = async (type: ExportableReport, format: ExportFormat) => {
  downloading.value = `${type}:${format}`
  try {
    await downloadReport(type, exportParams(type), format)
  } finally {
    downloading.value = ''
  }
}

const formatCurrency = (value: number) => currencyFormatter.format(value)

const formatNumber = (value: number) => numberFormatter.format(value)

const PERIOD_TABS = [
  { value: 'week', label: MESSAGES.TIME.THIS_WEEK },
  { value: 'month', label: MESSAGES.TIME.THIS_MONTH },
  { value: 'year', label: MESSAGES.TIME.THIS_YEAR },
] as const

const formatPercent = (value: number) => {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

const maxRevenue = computed(() => {
  if (revenueByMonth.value.length === 0) return 1
  return Math.max(1, ...revenueByMonth.value.map(m => m.revenue))
})

watch([selectedBranch, selectedPeriod], () => {
  loadReports()
})

onMounted(async () => {
  await Promise.all([
    fetchBranches(),
    loadReports()
  ])
})
</script>

<template>
  <div class="reports-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ PAGES.REPORTS.TITLE }}</h1>
        <p>{{ PAGES.REPORTS.DESCRIPTION }}</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedBranch" class="filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <div class="period-tabs">
          <button
            v-for="period in PERIOD_TABS"
            :key="period.value"
            :class="{ active: selectedPeriod === period.value }"
            @click="selectedPeriod = period.value"
          >
            {{ period.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Key Metrics -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-header">
          <div class="metric-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <span class="metric-change" :class="stats.revenueChange > 0 ? 'positive' : 'negative'">
            {{ formatPercent(stats.revenueChange) }}
          </span>
        </div>
        <div class="metric-value">{{ formatCurrency(stats.revenue) }}</div>
        <div class="metric-label">{{ PAGES.REPORTS.REVENUE }}</div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <div class="metric-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span class="metric-change" :class="stats.newMembersChange > 0 ? 'positive' : 'negative'">
            {{ formatPercent(stats.newMembersChange) }}
          </span>
        </div>
        <div class="metric-value">{{ stats.newMembers }}</div>
        <div class="metric-label">{{ PAGES.REPORTS.NEW_MEMBERS }}</div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <div class="metric-icon purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          </div>
        </div>
        <div class="metric-value">{{ stats.expiringContracts }}</div>
        <div class="metric-label">{{ EXPIRY_DAYS }} 天內到期合約</div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <div class="metric-icon orange">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <span class="metric-change" :class="stats.checkinsChange > 0 ? 'positive' : 'negative'">
            {{ formatPercent(stats.checkinsChange) }}
          </span>
        </div>
        <div class="metric-value">{{ formatNumber(stats.checkins) }}</div>
        <div class="metric-label">{{ PAGES.REPORTS.CHECKINS }}</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-grid">
      <!-- Revenue Chart -->
      <div class="chart-card revenue-chart">
        <div class="chart-header">
          <h3>{{ PAGES.REPORTS.REVENUE_TREND }}</h3>
          <span class="chart-subtitle">{{ MESSAGES.TIME.RECENT_6_MONTHS }}</span>
        </div>
        <div class="bar-chart">
          <div
            v-for="(item, index) in revenueByMonth"
            :key="index"
            class="bar-item"
          >
            <div class="bar-container">
              <div
                class="bar"
                :style="{ height: `${(item.revenue / maxRevenue) * 100}%` }"
              >
                <span class="bar-value">{{ formatCurrency(item.revenue) }}</span>
              </div>
            </div>
            <span class="bar-label">{{ item.month }}</span>
          </div>
        </div>
      </div>

      <!-- Top Plans: no backend aggregate for plan sales yet -->
      <div class="chart-card top-plans">
        <div class="chart-header">
          <h3>{{ PAGES.REPORTS.POPULAR_PLANS }}</h3>
          <span class="chart-subtitle">{{ PAGES.REPORTS.SORT_BY_SALES }}</span>
        </div>
        <div class="not-available">
          <span class="not-available-badge">尚未開放</span>
          <p>方案銷售統計尚未提供</p>
        </div>
      </div>
    </div>

    <!-- Exports (files generated by GET /api/reports/<type>/export) -->
    <div class="quick-actions">
      <h3>{{ PAGES.REPORTS.EXPORT_REPORTS }}</h3>
      <div class="actions-grid">
        <div v-for="item in EXPORTS" :key="item.type" class="export-wrapper">
          <p class="export-label">{{ item.label }}</p>
          <div class="legacy-actions">
            <button
              type="button"
              class="legacy-btn"
              :disabled="!!downloading"
              @click="handleDownload(item.type, 'xlsx')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              Excel
            </button>
            <button
              type="button"
              class="legacy-btn"
              :disabled="!!downloading"
              @click="handleDownload(item.type, 'csv')"
            >
              CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.header-content h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.header-content p {
  color: var(--color-text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.filter-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.period-tabs {
  display: flex;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: 4px;
}

.period-tabs button {
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.period-tabs button.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.metric-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.metric-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-icon.blue {
  background: rgba(0, 122, 255, 0.1);
  color: var(--color-accent);
}

.metric-icon.green {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.metric-icon.purple {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.metric-icon.orange {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.metric-change {
  font-size: 13px;
  font-weight: 500;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
}

.metric-change.positive {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.metric-change.negative {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.metric-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.chart-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.chart-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.chart-subtitle {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Bar Chart */
.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 250px;
  gap: var(--space-md);
}

.bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-container {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bar {
  width: 60%;
  background: linear-gradient(180deg, var(--color-accent), rgba(0, 122, 255, 0.6));
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  position: relative;
  min-height: 20px;
  transition: all var(--duration-normal) var(--ease-out);
}

.bar:hover {
  background: var(--color-accent);
}

.bar-value {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  padding-bottom: var(--space-xs);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.bar:hover .bar-value {
  opacity: 1;
}

.bar-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: var(--space-sm);
}

/* Not available yet (no backend endpoint) */
.not-available {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 160px;
  text-align: center;
}

.not-available-badge {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.not-available p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.legacy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Quick Actions */
.quick-actions {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.quick-actions h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.export-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.export-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
  text-align: center;
}

.legacy-exports {
  margin-top: var(--space-xl);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.section-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md) 0;
}

.legacy-actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.legacy-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.legacy-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-bg-primary);
}

@media (max-width: 1200px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }

  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
