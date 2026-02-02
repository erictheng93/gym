<script setup lang="ts">
/**
 * Admin Role Management - List Page
 * 角色權限管理頁面
 */

definePageMeta({
  middleware: 'auth'
})

interface PermissionSet {
  read: boolean
  create: boolean
  update: boolean
  delete: boolean
}

interface RolePermissions {
  [module: string]: PermissionSet
}

interface Role {
  id: string
  name: string
  description: string
  userCount: number
  color: string
  permissions: RolePermissions
}

// Predefined roles with permissions
const roles = ref<Role[]>([
  {
    id: 'admin',
    name: '管理員',
    description: '完整系統權限，可管理所有功能和用戶',
    userCount: 2,
    color: '#ef4444',
    permissions: {
      members: { read: true, create: true, update: true, delete: true },
      contracts: { read: true, create: true, update: true, delete: true },
      payments: { read: true, create: true, update: true, delete: true },
      employees: { read: true, create: true, update: true, delete: true },
      branches: { read: true, create: true, update: true, delete: true },
      reports: { read: true, create: true, update: true, delete: true },
      settings: { read: true, create: true, update: true, delete: true },
      users: { read: true, create: true, update: true, delete: true },
    }
  },
  {
    id: 'manager',
    name: '經理',
    description: '分店管理權限，可管理分店內所有資料',
    userCount: 5,
    color: '#f59e0b',
    permissions: {
      members: { read: true, create: true, update: true, delete: false },
      contracts: { read: true, create: true, update: true, delete: false },
      payments: { read: true, create: true, update: true, delete: false },
      employees: { read: true, create: true, update: true, delete: false },
      branches: { read: true, create: false, update: true, delete: false },
      reports: { read: true, create: false, update: false, delete: false },
      settings: { read: true, create: false, update: false, delete: false },
      users: { read: false, create: false, update: false, delete: false },
    }
  },
  {
    id: 'coach',
    name: '教練',
    description: '教練專屬功能，可查看自己的會員和課程',
    userCount: 12,
    color: '#10b981',
    permissions: {
      members: { read: true, create: false, update: false, delete: false },
      contracts: { read: true, create: false, update: false, delete: false },
      payments: { read: false, create: false, update: false, delete: false },
      employees: { read: false, create: false, update: false, delete: false },
      branches: { read: true, create: false, update: false, delete: false },
      reports: { read: true, create: false, update: false, delete: false },
      settings: { read: false, create: false, update: false, delete: false },
      users: { read: false, create: false, update: false, delete: false },
    }
  },
  {
    id: 'staff',
    name: '員工',
    description: '基本存取權限，可處理日常業務',
    userCount: 8,
    color: '#6366f1',
    permissions: {
      members: { read: true, create: true, update: true, delete: false },
      contracts: { read: true, create: true, update: false, delete: false },
      payments: { read: true, create: true, update: false, delete: false },
      employees: { read: false, create: false, update: false, delete: false },
      branches: { read: true, create: false, update: false, delete: false },
      reports: { read: false, create: false, update: false, delete: false },
      settings: { read: false, create: false, update: false, delete: false },
      users: { read: false, create: false, update: false, delete: false },
    }
  }
])

const permissionModules = [
  { key: 'members', label: '會員管理' },
  { key: 'contracts', label: '合約管理' },
  { key: 'payments', label: '付款管理' },
  { key: 'employees', label: '員工管理' },
  { key: 'branches', label: '分店管理' },
  { key: 'reports', label: '報表功能' },
  { key: 'settings', label: '系統設定' },
  { key: 'users', label: '用戶管理' },
]

const permissionTypes = [
  { key: 'read', label: '查看' },
  { key: 'create', label: '新增' },
  { key: 'update', label: '編輯' },
  { key: 'delete', label: '刪除' },
]

const selectedRole = ref<string | null>(null)

const selectRole = (roleId: string) => {
  selectedRole.value = selectedRole.value === roleId ? null : roleId
}

const getSelectedRole = computed(() => {
  return roles.value.find(r => r.id === selectedRole.value)
})
</script>

