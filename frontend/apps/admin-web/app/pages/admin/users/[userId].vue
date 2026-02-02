<script setup lang="ts">
/**
 * Admin User Management - Edit Page
 * 編輯使用者頁面
 */

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()
const toast = useToast()
const { fetchUser, updateUser, deleteUser, resetPassword, fetchAvailableEmployees, isLoading } = useUsers()

const userId = computed(() => route.params.userId as string)

// User data
const user = ref<any>(null)
const isLoadingUser = ref(true)

// Form state
const formData = ref({
  email: '',
  role: 'staff' as 'admin' | 'manager' | 'coach' | 'staff',
  isActive: true,
  employeeId: '' as string | null
})

const errors = ref<Record<string, string>>({})
const availableEmployees = ref<Array<{ id: string; fullName: string; employeeCode: string; email: string | null }>>([])

// Password reset modal
const showPasswordModal = ref(false)
const newPassword = ref('')
const confirmNewPassword = ref('')
const passwordErrors = ref<Record<string, string>>({})

// Role options
const roleOptions = [
  { value: 'staff', label: '員工', description: '基本存取權限' },
  { value: 'coach', label: '教練', description: '教練專屬功能' },
  { value: 'manager', label: '經理', description: '分店管理權限' },
  { value: 'admin', label: '管理員', description: '完整系統權限' }
]

// Role labels
const roleLabels: Record<string, string> = {
  admin: '管理員',
  manager: '經理',
  coach: '教練',
  staff: '員工',
  super_admin: '超級管理員'
}

// Load user data
const loadUser = async () => {
  isLoadingUser.value = true
  const result = await fetchUser(userId.value)
  if (result.success && result.data) {
    user.value = result.data
    formData.value = {
      email: result.data.email,
      role: result.data.role as 'admin' | 'manager' | 'coach' | 'staff',
      isActive: result.data.isActive,
      employeeId: result.data.employeeId
    }
  } else {
    toast.error('找不到此使用者')
    router.push('/admin/users')
  }
  isLoadingUser.value = false
}

// Load available employees
const loadAvailableEmployees = async () => {
  const result = await fetchAvailableEmployees()
  if (result.success && result.data) {
    // Include current linked employee if any
    availableEmployees.value = result.data
    if (user.value?.employee && !result.data.find((e: any) => e.id === user.value.employeeId)) {
      availableEmployees.value.unshift({
        id: user.value.employeeId,
        fullName: user.value.employee.fullName,
        employeeCode: user.value.employee.employeeCode,
        email: null
      })
    }
  }
}

// Validation
const validate = () => {
  errors.value = {}

  if (!formData.value.email) {
    errors.value.email = '請輸入電子郵件'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email)) {
    errors.value.email = '請輸入有效的電子郵件格式'
  }

  if (!formData.value.role) {
    errors.value.role = '請選擇角色'
  }

  return Object.keys(errors.value).length === 0
}

// Submit
const handleSubmit = async () => {
  if (!validate()) return

  const result = await updateUser(userId.value, {
    email: formData.value.email,
    role: formData.value.role,
    isActive: formData.value.isActive,
    employeeId: formData.value.employeeId || null
  })

  if (result.success) {
    await loadUser() // Refresh data
  }
}

// Handle delete
const handleDelete = async () => {
  const confirmed = await confirm({
    title: '確認刪除',
    message: `確定要刪除使用者「${user.value?.email}」嗎？此操作無法復原。`,
    confirmText: '刪除',
    confirmVariant: 'error'
  })

  if (confirmed) {
    const result = await deleteUser(userId.value)
    if (result.success) {
      router.push('/admin/users')
    }
  }
}

// Password reset
const validatePassword = () => {
  passwordErrors.value = {}

  if (!newPassword.value) {
    passwordErrors.value.newPassword = '請輸入新密碼'
  } else if (newPassword.value.length < 8) {
    passwordErrors.value.newPassword = '密碼至少 8 個字元'
  }

  if (newPassword.value !== confirmNewPassword.value) {
    passwordErrors.value.confirmNewPassword = '密碼不一致'
  }

  return Object.keys(passwordErrors.value).length === 0
}

