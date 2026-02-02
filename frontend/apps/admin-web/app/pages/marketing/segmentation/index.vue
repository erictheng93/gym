<script setup lang="ts">
/**
 * 會員分群總覽頁面
 *
 * 顯示 RFM 分群卡片與會員分佈
 */
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const {
  segments,
  isLoading,
  fetchSegments,
  calculateRFM,
  getSegmentLabel,
  getSegmentColor,
  getSegmentIcon,
  getSegmentDescription
} = useSegmentation()

const isCalculating = ref(false)

const loadSegments = async () => {
  try {
    await fetchSegments()
  } catch (error) {
    console.error('Failed to load segments:', error)
    toast.error('載入分群資料失敗')
  }
}

onMounted(loadSegments)

const handleRecalculate = async () => {
  isCalculating.value = true
  try {
    await calculateRFM()
    toast.success('RFM 分數已重新計算')
    await loadSegments()
  } catch (error) {
    console.error('Failed to recalculate RFM:', error)
    toast.error('重新計算失敗')
  } finally {
    isCalculating.value = false
  }
}

// Total members count
const totalMembers = computed(() => {
  return segments.value.reduce((sum, s) => sum + (s.member_count || 0), 0)
})

// Calculate percentage
const getPercentage = (count: number) => {
  if (totalMembers.value === 0) return 0
  return ((count / totalMembers.value) * 100).toFixed(1)
}

// Segment order for display
const segmentOrder = [
  'CHAMPIONS',
  'LOYAL',
  'POTENTIAL_LOYALISTS',
  'NEW_CUSTOMERS',
  'PROMISING',
  'NEED_ATTENTION',
  'ABOUT_TO_SLEEP',
  'AT_RISK',
  'HIBERNATING',
  'LOST'
]

const sortedSegments = computed(() => {
  return segmentOrder
    .map(key => segments.value.find(s => s.segment === key))
    .filter(Boolean) as typeof segments.value
})
</script>

<template>
  <PageContainer class="segmentation-page">
    <!-- Header -->
    <PageHeader
      title="會員分群"
      description="根據 RFM 模型自動分析會員價值"
    >
      <template #actions>
        <button
          class="btn btn-secondary"
          :disabled="isCalculating"
          @click="handleRecalculate"
        >
          <svg v-if="isCalculating" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          {{ isCalculating ? '計算中...' : '重新計算' }}
        </button>
      </template>
    </PageHeader>

    <!-- RFM Explanation -->
    <section class="rfm-intro glass-card">
      <h2 class="intro-title">什麼是 RFM 分析？</h2>
      <div class="rfm-metrics">
        <div class="metric-item">
          <div class="metric-icon" style="background: rgba(0, 122, 255, 0.1); color: #007aff;">R</div>
          <div class="metric-content">
            <strong>Recency (最近性)</strong>
            <span>最後一次消費/打卡距今多久</span>
          </div>
        </div>
        <div class="metric-item">
          <div class="metric-icon" style="background: rgba(52, 199, 89, 0.1); color: #34c759;">F</div>
          <div class="metric-content">
            <strong>Frequency (頻率)</strong>
            <span>過去 12 個月消費/打卡次數</span>
          </div>
        </div>
        <div class="metric-item">
          <div class="metric-icon" style="background: rgba(175, 82, 222, 0.1); color: #af52de;">M</div>
          <div class="metric-content">
            <strong>Monetary (金額)</strong>
            <span>過去 12 個月消費總金額</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Loading State -->
    <LoadingState v-if="isLoading" />

    <!-- Segments Grid -->
    <template v-else>
      <div class="segments-summary">
        <span class="summary-text">共 <strong>{{ totalMembers }}</strong> 位會員已分群</span>
      </div>

      <div class="segments-grid">
        <NuxtLink
          v-for="segment in sortedSegments"
          :key="segment.segment"
          :to="`/marketing/segmentation/${segment.segment.toLowerCase()}`"
          class="segment-card"
          :style="{ '--segment-color': getSegmentColor(segment.segment) }"
        >
          <div class="segment-header">
            <div class="segment-icon">
              {{ getSegmentIcon(segment.segment) }}
            </div>
            <div class="segment-badge" :style="{ background: getSegmentColor(segment.segment) }">
              {{ getPercentage(segment.member_count) }}%
            </div>
          </div>
          <h3 class="segment-title">{{ getSegmentLabel(segment.segment) }}</h3>
          <p class="segment-description">{{ getSegmentDescription(segment.segment) }}</p>
          <div class="segment-stats">
            <span class="segment-count">{{ segment.member_count }} 人</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </NuxtLink>
      </div>

      <EmptyState
        v-if="segments.length === 0"
        title="尚未計算分群"
        description="點擊上方「重新計算」按鈕開始分析會員"
        icon="users"
      />
    </template>
  </PageContainer>
</template>

<style scoped>
.segmentation-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* RFM Intro */
.rfm-intro {
  padding: var(--space-xl);
  margin-bottom: var(--space-2xl);
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.intro-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: var(--space-lg);
}

.rfm-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-xl);
}

.metric-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
}

.metric-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}

.metric-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.metric-content strong {
  font-size: 14px;
}

.metric-content span {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Segments Summary */
.segments-summary {
  margin-bottom: var(--space-lg);
  animation: fadeUp 0.6s var(--ease-out) 0.15s backwards;
}

.summary-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.summary-text strong {
  color: var(--color-text-primary);
}

/* Segments Grid */
.segments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.segment-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  text-decoration: none;
  transition: all var(--duration-normal) var(--ease-out);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.segment-card:nth-child(1) { animation-delay: 0.2s; }
.segment-card:nth-child(2) { animation-delay: 0.25s; }
.segment-card:nth-child(3) { animation-delay: 0.3s; }
.segment-card:nth-child(4) { animation-delay: 0.35s; }
.segment-card:nth-child(5) { animation-delay: 0.4s; }
.segment-card:nth-child(6) { animation-delay: 0.45s; }
.segment-card:nth-child(7) { animation-delay: 0.5s; }
.segment-card:nth-child(8) { animation-delay: 0.55s; }
.segment-card:nth-child(9) { animation-delay: 0.6s; }
.segment-card:nth-child(10) { animation-delay: 0.65s; }

.segment-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);
  border-color: var(--segment-color);
}

.segment-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-lg);
}

.segment-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.segment-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.segment-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-sm);
}

.segment-description {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--space-lg);
}

.segment-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-divider);
}

.segment-count {
  font-size: 15px;
  font-weight: 600;
  color: var(--segment-color);
}

.segment-stats svg {
  color: var(--color-text-tertiary);
  transition: transform var(--duration-fast);
}

.segment-card:hover .segment-stats svg {
  transform: translateX(4px);
  color: var(--segment-color);
}

/* Button Spinner */
.btn-spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .rfm-metrics {
    grid-template-columns: 1fr;
  }

  .segments-grid {
    grid-template-columns: 1fr;
  }
}
</style>
