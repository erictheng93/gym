<script setup lang="ts">
/**
 * FormField - 表單欄位基礎包裝組件
 *
 * 提供統一的標籤、錯誤訊息、必填標記樣式
 *
 * @example
 * <FormField label="姓名" :required="true" :error="errors.name">
 *   <input v-model="form.name" class="input" />
 * </FormField>
 */

interface Props {
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
}

defineProps<Props>()
</script>

<template>
  <div class="form-field" :class="{ 'is-error': error, 'is-disabled': disabled }">
    <label v-if="label" class="form-field-label" :class="{ required }">
      {{ label }}
    </label>
    <div class="form-field-control">
      <slot />
    </div>
    <p v-if="error" class="form-field-error">{{ error }}</p>
    <p v-else-if="hint" class="form-field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-field-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-field-label.required::after {
  content: ' *';
  color: var(--color-error);
}

.form-field-control {
  position: relative;
}

.form-field-error {
  font-size: 13px;
  color: var(--color-error);
  margin: 0;
}

.form-field-hint {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.form-field.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Error state styling for nested inputs */
.form-field.is-error :deep(.input),
.form-field.is-error :deep(input),
.form-field.is-error :deep(select),
.form-field.is-error :deep(textarea) {
  border-color: var(--color-error);
}

.form-field.is-error :deep(.input:focus),
.form-field.is-error :deep(input:focus),
.form-field.is-error :deep(select:focus),
.form-field.is-error :deep(textarea:focus) {
  box-shadow: 0 0 0 4px rgba(255, 59, 48, 0.15);
}
</style>
