<script setup lang="ts">
/**
 * 產生薪資頁面
 */
import { MESSAGES } from '~/constants'
import { generatePayrollSchema, type GeneratePayrollInput } from '~/schemas/payroll.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'
import { useFormSubmit } from '~/composables/useFormSubmit'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const toast = useToast()
const { generatePayroll } = usePayroll()
const { branches, fetchBranches } = useBranches()
const { employees, fetchEmployees } = useEmployees()

// Get current period
function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Form state
const initialData: GeneratePayrollInput = {
  period: getCurrentPeriod(),
  branch_id: undefined,
  employee_ids: undefined
}

const {
  formData: form,
  errors,
  validate,
  setError,
  clearErrors
} = useZodFormValidation(generatePayrollSchema, initialData)

const { isSubmitting, submit } = useFormSubmit()

// Selection mode
const selectionMode = ref<'all' | 'branch' | 'selected'>('all')
const selectedEmployeeIds = ref<string[]>([])

// Filter employees by branch
const filteredEmployees = computed(() => {
  if (selectionMode.value === 'branch' && form.branch_id) {
    return employees.value.filter(e => e.branch_id === form.branch_id)
  }
  return employees.value
})

onMounted(async () => {
  await Promise.all([fetchBranches(), fetchEmployees()])
})

// Generate period options
const periodOptions = computed(() => {
  const options = []
  const now = new Date()
  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
    options.push({ value, label })
  }
  return options
})

// Form submission
const handleSubmit = async () => {
  clearErrors()

  if (!validate()) return

  await submit(
    async () => {
      const payload: GeneratePayrollInput = {
        period: form.period
      }

      if (selectionMode.value === 'branch' && form.branch_id) {
        payload.branch_id = form.branch_id
      } else if (selectionMode.value === 'selected' && selectedEmployeeIds.value.length > 0) {
        payload.employee_ids = selectedEmployeeIds.value
      }

      const result = await generatePayroll(payload)
      if (!result) {
        throw new Error('產生薪資失敗')
      }
      return result
    },
    {
      successMessage: '已成功產生薪資紀錄',
      errorMessage: '產生薪資失敗',
      onSuccess: () => router.push('/hr/payroll'),
      onError: (error) => setError('submit', error.message)
    }
  )
}

// Toggle employee selection
const toggleEmployee = (employeeId: string) => {
  const index = selectedEmployeeIds.value.indexOf(employeeId)
  if (index === -1) {
    selectedEmployeeIds.value.push(employeeId)
  } else {
    selectedEmployeeIds.value.splice(index, 1)
  }
}

const toggleAll = () => {
  if (selectedEmployeeIds.value.length === filteredEmployees.value.length) {
    selectedEmployeeIds.value = []
  } else {
    selectedEmployeeIds.value = filteredEmployees.value.map(e => e.id)
  }
}
</script>

