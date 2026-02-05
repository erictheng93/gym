<script setup lang="ts">
import { MESSAGES } from '~/constants'
import { useReports } from '~/composables/useReports'
import type { CoachPerformanceReport, CoachPerformanceData } from '~/composables/useReports'

const { branches, fetchBranches } = useBranches()
const { getCoachPerformanceReport } = useReports()

const selectedBranch = ref('')
const selectedPeriod = ref<'month' | 'quarter' | 'year'>('month')
const loading = ref(true)
const report = ref<CoachPerformanceReport | null>(null)
const selectedCoach = ref<CoachPerformanceData | null>(null)
const showDetail = ref(false)

const loadReport = async () => {
  try {
    loading.value = true
    const branchId = selectedBranch.value || undefined
    report.value = await getCoachPerformanceReport(selectedPeriod.value, undefined, branchId)
  } catch (error) {
    console.error('Failed to load coach performance report:', error)
  } finally {
    loading.value = false
  }
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('zh-TW').format(value)
}

const formatPercent = (value: number | null) => {
  if (value === null) return '-'
  return `${value.toFixed(1)}%`
}

const formatRating = (value: number | null) => {
  if (value === null) return '-'
  return value.toFixed(1)
}

const getCategoryLabel = (category: string | null) => {
  const labels: Record<string, string> = {
    YOGA: '瑜珈',
    CARDIO: '有氧',
    STRENGTH: '重訓',
    DANCE: '舞蹈',
    SPINNING: '飛輪',
    PILATES: '皮拉提斯',
    BOXING: '拳擊',
    SWIMMING: '游泳',
    OTHER: '其他',
  }
  return labels[category || ''] || category || '其他'
}

const openDetail = (coach: CoachPerformanceData) => {
  selectedCoach.value = coach
  showDetail.value = true
}

const closeDetail = () => {
  showDetail.value = false
  selectedCoach.value = null
}

const exportReport = async (format: 'csv' | 'excel') => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl || 'http://localhost:8056'
  const params = new URLSearchParams()
  params.append('period', selectedPeriod.value)
  params.append('format', format)
  if (selectedBranch.value) params.append('branch_id', selectedBranch.value)

  window.open(`${baseURL}/api/reports/coach-performance/export?${params}`, '_blank')
}

// Sort coaches by classes taught
const sortedCoaches = computed(() => {
  if (!report.value) return []
  return [...report.value.data].sort((a, b) => b.metrics.classes_taught - a.metrics.classes_taught)
})

