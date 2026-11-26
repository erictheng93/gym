<script lang="ts">
import { PAGES } from '~/constants'
import { CLASS_CATEGORIES, CLASS_CATEGORY_LABELS } from '~/composables/useClasses'

const difficultyOptions = [
  { value: 'BEGINNER', label: PAGES.CLASSES.DIFFICULTY_BEGINNER },
  { value: 'INTERMEDIATE', label: PAGES.CLASSES.DIFFICULTY_INTERMEDIATE },
  { value: 'ADVANCED', label: PAGES.CLASSES.DIFFICULTY_ADVANCED }
]

const categoryOptions = [
  { value: '', label: '未分類' },
  ...CLASS_CATEGORIES.map(code => ({ value: code, label: CLASS_CATEGORY_LABELS[code] }))
]
</script>

<script setup lang="ts">
/**
 * 課程表單（新增 / 編輯共用）
 * Emits a body that matches the backend class zod schema (camelCase, ranges enforced there:
 * duration 15–240 min, capacity 1–100, count deduction ≥ 1).
 */
import { MESSAGES } from '~/constants'
import type { ApiClass, ClassInput, ClassCategoryCode, DifficultyLevel } from '~/composables/useClasses'

const props = defineProps<{
  initial?: ApiClass | null
  submitting?: boolean
  submitLabel: string
  cancelTo: string
}>()

const emit = defineEmits<{ submit: [input: ClassInput] }>()

const { branches, fetchBranches } = useBranches()
const { fetchAllEmployees } = useEmployees()
const instructors = ref<Array<{ id: string; fullName: string }>>([])

const form = ref({
  name: props.initial?.name ?? '',
  description: props.initial?.description ?? '',
  durationMinutes: props.initial?.durationMinutes ?? 60,
  maxCapacity: props.initial?.maxCapacity ?? 20,
  instructorId: props.initial?.instructorId ?? '',
  branchId: props.initial?.branchId ?? '',
  category: (props.initial?.category ?? '') as ClassCategoryCode | '',
  difficultyLevel: (props.initial?.difficultyLevel ?? 'BEGINNER') as DifficultyLevel,
  imageUrl: props.initial?.imageUrl ?? '',
  requiresCount: props.initial?.requiresCount ?? true,
  countDeduction: props.initial?.countDeduction ?? 1
})

const errors = ref<Record<string, string>>({})

const validate = () => {
  const e: Record<string, string> = {}
  const f = form.value
  if (!f.name.trim()) e.name = PAGES.CLASSES.ERROR_NAME_REQUIRED
  if (!f.branchId) e.branchId = '請選擇分店'
  if (!Number.isInteger(f.durationMinutes) || f.durationMinutes < 15 || f.durationMinutes > 240) {
    e.durationMinutes = '課程時長需為 15–240 分鐘'
  }
  if (!Number.isInteger(f.maxCapacity) || f.maxCapacity < 1 || f.maxCapacity > 100) {
    e.maxCapacity = '最大人數需為 1–100 人'
  }
  if (f.requiresCount && (!Number.isInteger(f.countDeduction) || f.countDeduction < 1)) {
    e.countDeduction = '扣除堂數至少為 1'
  }
  if (f.imageUrl.trim() && !/^https?:\/\/\S+$/.test(f.imageUrl.trim())) e.imageUrl = '請輸入有效的網址'
  errors.value = e
  return Object.keys(e).length === 0
}

const handleSubmit = () => {
  if (!validate()) return
  const f = form.value
  emit('submit', {
    name: f.name.trim(),
    branchId: f.branchId,
    description: f.description.trim() || null,
    durationMinutes: f.durationMinutes,
    maxCapacity: f.maxCapacity,
    instructorId: f.instructorId || null,
    ...(f.category ? { category: f.category } : {}),
    difficultyLevel: f.difficultyLevel,
    imageUrl: f.imageUrl.trim() || null,
    requiresCount: f.requiresCount,
    countDeduction: f.requiresCount ? f.countDeduction : 1
  })
}

onMounted(async () => {
  const [employees] = await Promise.all([fetchAllEmployees(), fetchBranches()])
  // fetchAllEmployees returns the API rows (camelCase)
  instructors.value = (employees as unknown as Array<{ id: string; fullName: string }>)
})
</script>

