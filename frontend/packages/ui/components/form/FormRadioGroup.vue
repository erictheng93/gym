<script setup lang="ts">
/**
 * FormRadioGroup - 單選按鈕組組件
 *
 * 提供 pill 風格的單選按鈕組
 *
 * @example
 * <FormRadioGroup
 *   v-model="form.gender"
 *   label="性別"
 *   :options="[
 *     { value: 'M', label: '男' },
 *     { value: 'F', label: '女' },
 *     { value: 'O', label: '其他' }
 *   ]"
 * />
 */

interface RadioOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface Props {
  /** 選中值 (v-model) */
  modelValue?: string | number
  /** 欄位標籤 */
  label?: string
  /** 選項列表 */
  options: RadioOption[]
  /** 是否必填 */
  required?: boolean
  /** 錯誤訊息 */
  error?: string
  /** 提示文字 */
  hint?: string
  /** 是否禁用整組 */
  disabled?: boolean
  /** 樣式變體 */
  variant?: 'pill' | 'button'
  /** 是否允許取消選擇 */
  allowEmpty?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  options: () => [],
  variant: 'pill',
  allowEmpty: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectOption = (value: string | number) => {
  if (props.disabled) return
  if (props.modelValue === value && props.allowEmpty) {
    emit('update:modelValue', '')
  } else {
    emit('update:modelValue', value)
  }
}

// Generate unique name for radio group
const groupName = `radio-group-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <FormField
    :label="label"
    :required="required"
    :error="error"
    :hint="hint"
    :disabled="disabled"
  >
    <div class="radio-group" :class="[`variant-${variant}`]">
      <label
        v-for="option in options"
        :key="option.value"
        class="radio-option"
        :class="{
          active: modelValue === option.value,
          disabled: option.disabled || disabled
        }"
        @click="selectOption(option.value)"
      >
        <input
          type="radio"
          :name="groupName"
          :value="option.value"
          :checked="modelValue === option.value"
          :disabled="option.disabled || disabled"
          class="radio-input"
        />
        <span class="radio-label">{{ option.label }}</span>
      </label>
    </div>
  </FormField>
</template>

<style scoped>
.radio-group {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.radio-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-option {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all var(--duration-fast) var(--ease-out);
  user-select: none;
}

.radio-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pill variant */
.variant-pill .radio-option {
  padding: 10px 20px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-primary);
}

.variant-pill .radio-option:hover:not(.disabled) {
  border-color: var(--color-accent);
}

.variant-pill .radio-option.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

/* Button variant */
.variant-button .radio-option {
  padding: 12px 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.variant-button .radio-option:first-child {
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.variant-button .radio-option:last-child {
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.variant-button .radio-option:not(:first-child) {
  margin-left: -1px;
}

.variant-button .radio-option:hover:not(.disabled) {
  background: var(--color-bg-tertiary);
}

.variant-button .radio-option.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
  z-index: 1;
}
</style>
