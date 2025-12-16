<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { contracts, isLoading, fetchContracts, getContractStats } = useContracts()
const { branches, fetchBranches } = useBranches()

const selectedBranch = ref('')
const selectedStatus = ref('')
const stats = ref({ active: 0, expired: 0, draft: 0 })

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '有效' },
  { value: 'PAUSED', label: '暫停中' },
  { value: 'EXPIRED', label: '已過期' },
  { value: 'TERMINATED', label: '已終止' }
]

const loadContracts = async () => {
  await fetchContracts({
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined
  })
}

const loadStats = async () => {
  stats.value = await getContractStats(selectedBranch.value || undefined)
}

watch([selectedBranch, selectedStatus], () => {
  loadContracts()
  loadStats()
})

onMounted(async () => {
  await Promise.all([loadContracts(), loadStats(), fetchBranches()])
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    DRAFT: { label: '草稿', class: '' },
    ACTIVE: { label: '有效', class: 'badge-success' },
    PAUSED: { label: '暫停中', class: 'badge-warning' },
    EXPIRED: { label: '已過期', class: 'badge-error' },
    TERMINATED: { label: '已終止', class: 'badge-error' }
  }
  return map[status] || { label: status, class: '' }
}

const getPaymentStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    UNPAID: { label: '未付款', class: 'badge-error' },
    PARTIAL: { label: '部分付款', class: 'badge-warning' },
    PAID: { label: '已付清', class: 'badge-success' }
  }
  return map[status] || { label: status, class: '' }
}
</script>

<template>
  <div class="contracts-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">合約管理</h1>
        <p class="text-body text-secondary">管理會員合約與簽約流程</p>
      </div>
      <NuxtLink to="/contracts/new" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
          <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          <path d="M12 18v-6"/>
          <path d="M9 15h6"/>
        </svg>
        新增合約
      </NuxtLink>
    </header>

    <!-- Stats Cards (Bento Grid) -->
    <div class="stats-grid">
      <div class="stat-card glass-card stat-active">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number">{{ stats.active }}</span>
          <span class="stat-label">有效合約</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-expired">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" x2="12" y1="8" y2="12"/>
            <line x1="12" x2="12.01" y1="16" y2="16"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number">{{ stats.expired }}</span>
          <span class="stat-label">已過期</span>
        </div>
      </div>

      <div class="stat-card glass-card stat-draft">
        <div class="stat-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-number">{{ stats.draft }}</span>
          <span class="stat-label">草稿</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar glass-card-flat">
      <div class="filter-group">
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">全部分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>

        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Contracts Table -->
    <div class="table-card card">
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner-large" />
        <p class="text-secondary mt-md">載入中...</p>
      </div>

      <div v-else-if="contracts.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
            <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          </svg>
        </div>
        <h3 class="text-title-3">尚無合約資料</h3>
        <p class="text-secondary">新增第一份合約開始使用系統</p>
        <NuxtLink to="/contracts/new" class="btn btn-primary mt-lg">新增合約</NuxtLink>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>合約編號</th>
            <th>會員</th>
            <th>方案</th>
            <th>期間</th>
            <th>金額</th>
            <th>付款狀態</th>
            <th>合約狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(contract, index) in contracts" :key="contract.id" class="stagger-item" :style="{ animationDelay: `${index * 0.03}s` }">
            <td>
              <code class="contract-code">{{ contract.contract_no }}</code>
            </td>
            <td>
              <div class="member-cell">
                <div class="member-avatar">{{ contract.member?.full_name?.[0] || '?' }}</div>
                <div class="member-info">
                  <span class="member-name">{{ contract.member?.full_name || '—' }}</span>
                  <span class="member-code-small text-caption text-tertiary">{{ contract.member?.member_code }}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="plan-name">{{ contract.plan?.name || '—' }}</span>
            </td>
            <td>
              <div class="date-range">
                <span>{{ formatDate(contract.start_date) }}</span>
                <span class="date-separator">→</span>
                <span>{{ formatDate(contract.end_date) }}</span>
              </div>
            </td>
            <td>
              <span class="amount">NT$ {{ contract.total_amount?.toLocaleString() || 0 }}</span>
            </td>
            <td>
              <span :class="['badge', getPaymentStatusBadge(contract.payment_status).class]">
                {{ getPaymentStatusBadge(contract.payment_status).label }}
              </span>
            </td>
            <td>
              <span :class="['badge', getStatusBadge(contract.contract_status).class]">
                {{ getStatusBadge(contract.contract_status).label }}
              </span>
            </td>
            <td>
              <div class="actions-cell">
                <NuxtLink :to="`/contracts/${contract.id}`" class="action-btn" title="查看詳情">
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
    </div>
  </div>
</template>

<style scoped>
.contracts-page {
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

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-active .stat-icon {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.stat-expired .stat-icon {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.stat-draft .stat-icon {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-number {
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

@keyframes statAppear {
  from { opacity: 0; transform: translateY(20px); }
}

/* Filters */
.filters-bar {
  display: flex;
  gap: var(--space-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: filtersAppear 0.6s var(--ease-out) 0.25s backwards;
}

@keyframes filtersAppear {
  from { opacity: 0; transform: translateY(10px); }
}

.filter-group {
  display: flex;
  gap: var(--space-md);
}

.filter-select {
  min-width: 160px;
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

/* Contract Code */
.contract-code {
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

/* Member Cell */
.member-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
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
}

/* Plan Name */
.plan-name {
  font-weight: 500;
}

/* Date Range */
.date-range {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.date-separator {
  color: var(--color-text-tertiary);
}

/* Amount */
.amount {
  font-weight: 600;
  font-family: var(--font-mono);
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

/* Responsive */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filters-bar {
    flex-direction: column;
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
