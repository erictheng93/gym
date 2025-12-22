<script setup lang="ts">
/**
 * FormCheckbox - 核取方塊組件
 *
 * 支援單一布林值切換或多選群組
 *
 * @example
 * <!-- 單一切換 -->
 * <FormCheckbox
 *   v-model="form.agree"
 *   label="我同意服務條款"
 * />
 *
 * <!-- 帶說明文字 -->
 * <FormCheckbox
 *   v-model="form.newsletter"
 *   label="訂閱電子報"
 *   description="每週接收最新優惠資訊"
 * />
 */

interface Props {
  /** 勾選狀態 (v-model) */
  modelValue?: boolean
  /** 標籤文字 */
  label?: string
  /** 說明文字 */
  description?: string
  /** 是否必填 */
  required?: boolean
  /** 錯誤訊息 */
  error?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  size: 'md'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggle = () => {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div
    class="form-checkbox"
    :class="[
      `size-${size}`,
      { 'is-checked': modelValue, 'is-disabled': disabled, 'is-error': error }
    ]"
    @click="toggle"
  >
    <div class="checkbox-box">
      <svg
        v-if="modelValue"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="checkbox-icon"
      >
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div v-if="label || description" class="checkbox-content">
      <span v-if="label" class="checkbox-label" :class="{ required }">
        {{ label }}
      </span>
      <span v-if="description" class="checkbox-description">
        {{ description }}
      </span>
    </div>
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      class="checkbox-input"
      @change="toggle"
    />
  </div>
  <p v-if="error" class="checkbox-error">{{ error }}</p>
</template>

<style scoped>
.form-checkbox {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  cursor: pointer;
  user-select: none;
}

.form-checkbox.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox-box {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  transition: all var(--duration-fast) var(--ease-out);
}

.size-sm .checkbox-box {
  width: 16px;
  height: 16px;
}

.size-md .checkbox-box {
  width: 20px;
  height: 20px;
}

.size-lg .checkbox-box {
  width: 24px;
  height: 24px;
}

.form-checkbox:hover:not(.is-disabled) .checkbox-box {
  border-color: var(--color-accent);
}

.form-checkbox.is-checked .checkbox-box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.form-checkbox.is-error .checkbox-box {
  border-color: var(--color-error);
}

.checkbox-icon {
  width: 70%;
  height: 70%;
  color: white;
}

.checkbox-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 1px;
}

.checkbox-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.checkbox-label.required::after {
  content: ' *';
  color: var(--color-error);
}

.checkbox-description {
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.checkbox-error {
  margin: var(--space-xs) 0 0 calc(20px + var(--space-md));
  font-size: 13px;
  color: var(--color-error);
}

.size-sm .checkbox-error {
  margin-left: calc(16px + var(--space-md));
}

.size-lg .checkbox-error {
  margin-left: calc(24px + var(--space-md));
}
</style>
