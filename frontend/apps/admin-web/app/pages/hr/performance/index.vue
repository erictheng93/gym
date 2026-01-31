<script setup lang="ts">
/**
 * 績效考核列表頁面
 */
import { MESSAGES, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const { currentEmployee } = useAuth()

const {
  reviews,
  totalCount,
  isLoading,
  fetchReviews,
  getStatusLabel,
  getStatusVariant,
  getReviewTypeLabel
} = usePerformance()

// Filter state
const activeTab = ref<'all' | 'pending' | 'mine'>('all')
const selectedType = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const typeOptions = [
  { value: '', label: '全部類型' },
  { value: 'MONTHLY', label: '月考核' },
  { value: 'QUARTERLY', label: '季考核' },
  { value: 'ANNUAL', label: '年度考核' }
]

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SUBMITTED', label: '待審核' },
  { value: 'APPROVED', label: '已核准' }
]

// Load reviews
const loadReviews = async () => {
  const filters: Record<string, unknown> = {
    page: currentPage.value,
    limit: pageSize,
    review_type: selectedType.value || undefined,
    status: selectedStatus.value || undefined
  }

  if (activeTab.value === 'pending') {
    filters.status = 'SUBMITTED'
    filters.reviewer_id = currentEmployee.value?.id
  } else if (activeTab.value === 'mine') {
    filters.employee_id = currentEmployee.value?.id
  }

  await fetchReviews(filters)
}

// Watch filters
watch([activeTab, selectedType, selectedStatus], () => {
  currentPage.value = 1
  loadReviews()
})

watch(currentPage, loadReviews)

onMounted(loadReviews)

// Row click
const handleRowClick = (review: typeof reviews.value[0]) => {
  navigateTo(`/hr/performance/${review.id}`)
}

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

// Table columns
const columns = [
  { key: 'employee', label: '員工', slot: 'employee' },
  { key: 'review_period', label: '考核期間' },
  { key: 'review_type', label: '類型', slot: 'type' },
  { key: 'score', label: '分數', slot: 'score' },
  { key: 'status', label: '狀態', slot: 'status' },
  { key: 'date_created', label: '建立日期', format: (v: string) => formatDate(v), hideOnMobile: true }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="績效考核"
      description="管理員工績效考核與 KPI 追蹤"
      action-label="新增考核"
      action-to="/hr/performance/new"
      action-icon="clipboard-check"
    >
      <template #actions>
        <NuxtLink to="/hr/performance/templates" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          KPI 範本
        </NuxtLink>
        <NuxtLink to="/hr/performance/dashboard" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          團隊儀表板
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'all' }]"
          @click="activeTab = 'all'"
        >
          全部考核
        </button>
        <button
          :class="['tab', { active: activeTab === 'pending' }]"
          @click="activeTab = 'pending'"
        >
          待我審核
        </button>
        <button
          :class="['tab', { active: activeTab === 'mine' }]"
          @click="activeTab = 'mine'"
        >
          我的考核
        </button>
      </div>
    </div>

    <!-- Filters -->
    <FilterBar>
      <template #filters>
        <select v-model="selectedType" class="input filter-select">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-if="activeTab === 'all'" v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="筆考核紀錄" />

    <!-- Data Table -->
    <DataTable
      :data="reviews"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無考核紀錄"
      empty-description="點擊上方按鈕新增第一筆考核"
      empty-icon="clipboard"
      empty-action-label="新增考核"
      empty-action-to="/hr/performance/new"
      row-clickable
      @row-click="handleRowClick"
    >
      <!-- Employee Cell -->
      <template #employee="{ row }">
        <div class="employee-cell">
          <AppAvatar :name="row.employee?.full_name || '?'" size="md" variant="blue" />
          <div class="employee-info">
            <span class="employee-name">{{ row.employee?.full_name }}</span>
            <span class="employee-code text-caption text-tertiary">{{ row.employee?.employee_code }}</span>
          </div>
        </div>
      </template>

      <!-- Type Cell -->
      <template #type="{ row }">
        <span class="type-badge" :class="`type-${row.review_type.toLowerCase()}`">
          {{ getReviewTypeLabel(row.review_type) }}
        </span>
      </template>

      <!-- Score Cell -->
      <template #score="{ row }">
        <div v-if="row.score != null" class="score-display">
          <span class="score-value" :class="{ good: row.score >= 80, warning: row.score >= 60 && row.score < 80, poor: row.score < 60 }">
            {{ row.score }}
          </span>
          <span class="score-max">/ 100</span>
        </div>
        <span v-else class="text-tertiary">—</span>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getStatusLabel(row.status)"
          :variant="getStatusVariant(row.status)"
        />
      </template>

      <!-- Pagination -->
      <template #footer>
        <DataPagination
          v-model="currentPage"
          :total-pages="totalPages"
          :prev-label="MESSAGES.ACTIONS.PREV_PAGE"
          :next-label="MESSAGES.ACTIONS.NEXT_PAGE"
        />
      </template>
    </DataTable>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Tabs */
.tabs-container {
  margin-bottom: var(--space-xl);
}

.tabs {
  display: flex;
  gap: var(--space-sm);
  background: var(--color-bg-secondary);
  padding: var(--space-xs);
  border-radius: var(--radius-lg);
  width: fit-content;
}

.tab {
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.tab:hover {
  color: var(--color-text-primary);
}

.tab.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* Employee Cell */
.employee-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.employee-info {
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.type-monthly {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.type-quarterly {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.type-annual {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

/* Score Display */
.score-display {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
}

.score-value {
  font-size: 18px;
  font-weight: 600;
}

.score-value.good {
  color: #34c759;
}

.score-value.warning {
  color: #ff9500;
}

.score-value.poor {
  color: #ff3b30;
}

.score-max {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
