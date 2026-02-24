<script setup lang="ts">
import { MESSAGES } from '~/constants'
import { useReports } from '~/composables/useReports'
import type { BranchPerformanceReport } from '~/composables/useReports'

const { branches, fetchBranches } = useBranches()
const { getBranchPerformanceReport } = useReports()

const selectedBranch = ref('')
const selectedPeriod = ref<'week' | 'month' | 'year'>('month')
const loading = ref(true)
const report = ref<BranchPerformanceReport | null>(null)

const loadReport = async () => {
  try {
    loading.value = true
    const branchId = selectedBranch.value || undefined
    report.value = await getBranchPerformanceReport(selectedPeriod.value, branchId)
  } catch (error) {
    console.error('Failed to load branch performance report:', error)
  } finally {
    loading.value = false
  }
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(value)
}

const formatPercent = (value: number) => {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('zh-TW').format(value)
}

const exportReport = async (format: 'csv' | 'excel') => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl || 'http://localhost:8056'
  const params = new URLSearchParams()
  params.append('period', selectedPeriod.value)
  params.append('format', format)
  if (selectedBranch.value) params.append('branch_id', selectedBranch.value)

  window.open(`${baseURL}/api/reports/branch-performance/export?${params}`, '_blank')
}

watch([selectedBranch, selectedPeriod], () => {
  loadReport()
})

onMounted(async () => {
  await fetchBranches()
  await loadReport()
})
</script>

