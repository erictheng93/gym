<script setup lang="ts">
/**
 * FormTextarea - 多行文字輸入組件
 *
 * @example
 * <FormTextarea
 *   v-model="form.notes"
 *   label="備註"
 *   placeholder="請輸入備註"
 *   :rows="3"
 *   :error="errors.notes"
 * />
 */

interface Props {
  /** 輸入值 (v-model) */
  modelValue?: string
  /** 欄位標籤 */
  label?: string
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
  /** 行數 */
  rows?: number
  /** 最大長度 */
  maxlength?: number
  /** 是否可調整大小 */
  resize?: 'none' | 'vertical' | 'horizontal' | 'both'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  rows: 3,
  resize: 'vertical'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const charCount = computed(() => props.modelValue?.length || 0)
</script>

<template>
  <FormField
    :label="label"
    :required="required"
    :error="error"
    :hint="hint"
    :disabled="disabled"
  >
    <div class="textarea-wrapper">
      <textarea
        v-model="textValue"
        class="input textarea"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        :maxlength="maxlength"
        :style="{ resize }"
      />
      <span v-if="maxlength" class="char-count">
        {{ charCount }} / {{ maxlength }}
      </span>
    </div>
  </FormField>
</template>

<style scoped>
.textarea-wrapper {
  position: relative;
}

.textarea {
  width: 100%;
  min-height: 80px;
  line-height: 1.6;
}

.char-count {
  position: absolute;
  right: var(--space-sm);
  bottom: var(--space-sm);
  font-size: 12px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}
</style>
