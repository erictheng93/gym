<script setup lang="ts">
import { MESSAGES, PAGES, LABELS } from '~/constants'
import { required, positive, between, maxLength } from '@gym-nexus/ui/composables'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const { createContract } = useContracts()
const { members, fetchMembers } = useMembers()
const { plans, fetchPlans } = usePlans()
const { branches, fetchBranches } = useBranches()

const isLoading = ref(true)
const isSubmitting = ref(false)
const currentStep = ref(1)
const totalSteps = 3

// Form validation - 使用 composable
const { errors, validate, setError, clearErrors, clearFieldError } = useFormValidation<typeof form>()

const form = reactive({
  member_id: route.query.member as string || '',
  plan_id: '',
  branch_id: '',
  start_date: new Date().toISOString().split('T')[0],
  total_amount: 0,
  notes: '',
  digital_signature: ''
})

const selectedMember = computed(() => members.value.find(m => m.id === form.member_id))
const selectedPlan = computed(() => plans.value.find(p => p.id === form.plan_id))

// 計算結束日期
const calculatedEndDate = computed(() => {
  if (!form.start_date || !selectedPlan.value?.duration_months) return ''

  const start = new Date(form.start_date)
  start.setMonth(start.getMonth() + selectedPlan.value.duration_months)
  return start.toISOString().split('T')[0]
})

// 當選擇方案時自動更新金額
watch(() => form.plan_id, () => {
  if (selectedPlan.value) {
    form.total_amount = selectedPlan.value.price
  }
})

onMounted(async () => {
  isLoading.value = true
  await Promise.all([
    fetchMembers({ limit: 100 }),
    fetchPlans(),
    fetchBranches()
  ])

  // 預設選擇第一個分店
  if (branches.value.length > 0 && !form.branch_id) {
    form.branch_id = branches.value[0].id
  }

  isLoading.value = false
})

const validateStep = (step: number) => {
  clearErrors()

  if (step === 1) {
    return validate(form, {
      member_id: [required(PAGES.CONTRACTS.ERROR_SELECT_MEMBER)],
      plan_id: [required(PAGES.CONTRACTS.ERROR_SELECT_PLAN)],
      branch_id: [required(PAGES.CONTRACTS.ERROR_SELECT_BRANCH)],
      start_date: [required(PAGES.CONTRACTS.ERROR_SELECT_START_DATE)]
    })
  }

  if (step === 2) {
    return validate(form, {
      total_amount: [
        positive(PAGES.CONTRACTS.ERROR_AMOUNT_POSITIVE),
        between(1, 10000000, '合約金額需介於 1 至 10,000,000 之間')
      ],
      notes: [maxLength(500, '備註不能超過 500 個字')]
    })
  }

  if (step === 3) {
    return validate(form, {
      digital_signature: [required(PAGES.CONTRACTS.ERROR_SIGNATURE_REQUIRED)]
    })
  }

  return true
}

