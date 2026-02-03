<script setup lang="ts">
/**
 * ROI 報表頁面
 */
definePageMeta({
  middleware: 'auth'
})

const { fetchROIReport, isLoading } = useCampaigns()

const selectedPeriod = ref('last_30_days')
const roiData = ref<any>(null)

const periodOptions = [
  { value: 'last_7_days', label: '過去 7 天' },
  { value: 'last_30_days', label: '過去 30 天' },
  { value: 'last_90_days', label: '過去 90 天' },
  { value: 'this_year', label: '今年' }
]

const loadReport = async () => {
  roiData.value = await fetchROIReport({ type: selectedPeriod.value })
}

watch(selectedPeriod, loadReport)
onMounted(loadReport)

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount)
}

// Calculate ROI percentage
const calculateROI = (revenue: number, cost: number) => {
  if (!cost) return '—'
  return ((revenue - cost) / cost * 100).toFixed(1) + '%'
}

// Get ROI color class
const getROIClass = (revenue: number, cost: number) => {
  if (!cost) return ''
  const roi = (revenue - cost) / cost * 100
  if (roi >= 100) return 'excellent'
  if (roi >= 50) return 'good'
  if (roi >= 0) return 'neutral'
  return 'negative'
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="ROI 報表"
      description="行銷活動投資報酬率分析"
      back-to="/marketing/campaigns"
    />

    <!-- Period Filter -->
    <div class="filter-bar">
      <select v-model="selectedPeriod" class="input filter-select">
        <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <LoadingState v-if="isLoading" />

    <template v-else-if="roiData">
      <!-- Summary Cards -->
      <section class="summary-cards">
        <div class="summary-card">
          <div class="summary-icon budget">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l-5 3Z" />
              <path d="M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l-5 3Z" />
              <path d="M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總投入成本</span>
            <span class="summary-value">{{ formatCurrency(roiData.total_budget || 0) }}</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon revenue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總營收</span>
            <span class="summary-value">{{ formatCurrency(roiData.total_revenue || 0) }}</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon conversions">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總轉換數</span>
            <span class="summary-value">{{ roiData.total_conversions || 0 }}</span>
          </div>
        </div>

        <div class="summary-card highlight">
          <div class="summary-icon roi">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">平均 ROI</span>
            <span
              class="summary-value"
              :class="getROIClass(roiData.total_revenue || 0, roiData.total_budget || 0)"
            >
              {{ calculateROI(roiData.total_revenue || 0, roiData.total_budget || 0) }}
            </span>
          </div>
        </div>
      </section>

      <!-- Campaign Details Table -->
      <div class="table-card">
        <h3 class="card-title">各活動 ROI</h3>

        <table v-if="roiData.campaigns?.length" class="roi-table">
          <thead>
            <tr>
              <th>活動名稱</th>
              <th>類型</th>
              <th class="text-right">投入成本</th>
              <th class="text-right">營收</th>
              <th class="text-right">轉換數</th>
              <th class="text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="campaign in roiData.campaigns" :key="campaign.id">
              <td>
                <NuxtLink :to="`/marketing/campaigns/${campaign.id}`" class="campaign-link">
                  {{ campaign.name }}
                </NuxtLink>
              </td>
              <td>
                <span class="type-badge" :class="`type-${campaign.type?.toLowerCase()}`">
                  {{ campaign.type_label }}
                </span>
              </td>
              <td class="text-right">{{ formatCurrency(campaign.budget || 0) }}</td>
              <td class="text-right">{{ formatCurrency(campaign.revenue || 0) }}</td>
              <td class="text-right">{{ campaign.conversions || 0 }}</td>
              <td class="text-right">
                <span
                  class="roi-value"
                  :class="getROIClass(campaign.revenue || 0, campaign.budget || 0)"
                >
                  {{ calculateROI(campaign.revenue || 0, campaign.budget || 0) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <EmptyState
          v-else
          title="暫無數據"
          description="此期間內無活動數據"
          icon="bar-chart-2"
        />
      </div>
    </template>
  </PageContainer>
</template>

<style scoped>
.filter-bar {
  display: flex;
  margin-bottom: var(--space-xl);
}

.filter-select {
  min-width: 160px;
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.summary-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.summary-card.highlight {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));
  border-color: var(--color-accent);
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

.summary-icon.budget { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.summary-icon.revenue { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.summary-icon.conversions { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.summary-icon.roi { background: rgba(175, 82, 222, 0.1); color: #af52de; }

.summary-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.summary-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.summary-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.summary-value.excellent { color: #34c759; }
.summary-value.good { color: #30d158; }
.summary-value.neutral { color: #ff9500; }
.summary-value.negative { color: #ff3b30; }

/* Table Card */
.table-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

.roi-table {
  width: 100%;
  border-collapse: collapse;
}

.roi-table th,
.roi-table td {
  padding: var(--space-md);
  text-align: left;
  border-bottom: 1px solid var(--color-border-light);
}

.roi-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.roi-table td {
  font-size: 14px;
  color: var(--color-text-primary);
}

.text-right {
  text-align: right;
}

.campaign-link {
  color: var(--color-accent);
  text-decoration: none;
  font-weight: 500;
}

.campaign-link:hover {
  text-decoration: underline;
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
}

.type-promotion { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.type-seasonal { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.type-referral { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.type-retention { background: rgba(175, 82, 222, 0.1); color: #af52de; }

/* ROI Value */
.roi-value {
  font-weight: 600;
}

.roi-value.excellent { color: #34c759; }
.roi-value.good { color: #30d158; }
.roi-value.neutral { color: #ff9500; }
.roi-value.negative { color: #ff3b30; }

/* Responsive */
@media (max-width: 1024px) {
  .summary-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }

  .roi-table {
    font-size: 12px;
  }

  .roi-table th,
  .roi-table td {
    padding: var(--space-sm);
  }
}
</style>
