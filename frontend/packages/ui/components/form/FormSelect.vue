<script setup lang="ts">
/**
 * FormSelect - 下拉選單組件
 *
 * @example
 * <FormSelect
 *   v-model="form.branch_id"
 *   label="所屬分店"
 *   :options="branches.map(b => ({ value: b.id, label: b.name }))"
 *   placeholder="請選擇分店"
 *   :required="true"
 *   :error="errors.branch_id"
 * />
 */

interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface Props {
  /** 選中值 (v-model) */
  modelValue?: string | number | null
  /** 欄位標籤 */
  label?: string
  /** 選項列表 (可選，也可使用 slot 傳入 option 元素) */
  options?: SelectOption[]
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
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  options: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectValue = computed({
  get: () => props.modelValue ?? '',
  set: (value) => emit('update:modelValue', value)
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
    <select
      v-model="selectValue"
      class="input"
      :disabled="disabled"
    >
      <option v-if="placeholder" value="" disabled>
        {{ placeholder }}
      </option>
      <!-- Use options prop if provided -->
      <template v-if="options && options.length > 0">
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </template>
      <!-- Otherwise use slot for custom options -->
      <slot v-else />
    </select>
  </FormField>
</template>

<style scoped>
select.input {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--space-md) center;
  padding-right: var(--space-3xl);
}

select.input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
