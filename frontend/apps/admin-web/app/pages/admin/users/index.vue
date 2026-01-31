<script setup lang="ts">
/**
 * Admin User Management - List Page
 * 使用者管理列表頁面
 */

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { confirm } = useConfirm()
const { users, isLoading, pagination, fetchUsers, deleteUser, toggleUserStatus } = useUsers()

const searchQuery = ref('')
const filterRole = ref<string>('')
const filterStatus = ref<string>('')

// Role labels
const roleLabels: Record<string, string> = {
  admin: '管理員',
  manager: '經理',
  coach: '教練',
  staff: '員工',
  super_admin: '超級管理員'
}

// Status labels
const statusLabels = {
  active: { label: '啟用', class: 'badge-success' },
  inactive: { label: '停用', class: 'badge-error' }
}

// Fetch users with filters
const loadUsers = async () => {
  await fetchUsers({
    page: pagination.value.page,
    limit: pagination.value.limit,
    search: searchQuery.value || undefined,
    role: filterRole.value || undefined,
    isActive: filterStatus.value ? filterStatus.value === 'active' : undefined
  })
}

// Watch for filter changes
watch([searchQuery, filterRole, filterStatus], () => {
  pagination.value.page = 1
  loadUsers()
}, { debounce: 300 } as any)

// Handle page change
const handlePageChange = (page: number) => {
  pagination.value.page = page
  loadUsers()
}

// Handle delete
const handleDelete = async (user: any) => {
  const confirmed = await confirm({
    title: '確認刪除',
    message: `確定要刪除使用者「${user.email}」嗎？此操作無法復原。`,
    confirmText: '刪除',
    confirmVariant: 'error'
  })

  if (confirmed) {
    await deleteUser(user.id)
  }
}

// Handle toggle status
const handleToggleStatus = async (user: any) => {
  const action = user.isActive ? '停用' : '啟用'
  const confirmed = await confirm({
    title: `確認${action}`,
    message: `確定要${action}使用者「${user.email}」嗎？`,
    confirmText: action,
    confirmVariant: user.isActive ? 'warning' : 'success'
  })

  if (confirmed) {
    await toggleUserStatus(user.id, !user.isActive)
  }
}

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load data on mount
onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="admin-users">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">使用者管理</h1>
        <p class="text-body text-secondary">管理系統使用者帳號與權限</p>
      </div>
      <div class="header-actions">
        <NuxtLink to="/admin/users/new" class="btn btn-primary">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新增使用者
        </NuxtLink>
      </div>
    </header>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ pagination.total }}</div>
          <div class="stat-label">總使用者數</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4 12 14.01l-3-3" />
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ users.filter(u => u.isActive).length }}</div>
          <div class="stat-label">啟用中</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ users.filter(u => u.role === 'admin').length }}</div>
          <div class="stat-label">管理員</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-input">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋 Email..."
          class="input"
        />
      </div>

      <select v-model="filterRole" class="select">
        <option value="">所有角色</option>
        <option value="admin">管理員</option>
        <option value="manager">經理</option>
        <option value="coach">教練</option>
        <option value="staff">員工</option>
      </select>

      <select v-model="filterStatus" class="select">
        <option value="">所有狀態</option>
        <option value="active">啟用</option>
        <option value="inactive">停用</option>
      </select>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

    <!-- Users Table -->
    <div v-else-if="users.length > 0" class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>角色</th>
            <th>關聯員工</th>
            <th>狀態</th>
            <th>最後登入</th>
            <th>建立時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>
              <div class="user-email">
                <span class="email">{{ user.email }}</span>
                <span v-if="user.emailVerified" class="verified-badge" title="已驗證">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                </span>
              </div>
            </td>
            <td>
              <span class="badge badge-role">{{ roleLabels[user.role] || user.role }}</span>
            </td>
            <td>
              <span v-if="user.employee">
                {{ user.employee.fullName }}
                <span class="text-secondary text-small">({{ user.employee.employeeCode }})</span>
              </span>
              <span v-else class="text-tertiary">-</span>
            </td>
            <td>
              <span
                class="badge"
                :class="user.isActive ? 'badge-success' : 'badge-error'"
              >
                {{ user.isActive ? '啟用' : '停用' }}
              </span>
            </td>
            <td class="text-secondary">{{ formatDate(user.lastLoginAt) }}</td>
            <td class="text-secondary">{{ formatDate(user.createdAt) }}</td>
            <td>
              <div class="action-buttons">
                <NuxtLink
                  :to="`/admin/users/${user.id}`"
                  class="btn btn-sm btn-ghost"
                  title="編輯"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </NuxtLink>
                <button
                  class="btn btn-sm btn-ghost"
                  :class="user.isActive ? 'text-warning' : 'text-success'"
                  :title="user.isActive ? '停用' : '啟用'"
                  @click="handleToggleStatus(user)"
                >
                  <svg v-if="user.isActive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M4.93 4.93l14.14 14.14" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4 12 14.01l-3-3" />
                  </svg>
                </button>
                <button
                  class="btn btn-sm btn-ghost text-error"
                  title="刪除"
                  @click="handleDelete(user)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <h3>尚無使用者</h3>
      <p>開始新增第一個系統使用者</p>
      <NuxtLink to="/admin/users/new" class="btn btn-primary">
        新增使用者
      </NuxtLink>
    </div>

    <!-- Pagination -->
    <div v-if="pagination.totalPages > 1" class="pagination">
      <button
        class="btn btn-sm btn-ghost"
        :disabled="pagination.page <= 1"
        @click="handlePageChange(pagination.page - 1)"
      >
        上一頁
      </button>
      <span class="pagination-info">
        第 {{ pagination.page }} / {{ pagination.totalPages }} 頁
      </span>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="pagination.page >= pagination.totalPages"
        @click="handlePageChange(pagination.page + 1)"
      >
        下一頁
      </button>
    </div>
  </div>
