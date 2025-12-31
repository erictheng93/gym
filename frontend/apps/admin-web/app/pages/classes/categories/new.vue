<script setup lang="ts">
/**
 * 新增課程類別頁面
 */
import { MESSAGES, PAGES } from '~/constants'
import type { ClassCategory } from '~/types/directus'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const toast = useToast()
const { createCategory, fetchRootCategories } = useClassCategories()
const { branches, fetchBranches } = useBranches()

// Form state
const form = ref({
  name: '',
  name_en: '',
  code: '',
  parent_id: null as string | null,
  icon: '',
  color: '#6366f1',
  description: '',
  is_active: true,
  requires_equipment: false,
  equipment_list: [] as string[],
  visibility: 'shared' as 'shared' | 'owner_only',
  owner_branch_id: null as string | null
})

const isSubmitting = ref(false)
const rootCategories = ref<ClassCategory[]>([])

// Predefined colors
const colorOptions = [
  '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#6366F1', '#8B5CF6', '#DC2626', '#06B6D4'
]

// Validation
const errors = ref<Record<string, string>>({})

const validate = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = PAGES.CLASS_CATEGORIES.ERROR_NAME_REQUIRED
  }

  if (!form.value.code.trim()) {
    errors.value.code = PAGES.CLASS_CATEGORIES.ERROR_CODE_REQUIRED
  } else if (!/^[a-z][a-z0-9_]*$/.test(form.value.code)) {
    errors.value.code = '代碼只能包含小寫字母、數字和底線，且必須以字母開頭'
  }

  return Object.keys(errors.value).length === 0
}

// Auto-generate code from name
const generateCode = () => {
  if (form.value.code) return

  // Simple transliteration for common Chinese characters to pinyin would require a library
  // For now, just use a simple approach
  const name = form.value.name_en || form.value.name
  form.value.code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50) || ''
}

// Submit form
const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    await createCategory({
      ...form.value,
      status: 'published',
      equipment_list: form.value.equipment_list.length > 0 ? form.value.equipment_list : []
    })
    toast.success(MESSAGES.SUCCESS.CATEGORY_CREATED)
    router.push('/classes/categories')
  } catch (error) {
    console.error('Failed to create category:', error)
    toast.error(MESSAGES.ERRORS.CATEGORY_CREATE_FAILED)
  } finally {
    isSubmitting.value = false
  }
}

// Load data
onMounted(async () => {
  try {
    rootCategories.value = await fetchRootCategories()
    await fetchBranches()
  } catch (error) {
    console.error('Failed to load data:', error)
  }
})
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASS_CATEGORIES.ADD_CATEGORY"
      :description="PAGES.CLASS_CATEGORIES.DESCRIPTION"
    />

    <!-- Form -->
    <form class="category-form card" @submit.prevent="handleSubmit">
      <div class="form-section">
        <h3 class="section-title">基本資訊</h3>

        <div class="form-grid">
          <FormField
            :label="PAGES.CLASS_CATEGORIES.CATEGORY_NAME"
            :error="errors.name"
            required
          >
            <FormInput
              v-model="form.name"
              :placeholder="PAGES.CLASS_CATEGORIES.CATEGORY_NAME_PLACEHOLDER"
              :error="!!errors.name"
              @blur="generateCode"
            />
          </FormField>

          <FormField
            :label="PAGES.CLASS_CATEGORIES.CATEGORY_NAME_EN"
          >
            <FormInput
              v-model="form.name_en"
              :placeholder="PAGES.CLASS_CATEGORIES.CATEGORY_NAME_EN_PLACEHOLDER"
              @blur="generateCode"
            />
          </FormField>
        </div>

        <div class="form-grid">
          <FormField
            :label="PAGES.CLASS_CATEGORIES.CATEGORY_CODE"
            :error="errors.code"
            required
          >
            <FormInput
              v-model="form.code"
              :placeholder="PAGES.CLASS_CATEGORIES.CATEGORY_CODE_PLACEHOLDER"
              :error="!!errors.code"
            />
            <template #hint>
              <span class="hint-text">唯一識別碼，僅限小寫字母、數字和底線</span>
            </template>
          </FormField>

          <FormField :label="PAGES.CLASS_CATEGORIES.PARENT_CATEGORY">
            <FormSelect
              v-model="form.parent_id"
              :placeholder="PAGES.CLASS_CATEGORIES.SELECT_PARENT_PLACEHOLDER"
            >
              <option :value="null">無（主類別）</option>
              <option v-for="cat in rootCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </FormSelect>
          </FormField>
        </div>

        <FormField :label="PAGES.CLASS_CATEGORIES.DESCRIPTION">
          <FormTextarea
            v-model="form.description"
            :placeholder="PAGES.CLASS_CATEGORIES.DESCRIPTION_PLACEHOLDER"
            :rows="3"
          />
        </FormField>
      </div>

      <div class="form-section">
        <h3 class="section-title">外觀設定</h3>

        <div class="form-grid">
          <FormField :label="PAGES.CLASS_CATEGORIES.COLOR">
            <div class="color-picker">
              <div class="color-options">
                <button
                  v-for="color in colorOptions"
                  :key="color"
                  type="button"
                  class="color-option"
                  :class="{ active: form.color === color }"
                  :style="{ background: color }"
                  @click="form.color = color"
                />
              </div>
              <input
                v-model="form.color"
                type="color"
                class="color-input"
              />
            </div>
          </FormField>

          <FormField :label="PAGES.CLASS_CATEGORIES.ICON">
            <FormInput
              v-model="form.icon"
              placeholder="圖示名稱（選填）"
            />
          </FormField>
        </div>
      </div>

      <div class="form-section">
        <h3 class="section-title">進階設定</h3>

        <div class="settings-grid">
          <FormCheckbox
            v-model="form.is_active"
            :label="PAGES.CLASS_CATEGORIES.IS_ACTIVE"
          />

          <FormCheckbox
            v-model="form.requires_equipment"
            :label="PAGES.CLASS_CATEGORIES.REQUIRES_EQUIPMENT"
          />
        </div>

        <div class="form-grid">
          <FormField :label="PAGES.CLASS_CATEGORIES.VISIBILITY">
            <FormSelect v-model="form.visibility">
              <option value="shared">{{ PAGES.CLASS_CATEGORIES.VISIBILITY_SHARED }}</option>
              <option value="owner_only">{{ PAGES.CLASS_CATEGORIES.VISIBILITY_OWNER_ONLY }}</option>
            </FormSelect>
          </FormField>

          <FormField
            v-if="form.visibility === 'owner_only'"
            :label="PAGES.CLASS_CATEGORIES.OWNER_BRANCH"
          >
            <FormSelect
              v-model="form.owner_branch_id"
              placeholder="選擇擁有者分店"
            >
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </FormSelect>
          </FormField>
        </div>
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <NuxtLink to="/classes/categories" class="btn btn-ghost">
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
.category-form {
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

.hint-text {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* Color Picker */
.color-picker {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.color-options {
  display: flex;
  gap: var(--space-xs);
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-bg-primary);
}

.color-input {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  padding: 0;
}

/* Settings Grid */
.settings-grid {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-lg);
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