<template>
  <div class="branch-performance-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="breadcrumb">
          <NuxtLink to="/reports" class="breadcrumb-link">報表中心</NuxtLink>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-current">分店業績報表</span>
        </div>
        <h1>分店業績報表</h1>
        <p>比較各分店營運表現，追蹤業績成長趨勢</p>
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
            v-for="period in [
              { value: 'week', label: '本週' },
              { value: 'month', label: '本月' },
              { value: 'year', label: '本年' }
            ]"
            :key="period.value"
            :class="{ active: selectedPeriod === period.value }"
            @click="selectedPeriod = period.value as 'week' | 'month' | 'year'"
          >
            {{ period.label }}
          </button>
        </div>
        <div class="export-buttons">
          <button class="export-btn" @click="exportReport('excel')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            匯出 Excel
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>載入報表中...</p>
    </div>

    <template v-else-if="report">
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總營收</span>
            <span class="summary-value">{{ formatCurrency(report.summary.total_revenue) }}</span>
            <span class="summary-change" :class="report.summary.total_revenue_growth >= 0 ? 'positive' : 'negative'">
              {{ formatPercent(report.summary.total_revenue_growth) }} vs 上期
            </span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">新增會員</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_new_members) }}</span>
            <span class="summary-change neutral">本期新加入</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">入場次數</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_check_ins) }}</span>
            <span class="summary-change neutral">本期累計</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon orange">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">有效合約</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_active_contracts) }}</span>
            <span class="summary-change neutral">當前總數</span>
          </div>
        </div>
      </div>

      <!-- Period Info -->
      <div class="period-info">
        <span>報表期間：{{ report.period.current.start }} ~ {{ report.period.current.end }}</span>
        <span class="separator">|</span>
        <span>比較期間：{{ report.period.previous.start }} ~ {{ report.period.previous.end }}</span>
      </div>

      <!-- Main Content Grid -->
      <div class="content-grid">
        <!-- Branch Table -->
        <div class="table-card">
          <div class="card-header">
            <h3>分店業績明細</h3>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>分店</th>
                  <th class="text-right">營收</th>
                  <th class="text-right">成長率</th>
                  <th class="text-right">新會員</th>
                  <th class="text-right">入場數</th>
                  <th class="text-right">有效合約</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="branch in report.data" :key="branch.branch_id">
                  <td>
                    <span class="rank-badge" :class="{ 'top-3': branch.rank <= 3 }">
                      {{ branch.rank }}
                    </span>
                  </td>
                  <td class="branch-name">{{ branch.branch_name }}</td>
                  <td class="text-right">{{ formatCurrency(branch.current_period.revenue) }}</td>
                  <td class="text-right">
                    <span class="growth-badge" :class="branch.growth.revenue_change >= 0 ? 'positive' : 'negative'">
                      {{ formatPercent(branch.growth.revenue_change) }}
                    </span>
                  </td>
                  <td class="text-right">{{ formatNumber(branch.current_period.new_members) }}</td>
                  <td class="text-right">{{ formatNumber(branch.current_period.check_ins) }}</td>
                  <td class="text-right">{{ formatNumber(branch.current_period.active_contracts) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Rankings -->
        <div class="rankings-card">
          <div class="card-header">
            <h3>排行榜</h3>
          </div>

          <div class="ranking-section">
            <h4>營收排名</h4>
            <div class="ranking-list">
              <div v-for="item in report.ranking.by_revenue.slice(0, 5)" :key="item.branch_id" class="ranking-item">
                <span class="rank" :class="{ gold: item.rank === 1, silver: item.rank === 2, bronze: item.rank === 3 }">
                  {{ item.rank }}
                </span>
                <span class="name">{{ item.branch_name }}</span>
                <span class="value">{{ formatCurrency(item.value) }}</span>
              </div>
            </div>
          </div>

          <div class="ranking-section">
            <h4>成長率排名</h4>
            <div class="ranking-list">
              <div v-for="item in report.ranking.by_growth.slice(0, 5)" :key="item.branch_id" class="ranking-item">
                <span class="rank" :class="{ gold: item.rank === 1, silver: item.rank === 2, bronze: item.rank === 3 }">
                  {{ item.rank }}
                </span>
                <span class="name">{{ item.branch_name }}</span>
                <span class="value" :class="item.value >= 0 ? 'positive' : 'negative'">
                  {{ formatPercent(item.value) }}
                </span>
              </div>
            </div>
          </div>

          <div class="ranking-section">
            <h4>入場數排名</h4>
            <div class="ranking-list">
              <div v-for="item in report.ranking.by_check_ins.slice(0, 5)" :key="item.branch_id" class="ranking-item">
                <span class="rank" :class="{ gold: item.rank === 1, silver: item.rank === 2, bronze: item.rank === 3 }">
                  {{ item.rank }}
                </span>
                <span class="name">{{ item.branch_name }}</span>
                <span class="value">{{ formatNumber(item.value) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
      </svg>
      <p>無法載入報表資料</p>
      <button class="retry-btn" @click="loadReport">重新載入</button>
    </div>
  </div>
</template>

<style scoped>
.branch-performance-page {
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

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
  font-size: 13px;
}

.breadcrumb-link {
  color: var(--color-text-tertiary);
  text-decoration: none;
}

.breadcrumb-link:hover {
  color: var(--color-accent);
}

.breadcrumb-separator {
  color: var(--color-text-tertiary);
}

.breadcrumb-current {
  color: var(--color-text-secondary);
}

.header-content h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.header-content p {
  color: var(--color-text-secondary);
  margin: 0;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  flex-wrap: wrap;
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

.export-buttons {
  display: flex;
  gap: var(--space-sm);
}

.export-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-lg);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.export-btn:hover {
  background: var(--color-accent-dark);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  color: var(--color-text-secondary);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--space-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.summary-card {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

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

.summary-icon.purple {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.summary-icon.orange {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.summary-content {
  display: flex;
  flex-direction: column;
}

.summary-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.summary-change {
  font-size: 12px;
  margin-top: var(--space-xs);
}

.summary-change.positive {
  color: var(--color-success);
}

.summary-change.negative {
  color: var(--color-error);
}

.summary-change.neutral {
  color: var(--color-text-tertiary);
}

/* Period Info */
.period-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-lg);
}

.period-info .separator {
  color: var(--color-border);
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-lg);
}

/* Table Card */
.table-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.card-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.card-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: var(--space-md);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg-secondary);
}

.data-table td {
  font-size: 14px;
  color: var(--color-text-primary);
}

.data-table tbody tr:hover {
  background: var(--color-bg-secondary);
}

.text-right {
  text-align: right !important;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.rank-badge.top-3 {
  background: var(--color-accent);
  color: white;
}

.branch-name {
  font-weight: 500;
}

.growth-badge {
  display: inline-block;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.growth-badge.positive {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.growth-badge.negative {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

/* Rankings Card */
.rankings-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.ranking-section {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.ranking-section:last-child {
  border-bottom: none;
}

.ranking-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md) 0;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.ranking-item .rank {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.ranking-item .rank.gold {
  background: #FFD700;
  color: #8B6914;
}

.ranking-item .rank.silver {
  background: #C0C0C0;
  color: #555;
}

.ranking-item .rank.bronze {
  background: #CD7F32;
  color: white;
}

.ranking-item .name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
}

.ranking-item .value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.ranking-item .value.positive {
  color: var(--color-success);
}

.ranking-item .value.negative {
  color: var(--color-error);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-state svg {
  margin-bottom: var(--space-md);
}

.retry-btn {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-lg);
  color: white;
  font-size: 14px;
  cursor: pointer;
}

/* Responsive */
@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid {
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

  .period-tabs {
    justify-content: center;
  }
}
</style>
