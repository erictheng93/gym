<script setup lang="ts">
/**
 * 團隊績效儀表板
 */
import { usePerformance } from '~/composables/hr'

definePageMeta({
  middleware: 'auth'
})

const { fetchTeamDashboard, isLoading } = usePerformance()
const { branches, fetchBranches } = useBranches()

const selectedBranch = ref('')
const selectedPeriod = ref(getCurrentPeriod())
const dashboardData = ref<any>(null)

// Get current period
function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Generate period options
const periodOptions = computed(() => {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
    options.push({ value, label })
  }
  return options
})

const loadDashboard = async () => {
  dashboardData.value = await fetchTeamDashboard({
    branch_id: selectedBranch.value || undefined,
    period: selectedPeriod.value
  })
}

watch([selectedBranch, selectedPeriod], loadDashboard)

onMounted(async () => {
  await fetchBranches()
  await loadDashboard()
})

// Get score class
const getScoreClass = (score: number | null) => {
  if (score === null) return ''
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  return 'poor'
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="團隊績效儀表板"
      description="查看團隊整體績效表現"
      back-to="/hr/performance"
    />

    <!-- Filters -->
    <div class="filter-bar">
      <select v-model="selectedBranch" class="input filter-select">
        <option value="">全部分店</option>
        <option v-for="branch in branches" :key="branch.id" :value="branch.id">
          {{ branch.name }}
        </option>
      </select>
      <select v-model="selectedPeriod" class="input filter-select">
        <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <LoadingState v-if="isLoading" />

    <template v-else-if="dashboardData">
      <!-- Summary Stats -->
      <section class="summary-stats">
        <div class="stat-card">
          <div class="stat-icon reviews">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="m9 15 2 2 4-4" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">考核總數</span>
            <span class="stat-value">{{ dashboardData.total_reviews || 0 }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon pending">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">待審核</span>
            <span class="stat-value">{{ dashboardData.pending_reviews || 0 }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon completed">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">已完成</span>
            <span class="stat-value">{{ dashboardData.completed_reviews || 0 }}</span>
          </div>
        </div>

        <div class="stat-card highlight">
          <div class="stat-icon average">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-label">平均分數</span>
            <span class="stat-value" :class="getScoreClass(dashboardData.average_score)">
              {{ dashboardData.average_score?.toFixed(1) || '—' }}
            </span>
          </div>
        </div>
      </section>

      <!-- Score Distribution -->
      <div class="charts-grid">
        <div class="chart-card">
          <h3 class="card-title">分數分布</h3>
          <div class="distribution-bars">
            <div class="bar-item">
              <div class="bar-label">
                <span class="label-text">優秀 (80-100)</span>
                <span class="label-count">{{ dashboardData.score_distribution?.excellent || 0 }}</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill excellent"
                  :style="{ width: `${(dashboardData.score_distribution?.excellent || 0) / (dashboardData.total_reviews || 1) * 100}%` }"
                />
              </div>
            </div>
            <div class="bar-item">
              <div class="bar-label">
                <span class="label-text">合格 (60-79)</span>
                <span class="label-count">{{ dashboardData.score_distribution?.good || 0 }}</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill good"
                  :style="{ width: `${(dashboardData.score_distribution?.good || 0) / (dashboardData.total_reviews || 1) * 100}%` }"
                />
              </div>
            </div>
            <div class="bar-item">
              <div class="bar-label">
                <span class="label-text">待改進 (&lt;60)</span>
                <span class="label-count">{{ dashboardData.score_distribution?.poor || 0 }}</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill poor"
                  :style="{ width: `${(dashboardData.score_distribution?.poor || 0) / (dashboardData.total_reviews || 1) * 100}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Top Performers -->
        <div class="chart-card">
          <h3 class="card-title">表現最佳員工</h3>
          <div v-if="dashboardData.top_performers?.length" class="ranking-list">
            <div
              v-for="(performer, index) in dashboardData.top_performers"
              :key="performer.id"
              class="ranking-item"
            >
              <span class="rank-number" :class="`rank-${index + 1}`">{{ index + 1 }}</span>
              <AppAvatar :name="performer.full_name || '?'" size="sm" variant="blue" />
              <span class="performer-name">{{ performer.full_name }}</span>
              <span class="performer-score" :class="getScoreClass(performer.score)">
                {{ performer.score }}
              </span>
            </div>
          </div>
          <p v-else class="empty-text">暫無數據</p>
        </div>
      </div>
    </template>
  </PageContainer>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.filter-select {
  min-width: 160px;
}

/* Summary Stats */
.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.stat-card.highlight {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));
  border-color: var(--color-accent);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.reviews { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.stat-icon.pending { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.stat-icon.completed { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.stat-icon.average { background: rgba(175, 82, 222, 0.1); color: #af52de; }

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
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stat-value.excellent { color: #34c759; }
.stat-value.good { color: #ff9500; }
.stat-value.poor { color: #ff3b30; }

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}

.chart-card {
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

/* Distribution Bars */
.distribution-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.label-text {
  color: var(--color-text-secondary);
}

.label-count {
  font-weight: 600;
  color: var(--color-text-primary);
}

.bar-track {
  height: 8px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--duration-normal) var(--ease-out);
}

.bar-fill.excellent { background: #34c759; }
.bar-fill.good { background: #ff9500; }
.bar-fill.poor { background: #ff3b30; }

/* Ranking List */
.ranking-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.rank-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 700;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.rank-number.rank-1 { background: #ffd700; color: #000; }
.rank-number.rank-2 { background: #c0c0c0; color: #000; }
.rank-number.rank-3 { background: #cd7f32; color: #fff; }

.performer-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.performer-score {
  font-size: 16px;
  font-weight: 600;
}

.performer-score.excellent { color: #34c759; }
.performer-score.good { color: #ff9500; }
.performer-score.poor { color: #ff3b30; }

.empty-text {
  font-size: 14px;
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--space-xl);
}

/* Responsive */
@media (max-width: 1024px) {
  .summary-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .summary-stats {
    grid-template-columns: 1fr;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