const nextStep = () => {
  if (validateStep(currentStep.value)) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const handleSubmit = async () => {
  if (!validateStep(3)) return

  isSubmitting.value = true
  try {
    const contractData = {
      member_id: form.member_id,
      plan_id: form.plan_id,
      branch_id: form.branch_id,
      start_date: form.start_date,
      end_date: calculatedEndDate.value,
      original_end_date: calculatedEndDate.value,
      sign_date: new Date().toISOString().split('T')[0],
      total_amount: form.total_amount,
      notes: form.notes,
      digital_signature: form.digital_signature,
      contract_status: 'ACTIVE' as const,
      payment_status: 'UNPAID' as const,
      remaining_counts: selectedPlan.value?.class_counts || null
    }

    await createContract(contractData)
    useToast().success(MESSAGES.SUCCESS.CONTRACT_CREATED)
    router.push('/contracts')
  } catch (error) {
    console.error('Failed to create contract:', error)
    useToast().error(MESSAGES.ERRORS.CONTRACT_CREATE_FAILED)
    setError('submit', PAGES.CONTRACTS.ERROR_CREATE_FAILED)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="contract-form-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">{{ MESSAGES.ACTIONS.LOADING }}</p>
    </div>

    <template v-else>
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          {{ MESSAGES.ACTIONS.BACK }}
        </button>
      </header>

      <!-- Form Hero -->
      <div class="form-hero">
        <div class="hero-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
            <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
            <path d="M12 18v-6"/>
            <path d="M9 15h6"/>
          </svg>
        </div>
        <h1 class="text-headline">{{ PAGES.CONTRACTS.CREATE_TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.CONTRACTS.CREATE_CONTRACT }}</p>
      </div>

      <!-- Progress Steps -->
      <div class="progress-steps">
        <div
          v-for="step in totalSteps"
          :key="step"
          class="step"
          :class="{ active: currentStep >= step, current: currentStep === step }"
        >
          <div class="step-number">{{ step }}</div>
          <span class="step-label">
            {{ step === 1 ? PAGES.CONTRACTS.STEP_SELECT_PLAN : step === 2 ? PAGES.CONTRACTS.STEP_CONFIRM : PAGES.CONTRACTS.STEP_SIGN }}
          </span>
        </div>
        <div class="progress-line">
          <div class="progress-fill" :style="{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }" />
        </div>
      </div>

      <!-- Form -->
      <form class="contract-form" @submit.prevent="handleSubmit">
        <!-- Step 1: Select Plan -->
        <section v-if="currentStep === 1" class="form-step glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
            </svg>
            {{ PAGES.CONTRACTS.SELECT_MEMBER_PLAN }}
          </h2>

          <div class="form-grid">
            <div class="input-group required full-width">
              <label class="input-label">{{ PAGES.CONTRACTS.SELECT_MEMBER }}</label>
              <select v-model="form.member_id" class="input" :class="{ 'input-error': errors.member_id }">
                <option value="">{{ PAGES.CONTRACTS.SELECT_MEMBER_PLACEHOLDER }}</option>
                <option v-for="member in members" :key="member.id" :value="member.id">
                  {{ member.full_name }} ({{ member.member_code }})
                </option>
              </select>
              <span v-if="errors.member_id" class="error-text">{{ errors.member_id }}</span>
            </div>

            <div class="input-group required">
              <label class="input-label">{{ PAGES.CONTRACTS.SELECT_PLAN }}</label>
              <select v-model="form.plan_id" class="input" :class="{ 'input-error': errors.plan_id }">
                <option value="">{{ PAGES.CONTRACTS.SELECT_PLAN_PLACEHOLDER }}</option>
                <option v-for="plan in plans" :key="plan.id" :value="plan.id">
                  {{ plan.name }} - NT$ {{ plan.price.toLocaleString() }}
                </option>
              </select>
              <span v-if="errors.plan_id" class="error-text">{{ errors.plan_id }}</span>
            </div>

            <div class="input-group required">
              <label class="input-label">{{ PAGES.CONTRACTS.SELECT_BRANCH }}</label>
              <select v-model="form.branch_id" class="input" :class="{ 'input-error': errors.branch_id }">
                <option value="">{{ PAGES.CONTRACTS.SELECT_BRANCH_PLACEHOLDER }}</option>
                <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                  {{ branch.name }}
                </option>
              </select>
              <span v-if="errors.branch_id" class="error-text">{{ errors.branch_id }}</span>
            </div>

            <div class="input-group required">
              <label class="input-label">{{ PAGES.CONTRACTS.SELECT_START_DATE }}</label>
              <input
                v-model="form.start_date"
                type="date"
                class="input"
                :class="{ 'input-error': errors.start_date }"
              />
              <span v-if="errors.start_date" class="error-text">{{ errors.start_date }}</span>
            </div>
          </div>

          <!-- Plan Preview -->
          <div v-if="selectedPlan" class="plan-preview">
            <div class="preview-header">
              <h4>{{ selectedPlan.name }}</h4>
              <span class="plan-type-badge">
                {{ selectedPlan.plan_type === 'TIME_BASED' ? LABELS.CONTRACT_TYPE.TIME_BASED : LABELS.CONTRACT_TYPE.COUNT_BASED }}
              </span>
            </div>
            <div class="preview-details">
              <div v-if="selectedPlan.duration_months" class="preview-item">
                <span class="preview-label">{{ PAGES.CONTRACTS.DURATION_LABEL }}</span>
                <span class="preview-value">{{ selectedPlan.duration_months }} {{ PAGES.CONTRACTS.MONTHS }}</span>
              </div>
              <div v-if="selectedPlan.class_counts" class="preview-item">
                <span class="preview-label">{{ PAGES.CONTRACTS.CLASS_COUNTS }}</span>
                <span class="preview-value">{{ selectedPlan.class_counts }} {{ PAGES.CONTRACTS.TIMES }}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">{{ PAGES.CONTRACTS.ALLOW_PAUSE }}</span>
                <span class="preview-value" :class="selectedPlan.allow_pause ? 'text-success' : 'text-error'">
                  {{ selectedPlan.allow_pause ? LABELS.YES : LABELS.NO }}
                </span>
              </div>
              <div class="preview-item">
                <span class="preview-label">{{ PAGES.CONTRACTS.ALLOW_TRANSFER }}</span>
                <span class="preview-value" :class="selectedPlan.allow_transfer ? 'text-success' : 'text-error'">
                  {{ selectedPlan.allow_transfer ? LABELS.YES : LABELS.NO }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Step 2: Confirm Info -->
        <section v-if="currentStep === 2" class="form-step glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {{ PAGES.CONTRACTS.CONFIRM_CONTRACT_INFO }}
          </h2>

          <!-- Contract Summary -->
          <div class="contract-summary">
            <div class="summary-section">
              <h4>{{ PAGES.CONTRACTS.MEMBER_INFO }}</h4>
              <div class="summary-row">
                <span class="summary-label">{{ PAGES.CONTRACTS.MEMBER_NAME }}</span>
                <span class="summary-value">{{ selectedMember?.full_name }}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">{{ PAGES.CONTRACTS.MEMBER_CODE }}</span>
                <span class="summary-value">{{ selectedMember?.member_code }}</span>
              </div>
            </div>

            <div class="summary-section">
              <h4>{{ PAGES.CONTRACTS.PLAN_INFO }}</h4>
              <div class="summary-row">
                <span class="summary-label">{{ PAGES.CONTRACTS.PLAN_NAME }}</span>
                <span class="summary-value">{{ selectedPlan?.name }}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">{{ PAGES.CONTRACTS.CONTRACT_PERIOD }}</span>
                <span class="summary-value">
                  {{ formatDate(form.start_date) }} ~ {{ formatDate(calculatedEndDate) }}
                </span>
              </div>
            </div>

            <div class="summary-section">
              <h4>{{ PAGES.CONTRACTS.PAYMENT_INFO }}</h4>
              <div class="input-group">
                <label class="input-label">{{ PAGES.CONTRACTS.CONTRACT_AMOUNT }}</label>
                <div class="amount-input">
                  <span class="currency">NT$</span>
                  <input
                    v-model.number="form.total_amount"
                    type="number"
                    class="input"
                    :class="{ 'input-error': errors.total_amount }"
                    min="0"
                  />
                </div>
                <span v-if="errors.total_amount" class="error-text">{{ errors.total_amount }}</span>
              </div>
            </div>

            <div class="summary-section">
              <h4>{{ MESSAGES.FORM.NOTES }}</h4>
              <textarea
                v-model="form.notes"
                class="input"
                rows="3"
                :placeholder="PAGES.CONTRACTS.NOTES_PLACEHOLDER"
              ></textarea>
            </div>
          </div>

          <!-- Total Amount Display -->
          <div class="total-amount-card">
            <span class="total-label">{{ PAGES.CONTRACTS.TOTAL_AMOUNT }}</span>
            <span class="total-value">NT$ {{ form.total_amount.toLocaleString() }}</span>
          </div>
        </section>

        <!-- Step 3: Signature -->
        <section v-if="currentStep === 3" class="form-step glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            {{ PAGES.CONTRACTS.E_SIGNATURE }}
          </h2>

          <div class="signature-section">
            <p class="signature-notice text-secondary">
              {{ PAGES.CONTRACTS.SIGN_INSTRUCTION }}
            </p>

            <SignaturePad v-model="form.digital_signature" />
            <span v-if="errors.digital_signature" class="error-text">{{ errors.digital_signature }}</span>

            <!-- Contract Terms -->
            <div class="contract-terms">
              <h4>{{ PAGES.CONTRACTS.CONTRACT_TERMS }}</h4>
              <ul>
                <li>本合約自 {{ formatDate(form.start_date) }} 起生效，至 {{ formatDate(calculatedEndDate) }} 止。</li>
                <li>合約金額為 NT$ {{ form.total_amount.toLocaleString() }}。</li>
                <li v-if="selectedPlan?.allow_pause">{{ PAGES.CONTRACTS.PAUSE_HINT }}</li>
                <li v-if="selectedPlan?.allow_transfer">本方案允許轉讓給其他會員。</li>
                <li>{{ PAGES.CONTRACTS.SIGN_LEGAL_NOTE }}</li>
              </ul>
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
          <button v-if="currentStep > 1" type="button" class="btn btn-ghost" @click="prevStep">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            {{ MESSAGES.ACTIONS.PREVIOUS }}
          </button>
          <button v-else type="button" class="btn btn-ghost" @click="router.back()">{{ MESSAGES.FORM.CANCEL }}</button>

          <button v-if="currentStep < totalSteps" type="button" class="btn btn-primary btn-large" @click="nextStep">
            {{ MESSAGES.ACTIONS.NEXT }}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
          <button v-else type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
            <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : PAGES.CONTRACTS.COMPLETE_SIGN }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.contract-form-page {
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
  padding: var(--space-xl) 0;
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.hero-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-2xl);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

/* Progress Steps */
.progress-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  max-width: 500px;
  margin: 0 auto var(--space-2xl);
  padding: 0 var(--space-lg);
  animation: fadeUp 0.6s var(--ease-out) 0.15s backwards;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  z-index: 1;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 16px;
  transition: all var(--duration-normal) var(--ease-out);
}

.step.active .step-number {
  background: var(--color-accent);
  color: white;
}

.step.current .step-number {
  box-shadow: 0 0 0 4px var(--color-accent-light);
}

.step-label {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-weight: 500;
  transition: color var(--duration-fast) var(--ease-out);
}

.step.active .step-label {
  color: var(--color-text-primary);
}

.progress-line {
  position: absolute;
  top: 20px;
  left: 60px;
  right: 60px;
  height: 2px;
  background: var(--color-bg-tertiary);
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width var(--duration-normal) var(--ease-out);
}

/* Form Steps */
.form-step {
  padding: var(--space-xl);
  animation: fadeUp 0.5s var(--ease-out);
}

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

.full-width {
  grid-column: 1 / -1;
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

.error-text {
  font-size: 13px;
  color: var(--color-error);
}

/* Plan Preview */
.plan-preview {
  margin-top: var(--space-xl);
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.preview-header h4 {
  font-size: 17px;
  font-weight: 600;
}

.plan-type-badge {
  font-size: 12px;
  padding: 4px 10px;
  background: var(--color-accent-light);
  color: var(--color-accent);
  border-radius: var(--radius-full);
  font-weight: 500;
}

.preview-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.preview-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.preview-label {
  color: var(--color-text-secondary);
}

.preview-value {
  font-weight: 500;
}

.text-success { color: var(--color-success); }
.text-error { color: var(--color-error); }

/* Contract Summary */
.contract-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.summary-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: var(--space-md);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-divider);
}

.summary-label {
  color: var(--color-text-secondary);
}

.summary-value {
  font-weight: 500;
}

.amount-input {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.currency {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.amount-input .input {
  flex: 1;
}

/* Total Amount Card */
.total-amount-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-xl);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  border-radius: var(--radius-lg);
  color: white;
  margin-top: var(--space-xl);
}

.total-label {
  font-size: 16px;
  font-weight: 500;
}

.total-value {
  font-size: 28px;
  font-weight: 700;
  font-family: var(--font-mono);
}

/* Signature Section */
.signature-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.signature-notice {
  font-size: 15px;
  text-align: center;
}

/* Contract Terms */
.contract-terms {
  padding: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.contract-terms h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: var(--space-md);
}

.contract-terms ul {
  margin: 0;
  padding-left: var(--space-lg);
}

.contract-terms li {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.8;
}

/* Submit Error */
.submit-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  margin-top: var(--space-lg);
  background: rgba(255, 59, 48, 0.1);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 14px;
}

/* Form Actions */
.form-actions {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  padding-top: var(--space-xl);
}

.btn-spinner {
  animation: spin 0.8s linear infinite;
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .preview-details {
    grid-template-columns: 1fr;
  }

  .progress-steps {
    padding: 0;
  }

  .step-label {
    display: none;
  }

  .progress-line {
    left: 40px;
    right: 40px;
  }
}
</style>
