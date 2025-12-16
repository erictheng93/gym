<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { payments, totalCount, isLoading, fetchPayments, getPaymentStats } = usePayments()
const { branches, fetchBranches } = useBranches()

const selectedBranch = ref('')
const selectedType = ref('')
const startDate = ref('')
const endDate = ref('')
const currentPage = ref(1)
const pageSize = 20

const stats = ref({ income: { count: 0, amount: 0 }, refund: { count: 0, amount: 0 }, netAmount: 0 })

const typeOptions = [
  { value: '', label: '全部類型' },
  { value: 'INCOME', label: '收款' },
  { value: 'REFUND', label: '退款' }
]

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const loadPayments = async () => {
  await fetchPayments({
    page: currentPage.value,
    limit: pageSize,
    branchId: selectedBranch.value || undefined,
    paymentType: selectedType.value || undefined,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined
  })
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

const formatCurrency = (amount: number) => {
  return `NT$ ${amount.toLocaleString()}`
}

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return '—'
  const map: Record<string, string> = {
    CASH: '現金',
    CREDIT_CARD: '信用卡',
    LINE_PAY: 'LINE Pay',
    TRANSFER: '匯款'
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
</script>

<template>
  <div class="payments-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">收款管理</h1>
        <p class="text-body text-secondary">收款紀錄、退款與對帳</p>
      </div>
      <NuxtLink to="/payments/new" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        新增收款
      </NuxtLink>
    </header>

    <!-- Stats Cards (Bento Grid) -->
    <div class="stats-grid">
      <div class="stat-card glass-card stat-income">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number">{{ formatCurrency(stats.income.amount) }}</span>
          <span class="stat-label">收款金額 ({{ stats.income.count }} 筆)</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-refund">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 7 9 13 3 19"/>
            <line x1="21" x2="9" y1="13" y2="13"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number">{{ formatCurrency(stats.refund.amount) }}</span>
          <span class="stat-label">退款金額 ({{ stats.refund.count }} 筆)</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-net large-stat">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" x2="12" y1="2" y2="22"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number" :class="{ negative: stats.netAmount < 0 }">
            {{ formatCurrency(stats.netAmount) }}
          </span>
          <span class="stat-label">淨收款</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar glass-card-flat">
      <div class="date-filters">
        <div class="date-shortcuts">
          <button class="shortcut-btn" :class="{ active: !startDate && !endDate }" @click="setDateRange('all')">全部</button>
          <button class="shortcut-btn" @click="setDateRange('today')">今日</button>
          <button class="shortcut-btn" @click="setDateRange('week')">本週</button>
          <button class="shortcut-btn" @click="setDateRange('month')">本月</button>
        </div>
        <div class="date-inputs">
          <input v-model="startDate" type="date" class="input input-date" placeholder="開始日期" />
          <span class="date-separator">—</span>
          <input v-model="endDate" type="date" class="input input-date" placeholder="結束日期" />
        </div>
      </div>

      <div class="filter-group">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">全部分店</option>
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
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-number-small">{{ totalCount }}</span>
        <span class="stat-label-small text-caption text-secondary">符合條件</span>
      </div>
    </div>

    <!-- Payments Table -->
    <div class="table-card card">
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner-large" />
        <p class="text-secondary mt-md">載入中...</p>
      </div>

      <div v-else-if="payments.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <h3 class="text-title-3">尚無收款紀錄</h3>
        <p class="text-secondary">新增第一筆收款開始記錄</p>
        <NuxtLink to="/payments/new" class="btn btn-primary mt-lg">新增收款</NuxtLink>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>類型</th>
            <th>會員</th>
            <th>合約編號</th>
            <th>付款方式</th>
            <th>分店</th>
            <th>金額</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(payment, index) in payments" :key="payment.id" class="stagger-item" :style="{ animationDelay: `${index * 0.03}s` }">
            <td>
              <span class="date-cell">{{ formatDate(payment.payment_date) }}</span>
            </td>
            <td>
              <span class="type-badge" :class="payment.payment_type === 'INCOME' ? 'type-income' : 'type-refund'">
                {{ payment.payment_type === 'INCOME' ? '收款' : '退款' }}
              </span>
            </td>
            <td>
              <div class="member-cell">
                <div class="member-avatar">{{ payment.member?.full_name?.[0] || '?' }}</div>
                <div class="member-info">
                  <span class="member-name">{{ payment.member?.full_name || '—' }}</span>
                  <span class="member-code-small text-caption text-tertiary">{{ payment.member?.member_code }}</span>
                </div>
              </div>
            </td>
            <td>
              <code v-if="payment.contract?.contract_no" class="contract-code">{{ payment.contract.contract_no }}</code>
              <span v-else class="text-tertiary">—</span>
            </td>
            <td>
              <span class="method-label">{{ getPaymentMethodLabel(payment.payment_method) }}</span>
            </td>
            <td>
              <span class="branch-name">{{ payment.branch?.name || '—' }}</span>
            </td>
            <td>
              <span class="amount" :class="payment.payment_type === 'INCOME' ? 'amount-income' : 'amount-refund'">
                {{ payment.payment_type === 'REFUND' ? '-' : '' }}{{ formatCurrency(payment.amount) }}
              </span>
            </td>
            <td>
              <div class="actions-cell">
                <NuxtLink :to="`/payments/${payment.id}`" class="action-btn" title="查看詳情">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button
          class="btn btn-ghost btn-small"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          上一頁
        </button>
        <span class="page-info text-secondary">
          第 {{ currentPage }} / {{ totalPages }} 頁
        </span>
        <button
          class="btn btn-ghost btn-small"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          下一頁
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.payments-page {
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  animation: headerAppear 0.6s var(--ease-out) backwards;
}

@keyframes headerAppear {
  from { opacity: 0; transform: translateY(-10px); }
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

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
  animation: statAppear 0.6s var(--ease-out) backwards;
}

.stat-card:nth-child(1) { animation-delay: 0.1s; }
.stat-card:nth-child(2) { animation-delay: 0.15s; }
.stat-card:nth-child(3) { animation-delay: 0.2s; }

.large-stat {
  background: linear-gradient(135deg, var(--color-bg-glass) 0%, rgba(0, 113, 227, 0.1) 100%);
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

@keyframes statAppear {
  from { opacity: 0; transform: translateY(20px); }
}

/* Filters */
.filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: filtersAppear 0.6s var(--ease-out) 0.25s backwards;
}

@keyframes filtersAppear {
  from { opacity: 0; transform: translateY(10px); }
}

.date-filters {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
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

/* Stats Bar */
.stats-bar {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-lg);
  padding: 0 var(--space-sm);
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.stat-number-small {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Table Card */
.table-card {
  overflow: hidden;
  animation: tableAppear 0.6s var(--ease-out) 0.3s backwards;
}

@keyframes tableAppear {
  from { opacity: 0; transform: translateY(20px); }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.loading-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-lg);
}

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: var(--space-md) var(--space-lg);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-divider);
}

.data-table td {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-divider);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr {
  transition: background var(--duration-fast) var(--ease-out);
}

.data-table tbody tr:hover {
  background: var(--color-bg-secondary);
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
}

.type-income {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.type-refund {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

/* Member Cell */
.member-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
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

/* Method Label */
.method-label {
  font-size: 14px;
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
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.data-table tbody tr:hover .actions-cell {
  opacity: 1;
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

/* Stagger Animation */
.stagger-item {
  opacity: 0;
  transform: translateY(10px);
  animation: staggerIn 0.4s var(--ease-out) forwards;
}

@keyframes staggerIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.page-info {
  font-size: 14px;
}

/* Responsive */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .date-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
    align-items: stretch;
  }

  .page-header .btn {
    width: 100%;
  }
}
</style>