const handleResetPassword = async () => {
  if (!validatePassword()) return

  const result = await resetPassword(userId.value, newPassword.value)
  if (result.success) {
    showPasswordModal.value = false
    newPassword.value = ''
    confirmNewPassword.value = ''
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

onMounted(async () => {
  await loadUser()
  await loadAvailableEmployees()
})
</script>

<template>
  <div class="edit-user">
    <!-- Header -->
    <header class="page-header">
      <NuxtLink to="/admin/users" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        返回使用者列表
      </NuxtLink>
    </header>

    <!-- Loading State -->
    <div v-if="isLoadingUser" class="loading-state">
      <div class="spinner"></div>
      <p>載入使用者資料中...</p>
    </div>

    <template v-else-if="user">
      <!-- User Info Header -->
      <div class="user-header">
        <div class="user-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="user-info">
          <h1>{{ user.email }}</h1>
          <div class="user-meta">
            <span class="badge" :class="user.isActive ? 'badge-success' : 'badge-error'">
              {{ user.isActive ? '啟用中' : '已停用' }}
            </span>
            <span class="badge badge-role">{{ roleLabels[user.role] || user.role }}</span>
            <span v-if="user.emailVerified" class="verified">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
              已驗證
            </span>
          </div>
        </div>
        <div class="user-actions">
          <button class="btn btn-ghost" @click="showPasswordModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            重設密碼
          </button>
          <button class="btn btn-ghost text-error" @click="handleDelete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            刪除使用者
          </button>
        </div>
      </div>

      <!-- Info Cards -->
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">建立時間</div>
          <div class="info-value">{{ formatDate(user.createdAt) }}</div>
        </div>
        <div class="info-card">
          <div class="info-label">最後登入</div>
          <div class="info-value">{{ formatDate(user.lastLoginAt) }}</div>
        </div>
        <div class="info-card" v-if="user.employee">
          <div class="info-label">關聯員工</div>
          <div class="info-value">
            {{ user.employee.fullName }}
            <span class="text-secondary">({{ user.employee.employeeCode }})</span>
          </div>
        </div>
      </div>

      <!-- Edit Form -->
      <form class="edit-form" @submit.prevent="handleSubmit">
        <section class="form-section">
          <h2 class="section-title">帳號設定</h2>

          <div class="form-group">
            <label class="form-label" for="email">
              電子郵件 <span class="required">*</span>
            </label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              class="form-input"
              :class="{ 'input-error': errors.email }"
            />
            <span v-if="errors.email" class="error-message">{{ errors.email }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">使用者角色 <span class="required">*</span></label>
            <div class="role-grid">
              <label
                v-for="role in roleOptions"
                :key="role.value"
                class="role-option"
                :class="{ selected: formData.role === role.value }"
              >
                <input
                  v-model="formData.role"
                  type="radio"
                  :value="role.value"
                  class="role-radio"
                />
                <div class="role-content">
                  <span class="role-label">{{ role.label }}</span>
                  <span class="role-description">{{ role.description }}</span>
                </div>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="employeeId">關聯員工</label>
            <select
              id="employeeId"
              v-model="formData.employeeId"
              class="form-input"
            >
              <option value="">不關聯員工</option>
              <option
                v-for="employee in availableEmployees"
                :key="employee.id"
                :value="employee.id"
              >
                {{ employee.fullName }} ({{ employee.employeeCode }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="toggle-label">
              <input
                v-model="formData.isActive"
                type="checkbox"
                class="toggle-input"
              />
              <span class="toggle-switch"></span>
              <span class="toggle-text">帳號狀態：{{ formData.isActive ? '啟用' : '停用' }}</span>
            </label>
          </div>
        </section>

        <div class="form-actions">
          <NuxtLink to="/admin/users" class="btn btn-ghost">
            取消
          </NuxtLink>
          <button type="submit" class="btn btn-primary" :disabled="isLoading">
            {{ isLoading ? '儲存中...' : '儲存變更' }}
          </button>
        </div>
      </form>
    </template>

    <!-- Password Reset Modal -->
    <Teleport to="body">
      <div v-if="showPasswordModal" class="modal-overlay" @click.self="showPasswordModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>重設密碼</h3>
            <button class="modal-close" @click="showPasswordModal = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-description">
              為使用者「{{ user?.email }}」設定新密碼。重設後所有現有工作階段將被登出。
            </p>

            <div class="form-group">
              <label class="form-label" for="newPassword">新密碼</label>
              <input
                id="newPassword"
                v-model="newPassword"
                type="password"
                class="form-input"
                :class="{ 'input-error': passwordErrors.newPassword }"
                placeholder="至少 8 個字元"
              />
              <span v-if="passwordErrors.newPassword" class="error-message">{{ passwordErrors.newPassword }}</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="confirmNewPassword">確認新密碼</label>
              <input
                id="confirmNewPassword"
                v-model="confirmNewPassword"
                type="password"
                class="form-input"
                :class="{ 'input-error': passwordErrors.confirmNewPassword }"
                placeholder="再次輸入新密碼"
              />
              <span v-if="passwordErrors.confirmNewPassword" class="error-message">{{ passwordErrors.confirmNewPassword }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="showPasswordModal = false">取消</button>
            <button class="btn btn-primary" @click="handleResetPassword" :disabled="isLoading">
              {{ isLoading ? '處理中...' : '重設密碼' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.edit-user {
  padding: var(--space-lg);
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--space-xl);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--color-text-primary);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
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

.user-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-lg);
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  flex-shrink: 0;
}

.user-avatar svg {
  width: 32px;
  height: 32px;
  color: var(--color-text-tertiary);
}

.user-info {
  flex: 1;
}

.user-info h1 {
  margin: 0 0 var(--space-xs);
  font-size: 1.25rem;
  font-weight: 600;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.badge-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.badge-role {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.verified {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  color: #10b981;
}

.user-actions {
  display: flex;
  gap: var(--space-sm);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.info-card {
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.info-label {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-xs);
}

.info-value {
  font-weight: 500;
}

.text-secondary {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.form-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.section-title {
  margin: 0 0 var(--space-md);
  font-size: 1rem;
  font-weight: 600;
}

.form-group {
  margin-bottom: var(--space-md);
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  margin-bottom: var(--space-xs);
  font-size: 0.875rem;
  font-weight: 500;
}

.required {
  color: #ef4444;
}

.form-input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.form-input.input-error {
  border-color: #ef4444;
}

.error-message {
  display: block;
  margin-top: var(--space-xs);
  font-size: 0.75rem;
  color: #ef4444;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-sm);
}

.role-option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.role-option:hover {
  border-color: var(--color-text-tertiary);
}

.role-option.selected {
  border-color: var(--color-accent);
  background: rgba(99, 102, 241, 0.05);
}

.role-radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.role-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.role-label {
  font-weight: 500;
}

.role-description {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  transition: background var(--duration-fast) ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform var(--duration-fast) ease;
}

.toggle-input:checked + .toggle-switch {
  background: var(--color-accent);
}

.toggle-input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

.toggle-text {
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
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

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.btn-ghost:hover {
  background: var(--color-bg-tertiary);
}

.text-error {
  color: #ef4444;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 100%;
  max-width: 400px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--space-xs);
}

.modal-body {
  padding: var(--space-lg);
}

.modal-description {
  margin: 0 0 var(--space-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .user-header {
    flex-direction: column;
  }

  .user-actions {
    width: 100%;
  }

  .user-actions .btn {
    flex: 1;
  }

  .role-grid {
    grid-template-columns: 1fr;
  }
}
</style>
