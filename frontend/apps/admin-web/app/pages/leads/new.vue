<script setup lang="ts">
/**
 * 新增潛在客戶頁面
 *
 * 使用 Zod schema 驗證
 */
import { MESSAGES } from '~/constants'
import { createLeadSchema, type CreateLeadInput } from '~/schemas/lead.schema'
import { useZodFormValidation } from '~/composables/core/useZodFormValidation'
import { useFormSubmit } from '~/composables/useFormSubmit'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createLead } = useLeads()
const { branches, fetchBranches } = useBranches()
const { employees, fetchEmployees } = useEmployees()

// Form state with Zod validation
const initialData: CreateLeadInput = {
  name: '',
  phone: '',
  email: '',
  source: 'WEBSITE',
  branch_id: '',
  assigned_to: null,
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  notes: ''
}

const {
  formData: form,
  errors,
  validate,
  setError,
  clearErrors
} = useZodFormValidation(createLeadSchema, initialData)

// Form submission helper
const { isSubmitting, submit } = useFormSubmit()

// Options
const sourceOptions = [
  { value: 'FB_AD', label: 'Facebook 廣告' },
  { value: 'IG_AD', label: 'Instagram 廣告' },
  { value: 'GOOGLE_AD', label: 'Google 廣告' },
  { value: 'WEBSITE', label: '網站' },
  { value: 'WALK_IN', label: '現場' },
  { value: 'REFERRAL', label: '推薦' }
]

const branchOptions = computed(() =>
  branches.value.map(b => ({ value: b.id, label: b.name }))
)

const employeeOptions = computed(() =>
  employees.value.map(e => ({ value: e.id, label: e.full_name }))
)

// Initial load
onMounted(async () => {
  await Promise.all([fetchBranches(), fetchEmployees()])
  if (branches.value.length > 0 && !form.branch_id) {
    form.branch_id = branches.value[0].id
  }
})

// Form submission
const handleSubmit = async () => {
  clearErrors()

  if (!validate()) return

  await submit(
    async () => {
      const leadData = {
        ...form,
        email: form.email || null,
        assigned_to: form.assigned_to || null,
        utm_source: form.utm_source || null,
        utm_medium: form.utm_medium || null,
        utm_campaign: form.utm_campaign || null,
        notes: form.notes || null
      }

      const result = await createLead(leadData)
      if (!result) {
        throw new Error('建立潛在客戶失敗')
      }
      return result
    },
    {
      successMessage: '已成功建立潛在客戶',
      errorMessage: '建立潛在客戶失敗',
      onSuccess: () => router.push('/leads'),
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
      <div class="hero-icon hero-icon--purple">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      </div>
      <h1 class="text-headline">新增潛在客戶</h1>
      <p class="text-body text-secondary">填寫潛在客戶的基本資訊</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          基本資訊
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.name"
            label="姓名"
            placeholder="請輸入姓名"
            :required="true"
            :error="errors.name"
          />

          <FormInput
            v-model="form.phone"
            label="電話"
            type="tel"
            placeholder="0912-345-678"
            :required="true"
            :error="errors.phone"
          />

          <FormInput
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="email@example.com"
            :error="errors.email"
          />

          <FormSelect
            v-model="form.source"
            label="來源"
            :options="sourceOptions"
            :required="true"
          />

          <FormSelect
            v-model="form.branch_id"
            label="分店"
            :options="branchOptions"
            placeholder="請選擇分店"
            :required="true"
            :error="errors.branch_id"
          />

          <FormSelect
            v-model="form.assigned_to"
            label="負責人"
            :options="employeeOptions"
            placeholder="選擇負責人（可選）"
            allow-empty
          />
        </div>
      </section>

      <!-- UTM Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          UTM 追蹤參數
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.utm_source"
            label="utm_source"
            placeholder="例：facebook"
          />

          <FormInput
            v-model="form.utm_medium"
            label="utm_medium"
            placeholder="例：cpc"
          />

          <FormInput
            v-model="form.utm_campaign"
            label="utm_campaign"
            placeholder="例：summer_promo_2024"
            class="full-width"
          />
        </div>
      </section>

      <!-- Notes Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          備註
        </h2>

        <FormTextarea
          v-model="form.notes"
          label="備註"
          placeholder="輸入備註內容..."
          :rows="4"
          :max-length="500"
        />
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
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : '新增潛在客戶' }}
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

.hero-icon--purple {
  background: linear-gradient(135deg, #af52de, #5856d6);
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
