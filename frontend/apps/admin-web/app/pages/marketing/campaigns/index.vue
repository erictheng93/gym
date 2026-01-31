<script setup lang="ts">
/**
 * 行銷活動列表頁面
 */
import { MESSAGES, PAGINATION } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const {
  campaigns,
  totalCount,
  isLoading,
  fetchCampaigns,
  getStatusLabel,
  getStatusVariant,
  getTypeLabel
} = useCampaigns()

// Filter state
const selectedType = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const typeOptions = [
  { value: '', label: '全部類型' },
  { value: 'PROMOTION', label: '促銷活動' },
  { value: 'SEASONAL', label: '季節活動' },
  { value: 'REFERRAL', label: '推薦活動' },
  { value: 'RETENTION', label: '留存活動' }
]

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SCHEDULED', label: '已排程' },
  { value: 'ACTIVE', label: '進行中' },
  { value: 'PAUSED', label: '已暫停' },
  { value: 'ENDED', label: '已結束' }
]

// Load campaigns
const loadCampaigns = async () => {
  await fetchCampaigns({
    page: currentPage.value,
    limit: pageSize,
    type: selectedType.value || undefined,
    status: selectedStatus.value || undefined
  })
}

watch([selectedType, selectedStatus], () => {
  currentPage.value = 1
  loadCampaigns()
})

watch(currentPage, loadCampaigns)

onMounted(loadCampaigns)

// Row click
const handleRowClick = (campaign: typeof campaigns.value[0]) => {
  navigateTo(`/marketing/campaigns/${campaign.id}`)
}

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount)
}

// Table columns
const columns = [
  { key: 'name', label: '活動名稱', slot: 'name' },
  { key: 'type', label: '類型', slot: 'type' },
  { key: 'date_range', label: '活動期間', slot: 'dates' },
  { key: 'budget', label: '預算', slot: 'budget' },
  { key: 'status', label: '狀態', slot: 'status' }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="行銷活動"
      description="管理促銷活動、季節活動與推薦計劃"
      action-label="新增活動"
      action-to="/marketing/campaigns/new"
      action-icon="megaphone"
    >
      <template #actions>
        <NuxtLink to="/marketing/reports/roi" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          ROI 報表
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Filters -->
    <FilterBar>
      <template #filters>
        <select v-model="selectedType" class="input filter-select">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="個活動" />

    <!-- Data Table -->
    <DataTable
      :data="campaigns"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無活動"
      empty-description="點擊上方按鈕新增第一個活動"
      empty-icon="megaphone"
      empty-action-label="新增活動"
      empty-action-to="/marketing/campaigns/new"
      row-clickable
      @row-click="handleRowClick"
    >
      <!-- Name Cell -->
      <template #name="{ row }">
        <div class="campaign-name">
          <span class="name-text">{{ row.name }}</span>
          <span v-if="row.description" class="name-desc text-caption text-tertiary">{{ row.description }}</span>
        </div>
      </template>

      <!-- Type Cell -->
      <template #type="{ row }">
        <span class="type-badge" :class="`type-${row.type?.toLowerCase()}`">
          {{ getTypeLabel(row.type) }}
        </span>
      </template>

      <!-- Dates Cell -->
      <template #dates="{ row }">
        <div class="date-range">
          <span>{{ formatDate(row.start_date) }}</span>
          <span class="date-separator">~</span>
          <span>{{ formatDate(row.end_date) }}</span>
        </div>
      </template>

      <!-- Budget Cell -->
      <template #budget="{ row }">
        <span v-if="row.budget" class="budget-amount">{{ formatCurrency(row.budget) }}</span>
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

/* Campaign Name */
.campaign-name {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.name-text {
  font-weight: 500;
  color: var(--color-text-primary);
}

.name-desc {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.type-promotion {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.type-seasonal {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.type-referral {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.type-retention {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

/* Date Range */
.date-range {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
}

.date-separator {
  color: var(--color-text-tertiary);
}

/* Budget Amount */
.budget-amount {
  font-weight: 500;
  color: var(--color-accent);
}
</style>
