<script setup lang="ts">
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createBranch } = useBranches()

const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  name: '',
  type: 'BRANCH' as 'HEADQUARTER' | 'BRANCH',
  address: '',
  phone: '',
  tax_id: '',
  status: 'active' as 'active' | 'archived'
})

const branchTypeOptions = [
  { value: 'HEADQUARTER', label: LABELS.BRANCH_TYPE.HEADQUARTER },
  { value: 'BRANCH', label: LABELS.BRANCH_TYPE.BRANCH }
]

const validate = () => {
  errors.value = {}

  if (!form.name.trim()) {
    errors.value.name = PAGES.BRANCHES.ERROR_NAME_REQUIRED
  }

  if (!form.type) {
    errors.value.type = PAGES.BRANCHES.ERROR_TYPE_REQUIRED
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const branchData = {
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      tax_id: form.tax_id.trim() || null,
      status: form.status
    }

    await createBranch(branchData)
    router.push('/branches')
  } catch (error) {
    console.error('Failed to create branch:', error)
    errors.value.submit = PAGES.BRANCHES.ERROR_CREATE_FAILED
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="branch-form-page">
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
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <h1 class="text-headline">{{ PAGES.BRANCHES.ADD_BRANCH }}</h1>
      <p class="text-body text-secondary">{{ PAGES.BRANCHES.DESCRIPTION }}</p>
    </div>

    <!-- Form -->
    <form class="branch-form" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          {{ PAGES.BRANCHES.BASIC_INFO }}
        </h2>

        <div class="form-grid">
          <div class="input-group required">
            <label class="input-label">{{ PAGES.BRANCHES.BRANCH_NAME }}</label>
            <input
              v-model="form.name"
              type="text"
              class="input"
              :class="{ 'input-error': errors.name }"
              :placeholder="PAGES.BRANCHES.BRANCH_NAME_PLACEHOLDER"
            />
            <span v-if="errors.name" class="error-text">{{ errors.name }}</span>
          </div>

          <div class="input-group required">
            <label class="input-label">{{ PAGES.BRANCHES.BRANCH_TYPE }}</label>
            <div class="radio-group">
              <label
                v-for="opt in branchTypeOptions"
                :key="opt.value"
                class="radio-option"
                :class="{ active: form.type === opt.value, hq: opt.value === 'HEADQUARTER' && form.type === opt.value }"
              >
                <input
                  v-model="form.type"
                  type="radio"
                  :value="opt.value"
                  class="radio-input"
                />
                {{ opt.label }}
              </label>
            </div>
            <span v-if="errors.type" class="error-text">{{ errors.type }}</span>
          </div>

          <div class="input-group">
            <label class="input-label">{{ PAGES.BRANCHES.STATUS }}</label>
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
                {{ STATUS.OPERATING }}
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

      <!-- Contact Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {{ PAGES.BRANCHES.CONTACT_INFO }}
        </h2>

        <div class="form-grid">
          <div class="input-group full-width">
            <label class="input-label">{{ PAGES.BRANCHES.ADDRESS }}</label>
            <input
              v-model="form.address"
              type="text"
              class="input"
              :placeholder="PAGES.BRANCHES.ADDRESS_PLACEHOLDER"
            />
          </div>

          <div class="input-group">
            <label class="input-label">{{ PAGES.BRANCHES.PHONE }}</label>
            <input
              v-model="form.phone"
              type="tel"
              class="input"
              :placeholder="PAGES.BRANCHES.PHONE_PLACEHOLDER"
            />
          </div>

          <div class="input-group">
            <label class="input-label">{{ PAGES.BRANCHES.TAX_ID }}</label>
            <input
              v-model="form.tax_id"
              type="text"
              class="input"
              :placeholder="PAGES.BRANCHES.TAX_ID_PLACEHOLDER"
              maxlength="8"
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
        <button type="button" class="btn btn-ghost" @click="router.back()">{{ MESSAGES.FORM.CANCEL }}</button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : PAGES.BRANCHES.ADD_BRANCH }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.branch-form-page {
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
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

/* Form Sections */
.branch-form {
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

.radio-option.active.hq {
  background: linear-gradient(135deg, #ff9500, #ff5e3a);
  border-color: #ff9500;
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
