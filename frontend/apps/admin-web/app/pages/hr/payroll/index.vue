<script setup lang="ts">
/**
 * 薪資管理頁面
 */
import { MESSAGES, PAGINATION } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const { confirm } = useConfirm()

const {
  salaryRecords,
  totalCount,
  isLoading,
  fetchSalaryRecords,
  approveSalary,
  markAsPaid,
  getStatusLabel,
  getStatusVariant,
  formatCurrency
} = usePayroll()
const { branches, fetchBranches } = useBranches()

// Filter state
const selectedPeriod = ref(getCurrentPeriod())
const selectedBranch = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'PENDING', label: '待審核' },
  { value: 'APPROVED', label: '已核准' },
  { value: 'PAID', label: '已發放' }
]

// Get current period (YYYY-MM)
function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Generate period options (last 12 months)
const periodOptions = computed(() => {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
    options.push({ value, label })
  }
  return options
})

// Load records
const loadRecords = async () => {
  await fetchSalaryRecords({
    page: currentPage.value,
    limit: pageSize,
    period: selectedPeriod.value || undefined,
    branch_id: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined
  })
}

// Watch filters
watch([selectedPeriod, selectedBranch, selectedStatus], () => {
  currentPage.value = 1
  loadRecords()
})

watch(currentPage, loadRecords)

onMounted(async () => {
  await Promise.all([loadRecords(), fetchBranches()])
})

// Row click
const handleRowClick = (record: typeof salaryRecords.value[0]) => {
  navigateTo(`/hr/payroll/${record.id}`)
}

// Batch approval
const selectedIds = ref<string[]>([])

const handleBatchApprove = async () => {
  if (selectedIds.value.length === 0) {
    toast.warning('請先選擇要核准的薪資紀錄')
    return
  }

  const confirmed = await confirm({
    title: '批量核准',
    message: `確定要核准 ${selectedIds.value.length} 筆薪資紀錄嗎？`,
    confirmText: '確定核准',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    for (const id of selectedIds.value) {
      await approveSalary(id)
    }
    toast.success(`已核准 ${selectedIds.value.length} 筆薪資紀錄`)
    selectedIds.value = []
    await loadRecords()
  } catch (error) {
    console.error('Failed to batch approve:', error)
    toast.error('批量核准失敗')
  }
}

// Summary stats
const summaryStats = computed(() => {
  const pending = salaryRecords.value.filter(r => r.status === 'PENDING').length
  const approved = salaryRecords.value.filter(r => r.status === 'APPROVED').length
  const paid = salaryRecords.value.filter(r => r.status === 'PAID').length
  const totalAmount = salaryRecords.value.reduce((sum, r) => sum + (r.net_salary || 0), 0)
  return { pending, approved, paid, totalAmount }
})

// Table columns
const columns = [
  { key: 'employee', label: '員工', slot: 'employee' },
  { key: 'period', label: '薪資期間' },
  { key: 'base_salary', label: '底薪', slot: 'base' },
  { key: 'net_salary', label: '實發金額', slot: 'net' },
  { key: 'status', label: '狀態', slot: 'status' }
]
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="薪資管理"
      description="管理員工薪資計算、核准與發放"
    >
      <template #actions>
        <NuxtLink to="/hr/payroll/generate" class="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          產生薪資
        </NuxtLink>
        <NuxtLink to="/hr/payroll/export" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          匯出報表
        </NuxtLink>
        <NuxtLink to="/hr/promotions" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          異動紀錄
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Summary Stats -->
    <section class="summary-stats">
      <div class="stat-card">
        <div class="stat-icon warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-label">待審核</span>
          <span class="stat-value">{{ summaryStats.pending }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-label">已核准</span>
          <span class="stat-value">{{ summaryStats.approved }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-label">已發放</span>
          <span class="stat-value">{{ summaryStats.paid }}</span>
        </div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-icon accent">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-label">本期總額</span>
          <span class="stat-value amount">{{ formatCurrency(summaryStats.totalAmount) }}</span>
        </div>
      </div>
    </section>

    <!-- Filters -->
    <FilterBar>
      <template #filters>
        <select v-model="selectedPeriod" class="input filter-select">
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
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
      <template #actions>
        <button
          v-if="selectedIds.length > 0"
          class="btn btn-primary"
          @click="handleBatchApprove"
        >
          批量核准 ({{ selectedIds.length }})
        </button>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="筆薪資紀錄" />

    <!-- Data Table -->
    <DataTable
      v-model:selected="selectedIds"
      :data="salaryRecords"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無薪資紀錄"
      empty-description="點擊「產生薪資」按鈕開始計算本月薪資"
      empty-icon="dollar-sign"
      row-clickable
      selectable
      @row-click="handleRowClick"
    >
      <!-- Employee Cell -->
      <template #employee="{ row }">
        <div class="employee-cell">
          <AppAvatar :name="row.employee?.full_name || '?'" size="md" variant="blue" />
          <div class="employee-info">
            <span class="employee-name">{{ row.employee?.full_name }}</span>
            <span class="employee-code text-caption text-tertiary">{{ row.employee?.employee_code }}</span>
          </div>
        </div>
      </template>

      <!-- Base Salary Cell -->
      <template #base="{ row }">
        <span class="salary-amount">{{ formatCurrency(row.base_salary || 0) }}</span>
      </template>

      <!-- Net Salary Cell -->
      <template #net="{ row }">
        <span class="salary-amount highlight">{{ formatCurrency(row.net_salary || 0) }}</span>
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

/* Summary Stats */
.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.stat-card.highlight {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));
  border-color: var(--color-accent);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.warning {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.stat-icon.success {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.stat-icon.primary {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.stat-icon.accent {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stat-value.amount {
  font-size: 20px;
}

/* Employee Cell */
.employee-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.employee-info {
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Salary Amount */
.salary-amount {
  font-weight: 500;
  color: var(--color-text-primary);
}

.salary-amount.highlight {
  color: var(--color-accent);
  font-weight: 600;
}

/* Responsive */
@media (max-width: 1024px) {
  .summary-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .summary-stats {
    grid-template-columns: 1fr;
  }
}
</style>
