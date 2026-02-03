<script setup lang="ts">
/**
 * New Goal Page
 * Create a new fitness goal
 */
import { GOAL_TYPES } from '../../../schemas/goal.schema'
import type { GoalType } from '../../../schemas/goal.schema'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const toast = useToast()
const { createGoal } = useGoals()

// Form state
const form = reactive({
  goal_type: '' as GoalType | '',
  description: '',
  target_value: '',
  target_unit: '',
  target_date: '',
  notes: '',
})
const isSubmitting = ref(false)
const errors = reactive<Record<string, string>>({})

// Goal types for selection
const goalTypes = Object.entries(GOAL_TYPES).map(([value, label]) => ({
  value: value as GoalType,
  label,
}))

// Unit suggestions based on goal type
const unitSuggestions = computed(() => {
  switch (form.goal_type) {
    case 'WEIGHT_LOSS':
      return ['kg', '公斤']
    case 'MUSCLE_GAIN':
      return ['kg', '公斤']
    case 'BODY_SHAPE':
      return ['%', 'cm']
    default:
      return []
  }
})

// Submit handler
const handleSubmit = async () => {
  // Clear errors
  Object.keys(errors).forEach(key => delete errors[key])

  if (!form.goal_type) {
    errors.goal_type = '請選擇目標類型'
    toast.error('請選擇目標類型')
    return
  }

  if (!form.description.trim()) {
    errors.description = '請輸入目標描述'
    toast.error('請輸入目標描述')
    return
  }

  isSubmitting.value = true

  try {
    const targetValue: Record<string, unknown> = {
      description: form.description.trim(),
    }

    if (form.target_value) {
      targetValue.value = parseFloat(form.target_value)
      if (form.target_unit) {
        targetValue.unit = form.target_unit
      }
    }

    const result = await createGoal({
      goal_type: form.goal_type as GoalType,
      target_value: targetValue,
      target_date: form.target_date || undefined,
      notes: form.notes.trim() || undefined,
    })

    if (result.success) {
      toast.success('目標已建立')
      router.replace('/fitness/goals')
    } else {
      toast.error(result.message)
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="new-goal-page">
    <!-- Header -->
    <div class="page-header">
      <NuxtLink to="/fitness/goals" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">設定目標</h1>
      <div class="header-spacer" />
    </div>

    <!-- Form -->
    <form class="goal-form" @submit.prevent="handleSubmit">
      <!-- Type Selection -->
      <div class="form-group">
        <label class="form-label">目標類型</label>
        <div class="type-options">
          <button
            v-for="goalType in goalTypes"
            :key="goalType.value"
            type="button"
            class="type-option"
            :class="{ active: form.goal_type === goalType.value }"
            @click="form.goal_type = goalType.value"
          >
            {{ goalType.label }}
          </button>
        </div>
        <span v-if="errors.goal_type" class="error-text">{{ errors.goal_type }}</span>
      </div>

      <!-- Description -->
      <div class="form-group">
        <label for="description" class="form-label">目標描述</label>
        <input
          id="description"
          v-model="form.description"
          type="text"
          class="form-input"
          placeholder="例如：減重 5 公斤、體脂率降到 18%"
        >
        <span v-if="errors.description" class="error-text">{{ errors.description }}</span>
      </div>

      <!-- Target Value -->
      <div class="form-group">
        <label class="form-label">目標數值（選填）</label>
        <div class="input-row">
          <input
            v-model="form.target_value"
            type="number"
            class="form-input"
            placeholder="數值"
            inputmode="decimal"
            step="0.1"
          >
          <input
            v-model="form.target_unit"
            type="text"
            class="form-input unit-input"
            placeholder="單位"
            :list="unitSuggestions.length > 0 ? 'unit-list' : undefined"
          >
          <datalist v-if="unitSuggestions.length > 0" id="unit-list">
            <option v-for="unit in unitSuggestions" :key="unit" :value="unit" />
          </datalist>
        </div>
      </div>

      <!-- Target Date -->
      <div class="form-group">
        <label for="target_date" class="form-label">目標日期（選填）</label>
        <input
          id="target_date"
          v-model="form.target_date"
          type="date"
          class="form-input"
          :min="new Date().toISOString().split('T')[0]"
        >
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label for="notes" class="form-label">備註（選填）</label>
        <textarea
          id="notes"
          v-model="form.notes"
          class="form-textarea"
          placeholder="任何想記錄的內容"
          rows="3"
          maxlength="500"
        />
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-btn"
        :disabled="isSubmitting"
      >
        <span v-if="!isSubmitting">建立目標</span>
        <span v-else class="loading-spinner" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.new-goal-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--color-text);
  transition: background-color 0.2s;
}

.back-btn:active {
  background-color: var(--color-border);
}

.page-title {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.header-spacer {
  width: 36px;
}

.goal-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.type-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-option {
  padding: 10px 16px;
  background-color: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.type-option.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background-color: rgba(16, 185, 129, 0.05);
}

.form-input,
.form-textarea {
  padding: 14px 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.input-row {
  display: flex;
  gap: 10px;
}

.input-row .form-input {
  flex: 1;
}

.unit-input {
  flex: 0 0 80px !important;
}

.error-text {
  font-size: 12px;
  color: var(--color-error);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 8px;
}

.submit-btn:active:not(:disabled) {
  background-color: #059669;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
