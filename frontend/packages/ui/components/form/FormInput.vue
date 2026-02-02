<script setup lang="ts">
/**
 * FormInput - 通用輸入框組件
 *
 * 支援 text, email, tel, number, password 等類型
 *
 * @example
 * <FormInput
 *   v-model="form.email"
 *   label="Email"
 *   type="email"
 *   placeholder="請輸入 Email"
 *   :required="true"
 *   :error="errors.email"
 * />
 */

interface Props {
  /** 輸入值 (v-model) */
  modelValue?: string | number | null
  /** 欄位標籤 */
  label?: string
  /** 輸入類型 */
  type?: 'text' | 'email' | 'tel' | 'number' | 'password' | 'date' | 'time' | 'datetime-local'
  /** 佔位文字 */
  placeholder?: string
  /** 是否必填 */
  required?: boolean
  /** 錯誤訊息 */
  error?: string
  /** 提示文字 */
  hint?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 最小值 (number 類型) */
  min?: number
  /** 最大值 (number 類型) */
  max?: number
  /** 步進值 (number 類型) */
  step?: number
  /** 最大長度 */
  maxlength?: number
  /** 自動完成 */
  autocomplete?: string
  /** 前綴文字 */
  prefix?: string
  /** 後綴文字 */
  suffix?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  modelValue: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => {
    if (props.type === 'number') {
      emit('update:modelValue', value === '' ? null : Number(value))
    } else {
      emit('update:modelValue', value)
    }
  }
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
    <div class="input-wrapper" :class="{ 'has-prefix': prefix, 'has-suffix': suffix }">
      <span v-if="prefix" class="input-prefix">{{ prefix }}</span>
      <input
        v-model="inputValue"
        :type="type"
        class="input"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
      />
      <span v-if="suffix" class="input-suffix">{{ suffix }}</span>
    </div>
  </FormField>
</template>

<style scoped>
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper .input {
  flex: 1;
}

.input-wrapper.has-prefix .input {
  padding-left: var(--space-3xl);
}

.input-wrapper.has-suffix .input {
  padding-right: var(--space-3xl);
}

.input-prefix,
.input-suffix {
  position: absolute;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  pointer-events: none;
}

.input-prefix {
  left: var(--space-md);
}

.input-suffix {
  right: var(--space-md);
}
</style>
