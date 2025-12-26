<script setup lang="ts">
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'
import type { MembershipPlan } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createPlan } = usePlans()

const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  name: '',
  plan_type: 'TIME_BASED' as 'TIME_BASED' | 'COUNT_BASED',
  price: 0,
  duration_months: 1,
  class_counts: 10,
  allow_transfer: false,
  allow_pause: true,
  description: '',
  status: 'active' as 'active' | 'archived'
})

const planTypeOptions = [
  { value: 'TIME_BASED', label: LABELS.CONTRACT_TYPE.TIME_BASED },
  { value: 'COUNT_BASED', label: LABELS.CONTRACT_TYPE.COUNT_BASED }
]

const validate = () => {
  errors.value = {}

  if (!form.name.trim()) {
    errors.value.name = PAGES.PLANS.ERROR_NAME_REQUIRED
  }

  if (!form.plan_type) {
    errors.value.plan_type = PAGES.PLANS.ERROR_TYPE_REQUIRED
  }

  if (!form.price || form.price <= 0) {
    errors.value.price = PAGES.PLANS.ERROR_PRICE_POSITIVE
  }

  if (form.plan_type === 'TIME_BASED') {
    if (!form.duration_months || form.duration_months <= 0) {
      errors.value.duration_months = PAGES.PLANS.ERROR_DURATION_POSITIVE
    }
  } else {
    if (!form.class_counts || form.class_counts <= 0) {
      errors.value.class_counts = PAGES.PLANS.ERROR_CLASS_COUNTS_POSITIVE
    }
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const planData: Partial<MembershipPlan> = {
      name: form.name.trim(),
      plan_type: form.plan_type,
      price: form.price,
      duration_months: form.plan_type === 'TIME_BASED' ? form.duration_months : null,
      class_counts: form.plan_type === 'COUNT_BASED' ? form.class_counts : null,
      allow_transfer: form.allow_transfer,
      allow_pause: form.allow_pause,
      description: form.description.trim() || null,
      status: form.status
    }

    await createPlan(planData)
    useToast().success(MESSAGES.SUCCESS.PLAN_CREATED)
    router.push('/plans')
  } catch (error) {
    console.error('Failed to create plan:', error)
    useToast().error(MESSAGES.ERRORS.PLAN_CREATE_FAILED)
    errors.value.submit = PAGES.PLANS.ERROR_CREATE_FAILED
  } finally {
    isSubmitting.value = false
  }
}

const formatPrice = (value: number) => {
  return new Intl.NumberFormat('zh-TW').format(value)
}
</script>

