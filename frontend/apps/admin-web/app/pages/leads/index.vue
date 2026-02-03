<script setup lang="ts">
/**
 * 潛在客戶管理頁面
 *
 * 支援篩選、批次操作、狀態管理
 */
import { MESSAGES, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const {
  leads,
  totalCount,
  isLoading,
  fetchLeads,
  deleteLead,
  assignLead,
  getStatusLabel,
  getStatusVariant,
  getSourceLabel
} = useLeads()
const { branches, fetchBranches } = useBranches()
const { employees, fetchEmployees } = useEmployees()
const toast = useToast()
const { confirm } = useConfirm()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref('')
const selectedSource = ref('')
const selectedAssignee = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

// Batch selection state
const selectedIds = ref<string[]>([])

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Status options
const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'NEW', label: '新建' },
  { value: 'CONTACTED', label: '已聯繫' },
  { value: 'TRIAL_BOOKED', label: '已預約體驗' },
  { value: 'VISITED', label: '已到訪' },
  { value: 'CONVERTED', label: '已轉換' },
  { value: 'LOST', label: '已流失' }
]

// Source options
const sourceOptions = [
  { value: '', label: '全部來源' },
  { value: 'FB_AD', label: 'Facebook 廣告' },
  { value: 'IG_AD', label: 'Instagram 廣告' },
  { value: 'GOOGLE_AD', label: 'Google 廣告' },
  { value: 'WEBSITE', label: '網站' },
  { value: 'WALK_IN', label: '現場' },
  { value: 'REFERRAL', label: '推薦' }
]

// Table columns configuration
const columns = [
  { key: 'name', label: '姓名', slot: 'name' },
  { key: 'phone', label: '電話' },
  { key: 'source', label: '來源', slot: 'source' },
  { key: 'status', label: '狀態', slot: 'status' },
  { key: 'assigned_to', label: '負責人', slot: 'assignee', hideOnMobile: true },
  { key: 'date_created', label: '建立日期', format: (v: string) => formatDate(v), hideOnMobile: true }
]

