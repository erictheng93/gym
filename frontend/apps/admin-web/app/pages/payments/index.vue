<script setup lang="ts">
/**
 * 收款管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { MESSAGES, PAGES, LABELS, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const { payments, totalCount, isLoading, fetchPayments, getPaymentStats } = usePayments()
const { branches, fetchBranches } = useBranches()

const search = ref('')
const selectedBranch = ref('')
const selectedType = ref('')
const startDate = ref('')
const endDate = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const stats = ref({ income: { count: 0, amount: 0 }, refund: { count: 0, amount: 0 }, netAmount: 0 })

const typeOptions = [
  { value: '', label: PAGES.PAYMENTS.ALL_TYPES },
  { value: 'INCOME', label: LABELS.PAYMENT_TYPE.INCOME },
  { value: 'REFUND', label: LABELS.PAYMENT_TYPE.REFUND }
]

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const loadPayments = async () => {
  await fetchPayments({
    page: currentPage.value,
    limit: pageSize,
    branchId: selectedBranch.value || undefined,
    paymentType: selectedType.value || undefined,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    search: search.value || undefined
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

watch([selectedBranch, selectedType, startDate, endDate], () => {
  currentPage.value = 1
  loadPayments()
  loadStats()
})

watch(currentPage, () => {
  loadPayments()
})

onMounted(async () => {
  await Promise.all([loadPayments(), loadStats(), fetchBranches()])
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return '—'
  const map: Record<string, string> = {
    CASH: LABELS.PAYMENT_METHOD.CASH,
    CREDIT_CARD: LABELS.PAYMENT_METHOD.CREDIT_CARD,
    LINE_PAY: LABELS.PAYMENT_METHOD.LINE_PAY,
    TRANSFER: LABELS.PAYMENT_METHOD.BANK_TRANSFER
  }
  return map[method] || method
}

// 設定日期快捷選項
const setDateRange = (range: string) => {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  switch (range) {
    case 'today':
      startDate.value = todayStr
      endDate.value = todayStr
      break
    case 'week':
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      startDate.value = weekAgo.toISOString().split('T')[0]
      endDate.value = todayStr
      break
    case 'month':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1)
      startDate.value = monthAgo.toISOString().split('T')[0]
      endDate.value = todayStr
      break
    case 'all':
      startDate.value = ''
      endDate.value = ''
      break
  }
}

// Table columns config
const columns = [
  { key: 'payment_date', label: PAGES.PAYMENTS.DATE },
  { key: 'payment_type', label: PAGES.PAYMENTS.TYPE },
  { key: 'member', label: PAGES.PAYMENTS.MEMBER },
  { key: 'contract', label: PAGES.PAYMENTS.CONTRACT_NO },
  { key: 'payment_method', label: PAGES.PAYMENTS.PAYMENT_METHOD },
  { key: 'branch', label: PAGES.PAYMENTS.BRANCH },
  { key: 'amount', label: PAGES.PAYMENTS.AMOUNT },
  { key: 'actions', label: '', width: '60px' }
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
          <span class="stat-number">{{ formatCurrency(stats.income.amount) }}</span>
          <span class="stat-label">{{ PAGES.PAYMENTS.TOTAL_PAYMENT }} ({{ stats.income.count }} {{ PAGES.PAYMENTS.ENTRIES }})</span>
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
          <span class="stat-number">{{ formatCurrency(stats.refund.amount) }}</span>
          <span class="stat-label">{{ PAGES.PAYMENTS.TOTAL_REFUND }} ({{ stats.refund.count }} {{ PAGES.PAYMENTS.ENTRIES }})</span>
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
          <span class="stat-number" :class="{ negative: stats.netAmount < 0 }">
            {{ formatCurrency(stats.netAmount) }}
          </span>
          <span class="stat-label">{{ PAGES.PAYMENTS.NET_PAYMENT }}</span>
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

        <select v-model="selectedType" class="input filter-select">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Stats Bar -->
    <StatsBar :total="totalCount" :label="MESSAGES.COMMON.MATCHES" />

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
      <template #cell-payment_date="{ row }">
        <span class="date-cell">{{ formatDate(row.payment_date) }}</span>
      </template>

      <template #cell-payment_type="{ row }">
        <AppBadge
          :label="row.payment_type === 'INCOME' ? LABELS.PAYMENT_TYPE.INCOME : LABELS.PAYMENT_TYPE.REFUND"
          :variant="row.payment_type === 'INCOME' ? 'success' : 'warning'"
        />
      </template>

      <template #cell-member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.member?.full_name || '?'" size="sm" />
          <div class="member-info">
            <span class="member-name">{{ row.member?.full_name || '—' }}</span>
            <span class="member-code text-caption text-tertiary">{{ row.member?.member_code }}</span>
          </div>
        </div>
      </template>

      <template #cell-contract="{ row }">
        <code v-if="row.contract?.contract_no" class="contract-code">{{ row.contract.contract_no }}</code>
        <span v-else class="text-tertiary">—</span>
      </template>

      <template #cell-payment_method="{ row }">
        <span>{{ getPaymentMethodLabel(row.payment_method) }}</span>
      </template>

      <template #cell-branch="{ row }">
        <span>{{ row.branch?.name || '—' }}</span>
      </template>

      <template #cell-amount="{ row }">
        <span class="amount" :class="row.payment_type === 'INCOME' ? 'amount-income' : 'amount-refund'">
          {{ row.payment_type === 'REFUND' ? '-' : '' }}{{ formatCurrency(row.amount) }}
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div class="actions-cell">
          <NuxtLink :to="`/payments/${row.id}`" class="action-btn" title="查看詳情">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
        </div>
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

/* Actions Cell */
.actions-cell {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
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