<template>
  <form class="class-form card" @submit.prevent="handleSubmit">
    <div class="form-section">
      <h3 class="section-title">基本資訊</h3>

      <div class="form-grid">
        <FormField :label="PAGES.CLASSES.CLASS_NAME" :error="errors.name" required>
          <FormInput v-model="form.name" :placeholder="PAGES.CLASSES.CLASS_NAME_PLACEHOLDER" :error="errors.name" />
        </FormField>

        <FormField :label="PAGES.CLASSES.BRANCH" :error="errors.branchId" required>
          <FormSelect
            v-model="form.branchId"
            placeholder="選擇分店"
            :error="errors.branchId"
            :options="branches.map(branch => ({ value: branch.id, label: branch.name }))"
          />
        </FormField>
      </div>

      <div class="form-grid">
        <FormField :label="PAGES.CLASSES.CATEGORY">
          <FormSelect v-model="form.category" :options="categoryOptions" />
        </FormField>

        <FormField :label="PAGES.CLASSES.INSTRUCTOR">
          <FormSelect
            v-model="form.instructorId"
            :placeholder="PAGES.CLASSES.SELECT_INSTRUCTOR"
            :options="[
              { value: '', label: '未指定' },
              ...instructors.map(instructor => ({ value: instructor.id, label: instructor.fullName }))
            ]"
          />
        </FormField>
      </div>

      <FormField label="課程說明">
        <FormTextarea v-model="form.description" placeholder="請輸入課程說明（選填）" :rows="3" />
      </FormField>
    </div>

    <div class="form-section">
      <h3 class="section-title">課程設定</h3>

      <div class="form-grid">
        <FormField :label="PAGES.CLASSES.DURATION" :error="errors.durationMinutes" required>
          <div class="input-with-suffix">
            <FormInput v-model.number="form.durationMinutes" type="number" :min="15" :max="240" :error="errors.durationMinutes" />
            <span class="input-suffix">{{ PAGES.CLASSES.DURATION_MINUTES }}</span>
          </div>
        </FormField>

        <FormField :label="PAGES.CLASSES.MAX_CAPACITY" :error="errors.maxCapacity" required>
          <div class="input-with-suffix">
            <FormInput v-model.number="form.maxCapacity" type="number" :min="1" :max="100" :error="errors.maxCapacity" />
            <span class="input-suffix">人</span>
          </div>
        </FormField>
      </div>

      <div class="form-grid">
        <FormField :label="PAGES.CLASSES.DIFFICULTY">
          <FormSelect v-model="form.difficultyLevel" :options="difficultyOptions" />
        </FormField>

        <FormField :label="PAGES.CLASSES.IMAGE_URL" :error="errors.imageUrl">
          <FormInput v-model="form.imageUrl" placeholder="課程圖片網址（選填）" :error="errors.imageUrl" />
        </FormField>
      </div>
    </div>

    <div class="form-section">
      <h3 class="section-title">堂數扣除設定</h3>

      <div class="settings-grid">
        <FormCheckbox v-model="form.requiresCount" :label="PAGES.CLASSES.REQUIRES_COUNT" />
      </div>

      <div v-if="form.requiresCount" class="form-grid form-grid-single">
        <FormField :label="PAGES.CLASSES.COUNT_DEDUCTION" :error="errors.countDeduction">
          <div class="input-with-suffix">
            <FormInput v-model.number="form.countDeduction" type="number" :min="1" :max="10" :error="errors.countDeduction" />
            <span class="input-suffix">堂</span>
          </div>
          <template #hint>
            <span class="hint-text">會員上課簽到時，從次數型合約扣除的堂數</span>
          </template>
        </FormField>
      </div>
    </div>

    <div class="form-actions">
      <NuxtLink :to="cancelTo" class="btn btn-ghost">{{ MESSAGES.FORM.CANCEL }}</NuxtLink>
      <button type="submit" class="btn btn-primary" :disabled="submitting">
        {{ submitting ? '儲存中...' : submitLabel }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.class-form {
  padding: var(--space-xl);
  max-width: 800px;
}

.form-section {
  margin-bottom: var(--space-2xl);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
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

.settings-grid {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-md);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
