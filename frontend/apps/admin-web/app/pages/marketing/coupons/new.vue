<script setup lang="ts">
/**
 * 新增優惠券頁面
 */
import { MESSAGES } from '~/constants'
import { createCouponSchema, type CreateCouponInput } from '~/schemas/coupon.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'
import { useFormSubmit } from '~/composables/useFormSubmit'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createCoupon } = useCoupons()
const { plans, fetchPlans } = usePlans()

// Form state
const initialData: CreateCouponInput = {
  code: '',
  name: '',
  discount_type: 'PERCENTAGE',
  discount_value: 10,
  min_purchase: 0,
  max_discount: null,
  usage_limit: null,
  usage_per_member: 1,
  applicable_plans: null,
  start_date: new Date().toISOString().split('T')[0],
  end_date: ''
}

const {
  formData: form,
  errors,
  validate,
  setError,
  clearErrors
} = useZodFormValidation(createCouponSchema, initialData)

const { isSubmitting, submit } = useFormSubmit()

// Options
const discountTypeOptions = [
  { value: 'PERCENTAGE', label: '百分比折扣' },
  { value: 'FIXED_AMOUNT', label: '固定金額折扣' }
]

// Generate random code
const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  form.code = code
}

// Initial load
onMounted(async () => {
  await fetchPlans()
  generateCode()
  // Set default end date to 30 days from now
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + 30)
  form.end_date = endDate.toISOString().split('T')[0]
})

// Form submission
const handleSubmit = async () => {
  clearErrors()

  if (!validate()) return

  await submit(
    async () => {
      const couponData = {
        ...form,
        code: form.code || undefined,
        max_discount: form.max_discount || null,
        usage_limit: form.usage_limit || null,
        applicable_plans: form.applicable_plans?.length ? form.applicable_plans : null
      }

      const result = await createCoupon(couponData)
      if (!result) {
        throw new Error('建立優惠券失敗')
      }
      return result
    },
    {
      successMessage: '已成功建立優惠券',
      errorMessage: '建立優惠券失敗',
      onSuccess: async () => { await router.push('/marketing/coupons') },
      onError: (error) => setError('submit', error.message)
    }
  )
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
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      </div>
      <h1 class="text-headline">新增優惠券</h1>
      <p class="text-body text-secondary">設定優惠券的折扣方式與使用條件</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
          </svg>
          基本資訊
        </h2>

        <div class="form-grid">
          <div class="form-group code-group">
            <label class="form-label">優惠碼</label>
            <div class="code-input-wrapper">
              <input
                v-model="form.code"
                type="text"
                class="input code-input"
                placeholder="留空自動產生"
              />
              <button type="button" class="btn btn-secondary btn-small" @click="generateCode">
                產生
              </button>
            </div>
            <span v-if="errors.code" class="form-error">{{ errors.code }}</span>
          </div>

          <FormInput
            v-model="form.name"
            label="優惠券名稱"
            placeholder="例：新會員折扣"
            :required="true"
            :error="errors.name"
          />
        </div>
      </section>

      <!-- Discount Settings -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="M9 9h.01" />
            <path d="M15 15h.01" />
          </svg>
          折扣設定
        </h2>

        <div class="form-grid">
          <FormRadioGroup
            v-model="form.discount_type"
            label="折扣類型"
            :options="discountTypeOptions"
          />

          <FormInput
            v-model="form.discount_value"
            :label="form.discount_type === 'PERCENTAGE' ? '折扣百分比 (%)' : '折扣金額 (NT$)'"
            type="number"
            :placeholder="form.discount_type === 'PERCENTAGE' ? '例：10' : '例：500'"
            :min="1"
            :max="form.discount_type === 'PERCENTAGE' ? 100 : undefined"
            :required="true"
            :error="errors.discount_value"
          />

          <FormInput
            v-model="form.min_purchase"
            label="最低消費門檻 (NT$)"
            type="number"
            placeholder="0 表示無門檻"
            :min="0"
          />

          <FormInput
            v-if="form.discount_type === 'PERCENTAGE'"
            v-model="form.max_discount"
            label="折扣上限 (NT$)"
            type="number"
            placeholder="留空表示無上限"
            :min="0"
          />
        </div>
      </section>

      <!-- Usage Limits -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
          使用限制
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.usage_limit"
            label="總使用次數上限"
            type="number"
            placeholder="留空表示無限制"
            :min="1"
          />

          <FormInput
            v-model="form.usage_per_member"
            label="每人使用次數上限"
            type="number"
            placeholder="1"
            :min="1"
          />
        </div>
      </section>

      <!-- Validity Period -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v4" /><path d="M16 2v4" />
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
          </svg>
          有效期間
        </h2>

        <div class="form-grid">
          <FormDatePicker
            v-model="form.start_date"
            label="開始日期"
            :required="true"
            :error="errors.start_date"
          />

          <FormDatePicker
            v-model="form.end_date"
            label="結束日期"
            :required="true"
            :min="form.start_date"
            :error="errors.end_date"
          />
        </div>
      </section>

      <!-- Applicable Plans -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          適用方案
        </h2>

        <div class="plans-selection">
          <p class="selection-hint text-secondary">不選擇表示適用所有方案</p>
          <div class="plans-grid">
            <label
              v-for="plan in plans"
              :key="plan.id"
              class="plan-checkbox"
            >
              <input
                type="checkbox"
                :value="plan.id"
                :checked="form.applicable_plans?.includes(plan.id)"
                @change="(e) => {
                  const target = e.target as HTMLInputElement
                  if (target.checked) {
                    form.applicable_plans = [...(form.applicable_plans || []), plan.id]
                  } else {
                    form.applicable_plans = form.applicable_plans?.filter(id => id !== plan.id) || null
                  }
                }"
              />
              <span class="plan-name">{{ plan.name }}</span>
              <span class="plan-price">NT$ {{ plan.price?.toLocaleString() }}</span>
            </label>
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
        <button type="button" class="btn btn-ghost" @click="router.back()">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : '建立優惠券' }}
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
.form-section:nth-child(3) { animation-delay: 0.25s; }
.form-section:nth-child(4) { animation-delay: 0.3s; }
.form-section:nth-child(5) { animation-delay: 0.35s; }

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

/* Code Input */
.code-group {
  grid-column: 1 / -1;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.code-input-wrapper {
  display: flex;
  gap: var(--space-sm);
}

.code-input {
  flex: 1;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.form-error {
  font-size: 12px;
  color: var(--color-error);
}

/* Plans Selection */
.selection-hint {
  font-size: 13px;
  margin-bottom: var(--space-lg);
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}

.plan-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast);
}

.plan-checkbox:hover {
  border-color: var(--color-accent);
}

.plan-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.plan-checkbox:has(input:checked) {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
}

.plan-name {
  flex: 1;
  font-weight: 500;
}

.plan-price {
  font-size: 13px;
  color: var(--color-text-tertiary);
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
  animation: fadeUp 0.6s var(--ease-out) 0.4s backwards;
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
