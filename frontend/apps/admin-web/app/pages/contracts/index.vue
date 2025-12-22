<script setup lang="ts">
/**
 * 合約管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { MESSAGES, PAGES, STATUS, LABELS } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { contracts, isLoading, fetchContracts, getContractStats } = useContracts()
const { branches, fetchBranches } = useBranches()

// Filter state
const selectedBranch = ref('')
const selectedStatus = ref('')
const stats = ref({ active: 0, expired: 0, draft: 0 })

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'DRAFT', label: STATUS.CONTRACT.DRAFT },
  { value: 'ACTIVE', label: STATUS.CONTRACT.ACTIVE },
  { value: 'PAUSED', label: STATUS.CONTRACT.PAUSED },
  { value: 'EXPIRED', label: STATUS.CONTRACT.EXPIRED },
  { value: 'TERMINATED', label: STATUS.CONTRACT.TERMINATED }
]

// Stats configuration for StatsGrid
const statsConfig = computed(() => [
  { label: PAGES.CONTRACTS.ACTIVE_CONTRACTS, value: stats.value.active, icon: 'check' as const, variant: 'success' as const },
  { label: PAGES.CONTRACTS.EXPIRED_CONTRACTS, value: stats.value.expired, icon: 'alert' as const, variant: 'error' as const },
  { label: PAGES.CONTRACTS.DRAFT_CONTRACTS, value: stats.value.draft, icon: 'file' as const, variant: 'default' as const }
])

// Table columns configuration
const columns = [
  { key: 'contract_no', label: PAGES.CONTRACTS.CONTRACT_NUMBER, slot: 'contractNo' },
  { key: 'member_id.full_name', label: PAGES.CONTRACTS.MEMBER, slot: 'member' },
  { key: 'plan_id.name', label: PAGES.CONTRACTS.PLAN },
  { key: 'start_date', label: PAGES.CONTRACTS.PERIOD, slot: 'period', hideOnMobile: true },
  { key: 'total_amount', label: PAGES.CONTRACTS.AMOUNT, slot: 'amount', hideOnMobile: true },
  { key: 'payment_status', label: PAGES.CONTRACTS.PAYMENT_STATUS, slot: 'paymentStatus' },
  { key: 'contract_status', label: PAGES.CONTRACTS.CONTRACT_STATUS, slot: 'contractStatus' }
]

// Load contracts
const loadContracts = async () => {
  await fetchContracts({
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined
  })
}

const loadStats = async () => {
  stats.value = await getContractStats(selectedBranch.value || undefined)
}

// Watch filters
watch([selectedBranch, selectedStatus], () => {
  loadContracts()
  loadStats()
})

// Initial load
onMounted(async () => {
  await Promise.all([loadContracts(), loadStats(), fetchBranches()])
})

// Row click handler
const handleRowClick = (contract: typeof contracts.value[0]) => {
  navigateTo(`/contracts/${contract.id}`)
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
    <FilterBar :show-search="false">
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
      @row-click="handleRowClick"
    >
      <!-- Contract Number Cell -->
      <template #contractNo="{ row }">
        <code class="item-code">{{ row.contract_no }}</code>
      </template>

      <!-- Member Cell -->
      <template #member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.member_id?.full_name" size="md" variant="blue" />
          <div class="member-info">
            <span class="member-name">{{ row.member_id?.full_name || '—' }}</span>
            <span class="member-code text-caption text-tertiary">{{ row.member_id?.member_code }}</span>
          </div>
        </div>
      </template>

      <!-- Period Cell -->
      <template #period="{ row }">
        <div class="date-range">
          <span>{{ formatDate(row.start_date) }}</span>
          <span class="date-separator">→</span>
          <span>{{ formatDate(row.end_date) }}</span>
        </div>
      </template>

      <!-- Amount Cell -->
      <template #amount="{ row }">
        <span class="amount">{{ formatCurrency(row.total_amount) }}</span>
      </template>

      <!-- Payment Status Cell -->
      <template #paymentStatus="{ row }">
        <AppBadge
          :label="getPaymentStatusBadge(row.payment_status).label"
          :variant="getPaymentStatusBadge(row.payment_status).variant"
        />
      </template>

      <!-- Contract Status Cell -->
      <template #contractStatus="{ row }">
        <AppBadge
          :label="getContractStatusBadge(row.contract_status).label"
          :variant="getContractStatusBadge(row.contract_status).variant"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/contracts/${row.id}`" class="action-btn" :title="MESSAGES.ACTIONS.VIEW_DETAILS">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
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
</style>
