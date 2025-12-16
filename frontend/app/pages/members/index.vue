<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { members, totalCount, isLoading, fetchMembers } = useMembers()
const { branches, fetchBranches } = useBranches()

const search = ref('')
const selectedBranch = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = 20

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'ACTIVE', label: '有效' },
  { value: 'EXPIRED', label: '過期' },
  { value: 'SUSPENDED', label: '暫停' },
  { value: 'BANNED', label: '停權' }
]

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

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
  }, 300)
}

watch([selectedBranch, selectedStatus], () => {
  currentPage.value = 1
  loadMembers()
})

watch(currentPage, () => {
  loadMembers()
})

onMounted(async () => {
  await Promise.all([loadMembers(), fetchBranches()])
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: '有效', class: 'badge-success' },
    EXPIRED: { label: '過期', class: 'badge-error' },
    SUSPENDED: { label: '暫停', class: 'badge-warning' },
    BANNED: { label: '停權', class: 'badge-error' }
  }
  return map[status] || { label: status, class: '' }
}
</script>

<template>
  <div class="members-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">會員管理</h1>
        <p class="text-body text-secondary">管理所有會員資料與狀態</p>
      </div>
      <NuxtLink to="/members/new" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" x2="19" y1="8" y2="14"/>
          <line x1="22" x2="16" y1="11" y2="11"/>
        </svg>
        新增會員
      </NuxtLink>
    </header>

    <!-- Filters -->
    <div class="filters-bar glass-card-flat">
      <div class="search-wrapper">
        <input
          v-model="search"
          type="text"
          class="input input-search"
          placeholder="搜尋會員姓名、編號或電話..."
          @input="handleSearch"
        />
      </div>

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

    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-number">{{ totalCount }}</span>
        <span class="stat-label text-caption text-secondary">符合條件</span>
      </div>
    </div>

    <!-- Members Table -->
    <div class="table-card card">
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner-large" />
        <p class="text-secondary mt-md">載入中...</p>
      </div>

      <div v-else-if="members.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h3 class="text-title-3">尚無會員資料</h3>
        <p class="text-secondary">新增第一位會員開始使用系統</p>
        <NuxtLink to="/members/new" class="btn btn-primary mt-lg">新增會員</NuxtLink>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>會員</th>
            <th>編號</th>
            <th>聯絡方式</th>
            <th>分店</th>
            <th>狀態</th>
            <th>加入日期</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(member, index) in members" :key="member.id" class="stagger-item" :style="{ animationDelay: `${index * 0.03}s` }">
            <td>
              <div class="member-cell">
                <div class="member-avatar">{{ member.full_name[0] }}</div>
                <span class="member-name">{{ member.full_name }}</span>
              </div>
            </td>
            <td>
              <code class="member-code">{{ member.member_code }}</code>
            </td>
            <td>
              <div class="contact-cell">
                <span v-if="member.phone" class="phone">{{ member.phone }}</span>
                <span v-if="member.email" class="email text-caption text-tertiary">{{ member.email }}</span>
                <span v-if="!member.phone && !member.email" class="text-tertiary">—</span>
              </div>
            </td>
            <td>
              <span class="branch-name">{{ member.branch?.name || '—' }}</span>
            </td>
            <td>
              <span :class="['badge', getStatusBadge(member.member_status).class]">
                {{ getStatusBadge(member.member_status).label }}
              </span>
            </td>
            <td>
              <span class="text-secondary">{{ member.join_date ? formatDate(member.join_date) : '—' }}</span>
            </td>
            <td>
              <div class="actions-cell">
                <NuxtLink :to="`/members/${member.id}`" class="action-btn" title="查看詳情">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </NuxtLink>
                <NuxtLink :to="`/members/${member.id}/edit`" class="action-btn" title="編輯">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                  </svg>
                </NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button
          class="btn btn-ghost btn-small"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          上一頁
        </button>
        <span class="page-info text-secondary">
          第 {{ currentPage }} / {{ totalPages }} 頁
        </span>
        <button
          class="btn btn-ghost btn-small"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          下一頁
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.members-page {
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
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

/* Filters */
.filters-bar {
  display: flex;
  gap: var(--space-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: filtersAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.1s;
}

@keyframes filtersAppear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.search-wrapper {
  flex: 1;
  max-width: 400px;
}

.filter-group {
  display: flex;
  gap: var(--space-md);
}

.filter-select {
  min-width: 140px;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-lg);
  padding: 0 var(--space-sm);
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.stat-number {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Table Card */
.table-card {
  overflow: hidden;
  animation: tableAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.2s;
}

@keyframes tableAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
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

.member-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.member-code {
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

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

.page-info {
  font-size: 14px;
}

/* Responsive */
@media (max-width: 1024px) {
  .filters-bar {
    flex-direction: column;
  }

  .search-wrapper {
    max-width: none;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }
}
</style>