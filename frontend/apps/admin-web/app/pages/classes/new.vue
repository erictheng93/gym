<script setup lang="ts">
/**
 * 新增課程頁面
 */
import { MESSAGES, PAGES } from '~/constants'
import type { ClassCategory, Employee } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const toast = useToast()
const { createClass } = useClasses()
const { branches, fetchBranches } = useBranches()
const { fetchCategoryTree } = useClassCategories()
const { fetchAllEmployees } = useEmployees()

// Form state
const form = ref({
  name: '',
  description: '',
  duration_minutes: 60,
  max_capacity: 20,
  instructor_id: null as string | null,
  branch_id: '',
  category_id: null as string | null,
  difficulty_level: 'BEGINNER' as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
  is_active: true,
  requires_count: false,
  count_deduction: 1,
  image_url: ''
})

const isSubmitting = ref(false)
const categories = ref<ClassCategory[]>([])
const instructors = ref<Employee[]>([])

// Difficulty options
const difficultyOptions = [
  { value: 'BEGINNER', label: PAGES.CLASSES.DIFFICULTY_BEGINNER },
  { value: 'INTERMEDIATE', label: PAGES.CLASSES.DIFFICULTY_INTERMEDIATE },
  { value: 'ADVANCED', label: PAGES.CLASSES.DIFFICULTY_ADVANCED }
]

// Validation
const errors = ref<Record<string, string>>({})

const validate = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = PAGES.CLASSES.ERROR_NAME_REQUIRED
  }

  if (!form.value.duration_minutes || form.value.duration_minutes <= 0) {
    errors.value.duration_minutes = PAGES.CLASSES.ERROR_DURATION_REQUIRED
  }

  if (!form.value.max_capacity || form.value.max_capacity <= 0) {
    errors.value.max_capacity = PAGES.CLASSES.ERROR_CAPACITY_REQUIRED
  }

  if (!form.value.branch_id) {
    errors.value.branch_id = '請選擇分店'
  }

  return Object.keys(errors.value).length === 0
}

// Submit form
const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const classData = await createClass({
      ...form.value,
      status: 'active'
    })

    if (classData) {
      toast.success(MESSAGES.SUCCESS.CREATED)
      router.push('/classes')
    }
  } finally {
    isSubmitting.value = false
  }
}

