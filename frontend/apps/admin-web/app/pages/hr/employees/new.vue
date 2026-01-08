<script setup lang="ts">
/**
 * 新增員工頁面
 *
 * 使用 @gym-nexus/ui 表單組件重構
 */
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createEmployee, employees, fetchEmployees } = useEmployees()
const { branches, fetchBranches } = useBranches()
const { jobTitles, fetchJobTitles } = useJobTitles()

// Form state
const isSubmitting = ref(false)
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
  basic_salary: null as number | null
})

// Form validation
const { errors, validate, setError, clearErrors } = useFormValidation<typeof form>()

// Options
const branchOptions = computed(() =>
  branches.value.map(b => ({ value: b.id, label: b.name }))
)

const jobTitleOptions = computed(() =>
  jobTitles.value.map(j => ({ value: j.id, label: j.name }))
)

const supervisorOptions = computed(() =>
  employees.value
    .filter(e => e.employment_status === 'ACTIVE')
    .map(e => ({ value: e.id, label: e.full_name }))
)

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

// Initial load
onMounted(async () => {
  await Promise.all([
    fetchBranches(),
    fetchJobTitles(),
    fetchEmployees({ limit: 100, status: 'ACTIVE' })
  ])
  if (branches.value.length > 0 && !form.branch_id) {
    form.branch_id = branches.value[0].id
  }
})

// Form submission
const handleSubmit = async () => {
  clearErrors()

  const isValid = validate(form, {
    full_name: [required('請輸入員工姓名')]
  })

  if (!isValid) return

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
      basic_salary: form.basic_salary || null
    }

    await createEmployee(employeeData)
    useToast().success(MESSAGES.SUCCESS.EMPLOYEE_CREATED)
    router.push('/hr/employees')
  } catch (error) {
    console.error('Failed to create employee:', error)
    useToast().error(MESSAGES.ERRORS.EMPLOYEE_CREATE_FAILED)
    setError('submit', '建立員工失敗，請稍後再試')
  } finally {
    isSubmitting.value = false
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      </div>
      <h1 class="text-headline">新增員工</h1>
      <p class="text-body text-secondary">填寫員工基本資料與職務資訊</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          基本資料
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.full_name"
            label="姓名"
            placeholder="請輸入員工姓名"
            :required="true"
            :error="errors.full_name"
          />

          <FormInput
            v-model="form.employee_code"
            label="員工編號"
            placeholder="自動產生或手動輸入"
          />

          <FormInput
            v-model="form.phone"
            label="聯絡電話"
            type="tel"
            placeholder="請輸入聯絡電話"
          />

          <FormInput
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="請輸入 Email"
          />
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
          <FormSelect
            v-model="form.branch_id"
            label="所屬分店"
            :options="branchOptions"
            placeholder="請選擇分店"
            :required="true"
          />

          <FormSelect
            v-model="form.job_title_id"
            label="職位"
            :options="jobTitleOptions"
            placeholder="請選擇職位"
          />

          <FormSelect
            v-model="form.supervisor_id"
            label="直屬主管"
            :options="supervisorOptions"
            placeholder="請選擇主管（選填）"
            help-text="用於休假審核流程"
          />
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
          <FormRadioGroup
            v-model="form.employment_status"
            label="任職狀態"
            :options="employmentStatusOptions"
          />

          <FormRadioGroup
            v-model="form.employment_type"
            label="聘用類型"
            :options="employmentTypeOptions"
          />

          <FormInput
            v-model="form.hire_date"
            label="到職日期"
            type="date"
          />

          <FormInput
            v-model="form.basic_salary"
            label="基本薪資"
            type="number"
            placeholder="請輸入金額"
            prefix="NT$"
            :min="0"
          />
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
        <button type="button" class="btn btn-ghost" @click="router.back()">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : '建立員工' }}
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

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
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