<template>
  <div class="form-page">
    <!-- Header -->
    <header class="form-page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {{ MESSAGES.ACTIONS.BACK }}
      </button>
    </header>

    <!-- Hero -->
    <div class="form-hero">
      <div class="hero-icon hero-icon--green">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      </div>
      <h1 class="text-headline">產生薪資</h1>
      <p class="text-body text-secondary">選擇期間與員工範圍，系統將自動計算薪資</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Period Selection -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v4" /><path d="M16 2v4" />
            <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
          </svg>
          薪資期間
        </h2>

        <FormSelect
          v-model="form.period"
          label="選擇月份"
          :options="periodOptions"
          :required="true"
          :error="errors.period"
        />
      </section>

      <!-- Employee Selection -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          員工範圍
        </h2>

        <div class="selection-modes">
          <label :class="['mode-option', { active: selectionMode === 'all' }]">
            <input v-model="selectionMode" type="radio" value="all" />
            <div class="mode-content">
              <span class="mode-title">全部員工</span>
              <span class="mode-desc">為所有員工產生薪資</span>
            </div>
          </label>

          <label :class="['mode-option', { active: selectionMode === 'branch' }]">
            <input v-model="selectionMode" type="radio" value="branch" />
            <div class="mode-content">
              <span class="mode-title">依分店</span>
              <span class="mode-desc">選擇特定分店的員工</span>
            </div>
          </label>

          <label :class="['mode-option', { active: selectionMode === 'selected' }]">
            <input v-model="selectionMode" type="radio" value="selected" />
            <div class="mode-content">
              <span class="mode-title">自選員工</span>
              <span class="mode-desc">手動選擇特定員工</span>
            </div>
          </label>
        </div>

        <!-- Branch Selection -->
        <div v-if="selectionMode === 'branch'" class="branch-select">
          <FormSelect
            v-model="form.branch_id"
            label="選擇分店"
            :options="branches.map(b => ({ value: b.id, label: b.name }))"
            placeholder="請選擇分店"
          />
        </div>

        <!-- Employee Selection List -->
        <div v-if="selectionMode === 'selected'" class="employee-selection">
          <div class="selection-header">
            <button type="button" class="btn btn-ghost btn-small" @click="toggleAll">
              {{ selectedEmployeeIds.length === filteredEmployees.length ? '取消全選' : '全選' }}
            </button>
            <span class="selection-count">已選 {{ selectedEmployeeIds.length }} 人</span>
          </div>
          <div class="employee-list">
            <label
              v-for="employee in filteredEmployees"
              :key="employee.id"
              class="employee-checkbox"
              :class="{ selected: selectedEmployeeIds.includes(employee.id) }"
            >
              <input
                type="checkbox"
                :checked="selectedEmployeeIds.includes(employee.id)"
                @change="toggleEmployee(employee.id)"
              />
              <AppAvatar :name="employee.full_name" size="sm" variant="blue" />
              <div class="employee-info">
                <span class="employee-name">{{ employee.full_name }}</span>
                <span class="employee-code">{{ employee.employee_code }}</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <!-- Info -->
      <div class="info-banner">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <div class="info-content">
          <strong>薪資計算說明</strong>
          <p>系統將根據以下資料自動計算：底薪、出勤紀錄、加班時數、請假扣款、業績獎金等。</p>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="errors.submit" class="submit-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        {{ errors.submit }}
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" @click="router.back()">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ isSubmitting ? '產生中...' : '產生薪資' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-page {
  max-width: 800px;
  margin: 0 auto;
}

/* Header */
.form-page-header {
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

/* Hero */
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
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.hero-icon--green {
  background: linear-gradient(135deg, #34c759, #30d158);
}

/* Form Sections */
.form-container {
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

/* Selection Modes */
.selection-modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.mode-option {
  padding: var(--space-lg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast);
}

.mode-option input {
  display: none;
}

.mode-option:hover {
  border-color: var(--color-accent);
}

.mode-option.active {
  border-color: var(--color-accent);
  background: var(--color-accent-light);
}

.mode-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.mode-title {
  font-weight: 600;
  color: var(--color-text-primary);
}

.mode-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Branch Select */
.branch-select {
  margin-top: var(--space-lg);
}

/* Employee Selection */
.employee-selection {
  margin-top: var(--space-lg);
}

.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.selection-count {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.employee-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-sm);
  max-height: 300px;
  overflow-y: auto;
}

.employee-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast);
}

.employee-checkbox input {
  display: none;
}

.employee-checkbox:hover {
  border-color: var(--color-accent);
}

.employee-checkbox.selected {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
}

.employee-info {
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-size: 14px;
  font-weight: 500;
}

.employee-code {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Info Banner */
.info-banner {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: rgba(0, 122, 255, 0.05);
  border: 1px solid rgba(0, 122, 255, 0.2);
  border-radius: var(--radius-lg);
  color: var(--color-accent);
}

.info-banner svg {
  flex-shrink: 0;
}

.info-content strong {
  display: block;
  margin-bottom: var(--space-xs);
}

.info-content p {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
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
  animation: fadeUp 0.6s var(--ease-out) 0.25s backwards;
}

.btn-spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .selection-modes {
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