// Load leads with current filters
const loadLeads = async () => {
  await fetchLeads({
    page: currentPage.value,
    limit: pageSize,
    search: search.value || undefined,
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined,
    source: selectedSource.value || undefined,
    assignedTo: selectedAssignee.value || undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadLeads()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedBranch, selectedStatus, selectedSource, selectedAssignee], () => {
  currentPage.value = 1
  loadLeads()
})

watch(currentPage, () => {
  loadLeads()
})

// Initial load
onMounted(async () => {
  await Promise.all([loadLeads(), fetchBranches(), fetchEmployees()])
})

// Row click handler
const handleRowClick = (lead: typeof leads.value[0]) => {
  navigateTo(`/leads/${lead.id}`)
}

// Batch action handlers
const handleBatchAssign = async (employeeId: string) => {
  if (selectedIds.value.length === 0) return

  const confirmed = await confirm({
    title: '批量指派',
    message: `確定要將 ${selectedIds.value.length} 筆潛在客戶指派給此業務嗎？`,
    confirmText: '確定指派',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await Promise.all(
      selectedIds.value.map(id => assignLead(id, employeeId))
    )
    toast.success(`成功指派 ${selectedIds.value.length} 筆潛在客戶`)
    selectedIds.value = []
    await loadLeads()
  } catch (error) {
    console.error('Failed to batch assign:', error)
    toast.error('批量指派失敗')
  }
}

const handleBatchDelete = async () => {
  if (selectedIds.value.length === 0) return

  const confirmed = await confirm({
    title: '批量刪除',
    message: `確定要刪除 ${selectedIds.value.length} 筆潛在客戶嗎？此操作無法復原。`,
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await Promise.all(selectedIds.value.map(id => deleteLead(id)))
    toast.success(`成功刪除 ${selectedIds.value.length} 筆潛在客戶`)
    selectedIds.value = []
    await loadLeads()
  } catch (error) {
    console.error('Failed to batch delete:', error)
    toast.error('批量刪除失敗')
  }
}

const handleExportSelected = () => {
  const selectedLeads = leads.value.filter(l => selectedIds.value.includes(l.id))
  const headers = ['姓名', '電話', 'Email', '來源', '狀態', '建立日期']
  const rows = selectedLeads.map(l => [
    l.name,
    l.phone || '',
    l.email || '',
    getSourceLabel(l.source),
    getStatusLabel(l.status),
    l.date_created ? new Date(l.date_created).toLocaleDateString('zh-TW') : ''
  ])

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`
  link.click()

  toast.success(`成功匯出 ${selectedLeads.length} 筆潛在客戶資料`)
}

// Clear selection when page changes
watch(currentPage, () => {
  selectedIds.value = []
})

// Format date helper
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

// Assignee select modal
const showAssignModal = ref(false)
const assignEmployeeId = ref('')

const openAssignModal = () => {
  if (selectedIds.value.length === 0) {
    toast.warning('請先選擇要指派的潛在客戶')
    return
  }
  assignEmployeeId.value = ''
  showAssignModal.value = true
}

const confirmAssign = async () => {
  if (!assignEmployeeId.value) {
    toast.warning('請選擇負責人')
    return
  }
  await handleBatchAssign(assignEmployeeId.value)
  showAssignModal.value = false
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      title="潛在客戶管理"
      description="管理所有潛在客戶，追蹤跟進狀態"
      action-label="新增潛在客戶"
      action-to="/leads/new"
      action-icon="user-plus"
    />

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          placeholder="搜尋姓名、電話..."
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
        <select v-model="selectedSource" class="input filter-select">
          <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
      <template #actions>
        <NuxtLink to="/leads/analytics" class="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          數據分析
        </NuxtLink>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" label="筆潛在客戶" />

    <!-- Data Table -->
    <DataTable
      v-model:selected="selectedIds"
      :data="leads"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      empty-title="暫無潛在客戶"
      empty-description="點擊上方按鈕新增第一位潛在客戶"
      empty-icon="users"
      empty-action-label="新增潛在客戶"
      empty-action-to="/leads/new"
      row-clickable
      show-actions
      selectable
      @row-click="handleRowClick"
    >
      <!-- Batch Actions -->
      <template #batch-actions="{ count }">
        <div class="batch-toolbar">
          <div class="batch-info">
            <span class="batch-count">已選擇 {{ count }} 項</span>
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
            <button type="button" class="btn btn-secondary btn-small" @click="openAssignModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              指派
            </button>
            <button type="button" class="btn btn-danger btn-small" @click="handleBatchDelete">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              刪除
            </button>
          </div>
        </div>
      </template>

      <!-- Name Cell -->
      <template #name="{ row }">
        <div class="lead-cell">
          <AppAvatar :name="row.name" size="md" variant="purple" />
          <div class="lead-info">
            <span class="lead-name">{{ row.name }}</span>
            <span v-if="row.email" class="lead-email text-caption text-tertiary">{{ row.email }}</span>
          </div>
        </div>
      </template>

      <!-- Source Cell -->
      <template #source="{ row }">
        <span class="source-badge" :class="`source-${row.source.toLowerCase().replace('_', '-')}`">
          {{ getSourceLabel(row.source) }}
        </span>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getStatusLabel(row.status)"
          :variant="getStatusVariant(row.status)"
        />
      </template>

      <!-- Assignee Cell -->
      <template #assignee="{ row }">
        <div v-if="row.assigned_to && typeof row.assigned_to === 'object'" class="assignee-cell">
          <AppAvatar :name="row.assigned_to.full_name" size="sm" variant="blue" />
          <span>{{ row.assigned_to.full_name }}</span>
        </div>
        <span v-else class="text-tertiary">未指派</span>
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/leads/${row.id}`" class="action-btn" title="查看詳情">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
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

    <!-- Assign Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAssignModal" class="modal-overlay" @click.self="showAssignModal = false">
          <div class="modal-content modal-sm">
            <div class="modal-header">
              <h3>指派負責人</h3>
              <button class="modal-close" @click="showAssignModal = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">選擇負責人</label>
                <select v-model="assignEmployeeId" class="input">
                  <option value="">請選擇</option>
                  <option v-for="emp in employees" :key="emp.id" :value="emp.id">
                    {{ emp.full_name }}
                  </option>
                </select>
              </div>
              <p class="assign-hint text-secondary">
                將 {{ selectedIds.length }} 筆潛在客戶指派給選定的負責人
              </p>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showAssignModal = false">取消</button>
              <button class="btn btn-primary" @click="confirmAssign">確定指派</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Lead Cell */
.lead-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.lead-info {
  display: flex;
  flex-direction: column;
}

.lead-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.lead-email {
  font-size: 12px;
}

/* Source Badge */
.source-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.source-fb-ad {
  background: rgba(66, 103, 178, 0.15);
  color: #4267b2;
}

.source-ig-ad {
  background: rgba(225, 48, 108, 0.15);
  color: #e1306c;
}

.source-google-ad {
  background: rgba(219, 68, 55, 0.15);
  color: #db4437;
}

.source-website {
  background: rgba(0, 122, 255, 0.15);
  color: #007aff;
}

.source-walk-in {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.source-referral {
  background: rgba(175, 82, 222, 0.15);
  color: #af52de;
}

/* Assignee Cell */
.assignee-cell {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
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

.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #e53935;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-lg);
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  padding: var(--space-xl);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-top: 1px solid var(--color-divider);
}

.form-group {
  margin-bottom: var(--space-lg);
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: var(--space-sm);
}

.assign-hint {
  font-size: 13px;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s var(--ease-out);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(20px);
}
</style>
