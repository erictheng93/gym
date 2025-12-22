<script setup lang="ts">
/**
 * 會員管理頁面
 *
 * 使用 @gym-nexus/ui 組件庫重構
 * 代碼量從 ~500 行減少到 ~150 行
 */
import { MESSAGES, PAGES, PAGINATION, TIMING } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { members, totalCount, isLoading, fetchMembers } = useMembers()
const { branches, fetchBranches } = useBranches()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

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
      @row-click="handleRowClick"
    >
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
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </NuxtLink>
          <NuxtLink :to="`/members/${row.id}/edit`" class="action-btn" title="編輯">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
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
</style>
