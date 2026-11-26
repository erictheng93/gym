<script lang="ts">
const paymentNumberFormatter = new Intl.NumberFormat('zh-TW')

/** YYYY-MM-DD of the viewer's local calendar day */
const localIsoDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
</script>

<script setup lang="ts">
import { MESSAGES, PAGES, LABELS } from '~/constants'
import type { PaymentMethod, PaymentType } from '~/types/schema'
import type { PayableContract } from '~/composables/usePayments'
// Validation rules are auto-imported from @gym-nexus/ui/composables/useFormValidation

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const { createPayment, fetchMemberContracts } = usePayments()
const { members, fetchMembers } = useMembers()
const { branches, fetchBranches } = useBranches()

const isLoading = ref(true)
const isSubmitting = ref(false)

const form = reactive({
  memberId: route.query.member as string || '',
  contractId: route.query.contract as string || '',
  amount: 0,
  paymentMethod: 'CASH' as PaymentMethod,
  paymentType: 'INCOME' as PaymentType,
  paymentDate: localIsoDate(new Date()),
  branchId: '',
  notes: ''
})

const memberContracts = ref<PayableContract[]>([])

// Form validation - 使用 composable
const { errors, validate, setError, clearErrors } = useFormValidation<typeof form>()

// Values are the backend enum (POST /api/payments paymentMethod)
const paymentMethods: Array<{ value: PaymentMethod; label: string; icon: string }> = [
  { value: 'CASH', label: LABELS.PAYMENT_METHOD.CASH, icon: '💵' },
  { value: 'CREDIT_CARD', label: LABELS.PAYMENT_METHOD.CREDIT_CARD, icon: '💳' },
  { value: 'LINE_PAY', label: LABELS.PAYMENT_METHOD.LINE_PAY, icon: '📱' },
  { value: 'BANK_TRANSFER', label: LABELS.PAYMENT_METHOD.BANK_TRANSFER, icon: '🏦' }
]

// The members API answers in camelCase; the shared Member type still lists snake_case too
type MemberOption = { id: string; fullName?: string; full_name?: string; memberCode?: string; member_code?: string }
const memberName = (m?: MemberOption) => m?.fullName ?? m?.full_name ?? ''
const memberCode = (m?: MemberOption) => m?.memberCode ?? m?.member_code ?? ''

const selectedMember = computed(() => (members.value as MemberOption[]).find(m => m.id === form.memberId))
const selectedContract = computed(() => memberContracts.value.find(c => c.id === form.contractId))
const remainingAmount = (c: PayableContract) => Math.max(c.totalAmount - c.paidAmount, 0)

const loadMemberContracts = async (memberId: string) => {
  memberContracts.value = memberId ? await fetchMemberContracts(memberId) : []
  // keep a preset contract (?contract=) only when it belongs to this member
  if (!memberContracts.value.some(c => c.id === form.contractId)) {
    form.contractId = memberContracts.value.length === 1 ? memberContracts.value[0]!.id : ''
  }
}

// 當選擇會員時，載入該會員的合約
watch(() => form.memberId, (memberId) => loadMemberContracts(memberId))

// 當選擇合約時：收款預設帶入尚未付清的金額，分店預設為合約分店
watch(() => form.contractId, () => {
  const contract = selectedContract.value
  if (!contract) return
  if (form.paymentType === 'INCOME') form.amount = remainingAmount(contract)
  if (contract.branchId && branches.value.some(b => b.id === contract.branchId)) {
    form.branchId = contract.branchId
  }
})

onMounted(async () => {
  isLoading.value = true
  await Promise.all([
    fetchMembers({ limit: 100 }),
    fetchBranches(),
    form.memberId ? loadMemberContracts(form.memberId) : Promise.resolve()
  ])

  const contractBranch = selectedContract.value?.branchId
  if (contractBranch && branches.value.some(b => b.id === contractBranch)) {
    form.branchId = contractBranch
  } else if (branches.value.length > 0 && !form.branchId) {
    // 預設選擇第一個分店
    form.branchId = branches.value[0]!.id
  }
  if (selectedContract.value && form.paymentType === 'INCOME' && !form.amount) {
    form.amount = remainingAmount(selectedContract.value)
  }

  isLoading.value = false
})

