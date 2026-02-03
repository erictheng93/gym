<script setup lang="ts">
/**
 * Admin User Management - Create Page
 * 新增使用者頁面
 */

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createUser, fetchAvailableEmployees, isLoading } = useUsers()

// Form state
const formData = ref({
  email: '',
  password: '',
  confirmPassword: '',
  role: 'staff' as 'admin' | 'manager' | 'coach' | 'staff',
  employeeId: '' as string | null
})

const errors = ref<Record<string, string>>({})
const availableEmployees = ref<Array<{ id: string; fullName: string; employeeCode: string; email: string | null }>>([])
const isLoadingEmployees = ref(false)

// Role options
const roleOptions = [
  { value: 'staff', label: '員工', description: '基本存取權限' },
  { value: 'coach', label: '教練', description: '教練專屬功能' },
  { value: 'manager', label: '經理', description: '分店管理權限' },
  { value: 'admin', label: '管理員', description: '完整系統權限' }
]

// Validation
const validate = () => {
  errors.value = {}

  if (!formData.value.email) {
    errors.value.email = '請輸入電子郵件'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email)) {
    errors.value.email = '請輸入有效的電子郵件格式'
  }

  if (!formData.value.password) {
    errors.value.password = '請輸入密碼'
  } else if (formData.value.password.length < 8) {
    errors.value.password = '密碼至少 8 個字元'
  }

  if (formData.value.password !== formData.value.confirmPassword) {
    errors.value.confirmPassword = '密碼不一致'
  }

  if (!formData.value.role) {
    errors.value.role = '請選擇角色'
  }

  return Object.keys(errors.value).length === 0
}

// Submit
const handleSubmit = async () => {
  if (!validate()) return

  const result = await createUser({
    email: formData.value.email,
    password: formData.value.password,
    role: formData.value.role,
    employeeId: formData.value.employeeId || null
  })

  if (result.success) {
    router.push('/admin/users')
  }
}

// Load available employees
const loadAvailableEmployees = async () => {
  isLoadingEmployees.value = true
  const result = await fetchAvailableEmployees()
  if (result.success && result.data) {
    availableEmployees.value = result.data
  }
  isLoadingEmployees.value = false
}

// Auto-fill email from selected employee
watch(() => formData.value.employeeId, async (employeeId) => {
  if (employeeId) {
    const employee = availableEmployees.value.find(e => e.id === employeeId)
    if (employee?.email && !formData.value.email) {
      formData.value.email = employee.email
    }
  }
})

onMounted(() => {
  loadAvailableEmployees()
})
</script>

<template>
  <div class="create-user">
    <!-- Header -->
    <header class="page-header">
      <NuxtLink to="/admin/users" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        返回使用者列表
      </NuxtLink>
    </header>

    <!-- Hero Section -->
    <div class="hero-section">
      <div class="hero-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
        </svg>
      </div>
      <h1>新增使用者</h1>
      <p>建立新的系統使用者帳號</p>
    </div>

    <!-- Form -->
    <form class="user-form" @submit.prevent="handleSubmit">
      <!-- Account Section -->
      <section class="form-section">
        <h2 class="section-title">帳號資訊</h2>

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
            placeholder="example@company.com"
          />
          <span v-if="errors.email" class="error-message">{{ errors.email }}</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="password">
              密碼 <span class="required">*</span>
            </label>
            <input
              id="password"
              v-model="formData.password"
              type="password"
              class="form-input"
              :class="{ 'input-error': errors.password }"
              placeholder="至少 8 個字元"
            />
            <span v-if="errors.password" class="error-message">{{ errors.password }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirmPassword">
              確認密碼 <span class="required">*</span>
            </label>
            <input
              id="confirmPassword"
              v-model="formData.confirmPassword"
              type="password"
              class="form-input"
              :class="{ 'input-error': errors.confirmPassword }"
              placeholder="再次輸入密碼"
            />
            <span v-if="errors.confirmPassword" class="error-message">{{ errors.confirmPassword }}</span>
          </div>
        </div>
      </section>

      <!-- Role Section -->
      <section class="form-section">
        <h2 class="section-title">角色與權限</h2>

        <div class="form-group">
          <label class="form-label">
            使用者角色 <span class="required">*</span>
          </label>
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
              <div v-if="formData.role === role.value" class="role-check">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              </div>
            </label>
          </div>
          <span v-if="errors.role" class="error-message">{{ errors.role }}</span>
        </div>
      </section>

      <!-- Employee Linking Section -->
      <section class="form-section">
        <h2 class="section-title">關聯員工</h2>
        <p class="section-description">
          將此使用者帳號與現有員工資料連結（選填）
        </p>

        <div class="form-group">
          <label class="form-label" for="employeeId">選擇員工</label>
          <select
            id="employeeId"
            v-model="formData.employeeId"
            class="form-input"
            :disabled="isLoadingEmployees"
          >
            <option value="">不關聯員工</option>
            <option
              v-for="employee in availableEmployees"
              :key="employee.id"
              :value="employee.id"
            >
              {{ employee.fullName }} ({{ employee.employeeCode }})
              {{ employee.email ? `- ${employee.email}` : '' }}
            </option>
          </select>
          <span v-if="isLoadingEmployees" class="help-text">載入員工列表中...</span>
          <span v-else-if="availableEmployees.length === 0" class="help-text">
            目前沒有可關聯的員工（已關聯帳號的員工不會顯示）
          </span>
        </div>
      </section>

      <!-- Actions -->
      <div class="form-actions">
        <NuxtLink to="/admin/users" class="btn btn-ghost">
          取消
        </NuxtLink>
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          <span v-if="isLoading" class="spinner-sm"></span>
          {{ isLoading ? '建立中...' : '建立使用者' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-user {
  padding: var(--space-lg);
  max-width: 800px;
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
  transition: color var(--duration-fast) ease;
}

.back-link:hover {
  color: var(--color-text-primary);
}

.hero-section {
  text-align: center;
  margin-bottom: var(--space-2xl);
}

.hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, var(--color-accent), #6366f1);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-md);
}

.hero-icon svg {
  width: 40px;
  height: 40px;
  color: white;
}

.hero-section h1 {
  margin: 0 0 var(--space-xs);
  font-size: 1.5rem;
  font-weight: 600;
}

.hero-section p {
  margin: 0;
  color: var(--color-text-secondary);
}

.user-form {
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

.section-description {
  margin: calc(-1 * var(--space-sm)) 0 var(--space-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.form-group {
  margin-bottom: var(--space-md);
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
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
  transition: border-color var(--duration-fast) ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.form-input.input-error {
  border-color: #ef4444;
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  display: block;
  margin-top: var(--space-xs);
  font-size: 0.75rem;
  color: #ef4444;
}

.help-text {
  display: block;
  margin-top: var(--space-xs);
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-sm);
}

.role-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
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
  flex: 1;
}

.role-label {
  font-weight: 500;
}

.role-description {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.role-check {
  color: var(--color-accent);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-md);
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

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .role-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
