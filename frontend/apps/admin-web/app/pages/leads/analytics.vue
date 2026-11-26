<script setup lang="ts">
/**
 * 潛在客戶數據分析頁面
 *
 * 資料來源：GET /api/leads/stats/summary（總數、各階段數量、轉換率）
 */
import { MESSAGES } from '~/constants'
import { LEAD_STATUSES } from '~/composables/useLeads'

definePageMeta({
  middleware: 'auth'
})

const { fetchStats, getStatusLabel } = useLeads()
const { branches, fetchBranches } = useBranches()

const stats = ref<Awaited<ReturnType<typeof fetchStats>> | null>(null)
const isLoading = ref(true)
const selectedBranch = ref('')

const loadStats = async () => {
  isLoading.value = true
  try {
    stats.value = await fetchStats({ branchId: selectedBranch.value || undefined }, true)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadStats(), fetchBranches()])
})

watch(selectedBranch, loadStats)

const convertedCount = computed(() => stats.value?.byStatus.CONVERTED ?? 0)
const lostCount = computed(() => stats.value?.byStatus.LOST ?? 0)

// Pipeline: every backend stage, in order
const funnelData = computed(() => {
  const byStatus = stats.value?.byStatus ?? {}
  return LEAD_STATUSES.map(status => ({
    status,
    label: getStatusLabel(status),
    count: byStatus[status] ?? 0
  }))
})

const maxFunnelCount = computed(() => {
  return Math.max(...funnelData.value.map(f => f.count), 1)
})
</script>

<template>
  <PageContainer class="analytics-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/leads" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          潛在客戶
        </NuxtLink>
        <h1 class="text-headline">數據分析</h1>
        <p class="text-body text-secondary">潛在客戶各階段分佈與轉換率</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedBranch" class="input period-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
      </div>
    </header>

    <!-- Loading State -->
    <LoadingState v-if="isLoading" />

    <template v-else-if="stats">
      <!-- Summary Stats -->
      <section class="stats-section">
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(0, 122, 255, 0.1); color: #007aff;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">總潛在客戶</span>
            <span class="stat-value">{{ stats.total }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(52, 199, 89, 0.1); color: #34c759;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">已轉換</span>
            <span class="stat-value">{{ convertedCount }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(175, 82, 222, 0.1); color: #af52de;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">轉換率</span>
            <span class="stat-value">{{ stats.conversionRate }}%</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(255, 149, 0, 0.1); color: #ff9500;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">已流失</span>
            <span class="stat-value">{{ lostCount }}</span>
          </div>
        </div>
      </section>

      <!-- Charts Grid -->
      <div class="charts-grid">
        <!-- Pipeline Funnel -->
        <section class="chart-card card full-width">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            各階段分佈
          </h3>
          <div v-if="stats.total > 0" class="funnel-chart">
            <div
              v-for="(item, index) in funnelData"
              :key="item.status"
              class="funnel-item"
            >
              <div class="funnel-label">
                <span class="funnel-step">{{ index + 1 }}</span>
                <span>{{ item.label }}</span>
              </div>
              <div class="funnel-bar-container">
                <div
                  class="funnel-bar"
                  :style="{ width: `${(item.count / maxFunnelCount) * 100}%` }"
                ></div>
              </div>
              <span class="funnel-count">{{ item.count }}</span>
            </div>
          </div>
          <EmptyState v-else title="暫無資料" icon="chart" />
        </section>
      </div>
    </template>
    <EmptyState v-else title="無法載入統計資料" icon="chart" />
  </PageContainer>
</template>

<style scoped>
.analytics-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-2xl);
  animation: fadeIn 0.6s var(--ease-out) backwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: var(--space-md);
  transition: opacity var(--duration-fast);
}

.back-link:hover {
  opacity: 0.7;
}

.period-select {
  min-width: 140px;
}

/* Stats Section */
.stats-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.stat-card:nth-child(1) { animation-delay: 0.1s; }
.stat-card:nth-child(2) { animation-delay: 0.15s; }
.stat-card:nth-child(3) { animation-delay: 0.2s; }
.stat-card:nth-child(4) { animation-delay: 0.25s; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.chart-card {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

.chart-card.full-width {
  grid-column: 1 / -1;
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: var(--space-xl);
}

.card-title svg {
  color: var(--color-accent);
}

/* Source Chart */
.source-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.source-bar-item {
  display: grid;
  grid-template-columns: 120px 1fr 50px;
  align-items: center;
  gap: var(--space-md);
}

.source-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
}

.source-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.source-bar {
  height: 24px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.source-bar-fill {
  height: 100%;
  border-radius: var(--radius-md);
  transition: width 0.5s var(--ease-out);
}

.source-count {
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

/* Funnel Chart */
.funnel-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.funnel-item {
  display: grid;
  grid-template-columns: 120px 1fr 50px;
  align-items: center;
  gap: var(--space-md);
}

.funnel-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
}

.funnel-step {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.funnel-bar-container {
  height: 32px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.funnel-bar {
  height: 100%;
  background: linear-gradient(90deg, #007aff, #5856d6);
  border-radius: var(--radius-md);
  transition: width 0.5s var(--ease-out);
}

.funnel-count {
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

/* Conversion Table */
.conversion-table {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.table-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-divider);
  transition: background var(--duration-fast);
}

.table-row:hover {
  background: var(--color-bg-secondary);
}

.table-cell {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.source-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.conversion-rate {
  font-weight: 600;
}

.conversion-rate.good {
  color: #34c759;
}

/* Responsive */
@media (max-width: 1024px) {
  .stats-section {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .stats-section {
    grid-template-columns: 1fr;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }

  .source-bar-item,
  .funnel-item {
    grid-template-columns: 100px 1fr 40px;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1fr;
    gap: var(--space-sm);
  }

  .table-cell::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-right: var(--space-sm);
  }
}
</style>
