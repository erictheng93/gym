<script setup lang="ts">
/**
 * 新增績效考核頁面
 */
import { MESSAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()
const router = useRouter()
const { createReview, kpiTemplates, fetchKPITemplates, isLoading } = usePerformance()
const { employees, fetchEmployees } = useEmployees()

const formData = ref({
  employee_id: '',
  review_period: getCurrentPeriod(),
  review_type: 'MONTHLY',
  template_id: '',
  score: null as number | null,
  comments: ''
})

const errors = ref<Record<string, string>>({})

const typeOptions = [
  { value: 'MONTHLY', label: '月考核' },
  { value: 'QUARTERLY', label: '季考核' },
  { value: 'ANNUAL', label: '年度考核' }
]

// Get current period (YYYY-MM or YYYY-QX)
function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Generate period options based on type
const periodOptions = computed(() => {
  const now = new Date()
  const options = []

  if (formData.value.review_type === 'MONTHLY') {
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
      options.push({ value, label })
    }
  } else if (formData.value.review_type === 'QUARTERLY') {
    for (let i = 0; i < 8; i++) {
      const quarter = Math.floor((now.getMonth() - i * 3) / 3) + 1
      const year = now.getFullYear() - Math.floor((i * 3 + (3 - now.getMonth() % 3)) / 12)
      const adjustedQuarter = ((quarter - 1 + 4) % 4) + 1
      const value = `${year}-Q${adjustedQuarter}`
      const label = `${year} 年 Q${adjustedQuarter}`
      options.push({ value, label })
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const year = now.getFullYear() - i
      options.push({ value: String(year), label: `${year} 年` })
    }
  }

  return options
})

// Watch type change to reset period
watch(() => formData.value.review_type, () => {
  formData.value.review_period = periodOptions.value[0]?.value || ''
})

onMounted(async () => {
  await Promise.all([fetchEmployees(), fetchKPITemplates()])
})

// Validate form
const validateForm = () => {
  errors.value = {}

  if (!formData.value.employee_id) {
    errors.value.employee_id = '請選擇員工'
  }

  if (!formData.value.review_period) {
    errors.value.review_period = '請選擇考核期間'
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
    const result = await createReview({
      ...formData.value,
      score: formData.value.score ? Number(formData.value.score) : null
    })
    toast.success('考核建立成功')
    navigateTo(`/hr/performance/${result.id}`)
  } catch (error) {
    console.error('Failed to create review:', error)
    toast.error('建立考核失敗')
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="新增績效考核"
      description="建立員工績效考核"
      back-to="/hr/performance"
    />

    <form class="form-container" @submit.prevent="handleSubmit">
      <div class="form-card">
        <h2 class="form-section-title">考核資訊</h2>

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

        <FormSelect
          v-model="formData.review_type"
          label="考核類型"
          :options="typeOptions"
          required
        />

        <FormSelect
          v-model="formData.review_period"
          label="考核期間"
          required
          :error="errors.review_period"
        >
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </FormSelect>

        <FormSelect
          v-if="kpiTemplates.length"
          v-model="formData.template_id"
          label="套用 KPI 範本"
        >
          <option value="">不套用範本</option>
          <option v-for="tpl in kpiTemplates" :key="tpl.id" :value="tpl.id">
            {{ tpl.name }}
          </option>
        </FormSelect>
      </div>

      <div class="form-card">
        <h2 class="form-section-title">初步評分（選填）</h2>

        <FormInput
          v-model="formData.score"
          label="考核分數"
          type="number"
          :min="0"
          :max="100"
          placeholder="0-100"
        />

        <FormTextarea
          v-model="formData.comments"
          label="考核評語"
          :rows="4"
          placeholder="輸入初步評語..."
        />
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="router.back()">
          取消
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '建立中...' : '建立考核' }}
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
}
</style>
