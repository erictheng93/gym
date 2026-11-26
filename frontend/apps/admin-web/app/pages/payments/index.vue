<script lang="ts">
import { PAGES, LABELS, STATUS } from '~/constants'
import type { Payment, PaymentRecordStatus } from '~/types/schema'

const paymentDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

const PAYMENT_METHOD_LABEL_MAP: Record<string, string> = LABELS.PAYMENT_METHOD

/** Record status → label + design-system status color (orange / green / red) */
const PAYMENT_RECORD_STATUS_BADGE: Record<PaymentRecordStatus, { label: string; variant: 'warning' | 'success' | 'error' }> = {
  PENDING: { label: STATUS.PAYMENT_RECORD.PENDING, variant: 'warning' },
  COMPLETED: { label: STATUS.PAYMENT_RECORD.COMPLETED, variant: 'success' },
  FAILED: { label: STATUS.PAYMENT_RECORD.FAILED, variant: 'error' }
}

const typeOptions = [
  { value: '', label: PAGES.PAYMENTS.ALL_TYPES },
  { value: 'INCOME', label: LABELS.PAYMENT_TYPE.INCOME },
  { value: 'REFUND', label: LABELS.PAYMENT_TYPE.REFUND }
]

const statusOptions = [
  { value: '', label: PAGES.PAYMENTS.ALL_STATUSES },
  { value: 'COMPLETED', label: STATUS.PAYMENT_RECORD.COMPLETED },
  { value: 'PENDING', label: STATUS.PAYMENT_RECORD.PENDING },
  { value: 'FAILED', label: STATUS.PAYMENT_RECORD.FAILED }
]

/** YYYY-MM-DD of the viewer's local calendar day (toISOString() would give the UTC day) */
const localIsoDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Amount column: only a COMPLETED payment is shown as money in (+) or out (-) */
const amountClass = (row: Payment) => {
  if (row.status !== 'COMPLETED') return 'amount-muted'
  return row.type === 'INCOME' ? 'amount-income' : 'amount-refund'
}
</script>

<script setup lang="ts">
/**
 * 收款管理頁面
 *
 * 列表、統計與匯出對應 backend/src/routes/payments.ts 的實際回應格式。
 * 統計只計入已完成 (COMPLETED) 的收款，待付款／失敗的金流不算收入。
 */
import type { PaymentType } from '~/types/schema'
import { MESSAGES, PAGINATION, TIMING } from '~/constants'
import { EMPTY_PAYMENT_SUMMARY, type PaymentSummary } from '~/composables/usePayments'

definePageMeta({
  middleware: 'auth'
})

const { payments, totalCount, isLoading, fetchPayments, getPaymentStats, exportPayments } = usePayments()
const { branches, fetchBranches } = useBranches()

const search = ref('')
const selectedBranch = ref('')
const selectedType = ref<'' | PaymentType>('')
const selectedStatus = ref<'' | PaymentRecordStatus>('')
const startDate = ref('')
const endDate = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE
const isExporting = ref(false)

const stats = ref<PaymentSummary>({ ...EMPTY_PAYMENT_SUMMARY })

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const branchNameById = computed(() => {
  const map: Record<string, string> = {}
  for (const branch of branches.value) map[branch.id] = branch.name
  return map
})

const loadPayments = async () => {
  await fetchPayments({
    page: currentPage.value,
    limit: pageSize,
    branchId: selectedBranch.value || undefined,
    type: selectedType.value || undefined,
    status: selectedStatus.value || undefined,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    search: search.value.trim() || undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadPayments()
  }, TIMING.DEBOUNCE)
}

const loadStats = async () => {
  stats.value = await getPaymentStats(
    selectedBranch.value || undefined,
    startDate.value || undefined,
    endDate.value || undefined
  )
}

watch([selectedBranch, startDate, endDate], () => {
  currentPage.value = 1
  Promise.all([loadPayments(), loadStats()])
})

// type / status narrow the list only; the summary always compares completed income with refunds
watch([selectedType, selectedStatus], () => {
  currentPage.value = 1
  loadPayments()
})

watch(currentPage, () => {
  loadPayments()
})

onMounted(async () => {
  await Promise.all([loadPayments(), loadStats(), fetchBranches()])
})

onBeforeUnmount(() => {
  clearTimeout(searchTimeout)
})

const handleExport = async () => {
  isExporting.value = true
  try {
    await exportPayments({
      branchId: selectedBranch.value || undefined,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined
    })
  } finally {
    isExporting.value = false
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  return paymentDateFormatter.format(date)
}

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return '—'
  return PAYMENT_METHOD_LABEL_MAP[method] || method
}