<template>
  <div class="plan-form-page">
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
      <div class="hero-icon" :class="form.plan_type === 'TIME_BASED' ? 'time' : 'count'">
        <svg v-if="form.plan_type === 'TIME_BASED'" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <h1 class="text-headline">{{ PAGES.PLANS.ADD_PLAN }}</h1>
      <p class="text-body text-secondary">{{ PAGES.PLANS.DESCRIPTION }}</p>
    </div>

    <!-- Form -->
    <form class="plan-form" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
          </svg>
          {{ PAGES.PLANS.BASIC_INFO }}
        </h2>

        <div class="form-grid">
          <div class="input-group required">
            <label class="input-label">{{ PAGES.PLANS.PLAN_NAME }}</label>
            <input
              v-model="form.name"
              type="text"
              class="input"
              :class="{ 'input-error': errors.name }"
              :placeholder="PAGES.PLANS.PLAN_NAME_PLACEHOLDER"
            />
            <span v-if="errors.name" class="error-text">{{ errors.name }}</span>
          </div>

          <div class="input-group required">
            <label class="input-label">{{ PAGES.PLANS.PLAN_TYPE }}</label>
            <div class="radio-group">
              <label
                v-for="opt in planTypeOptions"
                :key="opt.value"
                class="radio-option"
                :class="{ active: form.plan_type === opt.value, time: opt.value === 'TIME_BASED' && form.plan_type === opt.value, count: opt.value === 'COUNT_BASED' && form.plan_type === opt.value }"
              >
                <input
                  v-model="form.plan_type"
                  type="radio"
                  :value="opt.value"
                  class="radio-input"
                />
                {{ opt.label }}
              </label>
            </div>
            <span v-if="errors.plan_type" class="error-text">{{ errors.plan_type }}</span>
          </div>

          <div class="input-group required">
            <label class="input-label">{{ PAGES.PLANS.PRICE }}</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input
                v-model.number="form.price"
                type="number"
                class="input"
                :class="{ 'input-error': errors.price }"
                :placeholder="PAGES.PLANS.PRICE_PLACEHOLDER"
                min="0"
              />
            </div>
            <span v-if="errors.price" class="error-text">{{ errors.price }}</span>
          </div>

          <div v-if="form.plan_type === 'TIME_BASED'" class="input-group required">
            <label class="input-label">{{ PAGES.PLANS.DURATION_MONTHS }}</label>
            <div class="input-with-suffix">
              <input
                v-model.number="form.duration_months"
                type="number"
                class="input"
                :class="{ 'input-error': errors.duration_months }"
                :placeholder="PAGES.PLANS.DURATION_PLACEHOLDER"
                min="1"
              />
              <span class="input-suffix">{{ PAGES.PLANS.MONTHS }}</span>
            </div>
            <span v-if="errors.duration_months" class="error-text">{{ errors.duration_months }}</span>
          </div>

          <div v-else class="input-group required">
            <label class="input-label">{{ PAGES.PLANS.CLASS_COUNTS }}</label>
            <div class="input-with-suffix">
              <input
                v-model.number="form.class_counts"
                type="number"
                class="input"
                :class="{ 'input-error': errors.class_counts }"
                :placeholder="PAGES.PLANS.CLASS_COUNTS_PLACEHOLDER"
                min="1"
              />
              <span class="input-suffix">{{ PAGES.PLANS.CLASSES }}</span>
            </div>
            <span v-if="errors.class_counts" class="error-text">{{ errors.class_counts }}</span>
          </div>

          <div class="input-group">
            <label class="input-label">{{ PAGES.PLANS.STATUS }}</label>
            <div class="radio-group">
              <label
                class="radio-option"
                :class="{ active: form.status === 'active' }"
              >
                <input
                  v-model="form.status"
                  type="radio"
                  value="active"
                  class="radio-input"
                />
                {{ STATUS.ENABLED }}
              </label>
              <label
                class="radio-option"
                :class="{ active: form.status === 'archived' }"
              >
                <input
                  v-model="form.status"
                  type="radio"
                  value="archived"
                  class="radio-input"
                />
                {{ STATUS.DISABLED }}
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Rules Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          {{ PAGES.PLANS.RULES_SETTINGS }}
        </h2>

        <div class="rules-grid">
          <label class="toggle-option">
            <div class="toggle-info">
              <span class="toggle-label">{{ PAGES.PLANS.ALLOW_TRANSFER }}</span>
              <span class="toggle-hint">{{ form.allow_transfer ? LABELS.TRANSFERABLE : LABELS.NON_TRANSFERABLE }}</span>
            </div>
            <div class="toggle-switch" :class="{ active: form.allow_transfer }">
              <input v-model="form.allow_transfer" type="checkbox" class="toggle-input" />
              <span class="toggle-slider"></span>
            </div>
          </label>

          <label class="toggle-option">
            <div class="toggle-info">
              <span class="toggle-label">{{ PAGES.PLANS.ALLOW_PAUSE }}</span>
              <span class="toggle-hint">{{ form.allow_pause ? LABELS.PAUSABLE : LABELS.NON_PAUSABLE }}</span>
            </div>
            <div class="toggle-switch" :class="{ active: form.allow_pause }">
              <input v-model="form.allow_pause" type="checkbox" class="toggle-input" />
              <span class="toggle-slider"></span>
            </div>
          </label>
        </div>

        <div class="input-group full-width mt-lg">
          <label class="input-label">{{ PAGES.PLANS.PLAN_DESCRIPTION }}</label>
          <textarea
            v-model="form.description"
            class="input textarea"
            :placeholder="PAGES.PLANS.PLAN_DESCRIPTION_PLACEHOLDER"
            rows="3"
          />
        </div>
      </section>

      <!-- Price Preview -->
      <section class="price-preview glass-card">
        <div class="preview-label">預覽</div>
        <div class="preview-name">{{ form.name || '方案名稱' }}</div>
        <div class="preview-price">NT$ {{ formatPrice(form.price || 0) }}</div>
        <div class="preview-details">
          <span v-if="form.plan_type === 'TIME_BASED'">{{ form.duration_months }} 個月</span>
          <span v-else>{{ form.class_counts }} 堂</span>
          <span class="dot">·</span>
          <span>{{ form.allow_pause ? '可暫停' : '不可暫停' }}</span>
          <span class="dot">·</span>
          <span>{{ form.allow_transfer ? '可轉讓' : '不可轉讓' }}</span>
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
        <button type="button" class="btn btn-ghost" @click="router.back()">{{ MESSAGES.FORM.CANCEL }}</button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : PAGES.PLANS.ADD_PLAN }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.plan-form-page {
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
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
  transition: background var(--duration-normal) var(--ease-out);
}

.hero-icon.time {
  background: linear-gradient(135deg, #0071e3, #00c7be);
}

.hero-icon.count {
  background: linear-gradient(135deg, #af52de, #5856d6);
}

/* Form Sections */
.plan-form {
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

.input-group.full-width {
  grid-column: 1 / -1;
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

/* Input with prefix/suffix */
.input-with-prefix,
.input-with-suffix {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}

.input-with-prefix:focus-within,
.input-with-suffix:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-light);
}

.input-prefix,
.input-suffix {
  padding: 0 var(--space-md);
  color: var(--color-text-tertiary);
  font-size: 15px;
  white-space: nowrap;
}

.input-with-prefix .input,
.input-with-suffix .input {
  border: none;
  background: transparent;
  box-shadow: none;
}

.input-with-prefix .input:focus,
.input-with-suffix .input:focus {
  box-shadow: none;
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

.radio-option.active.time {
  background: linear-gradient(135deg, #0071e3, #00c7be);
  border-color: #0071e3;
}

.radio-option.active.count {
  background: linear-gradient(135deg, #af52de, #5856d6);
  border-color: #af52de;
}

.radio-input {
  display: none;
}

/* Toggle Options */
.rules-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.toggle-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.toggle-option:hover {
  background: var(--color-bg-tertiary);
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.toggle-hint {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.toggle-switch {
  position: relative;
  width: 50px;
  height: 30px;
}

.toggle-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-bg-quaternary);
  border-radius: 30px;
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 24px;
  width: 24px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .toggle-slider {
  background-color: var(--color-success);
}

.toggle-switch.active .toggle-slider:before {
  transform: translateX(20px);
}

.textarea {
  resize: vertical;
  min-height: 80px;
}

.mt-lg {
  margin-top: var(--space-lg);
}

/* Price Preview */
.price-preview {
  padding: var(--space-xl);
  text-align: center;
  animation: fadeUp 0.6s var(--ease-out) 0.25s backwards;
}

.preview-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-md);
}

.preview-name {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-sm);
}

.preview-price {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: var(--space-md);
}

.preview-details {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.preview-details .dot {
  color: var(--color-text-quaternary);
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

  .preview-details {
    flex-wrap: wrap;
  }
}
</style>