const handleSubmit = async () => {
  clearErrors()

  const isValid = validate(form, {
    memberId: [required(PAGES.PAYMENTS.ERROR_SELECT_MEMBER)],
    contractId: [required(PAGES.PAYMENTS.ERROR_SELECT_CONTRACT)],
    amount: [
      positive(PAGES.PAYMENTS.ERROR_AMOUNT_POSITIVE),
      between(1, 10000000, '金額需介於 1 至 10,000,000 之間')
    ],
    paymentDate: [
      required(PAGES.PAYMENTS.ERROR_SELECT_DATE),
      dateNotFuture('付款日期不能是未來日期')
    ],
    branchId: [required(PAGES.PAYMENTS.ERROR_SELECT_BRANCH)],
    notes: [maxLength(500, '備註不能超過 500 個字')]
  })

  if (!isValid) return

  isSubmitting.value = true
  try {
    // Field names are exactly the backend createPaymentSchema (camelCase)
    const created = await createPayment({
      contractId: form.contractId,
      memberId: form.memberId,
      branchId: form.branchId,
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      paymentType: form.paymentType,
      paymentDate: form.paymentDate,
      notes: form.notes || null
    })

    // createPayment already showed the backend's reason; stay on the form
    if (!created) {
      setError('submit', PAGES.PAYMENTS.ERROR_CREATE_FAILED)
      return
    }

    useToast().success(MESSAGES.SUCCESS.PAYMENT_CREATED)
    router.push('/payments')
  } finally {
    isSubmitting.value = false
  }
}

const formatCurrency = (amount: number) => {
  return `NT$ ${paymentNumberFormatter.format(amount)}`
}
</script>

