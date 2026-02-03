<script setup lang="ts">
import { validateUUIDParam } from '~/utils/validation'
import { PERMISSION_MODULES, createEmptyPermissions } from '~/constants/permissions'
import { MESSAGES } from '~/constants'
import type { JobTitle } from '~/types/schema'

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('employeeId')
})

const route = useRoute()
const router = useRouter()
const { getEmployee, updateEmployee, employees, fetchEmployees } = useEmployees()
const { branches, fetchBranches } = useBranches()
const { jobTitles, fetchJobTitles, getJobTitle } = useJobTitles()

const isLoading = ref(true)
const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})

const employeeId = computed(() => route.params.employeeId as string)

// Custom permissions state
const useCustomPermissions = ref(false)
const currentJobTitle = ref<JobTitle | null>(null)

const form = reactive({
  full_name: '',
  employee_code: '',
  phone: '',
  email: '',
  branch_id: '',
  job_title_id: '',
  supervisor_id: '',
  user_id: '',
  employment_status: 'ACTIVE' as 'ACTIVE' | 'RESIGNED' | 'LEAVE',
  employment_type: 'FULL_TIME' as 'FULL_TIME' | 'PART_TIME' | 'FREELANCE',
  hire_date: '',
  basic_salary: null as number | null,
  custom_permissions: createEmptyPermissions()
})

const employmentStatusOptions = [
  { value: 'ACTIVE', label: '在職' },
  { value: 'RESIGNED', label: '離職' },
  { value: 'LEAVE', label: '留停' }
]

const employmentTypeOptions = [
  { value: 'FULL_TIME', label: '正職' },
  { value: 'PART_TIME', label: '兼職' },
  { value: 'FREELANCE', label: '外包' }
]

const branchOptions = computed(() =>
  branches.value.map(b => ({ value: b.id, label: b.name }))
)

const jobTitleOptions = computed(() =>
  jobTitles.value.map(j => ({ value: j.id, label: j.name }))
)

const supervisorOptions = computed(() =>
  employees.value
    .filter(e => e.employment_status === 'ACTIVE' && e.id !== employeeId.value)
    .map(e => ({ value: e.id, label: e.full_name }))
)

const loadEmployee = async () => {
  isLoading.value = true
  try {
    const employee = await getEmployee(employeeId.value)
    if (!employee) {
      throw new Error('Employee not found')
    }
    form.full_name = employee.full_name
    form.employee_code = employee.employee_code || ''
    form.phone = employee.phone || ''
    form.email = employee.email || ''
    form.branch_id = employee.branch_id || ''
    form.job_title_id = employee.job_title_id || ''
    form.supervisor_id = employee.supervisor_id || ''
    form.user_id = employee.user_id || ''
    form.employment_status = employee.employment_status
    form.employment_type = employee.employment_type
    form.hire_date = employee.hire_date || ''
    form.basic_salary = employee.basic_salary

    // Load custom permissions if exists
    if (employee.custom_permissions && typeof employee.custom_permissions === 'object') {
      form.custom_permissions = employee.custom_permissions as unknown as Record<string, Record<string, boolean>>
      useCustomPermissions.value = true
    }

    // Load job title permissions
    if (employee.job_title_id) {
      await loadJobTitlePermissions(employee.job_title_id)
    }
  } catch (error) {
    console.error('Failed to load employee:', error)
    useToast().error(MESSAGES.ERRORS.EMPLOYEE_FETCH_FAILED)
  } finally {
    isLoading.value = false
  }
}

const loadJobTitlePermissions = async (jobTitleId: string) => {
  try {
    const jobTitle = await getJobTitle(jobTitleId)
    currentJobTitle.value = jobTitle
  } catch (error) {
    console.error('Failed to load job title:', error)
  }
}

// Watch job title changes to load permissions
watch(() => form.job_title_id, async (newJobTitleId) => {
  if (newJobTitleId) {
    await loadJobTitlePermissions(newJobTitleId)
  } else {
    currentJobTitle.value = null
  }
})

// Permission helpers
const toggleModuleAll = (moduleKey: string, value: boolean) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  if (!module || !form.custom_permissions[moduleKey]) return

  const modulePerms = form.custom_permissions[moduleKey]!
  module.actions.forEach(action => {
    modulePerms[action.key as keyof typeof modulePerms] = value
  })
}

