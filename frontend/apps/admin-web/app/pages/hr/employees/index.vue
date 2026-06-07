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

// Get avatar variant based on status
const getEmployeeStatusVariant = (status: string): 'green' | 'gray' | 'blue' | 'red' | 'orange' | 'pink' | 'purple' => {
  const map: Record<string, 'green' | 'gray' | 'orange'> = {
    ACTIVE: 'green',
    RESIGNED: 'gray',
    LEAVE: 'orange'
  }
  return map[status] || 'green'
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

    <!-- Data List -->
    <DataList
      :data="employees"
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
      <template #item="{ row }">
        <div class="employee-row">
          <div class="employee-main">
            <AppAvatar :name="row.fullName" size="md" variant="green" />
            <div class="employee-info">
              <span class="employee-name">{{ row.fullName }}</span>
              <code class="employee-code">{{ row.employeeCode || '—' }}</code>
            </div>
          </div>
          <div class="employee-meta">
            <span class="meta-item hide-mobile">{{ row.jobTitle?.name || '—' }}</span>
            <span class="meta-item hide-mobile">{{ row.branch?.name || '—' }}</span>
            <AppBadge
              :label="getEmployeeStatusBadge(row.status).label"
              :variant="getEmployeeStatusBadge(row.status).variant"
            />
          </div>
        </div>
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
    </DataList>

    <!-- Employee Detail Modal - Apple Style -->
    <AppModal v-model="showModal" max-width="lg">
      <template #header>
        <!-- Empty header, we'll use custom hero -->
      </template>

      <div class="employee-modal-content">
        <!-- Hero Section -->
        <div class="employee-hero">
          <div class="hero-avatar-wrapper">
            <AppAvatar
              :name="selectedEmployee?.fullName"
              size="xl"
              :variant="getEmployeeStatusVariant(selectedEmployee?.status || 'ACTIVE')"
            />
            <div
              class="hero-status-indicator"
              :class="`status-${selectedEmployee?.status?.toLowerCase()}`"
            />
          </div>
          <div class="hero-info">
            <h2 class="hero-name">{{ selectedEmployee?.fullName }}</h2>
            <div class="hero-meta">
              <code class="hero-code">{{ selectedEmployee?.employeeCode }}</code>
              <span class="hero-divider">•</span>
              <AppBadge
                v-if="selectedEmployee?.status"
                :label="getEmployeeStatusBadge(selectedEmployee.status).label"
                :variant="getEmployeeStatusBadge(selectedEmployee.status).variant"
                size="sm"
              />
            </div>
          </div>
        </div>

        <!-- Info Cards -->
        <div class="info-cards">
          <!-- Job Card -->
          <div class="info-card">
            <div class="card-icon card-icon-green">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">職務資訊</h3>
              <div class="card-grid">
                <div class="card-field">
                  <span class="field-label">職位</span>
                  <span class="field-value">{{ selectedEmployee?.jobTitle?.name || '—' }}</span>
                </div>
                <div class="card-field">
                  <span class="field-label">分店</span>
                  <span class="field-value">{{ selectedEmployee?.branch?.name || '—' }}</span>
                </div>
                <div class="card-field">
                  <span class="field-label">聘用類型</span>
                  <span class="field-value">
                    <AppBadge
                      v-if="selectedEmployee?.employmentType"
                      :label="getEmploymentTypeBadge(selectedEmployee.employmentType).label"
                      :variant="getEmploymentTypeBadge(selectedEmployee.employmentType).variant"
                      size="sm"
                    />
                    <template v-else>—</template>
                  </span>
                </div>
                <div class="card-field">
                  <span class="field-label">基本薪資</span>
                  <span class="field-value">
                    {{ selectedEmployee?.basicSalary ? formatCurrency(Number(selectedEmployee.basicSalary)) : '—' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Contact Card -->
          <div class="info-card">
            <div class="card-icon card-icon-blue">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">聯絡方式</h3>
              <div class="card-grid">
                <div class="card-field">
                  <span class="field-label">電話</span>
                  <span class="field-value">{{ selectedEmployee?.phone || '—' }}</span>
                </div>
                <div class="card-field">
                  <span class="field-label">Email</span>
                  <span class="field-value field-value-email">{{ selectedEmployee?.email || '—' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Additional Info Card -->
          <div class="info-card info-card-full">
            <div class="card-icon card-icon-purple">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">其他資訊</h3>
              <div class="card-grid card-grid-3">
                <div class="card-field">
                  <span class="field-label">加入日期</span>
                  <span class="field-value">
                    {{ selectedEmployee?.createdAt ? formatDate(selectedEmployee.createdAt) : '—' }}
                  </span>
                </div>
                <div class="card-field">
                  <span class="field-label">狀態</span>
                  <span class="field-value">
                    <AppBadge
                      v-if="selectedEmployee?.status"
                      :label="getEmployeeStatusBadge(selectedEmployee.status).label"
                      :variant="getEmployeeStatusBadge(selectedEmployee.status).variant"
                      size="sm"
                    />
                    <template v-else>—</template>
                  </span>
                </div>
                <div class="card-field">
                  <span class="field-label">員工編號</span>
                  <span class="field-value">
                    <code class="field-code">{{ selectedEmployee?.employeeCode || '—' }}</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="modal-actions">
          <button class="action-btn action-btn-secondary" @click="showModal = false">
            關閉
          </button>
          <NuxtLink :to="`/hr/employees/${selectedEmployee?.id}`" class="action-btn action-btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
              <path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" />
              <path d="M15 2v5h5" />
            </svg>
            查看完整檔案
          </NuxtLink>
        </div>
      </div>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Employee Row */
.employee-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.employee-main {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.employee-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.employee-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.employee-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.employee-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.meta-item {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* ============================================
   Apple Style Modal
   ============================================ */

.employee-modal-content {
  padding: 0;
}

/* Hero Section */
.employee-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-xl) var(--space-lg);
  background: linear-gradient(180deg, rgba(52, 199, 89, 0.08) 0%, transparent 100%);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-lg)) 0;
}

.hero-avatar-wrapper {
  position: relative;
  margin-bottom: var(--space-md);
}

.hero-avatar-wrapper :deep(.avatar) {
  width: 88px !important;
  height: 88px !important;
  font-size: 32px;
  box-shadow: 0 4px 20px rgba(52, 199, 89, 0.25);
}

.hero-status-indicator {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid var(--color-bg-primary);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.hero-status-indicator.status-active {
  background: var(--color-success);
}

.hero-status-indicator.status-resigned {
  background: var(--color-text-tertiary);
}

.hero-status-indicator.status-leave {
  background: var(--color-warning);
}

.hero-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.hero-name {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.hero-code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.hero-divider {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

/* Info Cards */
.info-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  padding: var(--space-lg) 0;
}

.info-card {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.info-card-full {
  grid-column: 1 / -1;
}

.card-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon-green {
  background: rgba(52, 199, 89, 0.15);
  color: #34C759;
}

.card-icon-blue {
  background: rgba(0, 122, 255, 0.15);
  color: #007AFF;
}

.card-icon-purple {
  background: rgba(175, 82, 222, 0.15);
  color: #AF52DE;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  margin: 0 0 var(--space-sm) 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.card-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.card-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.field-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.field-value-email {
  word-break: break-all;
}

.field-code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

/* Action Buttons */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
  margin-top: var(--space-md);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 500;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  text-decoration: none;
  border: none;
}

.action-btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.action-btn-secondary:hover {
  background: var(--color-bg-tertiary);
}

.action-btn-primary {
  background: linear-gradient(180deg, #34C759 0%, #28a745 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(52, 199, 89, 0.35);
}

.action-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(52, 199, 89, 0.45);
}

/* Responsive */
@media (max-width: 640px) {
  .hide-mobile {
    display: none;
  }

  .info-cards {
    grid-template-columns: 1fr;
  }

  .card-grid,
  .card-grid-3 {
    grid-template-columns: 1fr;
  }

  .modal-actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