// Get rating color class
const getRatingClass = (rating: number | null) => {
  if (rating === null) return ''
  if (rating >= 4.5) return 'excellent'
  if (rating >= 4) return 'good'
  if (rating >= 3) return 'average'
  return 'poor'
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
  <div class="coach-performance-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="breadcrumb">
          <NuxtLink to="/reports" class="breadcrumb-link">報表中心</NuxtLink>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-current">教練績效報表</span>
        </div>
        <h1>教練績效報表</h1>
        <p>追蹤教練授課表現、學員滿意度與各項績效指標</p>
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
              { value: 'month', label: '本月' },
              { value: 'quarter', label: '本季' },
              { value: 'year', label: '本年' }
            ]"
            :key="period.value"
            :class="{ active: selectedPeriod === period.value }"
            @click="selectedPeriod = period.value as 'month' | 'quarter' | 'year'"
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">活躍教練</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_coaches) }}</span>
            <span class="summary-subtitle">有授課或帶學員</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總授課堂數</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_classes_taught) }}</span>
            <span class="summary-subtitle">已完成課程</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">總學員數</span>
            <span class="summary-value">{{ formatNumber(report.summary.total_students) }}</span>
            <span class="summary-subtitle">指派學員</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon orange">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div class="summary-content">
            <span class="summary-label">平均滿意度</span>
            <span class="summary-value" :class="getRatingClass(report.summary.average_satisfaction)">
              {{ formatRating(report.summary.average_satisfaction) }}
            </span>
            <span class="summary-subtitle">滿分 5 分</span>
          </div>
        </div>
      </div>

      <!-- Period Info -->
      <div class="period-info">
        <span>報表期間：{{ report.period.start_date }} ~ {{ report.period.end_date }}</span>
      </div>

      <!-- Coach Cards Grid -->
      <div class="coach-grid">
        <div
          v-for="coach in sortedCoaches"
          :key="coach.coach_id"
          class="coach-card"
          @click="openDetail(coach)"
        >
          <div class="coach-header">
            <div class="coach-avatar">
              {{ coach.coach_name.charAt(0) }}
            </div>
            <div class="coach-info">
              <h4>{{ coach.coach_name }}</h4>
              <span class="coach-meta">{{ coach.coach_code }} · {{ coach.branch_name }}</span>
            </div>
          </div>

          <div class="coach-metrics">
            <div class="metric">
              <span class="metric-value">{{ formatNumber(coach.metrics.classes_taught) }}</span>
              <span class="metric-label">授課堂數</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ formatNumber(coach.metrics.total_students) }}</span>
              <span class="metric-label">學員數</span>
            </div>
            <div class="metric">
              <span class="metric-value" :class="getRatingClass(coach.metrics.satisfaction_rating)">
                {{ formatRating(coach.metrics.satisfaction_rating) }}
              </span>
              <span class="metric-label">滿意度</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ formatPercent(coach.metrics.attendance_rate) }}</span>
              <span class="metric-label">出席率</span>
            </div>
          </div>

          <div v-if="coach.details.classes_by_category.length > 0" class="coach-categories">
            <span
              v-for="cat in coach.details.classes_by_category.slice(0, 3)"
              :key="cat.category"
              class="category-tag"
            >
              {{ getCategoryLabel(cat.category) }} ({{ cat.count }})
            </span>
          </div>
        </div>
      </div>

      <!-- Empty Coach State -->
      <div v-if="sortedCoaches.length === 0" class="empty-coaches">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />
        </svg>
        <p>此期間內無教練活動紀錄</p>
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

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="showDetail && selectedCoach" class="modal-overlay" @click.self="closeDetail">
        <div class="detail-modal">
          <div class="modal-header">
            <div class="modal-coach-info">
              <div class="modal-avatar">
                {{ selectedCoach.coach_name.charAt(0) }}
              </div>
              <div>
                <h3>{{ selectedCoach.coach_name }}</h3>
                <span>{{ selectedCoach.job_title }} · {{ selectedCoach.branch_name }}</span>
              </div>
            </div>
            <button class="close-btn" @click="closeDetail">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>

          <div class="modal-content">
            <div class="detail-section">
              <h4>績效指標</h4>
              <div class="detail-metrics">
                <div class="detail-metric">
                  <span class="detail-metric-label">授課堂數</span>
                  <span class="detail-metric-value">{{ formatNumber(selectedCoach.metrics.classes_taught) }}</span>
                </div>
                <div class="detail-metric">
                  <span class="detail-metric-label">學員數</span>
                  <span class="detail-metric-value">{{ formatNumber(selectedCoach.metrics.total_students) }}</span>
                </div>
                <div class="detail-metric">
                  <span class="detail-metric-label">滿意度</span>
                  <span class="detail-metric-value" :class="getRatingClass(selectedCoach.metrics.satisfaction_rating)">
                    {{ formatRating(selectedCoach.metrics.satisfaction_rating) }}
                    <small v-if="selectedCoach.metrics.review_count > 0">({{ selectedCoach.metrics.review_count }} 則評價)</small>
                  </span>
                </div>
                <div class="detail-metric">
                  <span class="detail-metric-label">出席率</span>
                  <span class="detail-metric-value">{{ formatPercent(selectedCoach.metrics.attendance_rate) }}</span>
                </div>
                <div class="detail-metric">
                  <span class="detail-metric-label">建立筆記</span>
                  <span class="detail-metric-value">{{ formatNumber(selectedCoach.metrics.notes_created) }}</span>
                </div>
                <div class="detail-metric">
                  <span class="detail-metric-label">教案數量</span>
                  <span class="detail-metric-value">{{ formatNumber(selectedCoach.metrics.lesson_plans_created) }}</span>
                </div>
              </div>
            </div>

            <div v-if="selectedCoach.details.classes_by_category.length > 0" class="detail-section">
              <h4>課程類別分布</h4>
              <div class="category-bars">
                <div
                  v-for="cat in selectedCoach.details.classes_by_category"
                  :key="cat.category"
                  class="category-bar-item"
                >
                  <div class="category-bar-label">
                    <span>{{ getCategoryLabel(cat.category) }}</span>
                    <span>{{ cat.count }} 堂</span>
                  </div>
                  <div class="category-bar">
                    <div
                      class="category-bar-fill"
                      :style="{ width: `${(cat.count / selectedCoach.metrics.classes_taught) * 100}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.coach-performance-page {
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

.summary-value.excellent {
  color: var(--color-success);
}

.summary-value.good {
  color: #34c759;
}

.summary-value.average {
  color: #ff9500;
}

.summary-value.poor {
  color: var(--color-error);
}

.summary-subtitle {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
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

/* Coach Grid */
.coach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.coach-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.coach-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-md);
}

.coach-header {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.coach-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent), #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}

.coach-info h4 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.coach-meta {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.coach-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.metric {
  text-align: center;
}

.metric-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.metric-value.excellent {
  color: var(--color-success);
}

.metric-value.good {
  color: #34c759;
}

.metric-value.average {
  color: #ff9500;
}

.metric-value.poor {
  color: var(--color-error);
}

.metric-label {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-xs);
}

.coach-categories {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}

.category-tag {
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* Empty States */
.empty-state,
.empty-coaches {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-state svg,
.empty-coaches svg {
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

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-lg);
}

.detail-modal {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-coach-info {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.modal-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent), #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.modal-coach-info h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.modal-coach-info span {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.close-btn {
  padding: var(--space-sm);
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
}

.close-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.modal-content {
  padding: var(--space-lg);
}

.detail-section {
  margin-bottom: var(--space-xl);
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md) 0;
}

.detail-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.detail-metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.detail-metric-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.detail-metric-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.detail-metric-value.excellent {
  color: var(--color-success);
}

.detail-metric-value.good {
  color: #34c759;
}

.detail-metric-value.average {
  color: #ff9500;
}

.detail-metric-value.poor {
  color: var(--color-error);
}

.detail-metric-value small {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-tertiary);
  margin-left: var(--space-xs);
}

.category-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.category-bar-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.category-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-primary);
}

.category-bar {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.category-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width var(--duration-normal) var(--ease-out);
}

/* Responsive */
@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
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

  .coach-grid {
    grid-template-columns: 1fr;
  }

  .coach-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
