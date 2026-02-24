<script setup lang="ts">
/**
 * 會員管理頁面
 *
 * Apple-style UI 設計
 * 使用 DataList 組件，卡片式呈現
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

// Modal state
const showModal = ref(false)
const selectedMember = ref<typeof members.value[0] | null>(null)

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'ACTIVE', label: '有效' },
  { value: 'EXPIRED', label: '過期' },
  { value: 'SUSPENDED', label: '暫停' },
  { value: 'BANNED', label: '停權' }
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

// Toggle selection
const toggleSelection = (id: string, event: Event) => {
  event.stopPropagation()
  const index = selectedIds.value.indexOf(id)
  if (index === -1) {
    selectedIds.value.push(id)
  } else {
    selectedIds.value.splice(index, 1)
  }
}

// Row click handler - open modal
const handleRowClick = (member: typeof members.value[0]) => {
  selectedMember.value = member
  showModal.value = true
}

// Batch action handlers
const handleBatchStatusUpdate = async (status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED' | 'INACTIVE') => {
  if (selectedIds.value.length === 0) return

  const statusLabels: Record<string, string> = {
    ACTIVE: '有效',
    SUSPENDED: '暫停',
    BANNED: '停權'
  }

  const confirmed = await confirm({
    title: '批量更新狀態',
    message: `確定要將 ${selectedIds.value.length} 位會員的狀態更新為「${statusLabels[status] || status}」嗎？`,
    confirmText: '確定更新',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await Promise.all(
      selectedIds.value.map(id => updateMember(id, { status }))
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
  const selectedMembers = members.value.filter(m => selectedIds.value.includes(m.id))
  const headers = ['會員編號', '姓名', '電話', 'Email', '狀態', '加入日期']
  const rows = selectedMembers.map(m => [
    m.memberCode,
    m.fullName,
    m.phone || '',
    m.email || '',
    m.status,
    m.joinDate ? new Date(m.joinDate).toLocaleDateString('zh-TW') : ''
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

// Get avatar variant based on status
const getAvatarVariant = (status: string) => {
  const variants: Record<string, 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray'> = {
    ACTIVE: 'blue',
    EXPIRED: 'gray',
    SUSPENDED: 'orange',
    BANNED: 'red'
  }
  return variants[status] || 'blue'
}

// Get branch name by ID
const getBranchName = (branchId: string | null | undefined) => {
  if (!branchId) return '—'
  const branch = branches.value.find(b => b.id === branchId)
  return branch?.name || '—'
}
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
        <div class="search-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            v-model="search"
            type="text"
            class="input input-search"
            :placeholder="PAGES.MEMBERS.SEARCH_PLACEHOLDER"
            @input="handleSearch"
          />
        </div>
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

    <!-- Batch Actions Bar -->
    <Transition name="slide-down">
      <div v-if="selectedIds.length > 0" class="batch-bar">
        <div class="batch-info">
          <div class="batch-check">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span class="batch-text">已選擇 <strong>{{ selectedIds.length }}</strong> 位會員</span>
          <button type="button" class="batch-clear" @click="selectedIds = []">
            取消選擇
          </button>
        </div>
        <div class="batch-actions">
          <button type="button" class="batch-btn" @click="handleExportSelected">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            匯出
          </button>
          <div class="batch-dropdown">
            <button type="button" class="batch-btn">
              狀態
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div class="dropdown-menu">
              <button type="button" @click="handleBatchStatusUpdate('ACTIVE')">
                <span class="status-dot status-active" />
                設為有效
              </button>
              <button type="button" @click="handleBatchStatusUpdate('SUSPENDED')">
                <span class="status-dot status-suspended" />
                設為暫停
              </button>
              <button type="button" @click="handleBatchStatusUpdate('BANNED')">
                <span class="status-dot status-banned" />
                設為停權
              </button>
            </div>
          </div>
          <button type="button" class="batch-btn batch-btn-danger" @click="handleBatchDelete">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            刪除
          </button>
        </div>
      </div>
    </Transition>

    <!-- Data List -->
    <DataList
      :data="members"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      :empty-title="PAGES.MEMBERS.NO_MEMBERS"
      :empty-description="PAGES.MEMBERS.NO_MEMBERS_HINT"
      empty-icon="users"
      :empty-action-label="PAGES.MEMBERS.ADD_MEMBER"
      empty-action-to="/members/new"
      row-clickable
      @row-click="handleRowClick"
    >
      <template #item="{ row }">
        <div class="member-row">
          <!-- Selection Checkbox -->
          <button
            type="button"
            :class="['member-checkbox', { checked: selectedIds.includes(row.id) }]"
            @click="toggleSelection(row.id, $event)"
          >
            <svg v-if="selectedIds.includes(row.id)" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>

          <!-- Main Content -->
          <div class="member-main">
            <AppAvatar
              :name="row.fullName"
              size="md"
              :variant="getAvatarVariant(row.status)"
            />
            <div class="member-info">
              <span class="member-name">{{ row.fullName }}</span>
              <code class="member-code">{{ row.memberCode }}</code>
            </div>
          </div>

          <!-- Meta Info -->
          <div class="member-meta">
            <span v-if="row.phone" class="meta-item meta-phone">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {{ row.phone }}
            </span>
            <span class="meta-item meta-branch hide-mobile">{{ getBranchName(row.branchId) }}</span>
            <AppBadge
              :label="getMemberStatusBadge(row.status).label"
              :variant="getMemberStatusBadge(row.status).variant"
            />
          </div>

          <!-- Chevron -->
          <svg class="member-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
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
    </DataList>

    <!-- Member Detail Modal - Apple Style -->
    <AppModal v-model="showModal" max-width="lg">
      <template #header>
        <!-- Empty header, we'll use custom hero -->
      </template>

      <div class="member-modal-content">
        <!-- Hero Section -->
        <div class="member-hero">
          <div class="hero-avatar-wrapper">
            <AppAvatar
              :name="selectedMember?.fullName"
              size="xl"
              :variant="getAvatarVariant(selectedMember?.status || 'ACTIVE')"
            />
            <div class="hero-status-indicator" :class="`status-${selectedMember?.status?.toLowerCase()}`" />
          </div>
          <div class="hero-info">
            <h2 class="hero-name">{{ selectedMember?.fullName }}</h2>
            <div class="hero-meta">
              <code class="hero-code">{{ selectedMember?.memberCode }}</code>
              <span class="hero-divider">•</span>
              <AppBadge
                v-if="selectedMember?.status"
                :label="getMemberStatusBadge(selectedMember.status).label"
                :variant="getMemberStatusBadge(selectedMember.status).variant"
                size="sm"
              />
            </div>
          </div>
        </div>

        <!-- Info Cards -->
        <div class="info-cards">
          <!-- Contact Card -->
          <div class="info-card">
            <div class="card-header">
              <div class="card-icon card-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <span class="card-title">聯絡資訊</span>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">電話</span>
                <span class="card-value" :class="{ 'value-link': selectedMember?.phone }">
                  <template v-if="selectedMember?.phone">
                    <a :href="`tel:${selectedMember.phone}`" class="phone-link">{{ selectedMember.phone }}</a>
                  </template>
                  <template v-else>
                    <span class="value-empty">未設定</span>
                  </template>
                </span>
              </div>
              <div class="card-row">
                <span class="card-label">Email</span>
                <span class="card-value">
                  <template v-if="selectedMember?.email">
                    <a :href="`mailto:${selectedMember.email}`" class="email-link">{{ selectedMember.email }}</a>
                  </template>
                  <template v-else>
                    <span class="value-empty">未設定</span>
                  </template>
                </span>
              </div>
            </div>
          </div>

          <!-- Branch Card -->
          <div class="info-card">
            <div class="card-header">
              <div class="card-icon card-icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <span class="card-title">所屬分店</span>
            </div>
            <div class="card-body">
              <div class="branch-display">
                <span class="branch-name">{{ getBranchName(selectedMember?.branchId) }}</span>
              </div>
            </div>
          </div>

          <!-- Personal Info Card -->
          <div class="info-card info-card-wide">
            <div class="card-header">
              <div class="card-icon card-icon-purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span class="card-title">個人資料</span>
            </div>
            <div class="card-body card-body-grid">
              <div class="card-row">
                <span class="card-label">性別</span>
                <span class="card-value">
                  {{ selectedMember?.gender === 'MALE' ? '男' : selectedMember?.gender === 'FEMALE' ? '女' : selectedMember?.gender === 'OTHER' ? '其他' : '未設定' }}
                </span>
              </div>
              <div class="card-row">
                <span class="card-label">生日</span>
                <span class="card-value">
                  {{ selectedMember?.birthday ? formatDate(selectedMember.birthday) : '未設定' }}
                </span>
              </div>
              <div class="card-row">
                <span class="card-label">加入日期</span>
                <span class="card-value">
                  {{ selectedMember?.joinDate ? formatDate(selectedMember.joinDate) : '未設定' }}
                </span>
              </div>
              <div class="card-row">
                <span class="card-label">身高</span>
                <span class="card-value">
                  {{ selectedMember?.height ? `${selectedMember.height} cm` : '未設定' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="modal-actions">
          <button class="action-btn action-btn-secondary" @click="showModal = false">
            關閉
          </button>
          <NuxtLink :to="`/members/${selectedMember?.id}`" class="action-btn action-btn-primary">
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
/* Search Wrapper */
.search-wrapper {
  position: relative;
  flex: 1;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-wrapper .input-search {
  padding-left: 42px;
}

.filter-select {
  min-width: 140px;
}

/* Member Row - Apple Style */
.member-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xs) 0;
}

