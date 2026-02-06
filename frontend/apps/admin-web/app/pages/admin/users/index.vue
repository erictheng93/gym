<script setup lang="ts">
/**
 * Admin User Management - List Page
 * 使用者管理列表頁面
 */

definePageMeta({
  middleware: 'auth'
})

const { confirm } = useConfirm()
const { users, isLoading, pagination, fetchUsers, deleteUser, toggleUserStatus } = useUsers()

const searchQuery = ref('')
const filterRole = ref<string>('')
const filterStatus = ref<string>('')

// Modal state
const showModal = ref(false)
const selectedUser = ref<typeof users.value[0] | null>(null)

// Role labels
const roleLabels: Record<string, string> = {
  admin: '管理員',
  manager: '經理',
  coach: '教練',
  staff: '員工',
  super_admin: '超級管理員'
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

// Row click handler - open modal
const handleRowClick = (user: typeof users.value[0]) => {
  selectedUser.value = user
  showModal.value = true
}

// Get user initials from email
const getUserInitial = (email: string) => {
  return email.charAt(0).toUpperCase()
}

// Get role badge color class
const getRoleBadgeClass = (role: string) => {
  const classes: Record<string, string> = {
    admin: 'badge-error',
    super_admin: 'badge-error',
    manager: 'badge-warning',
    coach: 'badge-info',
    staff: 'badge-default'
  }
  return classes[role] || 'badge-default'
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
          <tr v-for="user in users" :key="user.id" class="clickable-row" @click="handleRowClick(user)">
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
              <div class="action-buttons" @click.stop>
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

    <!-- User Detail Modal -->
    <AppModal v-model="showModal" max-width="lg">
      <template #header>
        <!-- Empty header, using custom hero instead -->
      </template>

      <div class="user-modal-content">
        <!-- Hero Section -->
        <div class="user-hero">
          <div class="hero-avatar-wrapper">
            <div class="hero-avatar" :class="selectedUser?.isActive ? 'avatar-active' : 'avatar-inactive'">
              {{ getUserInitial(selectedUser?.email || '') }}
            </div>
            <div class="hero-status-indicator" :class="selectedUser?.isActive ? 'status-active' : 'status-inactive'" />
          </div>
          <div class="hero-info">
            <h2 class="hero-email">{{ selectedUser?.email }}</h2>
            <div class="hero-meta">
              <span class="badge" :class="getRoleBadgeClass(selectedUser?.role || '')">
                {{ roleLabels[selectedUser?.role || ''] || selectedUser?.role }}
              </span>
              <span class="hero-divider">•</span>
              <span class="badge" :class="selectedUser?.isActive ? 'badge-success' : 'badge-error'">
                {{ selectedUser?.isActive ? '啟用' : '停用' }}
              </span>
              <template v-if="selectedUser?.emailVerified">
                <span class="hero-divider">•</span>
                <span class="verified-indicator">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  已驗證
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Info Cards -->
        <div class="info-cards">
          <!-- Account Card -->
          <div class="info-card">
            <div class="card-header">
              <div class="card-icon card-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span class="card-title">帳號資訊</span>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">Email</span>
                <span class="card-value">
                  <a :href="`mailto:${selectedUser?.email}`" class="email-link">{{ selectedUser?.email }}</a>
                </span>
              </div>
              <div class="card-row">
                <span class="card-label">角色</span>
                <span class="card-value">{{ roleLabels[selectedUser?.role || ''] || selectedUser?.role }}</span>
              </div>
            </div>
          </div>

          <!-- Employee Card -->
          <div class="info-card">
            <div class="card-header">
              <div class="card-icon card-icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <span class="card-title">關聯員工</span>
            </div>
            <div class="card-body">
              <template v-if="selectedUser?.employee">
                <div class="card-row">
                  <span class="card-label">姓名</span>
                  <span class="card-value">{{ selectedUser.employee.fullName }}</span>
                </div>
                <div class="card-row">
                  <span class="card-label">員工編號</span>
                  <span class="card-value">
                    <code class="employee-code">{{ selectedUser.employee.employeeCode }}</code>
                  </span>
                </div>
              </template>
              <template v-else>
                <div class="empty-employee">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12h8" />
                  </svg>
                  <span>未關聯員工</span>
                </div>
              </template>
            </div>
          </div>

          <!-- System Info Card -->
          <div class="info-card info-card-wide">
            <div class="card-header">
              <div class="card-icon card-icon-purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <span class="card-title">系統資訊</span>
            </div>
            <div class="card-body card-body-grid">
              <div class="card-row">
                <span class="card-label">建立時間</span>
                <span class="card-value">{{ formatDate(selectedUser?.createdAt || null) }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">最後登入</span>
                <span class="card-value">{{ formatDate(selectedUser?.lastLoginAt || null) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="modal-actions">
          <button class="action-btn action-btn-secondary" @click="showModal = false">
            關閉
          </button>
          <NuxtLink :to="`/admin/users/${selectedUser?.id}`" class="action-btn action-btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            編輯使用者
          </NuxtLink>
        </div>
      </div>
    </AppModal>
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

/* Clickable Row */
.clickable-row {
  cursor: pointer;
}

.clickable-row:hover {
  background: var(--color-bg-tertiary);
}

/* ========================================
   User Modal - Apple Style Design
   ======================================== */

.user-modal-content {
  padding: var(--space-md);
}

/* Hero Section */
.user-hero {
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

.hero-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: white;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.hero-avatar.avatar-active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.hero-avatar.avatar-inactive {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
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

.hero-status-indicator.status-inactive {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

.hero-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.hero-email {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: -0.02em;
  word-break: break-all;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.hero-divider {
  color: var(--color-text-quaternary);
  font-size: 12px;
}

.verified-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
  font-size: 13px;
  font-weight: 500;
}

/* Badge variants */
.badge-info {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.badge-default {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
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

.email-link {
  color: var(--color-accent);
  text-decoration: none;
  transition: opacity 0.15s ease;
  word-break: break-all;
}

.email-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.employee-code {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  padding: 4px 10px;
  border-radius: var(--radius-full);
}

.empty-employee {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  color: var(--color-text-tertiary);
}

.empty-employee svg {
  opacity: 0.5;
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

  /* Modal responsive */
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
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
