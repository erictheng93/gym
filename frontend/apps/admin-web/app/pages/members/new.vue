<script setup lang="ts">
/**
 * 新增會員頁面
 *
 * 使用 @gym-nexus/ui 表單組件重構
 */
import { MESSAGES, PAGES, LABELS } from '~/constants'
import {
  required,
  email,
  phone,
  phoneLength,
  minLength,
  maxLength,
  between,
  dateNotFuture,
  arrayLength
} from '@gym-nexus/ui/composables'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createMember } = useMembers()
const { branches, fetchBranches } = useBranches()

// Form state
const isSubmitting = ref(false)
const form = reactive({
  full_name: '',
  phone: '',
  email: '',
  gender: '' as 'M' | 'F' | 'O' | '',
  birthday: '',
  height: null as number | null,
  branch_id: '',
  emergency_contact: '',
  emergency_phone: '',
  tags: [] as string[],
  member_status: 'ACTIVE' as const
})

// Form validation
const { errors, validate, setError, clearErrors } = useFormValidation<typeof form>()

// Options
const genderOptions = [
  { value: 'M', label: LABELS.GENDER.MALE },
  { value: 'F', label: LABELS.GENDER.FEMALE },
  { value: 'O', label: LABELS.GENDER.OTHER }
]

const branchOptions = computed(() =>
  branches.value.map(b => ({ value: b.id, label: b.name }))
)

// Initial load
onMounted(async () => {
  await fetchBranches()
  if (branches.value.length > 0 && !form.branch_id) {
    form.branch_id = branches.value[0].id
  }
})

// Form submission
const handleSubmit = async () => {
  clearErrors()

  const isValid = validate(form, {
    full_name: [
      required('請輸入會員姓名'),
      minLength(2, '姓名至少需要 2 個字'),
      maxLength(50, '姓名不能超過 50 個字')
    ],
    email: [email('Email 格式不正確')],
    phone: [
      phone('電話格式不正確'),
      phoneLength(8, 15, '電話號碼需為 8-15 位數字')
    ],
    emergency_phone: [
      phone('緊急聯絡電話格式不正確'),
      phoneLength(8, 15, '電話號碼需為 8-15 位數字')
    ],
    birthday: [dateNotFuture('生日不能是未來日期')],
    height: [between(50, 300, '身高需介於 50-300 公分')],
    tags: [arrayLength(10, '最多只能有 10 個標籤')]
  })

  if (!isValid) return

  isSubmitting.value = true
  try {
    const memberData = {
      ...form,
      gender: form.gender || null,
      birthday: form.birthday || null,
      height: form.height || null,
      branch_id: form.branch_id || null,
      join_date: new Date().toISOString().split('T')[0]
    }

    await createMember(memberData)
    useToast().success(MESSAGES.SUCCESS.MEMBER_CREATED)
    router.push('/members')
  } catch (error) {
    console.error('Failed to create member:', error)
    useToast().error(MESSAGES.ERRORS.MEMBER_CREATE_FAILED)
    setError('submit', '建立會員失敗，請稍後再試')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="form-page">
    <!-- Header -->
    <header class="form-page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        {{ MESSAGES.ACTIONS.BACK }}
      </button>
    </header>

    <!-- Hero -->
    <div class="form-hero">
      <div class="hero-icon hero-icon--blue">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" x2="19" y1="8" y2="14"/>
          <line x1="22" x2="16" y1="11" y2="11"/>
        </svg>
      </div>
      <h1 class="text-headline">{{ PAGES.MEMBERS.ADD_MEMBER }}</h1>
      <p class="text-body text-secondary">{{ PAGES.MEMBERS.FILL_BASIC_INFO }}</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {{ MESSAGES.COMMON.BASIC_INFO }}
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.full_name"
            :label="MESSAGES.FORM.NAME"
            :placeholder="PAGES.MEMBERS.NAME_PLACEHOLDER"
            :required="true"
            :error="errors.full_name"
          />

          <FormRadioGroup
            v-model="form.gender"
            :label="MESSAGES.FORM.GENDER"
            :options="genderOptions"
            allow-empty
          />

          <FormDatePicker
            v-model="form.birthday"
            :label="MESSAGES.FORM.BIRTHDAY"
            :error="errors.birthday"
          />

          <FormInput
            v-model="form.height"
            label="身高 (cm)"
            type="number"
            placeholder="例：175"
            :min="50"
            :max="300"
            :error="errors.height"
          />

          <FormSelect
            v-model="form.branch_id"
            label="所屬分店"
            :options="branchOptions"
            placeholder="請選擇分店"
          />
        </div>
      </section>

      <!-- Contact Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {{ MESSAGES.COMMON.CONTACT_INFO }}
        </h2>

        <div class="form-grid">
          <FormInput
            v-model="form.phone"
            :label="MESSAGES.FORM.PHONE"
            type="tel"
            placeholder="0912-345-678"
            :error="errors.phone"
          />

          <FormInput
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="email@example.com"
            :error="errors.email"
          />

          <FormInput
            v-model="form.emergency_contact"
            label="緊急聯絡人"
            placeholder="請輸入緊急聯絡人姓名"
          />

          <FormInput
            v-model="form.emergency_phone"
            label="緊急聯絡電話"
            type="tel"
            placeholder="0912-345-678"
            :error="errors.emergency_phone"
          />
        </div>
      </section>

      <!-- Tags Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>
          </svg>
          {{ MESSAGES.FORM.TAGS }}
        </h2>

        <FormTagInput
          v-model="form.tags"
          placeholder="輸入標籤..."
          :add-button-text="MESSAGES.FORM.ADD"
          :max-tags="10"
          :error="errors.tags"
        />
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
        <button type="button" class="btn btn-ghost" @click="router.back()">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          {{ isSubmitting ? MESSAGES.ACTIONS.CREATING : PAGES.MEMBERS.ADD_MEMBER }}
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

.hero-icon--blue {
  background: linear-gradient(135deg, #0071e3, #5856d6);
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
