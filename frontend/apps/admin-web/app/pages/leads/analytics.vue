<script setup lang="ts">
/**
 * 潛在客戶數據分析頁面
 *
 * 顯示來源分析、轉換率、漏斗圖
 */
definePageMeta({
  middleware: 'auth'
})

type LeadStatus = 'NEW' | 'CONTACTED' | 'TRIAL_BOOKED' | 'VISITED' | 'CONVERTED' | 'LOST'
type LeadSource = 'FB_AD' | 'IG_AD' | 'GOOGLE_AD' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL'

const { fetchAnalytics, getSourceLabel, getStatusLabel } = useLeads()

const analytics = ref<Awaited<ReturnType<typeof fetchAnalytics>> | null>(null)
const isLoading = ref(true)
const selectedPeriod = ref('30d')

const periodOptions = [
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: '90d', label: '最近 90 天' },
  { value: 'all', label: '全部' }
]

const loadAnalytics = async () => {
  isLoading.value = true
  try {
    analytics.value = await fetchAnalytics({
      period: selectedPeriod.value
    })
  } catch (error) {
    console.error('Failed to load analytics:', error)
    useToast().error('載入分析資料失敗')
  } finally {
    isLoading.value = false
  }
}

onMounted(loadAnalytics)

watch(selectedPeriod, loadAnalytics)

// Source colors
const sourceColors: Record<string, string> = {
  FB_AD: '#4267b2',
  IG_AD: '#e1306c',
  GOOGLE_AD: '#db4437',
  WEBSITE: '#007aff',
  WALK_IN: '#34c759',
  REFERRAL: '#af52de'
}

// Calculate conversion rate
const conversionRate = computed(() => {
  if (!analytics.value) return 0
  const total = analytics.value.total_leads || 0
  const converted = analytics.value.converted_leads || 0
  return total > 0 ? ((converted / total) * 100).toFixed(1) : 0
})

// Get max count for bar chart scaling
const maxSourceCount = computed(() => {
  if (!analytics.value?.by_source) return 1
  return Math.max(...analytics.value.by_source.map(s => s.count ?? s.total ?? 1), 1)
})

// Status funnel data
const funnelData = computed(() => {
  if (!analytics.value?.by_status) return []
  const statusOrder: LeadStatus[] = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED']
  return statusOrder
    .map(status => {
      const item = analytics.value!.by_status.find(s => s.status === status)
      return {
        status,
        label: getStatusLabel(status),
        count: item?.count || 0
      }
    })
    .filter(item => item.count > 0 || item.status === 'CONVERTED')
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
        <p class="text-body text-secondary">分析潛在客戶來源與轉換效果</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedPeriod" class="input period-select">
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </header>

    <!-- Loading State -->
    <LoadingState v-if="isLoading" />

    <template v-else-if="analytics">
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
            <span class="stat-value">{{ analytics.total_leads || 0 }}</span>
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
            <span class="stat-value">{{ analytics.converted_leads || 0 }}</span>
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
            <span class="stat-value">{{ conversionRate }}%</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(255, 149, 0, 0.1); color: #ff9500;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">平均轉換天數</span>
            <span class="stat-value">{{ analytics.avg_conversion_days?.toFixed(1) || '—' }}</span>
          </div>
        </div>
      </section>

      <!-- Charts Grid -->
      <div class="charts-grid">
        <!-- Source Distribution -->
        <section class="chart-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
            來源分佈
          </h3>
          <div v-if="analytics.by_source && analytics.by_source.length > 0" class="source-chart">
            <div
              v-for="source in analytics.by_source"
              :key="source.source"
              class="source-bar-item"
            >
              <div class="source-label">
                <span
                  class="source-dot"
                  :style="{ background: sourceColors[source.source] || '#8e8e93' }"
                ></span>
                <span>{{ getSourceLabel(source.source as LeadSource) }}</span>
              </div>
              <div class="source-bar">
                <div
                  class="source-bar-fill"
                  :style="{
                    width: `${((source.count ?? source.total ?? 0) / maxSourceCount) * 100}%`,
                    background: sourceColors[source.source] || '#8e8e93'
                  }"
                ></div>
              </div>
              <span class="source-count">{{ source.count ?? source.total ?? 0 }}</span>
            </div>
          </div>
          <EmptyState v-else title="暫無資料" icon="chart" />
        </section>

        <!-- Conversion Funnel -->
        <section class="chart-card card">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            轉換漏斗
          </h3>
          <div v-if="funnelData.length > 0" class="funnel-chart">
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
                  :style="{
                    width: `${(item.count / maxFunnelCount) * 100}%`,
                    opacity: 1 - (index * 0.15)
                  }"
                ></div>
              </div>
              <span class="funnel-count">{{ item.count }}</span>
            </div>
          </div>
          <EmptyState v-else title="暫無資料" icon="chart" />
        </section>

        <!-- Source Conversion Rate -->
        <section class="chart-card card full-width">
          <h3 class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            各來源轉換率
          </h3>
          <div v-if="analytics.source_conversion && analytics.source_conversion.length > 0" class="conversion-table">
            <div class="table-header">
              <div class="table-cell">來源</div>
              <div class="table-cell">總數</div>
              <div class="table-cell">已轉換</div>
              <div class="table-cell">轉換率</div>
              <div class="table-cell">平均天數</div>
            </div>
            <div
              v-for="item in analytics.source_conversion"
              :key="item.source"
              class="table-row"
            >
              <div class="table-cell">
                <span
                  class="source-badge"
                  :style="{ background: `${sourceColors[item.source] || '#8e8e93'}20`, color: sourceColors[item.source] || '#8e8e93' }"
                >
                  {{ getSourceLabel(item.source as LeadSource) }}
                </span>
              </div>
              <div class="table-cell">{{ item.total }}</div>
              <div class="table-cell">{{ item.converted }}</div>
              <div class="table-cell">
                <span class="conversion-rate" :class="{ good: item.conversion_rate >= 20 }">
                  {{ item.conversion_rate?.toFixed(1) || 0 }}%
                </span>
              </div>
              <div class="table-cell">{{ (item as any).avg_days?.toFixed(1) || '—' }} 天</div>
            </div>
          </div>
          <EmptyState v-else title="暫無資料" icon="chart" />
        </section>
      </div>
    </template>
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