// Load data
onMounted(async () => {
  try {
    const [categoryTree, allInstructors] = await Promise.all([
      fetchCategoryTree(),
      fetchAllEmployees(),
      fetchBranches()
    ])

    // Flatten category tree for select
    const flattenCategories = (cats: ClassCategory[], prefix = ''): ClassCategory[] => {
      return cats.flatMap(cat => [
        { ...cat, name: prefix + cat.name },
        ...flattenCategories(cat.children || [], prefix + '  ')
      ])
    }

    categories.value = flattenCategories(categoryTree)
    instructors.value = allInstructors
  } catch (error) {
    console.error('Failed to load data:', error)
    toast.error('載入資料失敗')
  }
})
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASSES.ADD_CLASS"
      :description="PAGES.CLASSES.DESCRIPTION"
    />

    <!-- Form -->
    <form class="class-form card" @submit.prevent="handleSubmit">
      <div class="form-section">
        <h3 class="section-title">基本資訊</h3>

        <div class="form-grid">
          <FormField
            :label="PAGES.CLASSES.CLASS_NAME"
            :error="errors.name"
            required
          >
            <FormInput
              v-model="form.name"
              :placeholder="PAGES.CLASSES.CLASS_NAME_PLACEHOLDER"
              :error="!!errors.name"
            />
          </FormField>

          <FormField
            :label="PAGES.CLASSES.BRANCH"
            :error="errors.branch_id"
            required
          >
            <FormSelect
              v-model="form.branch_id"
              placeholder="選擇分店"
              :error="!!errors.branch_id"
            >
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </FormSelect>
          </FormField>
        </div>

        <div class="form-grid">
          <FormField :label="PAGES.CLASSES.CATEGORY">
            <FormSelect
              v-model="form.category_id"
              :placeholder="PAGES.CLASSES.SELECT_CATEGORY"
            >
              <option :value="null">無類別</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </FormSelect>
          </FormField>

          <FormField :label="PAGES.CLASSES.INSTRUCTOR">
            <FormSelect
              v-model="form.instructor_id"
              :placeholder="PAGES.CLASSES.SELECT_INSTRUCTOR"
            >
              <option :value="null">未指定</option>
              <option v-for="instructor in instructors" :key="instructor.id" :value="instructor.id">
                {{ instructor.full_name }}
              </option>
            </FormSelect>
          </FormField>
        </div>

        <FormField label="課程說明">
          <FormTextarea
            v-model="form.description"
            placeholder="請輸入課程說明（選填）"
            :rows="3"
          />
        </FormField>
      </div>

      <div class="form-section">
        <h3 class="section-title">課程設定</h3>

        <div class="form-grid">
          <FormField
            :label="PAGES.CLASSES.DURATION"
            :error="errors.duration_minutes"
            required
          >
            <div class="input-with-suffix">
              <FormInput
                v-model.number="form.duration_minutes"
                type="number"
                min="1"
                max="480"
                :error="!!errors.duration_minutes"
              />
              <span class="input-suffix">{{ PAGES.CLASSES.DURATION_MINUTES }}</span>
            </div>
          </FormField>

          <FormField
            :label="PAGES.CLASSES.MAX_CAPACITY"
            :error="errors.max_capacity"
            required
          >
            <div class="input-with-suffix">
              <FormInput
                v-model.number="form.max_capacity"
                type="number"
                min="1"
                max="999"
                :error="!!errors.max_capacity"
              />
              <span class="input-suffix">人</span>
            </div>
          </FormField>
        </div>

        <div class="form-grid">
          <FormField :label="PAGES.CLASSES.DIFFICULTY">
            <FormSelect v-model="form.difficulty_level">
              <option v-for="opt in difficultyOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </FormSelect>
          </FormField>

          <FormField :label="PAGES.CLASSES.IMAGE_URL">
            <FormInput
              v-model="form.image_url"
              placeholder="課程圖片網址（選填）"
            />
          </FormField>
        </div>
      </div>

      <div class="form-section">
        <h3 class="section-title">堂數扣除設定</h3>

        <div class="settings-grid">
          <FormCheckbox
            v-model="form.requires_count"
            :label="PAGES.CLASSES.REQUIRES_COUNT"
          />
        </div>

        <div v-if="form.requires_count" class="form-grid form-grid-single">
          <FormField :label="PAGES.CLASSES.COUNT_DEDUCTION">
            <div class="input-with-suffix">
              <FormInput
                v-model.number="form.count_deduction"
                type="number"
                min="1"
                max="10"
              />
              <span class="input-suffix">堂</span>
            </div>
            <template #hint>
              <span class="hint-text">會員預約此課程時，將從合約扣除的堂數</span>
            </template>
          </FormField>
        </div>
      </div>

      <div class="form-section">
        <h3 class="section-title">狀態設定</h3>

        <div class="settings-grid">
          <FormCheckbox
            v-model="form.is_active"
            :label="PAGES.CLASSES.IS_ACTIVE"
          />
        </div>

        <p class="settings-hint">
          停用的課程將不會在排程和預約系統中顯示
        </p>
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <NuxtLink to="/classes" class="btn btn-ghost">
          {{ MESSAGES.FORM.CANCEL }}
        </NuxtLink>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="isSubmitting"
        >
          <span v-if="isSubmitting">{{ MESSAGES.ACTIONS.CREATING }}</span>
          <span v-else>{{ MESSAGES.FORM.CREATE }}</span>
        </button>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.class-form {
  padding: var(--space-xl);
  max-width: 800px;
}

.form-section {
  margin-bottom: var(--space-2xl);
}

.form-section:last-of-type {
  margin-bottom: var(--space-xl);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-divider);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.form-grid-single {
  grid-template-columns: 1fr;
  max-width: 300px;
}

.hint-text {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Input with suffix */
.input-with-suffix {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.input-with-suffix .input {
  flex: 1;
}

.input-suffix {
  font-size: 14px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* Settings Grid */
.settings-grid {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-md);
}

.settings-hint {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
}

/* Form Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-divider);
}

/* Responsive */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .settings-grid {
    flex-direction: column;
    gap: var(--space-md);
  }
}
</style>