const getStatusBadge = (status: PaymentRecordStatus) =>
  PAYMENT_RECORD_STATUS_BADGE[status] || { label: status, variant: 'default' as const }

// 設定日期快捷選項
const setDateRange = (range: string) => {
  const today = new Date()
  const todayStr = localIsoDate(today)

  switch (range) {
    case 'today':
      startDate.value = todayStr
      endDate.value = todayStr
      break
    case 'week': {
      const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
      startDate.value = localIsoDate(weekAgo)
      endDate.value = todayStr
      break
    }
    case 'month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      startDate.value = localIsoDate(monthStart)
      endDate.value = todayStr
      break
    }
    case 'all':
      startDate.value = ''
      endDate.value = ''
      break
  }
}

// Table columns config
const columns = [
  { key: 'paymentDate', label: PAGES.PAYMENTS.DATE },
  { key: 'type', label: PAGES.PAYMENTS.TYPE },
  { key: 'status', label: PAGES.PAYMENTS.STATUS },
  { key: 'member', label: PAGES.PAYMENTS.MEMBER },
  { key: 'contract', label: PAGES.PAYMENTS.CONTRACT_NO },
  { key: 'paymentMethod', label: PAGES.PAYMENTS.PAYMENT_METHOD },
  { key: 'branch', label: PAGES.PAYMENTS.BRANCH },
  { key: 'amount', label: PAGES.PAYMENTS.AMOUNT }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.PAYMENTS.TITLE"
      :description="PAGES.PAYMENTS.DESCRIPTION"
      :action-label="PAGES.PAYMENTS.ADD_PAYMENT"
      action-to="/payments/new"
      action-icon="dollar"
    />

    <!-- Stats Cards (Bento Grid) -->
    <div class="stats-grid">
      <div class="stat-card glass-card stat-income">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number" data-testid="stat-income">{{ formatCurrency(stats.totalIncome) }}</span>
          <span class="stat-label">{{ PAGES.PAYMENTS.TOTAL_PAYMENT }}</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-refund">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 7 9 13 3 19" />
            <line x1="21" x2="9" y1="13" y2="13" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number" data-testid="stat-refund">{{ formatCurrency(stats.totalRefund) }}</span>
          <span class="stat-label">{{ PAGES.PAYMENTS.TOTAL_REFUND }}</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-net">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number" data-testid="stat-net" :class="{ negative: stats.netIncome < 0 }">
            {{ formatCurrency(stats.netIncome) }}
          </span>
          <span class="stat-label">{{ PAGES.PAYMENTS.NET_PAYMENT }} ({{ PAGES.PAYMENTS.COMPLETED_ENTRIES }} {{ stats.paymentCount }} {{ PAGES.PAYMENTS.ENTRIES }})</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar glass-card">
      <div class="filters-row">
        <div class="search-box">
          <input
            v-model="search"
            type="text"
            class="input input-search"
            placeholder="搜尋會員姓名、合約編號..."
            @input="handleSearch"
          />
        </div>
        <div class="date-filters">
          <div class="date-shortcuts">
            <button class="shortcut-btn" :class="{ active: !startDate && !endDate }" @click="setDateRange('all')">{{ PAGES.PAYMENTS.DATE_RANGE_ALL }}</button>
            <button class="shortcut-btn" @click="setDateRange('today')">{{ PAGES.PAYMENTS.DATE_RANGE_TODAY }}</button>
            <button class="shortcut-btn" @click="setDateRange('week')">{{ PAGES.PAYMENTS.DATE_RANGE_WEEK }}</button>
            <button class="shortcut-btn" @click="setDateRange('month')">{{ PAGES.PAYMENTS.DATE_RANGE_MONTH }}</button>
          </div>
          <div class="date-inputs">
            <input v-model="startDate" type="date" class="input input-date" />
            <span class="date-separator">—</span>
            <input v-model="endDate" type="date" class="input input-date" />
          </div>
        </div>
      </div>

      <div class="filter-group">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>

        <select v-model="selectedType" class="input filter-select" data-testid="filter-type">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <select v-model="selectedStatus" class="input filter-select" data-testid="filter-status">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <button
          type="button"
          class="export-btn"
          data-testid="export-payments"
          :disabled="isExporting"
          @click="handleExport"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          {{ PAGES.PAYMENTS.EXPORT }}
        </button>
      </div>
      <p class="stats-hint text-caption text-tertiary">{{ PAGES.PAYMENTS.STATS_COMPLETED_ONLY }}</p>
    </div>

    <!-- Stats Bar -->
    <StatsBar :count="totalCount" :label="MESSAGES.COMMON.MATCHES" />

    <!-- Loading State -->
    <LoadingState v-if="isLoading" :message="MESSAGES.ACTIONS.LOADING" />

    <!-- Empty State -->
    <div v-else-if="payments.length === 0" class="card">
      <EmptyState
        :title="PAGES.PAYMENTS.NO_PAYMENTS"
        :description="PAGES.PAYMENTS.NO_PAYMENTS_HINT"
        icon="dollar"
        :action-label="PAGES.PAYMENTS.ADD_PAYMENT"
        action-to="/payments/new"
      />
    </div>

    <!-- Payments Table -->
    <DataTable v-else :columns="columns" :data="payments" row-key="id">
      <template #cell-paymentDate="{ row }">
        <span class="date-cell">{{ formatDate(row.paymentDate) }}</span>
      </template>

      <template #cell-type="{ row }">
        <AppBadge
          :label="row.type === 'INCOME' ? LABELS.PAYMENT_TYPE.INCOME : LABELS.PAYMENT_TYPE.REFUND"
          :variant="row.type === 'INCOME' ? 'success' : 'warning'"
        />
      </template>

      <template #cell-status="{ row }">
        <AppBadge
          :label="getStatusBadge(row.status).label"
          :variant="getStatusBadge(row.status).variant"
          data-testid="payment-status"
        />
      </template>

      <template #cell-member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.member?.fullName || '?'" size="sm" />
          <div class="member-info">
            <span class="member-name">{{ row.member?.fullName || '—' }}</span>
            <span class="member-code text-caption text-tertiary">{{ row.member?.memberCode }}</span>
          </div>
        </div>
      </template>

      <template #cell-contract="{ row }">
        <NuxtLink v-if="row.contract?.contractNo" :to="`/contracts/${row.contract.id}`" class="contract-code">
          {{ row.contract.contractNo }}
        </NuxtLink>
        <span v-else class="text-tertiary">—</span>
      </template>

      <template #cell-paymentMethod="{ row }">
        <span>{{ getPaymentMethodLabel(row.paymentMethod) }}</span>
      </template>

      <template #cell-branch="{ row }">
        <span>{{ branchNameById[row.branchId] || '—' }}</span>
      </template>

      <template #cell-amount="{ row }">
        <span class="amount" :class="amountClass(row)" data-testid="payment-amount">
          {{ row.status === 'COMPLETED' && row.type === 'REFUND' ? '-' : '' }}{{ formatCurrency(row.amount) }}
        </span>
      </template>
    </DataTable>

    <!-- Pagination -->
    <DataPagination
      v-if="totalPages > 1"
      v-model="currentPage"
      :total-pages="totalPages"
    />
  </PageContainer>
</template>

<style scoped>
/* Stats Grid (Bento) */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-xl);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-income .stat-icon {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.stat-refund .stat-icon {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

.stat-net .stat-icon {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-number {
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  font-family: var(--font-mono);
}

.stat-number.negative {
  color: var(--color-error);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Filters */
.filters-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-xl);
}

.filters-row {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.search-box {
  flex: 0 0 280px;
}

.input-search {
  width: 100%;
}

.date-filters {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex: 1;
}

.date-shortcuts {
  display: flex;
  gap: var(--space-xs);
}

.shortcut-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.shortcut-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.shortcut-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.date-inputs {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.input-date {
  width: 150px;
}

.date-separator {
  color: var(--color-text-tertiary);
}

.filter-group {
  display: flex;
  gap: var(--space-md);
}

.filter-select {
  min-width: 140px;
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
  gap: 2px;
}

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 14px;
}

/* Contract Code */
.contract-code {
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

/* Amount */
.amount {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 15px;
}

.amount-income {
  color: var(--color-success);
}

.amount-refund {
  color: var(--color-warning);
}

/* Open (PENDING) or failed (FAILED) gateway checkouts are not money received */
.amount-muted {
  color: var(--color-text-tertiary);
}

/* Export */
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin-left: auto;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-accent-light);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
}

.export-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: white;
}

.export-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.stats-hint {
  margin: 0;
}

/* Responsive */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filters-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-box {
    flex: none;
    width: 100%;
  }

  .date-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    flex-direction: column;
  }
}
</style>