<template>
  <div class="roles-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1>角色權限管理</h1>
        <p class="header-description">管理系統角色及其權限設定</p>
      </div>
    </header>

    <div class="roles-layout">
      <!-- Roles List -->
      <div class="roles-list">
        <div class="list-header">
          <h2>系統角色</h2>
          <span class="role-count">{{ roles.length }} 個角色</span>
        </div>

        <div class="roles-grid">
          <div
            v-for="role in roles"
            :key="role.id"
            class="role-card"
            :class="{ selected: selectedRole === role.id }"
            @click="selectRole(role.id)"
          >
            <div class="role-header">
              <div class="role-badge" :style="{ backgroundColor: role.color }">
                {{ role.name[0] }}
              </div>
              <div class="role-info">
                <h3 class="role-name">{{ role.name }}</h3>
                <p class="role-description">{{ role.description }}</p>
              </div>
            </div>
            <div class="role-footer">
              <span class="user-count">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                {{ role.userCount }} 位使用者
              </span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>
        </div>

        <div class="list-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>系統預設角色無法刪除，但可以調整權限</span>
        </div>
      </div>

      <!-- Permissions Panel -->
      <div class="permissions-panel" :class="{ visible: selectedRole }">
        <template v-if="getSelectedRole">
          <div class="panel-header">
            <div class="panel-title">
              <div class="role-badge-lg" :style="{ backgroundColor: getSelectedRole.color }">
                {{ getSelectedRole.name[0] }}
              </div>
              <div>
                <h2>{{ getSelectedRole.name }}</h2>
                <p>{{ getSelectedRole.description }}</p>
              </div>
            </div>
          </div>

          <div class="permissions-table">
            <table>
              <thead>
                <tr>
                  <th>功能模組</th>
                  <th v-for="perm in permissionTypes" :key="perm.key">{{ perm.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="module in permissionModules" :key="module.key">
                  <td class="module-name">{{ module.label }}</td>
                  <td v-for="perm in permissionTypes" :key="perm.key">
                    <span
                      class="permission-badge"
                      :class="getSelectedRole.permissions[module.key][perm.key] ? 'allowed' : 'denied'"
                    >
                      <svg v-if="getSelectedRole.permissions[module.key][perm.key]" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="panel-footer">
            <p class="footer-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
              權限變更將即時生效，請謹慎操作
            </p>
          </div>
        </template>

        <div v-else class="empty-panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" x2="3" y1="12" y2="12" />
          </svg>
          <p>選擇一個角色查看權限詳情</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roles-page {
  padding: var(--space-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  margin: 0 0 var(--space-xs);
  font-size: 1.5rem;
  font-weight: 600;
}

.header-description {
  margin: 0;
  color: var(--color-text-secondary);
}

.roles-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: var(--space-xl);
}

/* Roles List */
.roles-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.role-count {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.roles-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.role-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.role-card:hover {
  border-color: var(--color-text-tertiary);
}

.role-card.selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-light);
}

.role-header {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.role-badge {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1rem;
  flex-shrink: 0;
}

.role-badge-lg {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.role-info {
  flex: 1;
  min-width: 0;
}

.role-name {
  margin: 0 0 2px;
  font-size: 0.9375rem;
  font-weight: 600;
}

.role-description {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.role-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border);
  margin-top: var(--space-sm);
}

.user-count {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.chevron {
  color: var(--color-text-tertiary);
  transition: transform var(--duration-fast) ease;
}

.role-card.selected .chevron {
  color: var(--color-accent);
}

.list-note {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* Permissions Panel */
.permissions-panel {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  min-height: 500px;
}

.panel-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.panel-title h2 {
  margin: 0 0 2px;
  font-size: 1.125rem;
  font-weight: 600;
}

.panel-title p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.permissions-table {
  flex: 1;
  padding: var(--space-lg);
  overflow-x: auto;
}

.permissions-table table {
  width: 100%;
  border-collapse: collapse;
}

.permissions-table th,
.permissions-table td {
  padding: var(--space-sm) var(--space-md);
  text-align: center;
  border-bottom: 1px solid var(--color-border);
}

.permissions-table th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.permissions-table th:first-child,
.permissions-table td:first-child {
  text-align: left;
}

.module-name {
  font-weight: 500;
}

.permission-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
}

.permission-badge.allowed {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.permission-badge.denied {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.panel-footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.footer-note {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-tertiary);
}

.empty-panel p {
  margin: 0;
  font-size: 0.875rem;
}

@media (max-width: 1024px) {
  .roles-layout {
    grid-template-columns: 1fr;
  }

  .permissions-panel {
    display: none;
  }

  .permissions-panel.visible {
    display: flex;
  }
}

@media (max-width: 768px) {
  .roles-page {
    padding: var(--space-md);
  }
}
</style>