const isModuleFullyEnabled = (moduleKey: string) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  if (!module || !form.custom_permissions[moduleKey]) return false

  const modulePerms = form.custom_permissions[moduleKey]!
  return module.actions.every(action =>
    modulePerms[action.key as keyof typeof modulePerms] === true
  )
}

const isModulePartiallyEnabled = (moduleKey: string) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  if (!module || !form.custom_permissions[moduleKey]) return false

  const modulePerms = form.custom_permissions[moduleKey]!
  const enabledCount = module.actions.filter(action =>
    modulePerms[action.key as keyof typeof modulePerms] === true
  ).length

  return enabledCount > 0 && enabledCount < module.actions.length
}


// Check if permission is custom (different from job title)
const isCustomPermission = (moduleKey: string, actionKey: string): boolean => {
  if (!useCustomPermissions.value || !currentJobTitle.value) return false
  const jobTitlePerm = (currentJobTitle.value.permissions_config?.[moduleKey] as Record<string, boolean> | undefined)?.[actionKey] || false
  const customPerm = (form.custom_permissions[moduleKey] as Record<string, boolean> | undefined)?.[actionKey] || false
  return jobTitlePerm !== customPerm
}

// Toggle custom permissions on/off
const toggleCustomPermissions = () => {
  useCustomPermissions.value = !useCustomPermissions.value
  if (!useCustomPermissions.value) {
    // Reset custom permissions to job title permissions
    if (currentJobTitle.value?.permissions_config) {
      form.custom_permissions = JSON.parse(JSON.stringify(currentJobTitle.value.permissions_config))
    }
  }
}

onMounted(async () => {
  await Promise.all([
    loadEmployee(),
    fetchBranches(),
    fetchJobTitles(),
    fetchEmployees({ limit: 100, status: 'ACTIVE' })
  ])
})