</template>

<style scoped>
.admin-users {
  padding: var(--space-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  margin: 0 0 var(--space-xs);
  font-size: 1.5rem;
  font-weight: 600;
}

.header-content p {
  margin: 0;
  color: var(--color-text-secondary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
}

.stat-icon svg {
  width: 24px;
  height: 24px;
  color: white;
}

.stat-icon.bg-primary { background: var(--color-accent); }
.stat-icon.bg-success { background: #10b981; }
.stat-icon.bg-warning { background: #f59e0b; }
.stat-icon.bg-error { background: #ef4444; }

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.filter-bar {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.search-input {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: var(--space-sm);
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--color-text-tertiary);
}

.search-input .input {
  width: 100%;
  padding-left: 40px;
}

.input, .select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.select {
  min-width: 140px;
}

.table-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: var(--space-md);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  background: var(--color-bg-tertiary);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.data-table tbody tr:hover {
  background: var(--color-bg-tertiary);
}

.user-email {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.verified-badge {
  color: #10b981;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-role {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.badge-success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.badge-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.badge-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.text-secondary { color: var(--color-text-secondary); }
.text-tertiary { color: var(--color-text-tertiary); }
.text-small { font-size: 0.75rem; }
.text-warning { color: #f59e0b; }
.text-success { color: #10b981; }
.text-error { color: #ef4444; }

.action-buttons {
  display: flex;
  gap: var(--space-xs);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
  text-decoration: none;
}

.btn-primary {
  background: var(--color-accent);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.btn-ghost:hover {
  background: var(--color-bg-tertiary);
}

.btn-sm {
  padding: var(--space-xs) var(--space-sm);
}

.btn .icon {
  width: 16px;
  height: 16px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-md);
}

.empty-state h3 {
  margin: 0 0 var(--space-xs);
  font-size: 1.125rem;
}

.empty-state p {
  margin: 0 0 var(--space-lg);
  color: var(--color-text-secondary);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.pagination-info {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .filter-bar {
    flex-direction: column;
  }

  .search-input {
    width: 100%;
  }

  .data-table {
    font-size: 0.875rem;
  }

  .data-table th,
  .data-table td {
    padding: var(--space-sm);
  }
}
</style>
