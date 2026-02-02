<script setup lang="ts">
/**
 * 特定分群會員列表頁面
 */
import { MESSAGES, PAGINATION } from '~/constants'
import type { RFMSegment } from '~/composables/useSegmentation'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const {
  segmentMembers,
  segmentMemberCount,
  isLoading,
  fetchSegmentMembers,
  exportSegment,
  autoTagSegment,
  getSegmentLabel,
  getSegmentColor,
  getSegmentDescription
} = useSegmentation()

const segment = computed(() => (route.params.segment as string).toUpperCase() as RFMSegment)
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(segmentMemberCount.value / pageSize))

const loadMembers = async () => {
  try {
    await fetchSegmentMembers(segment.value, {
      page: currentPage.value,
      limit: pageSize
    })
  } catch (error) {
    console.error('Failed to load segment members:', error)
    toast.error('載入會員資料失敗')
  }
}

onMounted(loadMembers)

watch(currentPage, loadMembers)

// Export segment
const isExporting = ref(false)
const handleExport = async () => {
  isExporting.value = true
  try {
    await exportSegment(segment.value)
    toast.success('已開始下載 CSV 檔案')
  } catch (error) {
    console.error('Failed to export:', error)
    toast.error('匯出失敗')
  } finally {
    isExporting.value = false
  }
}

// Auto tag
const isTagging = ref(false)
const handleAutoTag = async () => {
  isTagging.value = true
  try {
    await autoTagSegment(segment.value)
    toast.success('已自動套用標籤')
    await loadMembers()
  } catch (error) {
    console.error('Failed to auto tag:', error)
    toast.error('自動標籤失敗')
  } finally {
    isTagging.value = false
  }
}

// Row click
const handleRowClick = (member: typeof segmentMembers.value[0]) => {
  router.push(`/members/${member.member_id}`)
}

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0
  }).format(amount)
}

// Table columns
const columns = [
  { key: 'member', label: '會員', slot: 'member' },
  { key: 'rfm', label: 'RFM 分數', slot: 'rfm' },
  { key: 'last_payment_date', label: '最後消費', format: (v: string) => formatDate(v) },
  { key: 'total_amount', label: '消費金額', slot: 'amount' },
  { key: 'visit_count', label: '打卡次數' }
]
</script>

<template>
  <PageContainer class="segment-members-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <NuxtLink to="/marketing/segmentation" class="back-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          會員分群
        </NuxtLink>
        <div class="segment-header-info">
          <div
            class="segment-badge-large"
            :style="{ background: getSegmentColor(segment) }"
          >
            {{ getSegmentLabel(segment) }}
          </div>
          <h1 class="text-headline">{{ getSegmentLabel(segment) }}</h1>
        </div>
        <p class="text-body text-secondary">{{ getSegmentDescription(segment) }}</p>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-secondary"
          :disabled="isTagging"
          @click="handleAutoTag"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
          </svg>
          {{ isTagging ? '標籤中...' : '自動標籤' }}
        </button>
        <button
          class="btn btn-secondary"
          :disabled="isExporting"
          @click="handleExport"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          {{ isExporting ? '匯出中...' : '匯出 CSV' }}
        </button>
      </div>
    </header>

    <!-- Stats -->
    <StatsBar :count="segmentMemberCount" label="位會員" />

    <!-- Data Table -->
    <DataTable
      :data="segmentMembers"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="此分群沒有會員"
      empty-icon="users"
      row-clickable
      @row-click="handleRowClick"
    >
      <!-- Member Cell -->
      <template #member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.member_name || '?'" size="md" variant="blue" />
          <div class="member-info">
            <span class="member-name">{{ row.member_name }}</span>
            <span class="member-code text-caption text-tertiary">{{ row.member_code }}</span>
          </div>
        </div>
      </template>

      <!-- RFM Cell -->
      <template #rfm="{ row }">
        <div class="rfm-scores">
          <span class="rfm-score" title="Recency">R{{ row.recency_score }}</span>
          <span class="rfm-score" title="Frequency">F{{ row.frequency_score }}</span>
          <span class="rfm-score" title="Monetary">M{{ row.monetary_score }}</span>
        </div>
      </template>

      <!-- Amount Cell -->
      <template #amount="{ row }">
        <span class="amount">{{ formatCurrency(row.total_payments_12m || 0) }}</span>
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
.segment-members-page {
  max-width: 1000px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
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

.segment-header-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.segment-badge-large {
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.header-actions {
  display: flex;
  gap: var(--space-md);
}

/* Member Cell */
.member-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.member-info {
  display: flex;
  flex-direction: column;
}

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* RFM Scores */
.rfm-scores {
  display: flex;
  gap: var(--space-xs);
}

.rfm-score {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
}

.rfm-score:nth-child(1) {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.rfm-score:nth-child(2) {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.rfm-score:nth-child(3) {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

/* Amount */
.amount {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
  }
}
</style>
