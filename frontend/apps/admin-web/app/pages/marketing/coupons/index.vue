<script lang="ts">
// The backend can only filter on "valid now" (enabled and today inside the validity range)
const STATUS_OPTIONS = [
  { value: '', label: '全部優惠券' },
  { value: 'ACTIVE', label: '僅有效中' }
]

const COUPON_DATE_FORMATTER = new Intl.DateTimeFormat('zh-TW')
const COUPON_NUMBER_FORMATTER = new Intl.NumberFormat('zh-TW')

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  // date-only strings (YYYY-MM-DD) are shown as that calendar day, not shifted by the timezone
  return COUPON_DATE_FORMATTER.format(new Date(`${dateStr.slice(0, 10)}T00:00:00`))
}

const formatDiscount = (coupon: { discountType: string; discountValue: string }) => {
  if (coupon.discountType === 'PERCENTAGE') {
    return `${Number(coupon.discountValue)}% 折扣`
  }
  return `折 NT$ ${COUPON_NUMBER_FORMATTER.format(Number(coupon.discountValue))}`
}

const COLUMNS = [
  { key: 'code', label: '代碼', slot: 'code' },
  { key: 'name', label: '名稱' },
  { key: 'discount', label: '折扣', slot: 'discount' },
  { key: 'usage', label: '使用狀況', slot: 'usage' },
  { key: 'validity', label: '有效期間', slot: 'validity', hideOnMobile: true },
  { key: 'status', label: '狀態', slot: 'status' }
]
</script>

<script setup lang="ts">
/**
 * 優惠券管理頁面
 */
import { MESSAGES, PAGINATION } from '~/constants'

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
  setCouponActive,
  getCouponState,
  getStatusLabel,
  getStatusVariant
} = useCoupons()

// Filter state
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Load coupons
const loadCoupons = async () => {
  await fetchCoupons({
    page: currentPage.value,
    limit: pageSize,
    activeOnly: selectedStatus.value === 'ACTIVE'
  })
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

// Disable coupon (PATCH isActive=false)
const handleDeactivate = async (coupon: typeof coupons.value[0]) => {
  const confirmed = await confirm({
    title: '停用優惠券',
    message: `確定要停用優惠券「${coupon.name}」嗎？`,
    confirmText: '確定停用',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  // setCouponActive shows the backend's error itself and returns null on failure
  const result = await setCouponActive(coupon.id, false)
  if (!result) return
  toast.success('優惠券已停用')
  await loadCoupons()
}
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
      <template #filters>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">
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
      :columns="COLUMNS"
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
          <span>{{ row.usageCount || 0 }} / {{ row.usageLimit || '∞' }}</span>
          <div v-if="row.usageLimit" class="usage-bar">
            <div
              class="usage-fill"
              :style="{ width: `${Math.min(((row.usageCount || 0) / row.usageLimit) * 100, 100)}%` }"
            ></div>
          </div>
        </div>
      </template>

      <!-- Validity Cell -->
      <template #validity="{ row }">
        <div class="validity-info">
          <span>{{ formatDate(row.validFrom) }}</span>
          <span class="validity-separator">~</span>
          <span>{{ formatDate(row.validUntil) }}</span>
        </div>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getStatusLabel(getCouponState(row))"
          :variant="getStatusVariant(getCouponState(row))"
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
            v-if="getCouponState(row) === 'ACTIVE'"
            class="action-btn danger"
            title="停用"
            @click.stop="handleDeactivate(row)"
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
