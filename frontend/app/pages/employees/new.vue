<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createEmployee } = useEmployees()
const { branches, fetchBranches } = useBranches()
const { jobTitles, fetchJobTitles } = useJobTitles()

const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  full_name: '',
  employee_code: '',
  branch_id: '',
  job_title_id: '',
  employment_status: 'ACTIVE' as 'ACTIVE' | 'RESIGNED' | 'LEAVE',
  employment_type: 'FULL_TIME' as 'FULL_TIME' | 'PART_TIME' | 'FREELANCE',
  basic_salary: null as number | null
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

onMounted(async () => {
  await Promise.all([fetchBranches(), fetchJobTitles()])
  // 預設選擇第一個分店
  if (branches.value.length > 0 && !form.branch_id) {
    form.branch_id = branches.value[0].id
  }
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
      branch_id: form.branch_id || null,
      job_title_id: form.job_title_id || null,
      basic_salary: form.basic_salary || null
    }

    await createEmployee(employeeData)
    router.push('/employees')
  } catch (error) {
    console.error('Failed to create employee:', error)
    errors.value.submit = '建立員工失敗，請稍後再試'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="employee-form-page">
    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        返回
      </button>
    </header>

    <!-- Form Hero -->
    <div class="form-hero">
      <div class="hero-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" x2="19" y1="8" y2="14"/>
          <line x1="22" x2="16" y1="11" y2="11"/>
        </svg>
      </div>
      <h1 class="text-headline">新增員工</h1>
      <p class="text-body text-secondary">填寫員工基本資料與職務資訊</p>
    </div>

    <!-- Form -->
    <form class="employee-form" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
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
            <label class="input-label">所屬分店</label>
            <select v-model="form.branch_id" class="input">
              <option value="">請選擇分店</option>
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </select>
          </div>

          <div class="input-group">
            <label class="input-label">職位</label>
            <select v-model="form.job_title_id" class="input">
              <option value="">請選擇職位</option>
              <option v-for="jobTitle in jobTitles" :key="jobTitle.id" :value="jobTitle.id">
                {{ jobTitle.name }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <!-- Employment Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
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

      <!-- Error Message -->
      <div v-if="errors.submit" class="submit-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        {{ errors.submit }}
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" @click="router.back()">取消</button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          {{ isSubmitting ? '建立中...' : '建立員工' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.employee-form-page {
  max-width: 800px;
  margin: 0 auto;
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
  background: linear-gradient(135deg, #34c759, #30d158);
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