const validate = () => {
  errors.value = {}

  if (!form.full_name.trim()) {
    errors.value.full_name = '請輸入員工姓名'
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const employeeData = {
      ...form,
      employee_code: form.employee_code || null,
      phone: form.phone || null,
      email: form.email || null,
      branch_id: form.branch_id || null,
      job_title_id: form.job_title_id || null,
      supervisor_id: form.supervisor_id || null,
      user_id: form.user_id || null,
      hire_date: form.hire_date || null,
      basic_salary: form.basic_salary || null,
      custom_permissions: useCustomPermissions.value ? form.custom_permissions : null
    } as Parameters<typeof updateEmployee>[1]

    await updateEmployee(employeeId.value, employeeData)
    useToast().success(MESSAGES.SUCCESS.EMPLOYEE_UPDATED)
    router.push(`/hr/employees/${employeeId.value}`)
  } catch (error) {
    console.error('Failed to update employee:', error)
    useToast().error(MESSAGES.ERRORS.EMPLOYEE_UPDATE_FAILED)
    errors.value.submit = '更新員工失敗，請稍後再試'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="employee-form-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">載入中...</p>
    </div>

    <template v-else>
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
      </header>

      <!-- Form Hero -->
      <div class="form-hero">
        <div class="hero-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </div>
        <h1 class="text-headline">編輯員工</h1>
        <p class="text-body text-secondary">修改員工資料與職務資訊</p>
      </div>

      <!-- Form -->
      <form class="employee-form" @submit.prevent="handleSubmit">
        <!-- Basic Info Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            基本資料
          </h2>

          <div class="form-grid">
            <div class="input-group required">
              <label class="input-label">姓名</label>
              <input
                v-model="form.full_name"
                type="text"
                class="input"
                :class="{ 'input-error': errors.full_name }"
                placeholder="請輸入員工姓名"
              />
              <span v-if="errors.full_name" class="error-text">{{ errors.full_name }}</span>
            </div>

            <div class="input-group">
              <label class="input-label">員工編號</label>
              <input
                v-model="form.employee_code"
                type="text"
                class="input"
                placeholder="自動產生或手動輸入"
              />
            </div>

            <div class="input-group">
              <label class="input-label">聯絡電話</label>
              <input
                v-model="form.phone"
                type="tel"
                class="input"
                placeholder="請輸入聯絡電話"
              />
            </div>

            <div class="input-group">
              <label class="input-label">Email</label>
              <input
                v-model="form.email"
                type="email"
                class="input"
                placeholder="請輸入 Email"
              />
            </div>
          </div>
        </section>

        <!-- Organization Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
            組織架構
          </h2>

          <div class="form-grid">
            <div class="input-group required">
              <label class="input-label">所屬分店</label>
              <select v-model="form.branch_id" class="input">
                <option value="">請選擇分店</option>
                <option v-for="branch in branchOptions" :key="branch.value" :value="branch.value">
                  {{ branch.label }}
                </option>
              </select>
            </div>

            <div class="input-group">
              <label class="input-label">職位</label>
              <select v-model="form.job_title_id" class="input">
                <option value="">請選擇職位</option>
                <option v-for="jobTitle in jobTitleOptions" :key="jobTitle.value" :value="jobTitle.value">
                  {{ jobTitle.label }}
                </option>
              </select>
            </div>

            <div class="input-group">
              <label class="input-label">直屬主管</label>
              <select v-model="form.supervisor_id" class="input">
                <option value="">請選擇主管（選填）</option>
                <option v-for="supervisor in supervisorOptions" :key="supervisor.value" :value="supervisor.value">
                  {{ supervisor.label }}
                </option>
              </select>
              <span class="help-text">用於休假審核流程</span>
            </div>
          </div>
        </section>

        <!-- Employment Info Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            任職資訊
          </h2>

          <div class="form-grid">
            <div class="input-group">
              <label class="input-label">任職狀態</label>
              <div class="radio-group">
                <label
                  v-for="opt in employmentStatusOptions"
                  :key="opt.value"
                  class="radio-option"
                  :class="{ active: form.employment_status === opt.value }"
                >
                  <input
                    v-model="form.employment_status"
                    type="radio"
                    :value="opt.value"
                    class="radio-input"
                  />
                  {{ opt.label }}
                </label>
              </div>
            </div>

            <div class="input-group">
              <label class="input-label">聘用類型</label>
              <div class="radio-group">
                <label
                  v-for="opt in employmentTypeOptions"
                  :key="opt.value"
                  class="radio-option"
                  :class="{ active: form.employment_type === opt.value }"
                >
                  <input
                    v-model="form.employment_type"
                    type="radio"
                    :value="opt.value"
                    class="radio-input"
                  />
                  {{ opt.label }}
                </label>
              </div>
            </div>

            <div class="input-group">
              <label class="input-label">到職日期</label>
              <input
                v-model="form.hire_date"
                type="date"
                class="input"
              />
            </div>

            <div class="input-group">
              <label class="input-label">基本薪資</label>
              <input
                v-model.number="form.basic_salary"
                type="number"
                class="input"
                placeholder="請輸入金額"
                min="0"
              />
            </div>
          </div>
        </section>

        <!-- Custom Permissions Section -->
        <section v-if="currentJobTitle" class="form-section glass-card">
          <div class="section-header-with-toggle">
            <h2 class="section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              自訂權限
            </h2>

            <label class="toggle-switch">
              <input
                v-model="useCustomPermissions"
                type="checkbox"
                @change="toggleCustomPermissions"
              />
              <span class="toggle-slider"></span>
              <span class="toggle-label">{{ useCustomPermissions ? '使用自訂權限' : '使用職位預設權限' }}</span>
            </label>
          </div>

          <!-- Inherited Permissions Info -->
          <div v-if="!useCustomPermissions" class="info-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            <span>此員工使用職位「{{ currentJobTitle.name }}」的預設權限</span>
          </div>

          <!-- Custom Permissions Editor -->
          <div v-else class="permissions-grid">
            <div
              v-for="module in PERMISSION_MODULES"
              :key="module.key"
              class="permission-module"
            >
              <div class="module-header">
                <div class="module-info">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      :checked="isModuleFullyEnabled(module.key)"
                      :indeterminate="isModulePartiallyEnabled(module.key)"
                      @change="toggleModuleAll(module.key, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="module-name">{{ module.label }}</span>
                  </label>
                  <p class="module-description">{{ module.description }}</p>
                </div>
              </div>

              <div class="module-actions">
                <label
                  v-for="action in module.actions"
                  :key="action.key"
                  class="action-checkbox"
                  :class="{ 'is-custom': isCustomPermission(module.key, action.key) }"
                >
                  <input
                    v-model="(form.custom_permissions[module.key] as Record<string, boolean>)[action.key]"
                    type="checkbox"
                  />
                  <span>{{ action.label }}</span>
                  <svg
                    v-if="isCustomPermission(module.key, action.key)"
                    class="custom-indicator"
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    title="已覆寫職位預設權限"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                  </svg>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Error Message -->
        <div v-if="errors.submit" class="submit-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          {{ errors.submit }}
        </div>

        <!-- Actions -->
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" @click="router.back()">取消</button>
          <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
            <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {{ isSubmitting ? '更新中...' : '儲存變更' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.employee-form-page {
  max-width: 800px;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
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

/* Header */
.page-header {
  margin-bottom: var(--space-xl);
  animation: fadeDown 0.5s var(--ease-out);
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.back-btn:hover {
  background: var(--color-accent-light);
}

/* Form Hero */
.form-hero {
  text-align: center;
  padding: var(--space-2xl) 0;
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.hero-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-2xl);
  background: linear-gradient(135deg, #ff9f0a, #ff6b35);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

/* Form Sections */
.employee-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-section {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.form-section:nth-child(1) { animation-delay: 0.15s; }
.form-section:nth-child(2) { animation-delay: 0.2s; }

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 17px;
  font-weight: 600;
  margin-bottom: var(--space-xl);
}

.section-title svg {
  color: var(--color-accent);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

/* Input Group */
.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.input-group.required .input-label::after {
  content: ' *';
  color: var(--color-error);
}

.input-error {
  border-color: var(--color-error) !important;
}

.input-error:focus {
  box-shadow: 0 0 0 4px rgba(255, 59, 48, 0.15) !important;
}

.error-text {
  font-size: 13px;
  color: var(--color-error);
}

/* Radio Group */
.radio-group {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.radio-option {
  display: flex;
  align-items: center;
  padding: 10px 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  cursor: pointer;
  font-size: 15px;
  transition: all var(--duration-fast) var(--ease-out);
}

.radio-option:hover {
  border-color: var(--color-accent);
}

.radio-option.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.radio-input {
  display: none;
}

/* Submit Error */
.submit-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(255, 59, 48, 0.1);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 14px;
}

/* Form Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

.btn-spinner {
  animation: spin 0.8s linear infinite;
}

/* Custom Permissions Section */
.section-header-with-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
  gap: var(--space-md);
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  cursor: pointer;
  user-select: none;
  position: relative;
}

.toggle-switch input[type="checkbox"] {
  position: absolute;
  opacity: 0;
}

.toggle-slider {
  position: relative;
  width: 48px;
  height: 24px;
  background: var(--color-border-strong);
  border-radius: var(--radius-full);
  transition: background var(--duration-fast) var(--ease-out);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform var(--duration-fast) var(--ease-out);
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--color-accent);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(24px);
}

.toggle-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.info-banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-accent-light);
  border-radius: var(--radius-md);
  color: var(--color-accent);
  font-size: 14px;
}

.info-banner svg {
  flex-shrink: 0;
}

/* Permissions Grid */
.permissions-grid {
  display: grid;
  gap: var(--space-lg);
}

.permission-module {
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}

.permission-module:hover {
  border-color: var(--color-accent-light);
  background: var(--color-surface-hover);
}

.module-header {
  margin-bottom: var(--space-md);
}

.module-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  user-select: none;
}

.module-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.module-description {
  margin: 0;
  padding-left: 28px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.module-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}

.action-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
  position: relative;
}

.action-checkbox input:checked + span {
  color: var(--color-accent);
  font-weight: 500;
}

.action-checkbox.is-custom {
  padding: var(--space-xs) var(--space-sm);
  background: rgba(255, 159, 10, 0.1);
  border-radius: var(--radius-sm);
}

.custom-indicator {
  color: var(--color-warning);
  margin-left: auto;
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .section-header-with-toggle {
    flex-direction: column;
    align-items: flex-start;
  }

  .module-actions {
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
