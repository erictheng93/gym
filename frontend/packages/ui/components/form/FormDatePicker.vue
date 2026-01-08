<script setup lang="ts">
/**
 * FormDatePicker - 日期選擇器組件
 *
 * 使用原生 date input，未來可替換為自定義日期選擇器
 *
 * @example
 * <FormDatePicker
 *   v-model="form.birthday"
 *   label="生日"
 *   :max="today"
 *   :error="errors.birthday"
 * />
 */

interface Props {
  /** 日期值 (v-model) - ISO 格式字串 YYYY-MM-DD */
  modelValue?: string
  /** 欄位標籤 */
  label?: string
  /** 是否必填 */
  required?: boolean
  /** 錯誤訊息 */
  error?: string
  /** 提示文字 */
  hint?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 最小日期 */
  min?: string
  /** 最大日期 */
  max?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const dateValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 格式化顯示日期
const displayDate = computed(() => {
  if (!props.modelValue) return ''
  return new Date(props.modelValue).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})
</script>

<template>
  <FormField
    :label="label"
    :required="required"
    :error="error"
    :hint="hint"
    :disabled="disabled"
  >
    <div class="date-input-wrapper">
      <input
        v-model="dateValue"
        type="date"
        class="input date-input"
        :disabled="disabled"
        :min="min"
        :max="max"
      />
      <div class="date-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      </div>
    </div>
  </FormField>
</template>

<style scoped>
.date-input-wrapper {
  position: relative;
}

.date-input {
  width: 100%;
  cursor: pointer;
}

.date-input::-webkit-calendar-picker-indicator {
  opacity: 0;
  position: absolute;
  right: 0;
  top: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.date-icon {
  position: absolute;
  right: var(--space-md);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  pointer-events: none;
}
</style>