/* Checkbox */
.member-checkbox {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.member-checkbox:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-light);
}

.member-checkbox.checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.member-checkbox.checked svg {
  color: white;
}

/* Main Info */
.member-main {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex: 1;
  min-width: 0;
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.member-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.member-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
}

/* Meta Info */
.member-meta {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-shrink: 0;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.meta-phone svg {
  opacity: 0.6;
}

.meta-branch {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Chevron */
.member-chevron {
  flex-shrink: 0;
  color: var(--color-text-quaternary);
  transition: transform 0.2s ease;
}

.data-list-item:hover .member-chevron {
  transform: translateX(2px);
  color: var(--color-text-tertiary);
}

/* Batch Bar - Apple Style */
.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: linear-gradient(135deg, var(--color-accent-light) 0%, rgba(59, 130, 246, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-md);
  backdrop-filter: blur(8px);
}

.batch-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.batch-check {
  width: 24px;
  height: 24px;
  background: var(--color-accent);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.batch-text {
  font-size: 14px;
  color: var(--color-text-primary);
}

.batch-text strong {
  font-weight: 600;
  color: var(--color-accent);
}

.batch-clear {
  font-size: 13px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.batch-clear:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.batch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.batch-btn:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-border-strong);
}

.batch-btn-danger {
  color: var(--color-error);
  border-color: var(--color-error);
  background: rgba(239, 68, 68, 0.05);
}

.batch-btn-danger:hover {
  background: var(--color-error);
  color: white;
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
  margin-top: 6px;
  min-width: 160px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s ease;
  z-index: 100;
  overflow: hidden;
  padding: 4px;
}

.dropdown-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s ease;
}

.dropdown-menu button:hover {
  background: var(--color-bg-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-active {
  background: var(--color-success);
}

.status-suspended {
  background: var(--color-warning);
}

.status-banned {
  background: var(--color-error);
}

/* Slide Down Animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ========================================
   Member Modal - Apple Style Design
   ======================================== */

.member-modal-content {
  padding: var(--space-md);
}

/* Hero Section */
.member-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-lg) 0 var(--space-xl);
  background: linear-gradient(180deg, var(--color-bg-secondary) 0%, transparent 100%);
  border-radius: var(--radius-xl);
  margin: calc(-1 * var(--space-md));
  margin-bottom: var(--space-lg);
}

.hero-avatar-wrapper {
  position: relative;
  margin-bottom: var(--space-md);
}

.hero-avatar-wrapper :deep(.avatar) {
  width: 88px !important;
  height: 88px !important;
  font-size: 32px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.hero-status-indicator {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid var(--color-bg-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.hero-status-indicator.status-active {
  background: linear-gradient(135deg, #34d399, #10b981);
}

.hero-status-indicator.status-expired {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

.hero-status-indicator.status-suspended {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
}

.hero-status-indicator.status-banned {
  background: linear-gradient(135deg, #f87171, #ef4444);
}

.hero-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.hero-name {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: -0.03em;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.hero-code {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  padding: 4px 10px;
  border-radius: var(--radius-full);
}

.hero-divider {
  color: var(--color-text-quaternary);
  font-size: 12px;
}

/* Info Cards */
.info-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.info-card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.info-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.info-card-wide {
  grid-column: span 2;
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.card-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon-blue {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
  color: #3b82f6;
}

.card-icon-green {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05));
  color: #10b981;
}

.card-icon-purple {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05));
  color: #8b5cf6;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.card-body-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.card-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.value-empty {
  color: var(--color-text-quaternary);
  font-weight: 400;
}

.phone-link,
.email-link {
  color: var(--color-accent);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.phone-link:hover,
.email-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.email-link {
  word-break: break-all;
}

/* Branch Display */
.branch-display {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.branch-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Modal Actions */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  border: none;
}

.action-btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.action-btn-secondary:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-border-strong);
}

.action-btn-primary {
  background: linear-gradient(135deg, var(--color-accent), #2563eb);
  color: white;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
}

.action-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.action-btn-primary:active {
  transform: translateY(0);
}

/* Responsive */
@media (max-width: 768px) {
  .hide-mobile {
    display: none;
  }

  .member-meta {
    gap: var(--space-md);
  }

  .batch-bar {
    flex-direction: column;
    gap: var(--space-md);
    align-items: stretch;
  }

  .batch-info {
    justify-content: center;
  }

  .batch-actions {
    justify-content: center;
    flex-wrap: wrap;
  }

  /* Modal Responsive */
  .info-cards {
    grid-template-columns: 1fr;
  }

  .info-card-wide {
    grid-column: span 1;
  }

  .card-body-grid {
    grid-template-columns: 1fr;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }

  .action-btn {
    width: 100%;
  }

  .hero-name {
    font-size: 22px;
  }

  .hero-avatar-wrapper :deep(.avatar) {
    width: 72px !important;
    height: 72px !important;
    font-size: 26px !important;
  }
}

@media (max-width: 480px) {
  .member-row {
    gap: var(--space-sm);
  }

  .meta-phone {
    display: none;
  }

  .member-modal-content {
    padding: var(--space-sm);
  }

  .member-hero {
    padding: var(--space-md) 0 var(--space-lg);
  }

  .info-card {
    padding: var(--space-md);
  }
}
</style>
