<script setup lang="ts">
/**
 * 新增員工異動頁面
 */
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const router = useRouter()
const { createPromotion, isLoading } = usePayroll()
const { employees, fetchEmployees } = useEmployees()
const { branches, fetchBranches } = useBranches()
const { jobTitles, fetchJobTitles } = useJobTitles()

const formData = ref({
  employee_id: '',
  type: 'PROMOTION',
  effective_date: '',
  to_job_title_id: '',
  to_branch_id: '',
  new_base_salary: null as number | null,
  reason: ''
})

const errors = ref<Record<string, string>>({})

const typeOptions = [
  { value: 'PROMOTION', label: '升遷' },
  { value: 'TRANSFER', label: '調動' },
  { value: 'DEMOTION', label: '降職' }
]

// Selected employee info
const selectedEmployee = computed(() => {
  return employees.value.find(e => e.id === formData.value.employee_id)
})

onMounted(async () => {
  await Promise.all([fetchEmployees(), fetchBranches(), fetchJobTitles()])
})

// Validate form
const validateForm = () => {
  errors.value = {}

  if (!formData.value.employee_id) {
    errors.value.employee_id = '請選擇員工'
  }

  if (!formData.value.effective_date) {
    errors.value.effective_date = '請選擇生效日期'
  }

  if (formData.value.type === 'TRANSFER' && !formData.value.to_branch_id) {
    errors.value.to_branch_id = '調動需選擇目標分店'
  }

  if ((formData.value.type === 'PROMOTION' || formData.value.type === 'DEMOTION') && !formData.value.to_job_title_id) {
    errors.value.to_job_title_id = '升遷/降職需選擇目標職稱'
  }

  return Object.keys(errors.value).length === 0
}

// Submit form
const handleSubmit = async () => {
  if (!validateForm()) {
    toast.error(MESSAGES.COMMON.VALIDATION_ERROR)
    return
  }

  try {
    await createPromotion({
      ...formData.value,
      new_base_salary: formData.value.new_base_salary ? Number(formData.value.new_base_salary) : null
    })
    toast.success('異動紀錄建立成功')
    navigateTo('/hr/promotions')
  } catch (error) {
    console.error('Failed to create promotion:', error)
    toast.error('建立失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="新增員工異動"
      description="建立升遷、調動或降職紀錄"
      back-to="/hr/promotions"
    />

    <form class="form-container" @submit.prevent="handleSubmit">
      <div class="form-card">
        <h2 class="form-section-title">異動資訊</h2>

        <FormSelect
          v-model="formData.employee_id"
          label="選擇員工"
          required
          :error="errors.employee_id"
        >
          <option value="">請選擇員工</option>
          <option v-for="emp in employees" :key="emp.id" :value="emp.id">
            {{ emp.full_name }} ({{ emp.employee_code }})
          </option>
        </FormSelect>

        <!-- Current Info -->
        <div v-if="selectedEmployee" class="current-info">
          <div class="info-row">
            <span class="info-label">目前職稱</span>
            <span class="info-value">{{ selectedEmployee.job_title?.name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">目前分店</span>
            <span class="info-value">{{ selectedEmployee.branch?.name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">目前底薪</span>
            <span class="info-value">{{ selectedEmployee.base_salary ? `NT$ ${selectedEmployee.base_salary.toLocaleString()}` : '—' }}</span>
          </div>
        </div>

        <FormSelect
          v-model="formData.type"
          label="異動類型"
          :options="typeOptions"
          required
        />

        <FormDatePicker
          v-model="formData.effective_date"
          label="生效日期"
          required
          :error="errors.effective_date"
        />
      </div>

      <div class="form-card">
        <h2 class="form-section-title">異動內容</h2>

        <FormSelect
          v-if="formData.type !== 'TRANSFER'"
          v-model="formData.to_job_title_id"
          label="新職稱"
          :required="formData.type !== 'TRANSFER'"
          :error="errors.to_job_title_id"
        >
          <option value="">請選擇職稱</option>
          <option v-for="jt in jobTitles" :key="jt.id" :value="jt.id">
            {{ jt.name }}
          </option>
        </FormSelect>

        <FormSelect
          v-if="formData.type === 'TRANSFER'"
          v-model="formData.to_branch_id"
          label="調動至分店"
          :required="formData.type === 'TRANSFER'"
          :error="errors.to_branch_id"
        >
          <option value="">請選擇分店</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </FormSelect>

        <FormInput
          v-model="formData.new_base_salary"
          label="新底薪（選填）"
          type="number"
          placeholder="不填則維持原薪資"
        >
          <template #prefix>NT$</template>
        </FormInput>

        <FormTextarea
          v-model="formData.reason"
          label="異動原因"
          :rows="3"
          placeholder="說明異動原因..."
        />
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="router.back()">
          取消
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '建立中...' : '建立異動' }}
        </button>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.form-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  max-width: 600px;
}

.form-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

/* Current Info */
.current-info {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.info-label {
  color: var(--color-text-tertiary);
}

.info-value {
  color: var(--color-text-primary);
  font-weight: 500;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
}
</style>
