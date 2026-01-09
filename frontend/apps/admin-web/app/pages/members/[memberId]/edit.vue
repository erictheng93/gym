<script setup lang="ts">
import { validateUUIDParam } from '~/utils/validation'
import { MESSAGES, PAGES, LABELS } from '~/constants'
// Validation rules are auto-imported from @gym-nexus/ui/composables/useFormValidation

definePageMeta({
  middleware: 'auth',
  validate: validateUUIDParam('memberId')
})

const route = useRoute()
const router = useRouter()
const { getMember, updateMember } = useMembers()
const { branches, fetchBranches } = useBranches()

const isLoading = ref(true)
const isSubmitting = ref(false)

const memberId = computed(() => route.params.memberId as string)

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
  member_status: 'ACTIVE' as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED'
})

// Form validation - 使用 composable
const { errors, validate, setError, clearErrors } = useFormValidation<typeof form>()

const genderOptions = [
  { value: 'M', label: '男' },
  { value: 'F', label: '女' },
  { value: 'O', label: '其他' }
]

const statusOptions = [
  { value: 'ACTIVE', label: '有效' },
  { value: 'EXPIRED', label: '過期' },
  { value: 'SUSPENDED', label: '暫停' },
  { value: 'BANNED', label: '停權' }
]

const branchOptions = computed(() =>
  branches.value.map(branch => ({
    value: branch.id,
    label: branch.name
  }))
)

const loadMember = async () => {
  isLoading.value = true
  try {
    const member = await getMember(memberId.value)
    form.full_name = member.full_name
    form.phone = member.phone || ''
    form.email = member.email || ''
    form.gender = member.gender || ''
    form.birthday = member.birthday || ''
    form.height = member.height
    form.branch_id = member.branch_id || ''
    form.emergency_contact = member.emergency_contact || ''
    form.emergency_phone = member.emergency_phone || ''
    form.tags = member.tags || []
    form.member_status = member.member_status
  } catch (error) {
    console.error('Failed to load member:', error)
    useToast().error(MESSAGES.ERRORS.MEMBER_LOAD_FAILED)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadMember(), fetchBranches()])
})

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
      branch_id: form.branch_id || null
    }

    await updateMember(memberId.value, memberData)
    useToast().success(MESSAGES.SUCCESS.MEMBER_UPDATED)
    router.push(`/members/${memberId.value}`)
  } catch (error) {
    console.error('Failed to update member:', error)
    useToast().error(MESSAGES.ERRORS.MEMBER_UPDATE_FAILED)
    setError('submit', '更新會員失敗，請稍後再試')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="member-form-page">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner-large" />
      <p class="text-secondary mt-md">載入中...</p>
    </div>

    <template v-else>
      <!-- Header -->
      <header class="page-header">
        <button class="back-btn" @click="router.back()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
      </header>

      <!-- Form Hero -->
      <div class="form-hero">
        <div class="hero-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </div>
        <h1 class="text-headline">編輯會員</h1>
        <p class="text-body text-secondary">修改會員資料</p>
      </div>

      <!-- Form -->
      <form class="member-form" @submit.prevent="handleSubmit">
        <!-- Basic Info Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            基本資料
          </h2>

          <div class="form-grid">
            <FormInput
              v-model="form.full_name"
              label="姓名"
              placeholder="請輸入會員姓名"
              :required="true"
              :error="errors.full_name"
            />

            <FormSelect
              v-model="form.member_status"
              label="會員狀態"
              :options="statusOptions"
            />

            <FormRadioGroup
              v-model="form.gender"
              label="性別"
              :options="genderOptions"
            />

            <FormDatePicker
              v-model="form.birthday"
              label="生日"
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
              placeholder="請選擇分店"
              :options="branchOptions"
            />
          </div>
        </section>

        <!-- Contact Section -->
        <section class="form-section glass-card">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            聯絡資訊
          </h2>

          <div class="form-grid">
            <FormInput
              v-model="form.phone"
              label="電話"
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
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" />
            </svg>
            會員標籤
          </h2>

          <FormTagInput
            v-model="form.tags"
            placeholder="輸入標籤..."
            :max-tags="10"
            :error="errors.tags"
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
          <button type="button" class="btn btn-ghost" @click="router.back()">取消</button>
          <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
            <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {{ isSubmitting ? '更新中...' : '儲存變更' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.member-form-page {
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
  background: linear-gradient(135deg, #ff9f0a, #ff6b35);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

/* Form Sections */
.member-form {
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