<template>
  <div class="payment-form-page">
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
            <path d="m15 18-6-6 6-6" />
          </svg>
          {{ MESSAGES.ACTIONS.BACK }}
        </button>
      </header>

      <!-- Form Hero -->
      <div class="form-hero">
        <div class="hero-icon" :class="form.paymentType === 'INCOME' ? 'hero-income' : 'hero-refund'">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <h1 class="text-headline">{{ form.paymentType === 'INCOME' ? PAGES.PAYMENTS.ADD_PAYMENT : PAGES.PAYMENTS.ADD_REFUND }}</h1>
        <p class="text-body text-secondary">{{ PAGES.PAYMENTS.RECORD_INFO }}</p>
      </div>

      <!-- Payment Type Toggle -->
      <div class="type-toggle glass-card-flat">
        <button
          class="type-option"
          :class="{ active: form.paymentType === 'INCOME' }"
          @click="form.paymentType = 'INCOME'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          {{ LABELS.PAYMENT_TYPE.INCOME }}
        </button>
        <button
          class="type-option refund"
          :class="{ active: form.paymentType === 'REFUND' }"
          @click="form.paymentType = 'REFUND'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 7 9 13 3 19" />
            <line x1="21" x2="9" y1="13" y2="13" />
          </svg>
          {{ LABELS.PAYMENT_TYPE.REFUND }}
        </button>
      </div>

      <!-- Form -->
      <form class="payment-form" @submit.prevent="handleSubmit">
        <!-- Member & Contract Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            {{ PAGES.PAYMENTS.MEMBER_CONTRACT }}
          </h2>

          <div class="form-grid">
            <div class="input-group required full-width">
              <label class="input-label">{{ PAGES.PAYMENTS.SELECT_MEMBER }}</label>
              <select v-model="form.memberId" class="input" :class="{ 'input-error': errors.memberId }">
                <option value="">{{ PAGES.PAYMENTS.SELECT_MEMBER_PLACEHOLDER }}</option>
                <option v-for="member in members" :key="member.id" :value="member.id">
                  {{ memberName(member) }} ({{ memberCode(member) }})
                </option>
              </select>
              <span v-if="errors.memberId" class="error-text">{{ errors.memberId }}</span>
            </div>

            <div class="input-group required full-width">
              <label class="input-label">{{ PAGES.PAYMENTS.RELATED_CONTRACT }}</label>
              <select
                v-model="form.contractId"
                class="input"
                :class="{ 'input-error': errors.contractId }"
                :disabled="!form.memberId || memberContracts.length === 0"
              >
                <option value="">{{ PAGES.PAYMENTS.SELECT_CONTRACT_PLACEHOLDER }}</option>
                <option v-for="contract in memberContracts" :key="contract.id" :value="contract.id">
                  {{ contract.contractNo }} - {{ contract.plan?.name }} ({{ formatCurrency(contract.totalAmount) }})
                </option>
              </select>
              <span v-if="errors.contractId" class="error-text">{{ errors.contractId }}</span>
              <span v-else-if="!form.memberId" class="hint-text">{{ PAGES.PAYMENTS.SELECT_MEMBER_FIRST }}</span>
              <span v-else-if="memberContracts.length === 0" class="hint-text">{{ PAGES.PAYMENTS.NO_MEMBER_CONTRACTS }}</span>
            </div>
          </div>

          <!-- Selected Info Preview -->
          <div v-if="selectedMember" class="selected-preview">
            <div class="preview-item">
              <span class="preview-label">{{ PAGES.PAYMENTS.MEMBER }}</span>
              <span class="preview-value">{{ memberName(selectedMember) }}</span>
            </div>
            <div v-if="selectedContract" class="preview-item">
              <span class="preview-label">{{ PAGES.PAYMENTS.CONTRACT_AMOUNT }}</span>
              <span class="preview-value">{{ formatCurrency(selectedContract.totalAmount) }}</span>
            </div>
            <div v-if="selectedContract" class="preview-item">
              <span class="preview-label">{{ PAGES.PAYMENTS.REMAINING_AMOUNT }}</span>
              <span class="preview-value" data-testid="remaining-amount">{{ formatCurrency(remainingAmount(selectedContract)) }}</span>
            </div>
          </div>
        </section>

        <!-- Amount Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" x2="12" y1="2" y2="22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            {{ PAGES.PAYMENTS.AMOUNT_METHOD }}
          </h2>

          <div class="amount-input-large">
            <span class="currency-prefix">NT$</span>
            <input
              v-model.number="form.amount"
              type="number"
              class="amount-field"
              :class="{ 'input-error': errors.amount, 'amount-refund': form.paymentType === 'REFUND' }"
              placeholder="0"
              min="0"
            />
          </div>
          <span v-if="errors.amount" class="error-text text-center">{{ errors.amount }}</span>

          <div class="payment-methods">
            <label
              v-for="method in paymentMethods"
              :key="method.value"
              class="method-option"
              :class="{ active: form.paymentMethod === method.value }"
            >
              <input
                v-model="form.paymentMethod"
                type="radio"
                :value="method.value"
                class="method-input"
              />
              <span class="method-icon">{{ method.icon }}</span>
              <span class="method-label">{{ method.label }}</span>
            </label>
          </div>
        </section>

        <!-- Details Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
            </svg>
            {{ PAGES.PAYMENTS.OTHER_INFO }}
          </h2>

          <div class="form-grid">
            <div class="input-group required">
              <label class="input-label">{{ PAGES.PAYMENTS.PAYMENT_DATE }}</label>
              <input
                v-model="form.paymentDate"
                type="date"
                class="input"
                :class="{ 'input-error': errors.paymentDate }"
              />
              <span v-if="errors.paymentDate" class="error-text">{{ errors.paymentDate }}</span>
            </div>

            <div class="input-group required">
              <label class="input-label">{{ PAGES.PAYMENTS.PAYMENT_BRANCH }}</label>
              <select v-model="form.branchId" class="input" :class="{ 'input-error': errors.branchId }">
                <option value="">{{ PAGES.PAYMENTS.SELECT_BRANCH_PLACEHOLDER }}</option>
                <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                  {{ branch.name }}
                </option>
              </select>
              <span v-if="errors.branchId" class="error-text">{{ errors.branchId }}</span>
            </div>

            <div class="input-group full-width">
              <label class="input-label">{{ MESSAGES.FORM.NOTES }}</label>
              <textarea
                v-model="form.notes"
                class="input"
                rows="3"
                :placeholder="PAGES.CONTRACTS.NOTES_PLACEHOLDER"
              ></textarea>
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
          <button type="button" class="btn btn-ghost" @click="router.back()">{{ MESSAGES.FORM.CANCEL }}</button>
          <button type="submit" class="btn btn-large" :class="form.paymentType === 'INCOME' ? 'btn-primary' : 'btn-warning'" :disabled="isSubmitting">
            <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {{ isSubmitting ? MESSAGES.ACTIONS.PROCESSING : (form.paymentType === 'INCOME' ? PAGES.PAYMENTS.CONFIRM_INCOME : PAGES.PAYMENTS.CONFIRM_REFUND) }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.payment-form-page {
  max-width: 700px;
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
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
  transition: background var(--duration-normal) var(--ease-out);
}

.hero-income {
  background: linear-gradient(135deg, #34c759, #30d158);
}

.hero-refund {
  background: linear-gradient(135deg, #ff9500, #ff6b35);
}

/* Type Toggle */
.type-toggle {
  display: flex;
  padding: var(--space-sm);
  margin-bottom: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) 0.15s backwards;
}

.type-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all var(--duration-fast) var(--ease-out);
}

.type-option:hover {
  color: var(--color-text-primary);
}

.type-option.active {
  background: var(--color-success);
  color: white;
}

.type-option.refund.active {
  background: var(--color-warning);
  color: #000;
}

/* Form Sections */
.payment-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-section {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.form-section:nth-child(1) { animation-delay: 0.2s; }
.form-section:nth-child(2) { animation-delay: 0.25s; }
.form-section:nth-child(3) { animation-delay: 0.3s; }

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

.text-center {
  text-align: center;
}

.hint-text {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Selected Preview */
.selected-preview {
  display: flex;
  gap: var(--space-xl);
  padding: var(--space-md);
  margin-top: var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.preview-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.preview-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.preview-value {
  font-weight: 500;
}

/* Amount Input Large */
.amount-input-large {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-xl) 0;
}

.currency-prefix {
  font-size: 24px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.amount-field {
  font-family: var(--font-mono);
  font-size: 48px;
  font-weight: 700;
  width: 100%;
  max-width: 300px;
  text-align: center;
  border: none;
  background: transparent;
  color: var(--color-success);
  outline: none;
  letter-spacing: -0.02em;
}

.amount-field.amount-refund {
  color: var(--color-warning);
}

.amount-field::placeholder {
  color: var(--color-text-tertiary);
}

/* Hide number input spinners */
.amount-field::-webkit-outer-spin-button,
.amount-field::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.amount-field[type=number] {
  -moz-appearance: textfield;
}

/* Payment Methods */
.payment-methods {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.method-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-xl);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.method-option:hover {
  border-color: var(--color-accent);
}

.method-option.active {
  border-color: var(--color-accent);
  background: var(--color-accent-light);
}

.method-input {
  display: none;
}

.method-icon {
  font-size: 28px;
}

.method-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.method-option.active .method-label {
  color: var(--color-accent);
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
  animation: fadeUp 0.6s var(--ease-out) 0.35s backwards;
}

.btn-warning {
  background: var(--color-warning);
  color: #000;
}

.btn-spinner {
  animation: spin 0.8s linear infinite;
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .payment-methods {
    grid-template-columns: repeat(2, 1fr);
  }

  .amount-field {
    font-size: 36px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
