<script setup lang="ts">
/**
 * 新增分店頁面
 *
 * 使用 Zod schema 驗證和 @gym-nexus/ui 表單組件
 */
import { MESSAGES, PAGES, LABELS, STATUS } from '~/constants'
import { createBranchSchema, type CreateBranchInput } from '~/schemas/branch.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'
import { useFormSubmit } from '~/composables/useFormSubmit'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createBranch } = useBranches()

// Form state with Zod validation
const initialData: CreateBranchInput = {
  name: '',
  type: 'BRANCH',
  address: '',
  phone: '',
  tax_id: '',
  status: 'active'
}

const {
  formData: form,
  errors,
  validate,
  setError,
  clearErrors
} = useZodFormValidation(createBranchSchema, initialData)

// Form submission helper
const { isSubmitting, submit } = useFormSubmit()

// Options
const branchTypeOptions = [
  { value: 'HEADQUARTER', label: LABELS.BRANCH_TYPE.HEADQUARTER },
  { value: 'BRANCH', label: LABELS.BRANCH_TYPE.BRANCH }
]

const statusOptions = [
  { value: 'active', label: STATUS.OPERATING },
  { value: 'archived', label: STATUS.DISABLED }
]

// Form submission
const handleSubmit = async () => {
  clearErrors()

  // 使用 Zod schema 驗證
  if (!validate()) return

  await submit(
    async () => {
      const branchData = {
        name: form.name.trim(),
        type: form.type,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        tax_id: form.tax_id?.trim() || null,
        status: form.status
      }

      const result = await createBranch(branchData)
      if (!result) {
        throw new Error(MESSAGES.ERRORS.BRANCH_CREATE_FAILED)
      }
      return result
    },
    {
      successMessage: MESSAGES.SUCCESS.BRANCH_CREATED,
      errorMessage: MESSAGES.ERRORS.BRANCH_CREATE_FAILED,
      onSuccess: () => router.push('/branches'),
      onError: (error) => setError('submit', PAGES.BRANCHES.ERROR_CREATE_FAILED)
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
      <div class="hero-icon hero-icon--teal">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
      <h1 class="text-headline">{{ PAGES.BRANCHES.ADD_BRANCH }}</h1>
      <p class="text-body text-secondary">{{ PAGES.BRANCHES.DESCRIPTION }}</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {{ PAGES.BRANCHES.BASIC_INFO }}
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.name"
            :label="PAGES.BRANCHES.BRANCH_NAME"
            :placeholder="PAGES.BRANCHES.BRANCH_NAME_PLACEHOLDER"
            :required="true"
            :error="errors.name"
          />

          <FormRadioGroup
            v-model="form.type"
            :label="PAGES.BRANCHES.BRANCH_TYPE"
            :options="branchTypeOptions"
            :required="true"
            :error="errors.type"
          />

          <FormRadioGroup
            v-model="form.status"
            :label="PAGES.BRANCHES.STATUS"
            :options="statusOptions"
          />
        </div>
      </section>

      <!-- Contact Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          {{ PAGES.BRANCHES.CONTACT_INFO }}
        </h2>

        <div class="form-grid">
          <div class="full-width">
            <FormInput
              v-model="form.address"
              :label="PAGES.BRANCHES.ADDRESS"
              :placeholder="PAGES.BRANCHES.ADDRESS_PLACEHOLDER"
            />
          </div>

          <FormInput
            v-model="form.phone"
            :label="PAGES.BRANCHES.PHONE"
            type="tel"
            :placeholder="PAGES.BRANCHES.PHONE_PLACEHOLDER"
          />

          <FormInput
            v-model="form.tax_id"
            :label="PAGES.BRANCHES.TAX_ID"
            :placeholder="PAGES.BRANCHES.TAX_ID_PLACEHOLDER"
            :maxlength="8"
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
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : PAGES.BRANCHES.ADD_BRANCH }}
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

.hero-icon--teal {
  background: linear-gradient(135deg, #0071e3, #00c7be);
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

.full-width {
  grid-column: 1 / -1;
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
