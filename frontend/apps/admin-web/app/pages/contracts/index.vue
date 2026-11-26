<script lang="ts">
import { MESSAGES, PAGES, STATUS } from '~/constants'

// Cached Intl formatter for exports
const exportDateFormatter = new Intl.DateTimeFormat('zh-TW')

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'DRAFT', label: STATUS.CONTRACT.DRAFT },
  { value: 'ACTIVE', label: STATUS.CONTRACT.ACTIVE },
  { value: 'PAUSED', label: STATUS.CONTRACT.PAUSED },
  { value: 'EXPIRED', label: STATUS.CONTRACT.EXPIRED },
  { value: 'CANCELLED', label: STATUS.CONTRACT.CANCELLED },
  { value: 'TRANSFERRED', label: STATUS.CONTRACT.TRANSFERRED }
]

// Table columns configuration
const columns = [
  { key: 'contractNo', label: PAGES.CONTRACTS.CONTRACT_NUMBER, slot: 'contractNo' },
  { key: 'member.fullName', label: PAGES.CONTRACTS.MEMBER, slot: 'member' },
  { key: 'plan.name', label: PAGES.CONTRACTS.PLAN },
  { key: 'startDate', label: PAGES.CONTRACTS.PERIOD, slot: 'period', hideOnMobile: true },
  { key: 'totalAmount', label: PAGES.CONTRACTS.AMOUNT, slot: 'amount', hideOnMobile: true },
  { key: 'paymentStatus', label: PAGES.CONTRACTS.PAYMENT_STATUS, slot: 'paymentStatus' },
  { key: 'status', label: PAGES.CONTRACTS.CONTRACT_STATUS, slot: 'contractStatus' }
]
</script>

<script setup lang="ts">
/**
 * 合約管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 * 支援批量選擇與匯出。狀態變更只在合約詳情頁進行（各自有專屬 API 與異動紀錄），
 * 因此不提供批量改狀態。
 */
import { TIMING } from '~/constants'
import { getContractStatusBadge, getPaymentStatusBadge } from '@gym-nexus/shared'
import type { ContractStatus, ContractView } from '~/composables/useContracts'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { contracts, isLoading, fetchContracts, getContractStats } = useContracts()
const { branches, fetchBranches } = useBranches()
const toast = useToast()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref<ContractStatus | ''>('')
const stats = ref({ active: 0, expired: 0, draft: 0 })

// Batch selection state
const selectedIds = ref<string[]>([])

// Stats configuration for StatsGrid
const statsConfig = computed(() => [
  { label: PAGES.CONTRACTS.ACTIVE_CONTRACTS, value: stats.value.active, icon: 'check' as const, variant: 'success' as const },
  { label: PAGES.CONTRACTS.EXPIRED_CONTRACTS, value: stats.value.expired, icon: 'alert' as const, variant: 'error' as const },
  { label: PAGES.CONTRACTS.DRAFT_CONTRACTS, value: stats.value.draft, icon: 'file' as const, variant: 'default' as const }
])

// Load contracts
const loadContracts = async () => {
  await fetchContracts({
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined,
    search: search.value || undefined
  })
}

const loadStats = async () => {
  stats.value = await getContractStats(selectedBranch.value || undefined)
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    selectedIds.value = [] // Clear selection on search
    loadContracts()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedBranch, selectedStatus], () => {
  selectedIds.value = [] // Clear selection on filter change
  Promise.all([loadContracts(), loadStats()])
})

// Initial load
onMounted(async () => {
  await Promise.all([loadContracts(), loadStats(), fetchBranches()])
})

onBeforeUnmount(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})

// Row click handler
const handleRowClick = (contract: ContractView) => {
  navigateTo(`/contracts/${contract.id}`)
}

