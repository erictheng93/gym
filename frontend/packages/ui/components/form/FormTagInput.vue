<script setup lang="ts">
/**
 * FormTagInput - 標籤輸入組件
 *
 * 支援新增、刪除標籤，可自訂樣式
 *
 * @example
 * <FormTagInput
 *   v-model="form.tags"
 *   label="標籤"
 *   placeholder="輸入標籤後按 Enter"
 *   add-button-text="新增"
 * />
 */

interface Props {
  /** 標籤陣列 (v-model) */
  modelValue?: string[]
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
  /** 新增按鈕文字 */
  addButtonText?: string
  /** 最大標籤數量 */
  maxTags?: number
  /** 標籤顏色變體 */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  placeholder: '輸入標籤...',
  addButtonText: '新增',
  variant: 'primary'
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const newTag = ref('')

const tags = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const canAddMore = computed(() => {
  if (!props.maxTags) return true
  return tags.value.length < props.maxTags
})

const addTag = () => {
  if (props.disabled || !canAddMore.value) return

  const tag = newTag.value.trim()
  if (tag && !tags.value.includes(tag)) {
    emit('update:modelValue', [...tags.value, tag])
    newTag.value = ''
  }
}

const removeTag = (tagToRemove: string) => {
  if (props.disabled) return
  emit('update:modelValue', tags.value.filter(t => t !== tagToRemove))
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !newTag.value && tags.value.length > 0) {
    // 當輸入為空時，按 Backspace 刪除最後一個標籤
    const lastTag = tags.value[tags.value.length - 1]
    if (lastTag) {
      removeTag(lastTag)
    }
  }
}
</script>

<template>
  <FormField
    :label="label"
    :required="required"
    :error="error"
    :hint="hint"
    :disabled="disabled"
  >
    <div class="tag-input-container" :class="{ 'is-disabled': disabled }">
      <!-- Tags List -->
      <div v-if="tags.length > 0" class="tags-list">
        <span
          v-for="tag in tags"
          :key="tag"
          class="tag"
          :class="[`tag-${variant}`]"
        >
          {{ tag }}
          <button
            type="button"
            class="tag-remove"
            :disabled="disabled"
            @click="removeTag(tag)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </span>
      </div>

      <!-- Input Row -->
      <div class="tag-input-row">
        <input
          v-model="newTag"
          type="text"
          class="input"
          :placeholder="placeholder"
          :disabled="disabled || !canAddMore"
          @keydown="handleKeydown"
        />
        <button
          type="button"
          class="btn btn-secondary btn-small"
          :disabled="disabled || !newTag.trim() || !canAddMore"
          @click="addTag"
        >
          {{ addButtonText }}
        </button>
      </div>

      <!-- Max tags hint -->
      <p v-if="maxTags" class="tags-count">
        {{ tags.length }} / {{ maxTags }}
      </p>
    </div>
  </FormField>
</template>

<style scoped>
.tag-input-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.tag-input-container.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.tag {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
}

.tag-default {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.tag-primary {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.tag-success {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
}

.tag-warning {
  background: rgba(255, 159, 10, 0.15);
  color: var(--color-warning);
}

.tag-error {
  background: rgba(255, 59, 48, 0.15);
  color: var(--color-error);
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity var(--duration-fast) var(--ease-out);
  padding: 0;
}

.tag-remove:hover:not(:disabled) {
  opacity: 1;
}

.tag-remove:disabled {
  cursor: not-allowed;
}

.tag-input-row {
  display: flex;
  gap: var(--space-md);
}

.tag-input-row .input {
  flex: 1;
}

.tags-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
  text-align: right;
}
</style>
