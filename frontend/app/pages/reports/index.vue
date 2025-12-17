<script setup lang="ts">
import { MESSAGES, PAGES } from '~/constants'

const { branches, fetchBranches } = useBranches()
const selectedBranch = ref('')
const selectedPeriod = ref('month')

onMounted(() => {
  fetchBranches()
})

// Mock data for reports
const stats = ref({
  revenue: 458000,
  revenueChange: 12.5,
  newMembers: 45,
  newMembersChange: 8.2,
  activeContracts: 156,
  contractsChange: 5.1,
  checkins: 1250,
  checkinsChange: -2.3
})

const revenueByMonth = ref([
  { month: '七月', revenue: 320000 },
  { month: '八月', revenue: 380000 },
  { month: '九月', revenue: 350000 },
  { month: '十月', revenue: 420000 },
  { month: '十一月', revenue: 410000 },
  { month: '十二月', revenue: 458000 }
])

const topPlans = ref([
  { name: '年卡方案', count: 42, revenue: 411600 },
  { name: '半年卡方案', count: 28, revenue: 168000 },
  { name: '10堂私教課程', count: 18, revenue: 216000 },
  { name: '季卡方案', count: 15, revenue: 54000 },
  { name: '月卡方案', count: 12, revenue: 18000 }
])

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(value)
}

const formatPercent = (value: number) => {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

const maxRevenue = computed(() => Math.max(...revenueByMonth.value.map(m => m.revenue)))
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
            v-for="period in [{ value: 'week', label: MESSAGES.TIME.THIS_WEEK }, { value: 'month', label: MESSAGES.TIME.THIS_MONTH }, { value: 'year', label: MESSAGES.TIME.THIS_YEAR }]"
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
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
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
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
            </svg>
          </div>
          <span class="metric-change" :class="stats.contractsChange > 0 ? 'positive' : 'negative'">
            {{ formatPercent(stats.contractsChange) }}
          </span>
        </div>
        <div class="metric-value">{{ stats.activeContracts }}</div>
        <div class="metric-label">{{ PAGES.REPORTS.ACTIVE_CONTRACTS }}</div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <div class="metric-icon orange">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <span class="metric-change" :class="stats.checkinsChange > 0 ? 'positive' : 'negative'">
            {{ formatPercent(stats.checkinsChange) }}
          </span>
        </div>
        <div class="metric-value">{{ stats.checkins.toLocaleString() }}</div>
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

      <!-- Top Plans -->
      <div class="chart-card top-plans">
        <div class="chart-header">
          <h3>{{ PAGES.REPORTS.POPULAR_PLANS }}</h3>
          <span class="chart-subtitle">{{ PAGES.REPORTS.SORT_BY_SALES }}</span>
        </div>
        <div class="plans-list">
          <div v-for="(plan, index) in topPlans" :key="index" class="plan-item">
            <div class="plan-rank">{{ index + 1 }}</div>
            <div class="plan-info">
              <span class="plan-name">{{ plan.name }}</span>
              <span class="plan-stats">{{ plan.count }} {{ PAGES.REPORTS.ENTRIES }} · {{ formatCurrency(plan.revenue) }}</span>
            </div>
            <div class="plan-bar">
              <div
                class="plan-bar-fill"
                :style="{ width: `${(plan.count / topPlans[0].count) * 100}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h3>{{ PAGES.REPORTS.EXPORT_REPORTS }}</h3>
      <div class="actions-grid">
        <button class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          <span>{{ PAGES.REPORTS.EXPORT_REVENUE }}</span>
        </button>
        <button class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          <span>{{ PAGES.REPORTS.EXPORT_MEMBERS }}</span>
        </button>
        <button class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          <span>{{ PAGES.REPORTS.EXPORT_CONTRACTS }}</span>
        </button>
        <button class="action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          <span>{{ PAGES.REPORTS.EXPORT_CHECKINS }}</span>
        </button>
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
  background: rgba(0, 113, 227, 0.1);
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
  background: linear-gradient(180deg, var(--color-accent), rgba(0, 113, 227, 0.6));
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

/* Top Plans */
.plans-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.plan-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.plan-rank {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.plan-info {
  flex: 1;
  min-width: 0;
}

.plan-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.plan-stats {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.plan-bar {
  width: 80px;
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.plan-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width var(--duration-normal) var(--ease-out);
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
  gap: var(--space-md);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
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
