<script setup lang="ts">
/**
 * 員工管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 */
import { TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { employees, totalCount, isLoading, fetchEmployees } = useEmployees()
const { branches, fetchBranches } = useBranches()
const { jobTitles, fetchJobTitles } = useJobTitles()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref('')
const selectedJobTitle = ref('')
const currentPage = ref(1)
const pageSize = 20

// Modal state
const showModal = ref(false)
const selectedEmployee = ref<typeof employees.value[0] | null>(null)

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Status options
const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'ACTIVE', label: '在職' },
  { value: 'RESIGNED', label: '離職' },
  { value: 'LEAVE', label: '留停' }
]

// Table columns configuration
const columns = [
  { key: 'fullName', label: '員工', slot: 'employee' },
  { key: 'employeeCode', label: '編號', slot: 'code' },
  { key: 'jobTitle.name', label: '職位', hideOnMobile: true },
  { key: 'branch.name', label: '分店', hideOnMobile: true },
  { key: 'employmentType', label: '聘用類型', slot: 'employmentType', hideOnMobile: true },
  { key: 'status', label: '狀態', slot: 'status' },
  { key: 'createdAt', label: '加入日期', format: (v: string) => formatDate(v), hideOnMobile: true }
]

// Load employees
const loadEmployees = async () => {
  await fetchEmployees({
    page: currentPage.value,
    limit: pageSize,
    search: search.value || undefined,
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined,
    jobTitleId: selectedJobTitle.value || undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadEmployees()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedBranch, selectedStatus, selectedJobTitle], () => {
  currentPage.value = 1
  loadEmployees()
})

watch(currentPage, () => {
  loadEmployees()
})

// Initial load
onMounted(async () => {
  await Promise.all([loadEmployees(), fetchBranches(), fetchJobTitles()])
})

// Row click handler - open modal
const handleRowClick = (employee: typeof employees.value[0]) => {
  selectedEmployee.value = employee
  showModal.value = true
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="員工管理"
      description="管理所有員工資料與權限"
      action-label="新增員工"
      action-to="/hr/employees/new"
      action-icon="user-plus"
    />

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          placeholder="搜尋員工姓名或編號..."
          @input="handleSearch"
        />
      </template>
      <template #filters>
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">全部分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <select v-model="selectedJobTitle" class="input filter-select">
          <option value="">全部職位</option>
          <option v-for="jobTitle in jobTitles" :key="jobTitle.id" :value="jobTitle.id">
            {{ jobTitle.name }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="符合條件" />

    <!-- Data Table -->
    <DataTable
      :data="employees"
      :columns="columns"
      :loading="isLoading"
      loading-message="載入中..."
      empty-title="尚無員工資料"
      empty-description="新增第一位員工開始使用系統"
      empty-icon="users"
      empty-action-label="新增員工"
      empty-action-to="/hr/employees/new"
      row-clickable
      @row-click="handleRowClick"
    >
      <!-- Employee Cell -->
      <template #employee="{ row }">
        <div class="employee-cell">
          <AppAvatar :name="row.fullName" size="md" variant="green" />
          <span class="employee-name">{{ row.fullName }}</span>
        </div>
      </template>

      <!-- Code Cell -->
      <template #code="{ row }">
        <code class="item-code">{{ row.employeeCode || '—' }}</code>
      </template>

      <!-- Employment Type Cell -->
      <template #employmentType="{ row }">
        <AppBadge
          :label="getEmploymentTypeBadge(row.employmentType).label"
          :variant="getEmploymentTypeBadge(row.employmentType).variant"
        />
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getEmployeeStatusBadge(row.status).label"
          :variant="getEmployeeStatusBadge(row.status).variant"
        />
      </template>

      <!-- Pagination -->
      <template #footer>
        <DataPagination
          v-model="currentPage"
          :total-pages="totalPages"
          prev-label="上一頁"
          next-label="下一頁"
        />
      </template>
    </DataTable>

    <!-- Employee Detail Modal -->
    <AppModal v-model="showModal" max-width="md">
      <template #header>
        <AppAvatar :name="selectedEmployee?.fullName" size="lg" variant="green" />
        <div>
          <h2 class="modal-title">{{ selectedEmployee?.fullName }}</h2>
          <p class="modal-subtitle">{{ selectedEmployee?.employeeCode }}</p>
        </div>
      </template>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">職位</span>
          <span class="detail-value">{{ selectedEmployee?.jobTitle?.name || '—' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">分店</span>
          <span class="detail-value">{{ selectedEmployee?.branch?.name || '—' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">聘用類型</span>
          <AppBadge
            v-if="selectedEmployee?.employmentType"
            :label="getEmploymentTypeBadge(selectedEmployee.employmentType).label"
            :variant="getEmploymentTypeBadge(selectedEmployee.employmentType).variant"
          />
          <span v-else>—</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">狀態</span>
          <AppBadge
            v-if="selectedEmployee?.status"
            :label="getEmployeeStatusBadge(selectedEmployee.status).label"
            :variant="getEmployeeStatusBadge(selectedEmployee.status).variant"
          />
          <span v-else>—</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">電話</span>
          <span class="detail-value">{{ selectedEmployee?.phone || '—' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Email</span>
          <span class="detail-value">{{ selectedEmployee?.email || '—' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">基本薪資</span>
          <span class="detail-value">
            {{ selectedEmployee?.basicSalary ? formatCurrency(Number(selectedEmployee.basicSalary)) : '—' }}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">加入日期</span>
          <span class="detail-value">
            {{ selectedEmployee?.createdAt ? formatDate(selectedEmployee.createdAt) : '—' }}
          </span>
        </div>
      </div>

      <template #footer>
        <button class="btn btn-ghost" @click="showModal = false">關閉</button>
        <NuxtLink :to="`/hr/employees/${selectedEmployee?.id}/edit`" class="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
          編輯員工
        </NuxtLink>
      </template>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Employee Cell */
.employee-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.employee-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.item-code {
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

/* Modal */
.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
  font-family: var(--font-mono);
}

/* Detail Grid */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.detail-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}

.detail-value {
  font-size: 15px;
  color: var(--color-text-primary);
}

/* Responsive */
@media (max-width: 640px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
