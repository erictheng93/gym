<script setup lang="ts">
/**
 * 優惠券管理頁面
 */
import { MESSAGES, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const { confirm } = useConfirm()

const {
  coupons,
  totalCount,
  isLoading,
  fetchCoupons,
  deleteCoupon,
  getStatusLabel,
  getStatusVariant
} = useCoupons()

// Filter state
const search = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'ACTIVE', label: '啟用中' },
  { value: 'INACTIVE', label: '已停用' },
  { value: 'EXPIRED', label: '已過期' }
]

// Load coupons
const loadCoupons = async () => {
  await fetchCoupons({
    page: currentPage.value,
    limit: pageSize,
    search: search.value || undefined,
    status: selectedStatus.value || undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadCoupons()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedStatus], () => {
  currentPage.value = 1
  loadCoupons()
})

watch(currentPage, loadCoupons)

onMounted(loadCoupons)

// Row click
const handleRowClick = (coupon: typeof coupons.value[0]) => {
  navigateTo(`/marketing/coupons/${coupon.id}`)
}

// Delete coupon
const handleDelete = async (coupon: typeof coupons.value[0]) => {
  const confirmed = await confirm({
    title: '停用優惠券',
    message: `確定要停用優惠券「${coupon.name}」嗎？`,
    confirmText: '確定停用',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await deleteCoupon(coupon.id)
    toast.success('優惠券已停用')
    await loadCoupons()
  } catch (error) {
    console.error('Failed to delete coupon:', error)
    toast.error('停用失敗')
  }
}

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

// Format discount value
const formatDiscount = (coupon: typeof coupons.value[0]) => {
  if (coupon.discount_type === 'PERCENTAGE') {
    return `${coupon.discount_value}% 折扣`
  }
  return `折 NT$ ${coupon.discount_value.toLocaleString()}`
}

// Table columns
const columns = [
  { key: 'code', label: '代碼', slot: 'code' },
  { key: 'name', label: '名稱' },
  { key: 'discount', label: '折扣', slot: 'discount' },
  { key: 'usage', label: '使用狀況', slot: 'usage' },
  { key: 'validity', label: '有效期間', slot: 'validity', hideOnMobile: true },
  { key: 'status', label: '狀態', slot: 'status' }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="優惠券管理"
      description="管理所有優惠券與折扣碼"
      action-label="新增優惠券"
      action-to="/marketing/coupons/new"
      action-icon="ticket"
    />

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          placeholder="搜尋代碼、名稱..."
          @input="handleSearch"
        />
      </template>
      <template #filters>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="張優惠券" />

    <!-- Data Table -->
    <DataTable
      :data="coupons"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無優惠券"
      empty-description="點擊上方按鈕新增第一張優惠券"
      empty-icon="ticket"
      empty-action-label="新增優惠券"
      empty-action-to="/marketing/coupons/new"
      row-clickable
      show-actions
      @row-click="handleRowClick"
    >
      <!-- Code Cell -->
      <template #code="{ row }">
        <code class="coupon-code">{{ row.code }}</code>
      </template>

      <!-- Discount Cell -->
      <template #discount="{ row }">
        <span class="discount-value">{{ formatDiscount(row) }}</span>
      </template>

      <!-- Usage Cell -->
      <template #usage="{ row }">
        <div class="usage-info">
          <span>{{ row.used_count || 0 }} / {{ row.usage_limit || '∞' }}</span>
          <div v-if="row.usage_limit" class="usage-bar">
            <div
              class="usage-fill"
              :style="{ width: `${Math.min((row.used_count / row.usage_limit) * 100, 100)}%` }"
            ></div>
          </div>
        </div>
      </template>

      <!-- Validity Cell -->
      <template #validity="{ row }">
        <div class="validity-info">
          <span>{{ formatDate(row.start_date) }}</span>
          <span class="validity-separator">~</span>
          <span>{{ formatDate(row.end_date) }}</span>
        </div>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getStatusLabel(row.status)"
          :variant="getStatusVariant(row.status)"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/marketing/coupons/${row.id}`" class="action-btn" title="查看詳情">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
          <button
            v-if="row.status === 'ACTIVE'"
            class="action-btn danger"
            title="停用"
            @click.stop="handleDelete(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
            </svg>
          </button>
        </div>
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

/* Coupon Code */
.coupon-code {
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-accent);
  font-weight: 600;
}

/* Discount Value */
.discount-value {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Usage Info */
.usage-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.usage-bar {
  width: 80px;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width 0.3s var(--ease-out);
}

/* Validity Info */
.validity-info {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
}

.validity-separator {
  color: var(--color-text-tertiary);
}

/* Actions */
.actions-row {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}
</style>
