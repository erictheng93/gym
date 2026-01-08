<script setup lang="ts">
/**
 * 會員管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 * 支援批量選擇和操作
 */
import { MESSAGES, PAGES, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { members, totalCount, isLoading, fetchMembers, updateMember, deleteMember } = useMembers()
const { branches, fetchBranches } = useBranches()
const toast = useToast()
const { confirm } = useConfirm()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

// Batch selection state
const selectedIds = ref<string[]>([])

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'ACTIVE', label: '有效' },
  { value: 'EXPIRED', label: '過期' },
  { value: 'SUSPENDED', label: '暫停' },
  { value: 'BANNED', label: '停權' }
]

// Table columns configuration
const columns = [
  { key: 'full_name', label: '會員', slot: 'member' },
  { key: 'member_code', label: '編號', slot: 'code' },
  { key: 'phone', label: '聯絡方式', slot: 'contact', hideOnMobile: true },
  { key: 'branch.name', label: '分店', hideOnMobile: true },
  { key: 'member_status', label: '狀態', slot: 'status' },
  { key: 'join_date', label: '加入日期', format: (v: string) => formatDate(v), hideOnMobile: true }
]

// Load members with current filters
const loadMembers = async () => {
  await fetchMembers({
    page: currentPage.value,
    limit: pageSize,
    search: search.value || undefined,
    branchId: selectedBranch.value || undefined,
    status: selectedStatus.value || undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadMembers()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedBranch, selectedStatus], () => {
  currentPage.value = 1
  loadMembers()
})

watch(currentPage, () => {
  loadMembers()
})

// Initial load
onMounted(async () => {
  await Promise.all([loadMembers(), fetchBranches()])
})

// Row click handler
const handleRowClick = (member: typeof members.value[0]) => {
  navigateTo(`/members/${member.id}`)
}

// Batch action handlers
const handleBatchStatusUpdate = async (status: string) => {
  if (selectedIds.value.length === 0) return

  const confirmed = await confirm({
    title: '批量更新狀態',
    message: `確定要將 ${selectedIds.value.length} 位會員的狀態更新為「${status === 'ACTIVE' ? '有效' : status === 'SUSPENDED' ? '暫停' : '停權'}」嗎？`,
    confirmText: '確定更新',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await Promise.all(
      selectedIds.value.map(id => updateMember(id, { member_status: status }))
    )
    toast.success(`成功更新 ${selectedIds.value.length} 位會員狀態`)
    selectedIds.value = []
    await loadMembers()
  } catch (error) {
    console.error('Failed to batch update:', error)
    toast.error('批量更新失敗')
  }
}

const handleBatchDelete = async () => {
  if (selectedIds.value.length === 0) return

  const confirmed = await confirm({
    title: '批量刪除',
    message: `確定要刪除 ${selectedIds.value.length} 位會員嗎？此操作無法復原。`,
    confirmText: '確定刪除',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  try {
    await Promise.all(selectedIds.value.map(id => deleteMember(id)))
    toast.success(`成功刪除 ${selectedIds.value.length} 位會員`)
    selectedIds.value = []
    await loadMembers()
  } catch (error) {
    console.error('Failed to batch delete:', error)
    toast.error('批量刪除失敗，部分會員可能有關聯合約')
  }
}

const handleExportSelected = () => {
  // Export selected members to CSV
  const selectedMembers = members.value.filter(m => selectedIds.value.includes(m.id))
  const headers = ['會員編號', '姓名', '電話', 'Email', '狀態', '加入日期']
  const rows = selectedMembers.map(m => [
    m.member_code,
    m.full_name,
    m.phone || '',
    m.email || '',
    m.member_status,
    m.join_date ? new Date(m.join_date).toLocaleDateString('zh-TW') : ''
  ])

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `members_export_${new Date().toISOString().split('T')[0]}.csv`
  link.click()

  toast.success(`成功匯出 ${selectedMembers.length} 位會員資料`)
}

// Clear selection when page changes
watch(currentPage, () => {
  selectedIds.value = []
})
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.MEMBERS.TITLE"
      :description="PAGES.MEMBERS.DESCRIPTION"
      :action-label="PAGES.MEMBERS.ADD_MEMBER"
      action-to="/members/new"
      action-icon="user-plus"
    />

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          :placeholder="PAGES.MEMBERS.SEARCH_PLACEHOLDER"
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

    <!-- Stats -->
    <StatsBar :count="totalCount" :label="MESSAGES.COMMON.MATCHES" />

    <!-- Data Table -->
    <DataTable
      v-model:selected="selectedIds"
      :data="members"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      :empty-title="PAGES.MEMBERS.NO_MEMBERS"
      :empty-description="PAGES.MEMBERS.NO_MEMBERS_HINT"
      empty-icon="users"
      :empty-action-label="PAGES.MEMBERS.ADD_MEMBER"
      empty-action-to="/members/new"
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
            <div class="batch-dropdown">
              <button type="button" class="btn btn-secondary btn-small">
                更新狀態
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div class="dropdown-menu">
                <button type="button" @click="handleBatchStatusUpdate('ACTIVE')">設為有效</button>
                <button type="button" @click="handleBatchStatusUpdate('SUSPENDED')">設為暫停</button>
                <button type="button" @click="handleBatchStatusUpdate('BANNED')">設為停權</button>
              </div>
            </div>
            <button type="button" class="btn btn-danger btn-small" @click="handleBatchDelete">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              刪除
            </button>
          </div>
        </div>
      </template>
      <!-- Member Cell -->
      <template #member="{ row }">
        <div class="member-cell">
          <AppAvatar :name="row.full_name" size="md" variant="blue" />
          <span class="member-name">{{ row.full_name }}</span>
        </div>
      </template>

      <!-- Code Cell -->
      <template #code="{ row }">
        <code class="item-code">{{ row.member_code }}</code>
      </template>

      <!-- Contact Cell -->
      <template #contact="{ row }">
        <div class="contact-cell">
          <span v-if="row.phone" class="phone">{{ row.phone }}</span>
          <span v-if="row.email" class="email text-caption text-tertiary">{{ row.email }}</span>
          <span v-if="!row.phone && !row.email" class="text-tertiary">—</span>
        </div>
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="getMemberStatusBadge(row.member_status).label"
          :variant="getMemberStatusBadge(row.member_status).variant"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/members/${row.id}`" class="action-btn" title="查看詳情">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
          <NuxtLink :to="`/members/${row.id}/edit`" class="action-btn" title="編輯">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
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
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Member Cell */
.member-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.member-name {
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

/* Contact Cell */
.contact-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phone {
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

/* Batch Dropdown */
.batch-dropdown {
  position: relative;
}

.batch-dropdown:hover .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-xs);
  min-width: 140px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: all var(--duration-fast) var(--ease-out);
  z-index: 100;
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  text-align: left;
  font-size: 14px;
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.dropdown-menu button:hover {
  background: var(--color-bg-secondary);
}

.dropdown-menu button:first-child {
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.dropdown-menu button:last-child {
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #e53935;
}
</style>