const handleExportSelected = () => {
  // Export selected contracts to CSV
  const selectedSet = new Set(selectedIds.value)
  const selectedContracts = contracts.value.filter(c => selectedSet.has(c.id))
  const headers = ['合約編號', '會員', '方案', '開始日期', '結束日期', '金額', '付款狀態', '合約狀態']
  const rows = selectedContracts.map(c => [
    c.contractNo,
    c.member?.fullName || '',
    c.plan?.name || '',
    c.startDate ? exportDateFormatter.format(new Date(c.startDate)) : '',
    c.endDate ? exportDateFormatter.format(new Date(c.endDate)) : '',
    c.totalAmount,
    getPaymentStatusBadge(c.paymentStatus).label,
    getContractStatusBadge(c.status).label
  ])

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `contracts_export_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()

  toast.success(`成功匯出 ${selectedContracts.length} 份合約資料`)
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CONTRACTS.TITLE"
      :description="PAGES.CONTRACTS.DESCRIPTION"
      :action-label="PAGES.CONTRACTS.ADD_CONTRACT"
      action-to="/contracts/new"
      action-icon="file-plus"
    />

    <!-- Stats Grid -->
    <StatsGrid :stats="statsConfig" />

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          placeholder="搜尋合約編號、會員姓名..."
          @input="handleSearch"
        />
      </template>
      <template #filters>
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Data Table -->
    <DataTable
      v-model:selected="selectedIds"
      :data="contracts"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      :empty-title="PAGES.CONTRACTS.NO_CONTRACTS"
      :empty-description="PAGES.CONTRACTS.NO_CONTRACTS_HINT"
      empty-icon="files"
      :empty-action-label="PAGES.CONTRACTS.ADD_CONTRACT"
      empty-action-to="/contracts/new"
      row-clickable
      show-actions
      selectable
      @row-click="handleRowClick"
    >
      <!-- Batch Actions -->
      <template #batch-actions="{ count }">
        <div class="batch-toolbar">
          <div class="batch-info">
            <span class="batch-count">已選擇 {{ count }} 份合約</span>
            <button type="button" class="btn btn-ghost btn-small" @click="selectedIds = []">
              清除選擇
            </button>
          </div>
          <div class="batch-actions">
            <button type="button" class="btn btn-secondary btn-small" @click="handleExportSelected">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              匯出
            </button>
          </div>
        </div>
      </template>
      <!-- Contract Number Cell -->
      <template #contractNo="{ row }">
        <code class="item-code">{{ row.contractNo }}</code>
      </template>

      <!-- Member Cell -->
      <template #member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.member?.fullName" size="md" variant="blue" />
          <div class="member-info">
            <span class="member-name">{{ row.member?.fullName || '—' }}</span>
            <span class="member-code text-caption text-tertiary">{{ row.member?.memberCode }}</span>
          </div>
        </div>
      </template>

      <!-- Period Cell -->
      <template #period="{ row }">
        <div class="date-range">
          <span>{{ formatDate(row.startDate) }}</span>
          <span class="date-separator">→</span>
          <span>{{ formatDate(row.endDate) }}</span>
        </div>
      </template>

      <!-- Amount Cell -->
      <template #amount="{ row }">
        <span class="amount">{{ formatCurrency(row.totalAmount) }}</span>
      </template>

      <!-- Payment Status Cell -->
      <template #paymentStatus="{ row }">
        <AppBadge
          :label="getPaymentStatusBadge(row.paymentStatus).label"
          :variant="getPaymentStatusBadge(row.paymentStatus).variant"
        />
      </template>

      <!-- Contract Status Cell -->
      <template #contractStatus="{ row }">
        <AppBadge
          :label="getContractStatusBadge(row.status).label"
          :variant="getContractStatusBadge(row.status).variant"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/contracts/${row.id}`" class="action-btn" :title="MESSAGES.ACTIONS.VIEW_DETAILS">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
        </div>
      </template>
    </DataTable>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 160px;
}

.item-code {
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

.member-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
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

/* Actions */
.actions-row {
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

/* Batch Toolbar */
.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-accent-light);
  border-bottom: 1px solid var(--color-accent);
}

.batch-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.batch-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-accent);
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.batch-actions .btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
</style>
