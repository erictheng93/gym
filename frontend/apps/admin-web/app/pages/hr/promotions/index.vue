<script setup lang="ts">
/**
 * 員工異動紀錄頁面
 */
import { MESSAGES, PAGINATION } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const {
  promotions,
  promotionCount,
  isPromotionLoading,
  fetchPromotions,
  getPromotionTypeLabel,
  formatCurrency
} = usePayroll()

// Filter state
const selectedType = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(promotionCount.value / pageSize))

const typeOptions = [
  { value: '', label: '全部類型' },
  { value: 'PROMOTION', label: '升遷' },
  { value: 'TRANSFER', label: '調動' },
  { value: 'DEMOTION', label: '降職' }
]

// Load promotions
const loadPromotions = async () => {
  await fetchPromotions({
    page: currentPage.value,
    limit: pageSize,
    type: selectedType.value || undefined
  })
}

watch([selectedType], () => {
  currentPage.value = 1
  loadPromotions()
})

watch(currentPage, loadPromotions)

onMounted(loadPromotions)

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Get type badge color
const getTypeBadgeClass = (type: string) => {
  const map: Record<string, string> = {
    PROMOTION: 'type-promotion',
    TRANSFER: 'type-transfer',
    DEMOTION: 'type-demotion'
  }
  return map[type] || ''
}

// Table columns
const columns = [
  { key: 'employee', label: '員工', slot: 'employee' },
  { key: 'type', label: '異動類型', slot: 'type' },
  { key: 'change', label: '異動內容', slot: 'change' },
  { key: 'effective_date', label: '生效日期', format: (v: string) => formatDate(v) },
  { key: 'new_base_salary', label: '新底薪', slot: 'salary' }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="員工異動紀錄"
      description="管理員工升遷、調動、降職等異動"
      action-label="新增異動"
      action-to="/hr/promotions/new"
      action-icon="user-plus"
    />

    <!-- Filters -->
    <FilterBar>
      <template #filters>
        <select v-model="selectedType" class="input filter-select">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="promotionCount" label="筆異動紀錄" />

    <!-- Data Table -->
    <DataTable
      :data="promotions"
      :columns="columns"
      :loading="isPromotionLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無異動紀錄"
      empty-description="點擊上方按鈕新增第一筆異動"
      empty-icon="users"
      empty-action-label="新增異動"
      empty-action-to="/hr/promotions/new"
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
        <span class="type-badge" :class="getTypeBadgeClass(row.type)">
          {{ getPromotionTypeLabel(row.type) }}
        </span>
      </template>

      <!-- Change Cell -->
      <template #change="{ row }">
        <div class="change-info">
          <div v-if="row.from_job_title || row.to_job_title" class="change-row">
            <span class="change-label">職稱：</span>
            <span class="change-from">{{ row.from_job_title?.name || '—' }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
            <span class="change-to">{{ row.to_job_title?.name || '—' }}</span>
          </div>
          <div v-if="row.from_branch || row.to_branch" class="change-row">
            <span class="change-label">分店：</span>
            <span class="change-from">{{ row.from_branch?.name || '—' }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
            <span class="change-to">{{ row.to_branch?.name || '—' }}</span>
          </div>
        </div>
      </template>

      <!-- Salary Cell -->
      <template #salary="{ row }">
        <span v-if="row.new_base_salary" class="salary-amount">
          {{ formatCurrency(row.new_base_salary) }}
        </span>
        <span v-else class="text-tertiary">—</span>
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
  font-weight: 600;
}

.type-promotion {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.type-transfer {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.type-demotion {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

/* Change Info */
.change-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.change-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
}

.change-label {
  color: var(--color-text-tertiary);
}

.change-from {
  color: var(--color-text-secondary);
}

.change-row svg {
  color: var(--color-text-tertiary);
}

.change-to {
  color: var(--color-text-primary);
  font-weight: 500;
}

/* Salary Amount */
.salary-amount {
  font-weight: 500;
  color: var(--color-accent);
}
</style>
