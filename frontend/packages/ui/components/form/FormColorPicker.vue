<script setup lang="ts">
/**
 * FormColorPicker - 顏色選擇器組件
 *
 * 支援原生顏色選擇器 + 文字輸入
 * 提供預設色板快速選擇
 *
 * @example
 * <FormColorPicker
 *   v-model="form.color"
 *   label="主題色"
 *   :presets="['#0a84ff', '#30d158', '#ff9500']"
 * />
 */

interface Props {
  /** 顏色值 (v-model, hex format) */
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
  /** 預設色板 */
  presets?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '#000000',
  presets: () => [
    '#0a84ff', // Apple Blue
    '#30d158', // Apple Green
    '#ff9500', // Apple Orange
    '#ff375f', // Apple Pink
    '#5e5ce6', // Apple Purple
    '#64d2ff', // Apple Teal
    '#ffd60a', // Apple Yellow
    '#ac8e68', // Apple Brown
  ]
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputValue = computed({
  get: () => props.modelValue || '#000000',
  set: (value) => {
    // Validate hex color format
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      emit('update:modelValue', value)
    }
  }
})

// For text input that might be incomplete
const textValue = ref(props.modelValue || '#000000')

watch(() => props.modelValue, (newVal) => {
  textValue.value = newVal || '#000000'
})

function handleTextInput(e: Event) {
  const target = e.target as HTMLInputElement
  let value = target.value

  // Ensure # prefix
  if (!value.startsWith('#')) {
    value = '#' + value
  }

  textValue.value = value

  // Only update model if valid
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    emit('update:modelValue', value)
  }
}

function handleTextBlur() {
  // Reset to valid value on blur
  if (!/^#[0-9A-Fa-f]{6}$/.test(textValue.value)) {
    textValue.value = props.modelValue || '#000000'
  }
}

function selectPreset(color: string) {
  if (!props.disabled) {
    textValue.value = color
    emit('update:modelValue', color)
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
    <div class="color-picker-wrapper">
      <!-- Native color input -->
      <div class="color-input-group">
        <input
          type="color"
          :value="inputValue"
          class="color-swatch"
          :disabled="disabled"
          @input="(e) => inputValue = (e.target as HTMLInputElement).value"
        />
        <input
          type="text"
          :value="textValue"
          class="color-text-input"
          :disabled="disabled"
          maxlength="7"
          placeholder="#000000"
          @input="handleTextInput"
          @blur="handleTextBlur"
        />
      </div>

      <!-- Preset palette -->
      <div v-if="presets.length > 0" class="color-presets">
        <button
          v-for="preset in presets"
          :key="preset"
          type="button"
          class="preset-swatch"
          :class="{ active: preset.toLowerCase() === inputValue.toLowerCase() }"
          :style="{ backgroundColor: preset }"
          :disabled="disabled"
          :title="preset"
          @click="selectPreset(preset)"
        />
      </div>
    </div>
  </FormField>
</template>

<style scoped>
.color-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.color-input-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.color-swatch {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  background: none;
  flex-shrink: 0;
}

.color-swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-swatch::-webkit-color-swatch {
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
}

.color-swatch:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.color-swatch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.color-text-input {
  flex: 1;
  min-width: 100px;
  height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  text-transform: uppercase;
}

.color-text-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-alpha);
}

.color-text-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.color-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.preset-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.preset-swatch:hover:not(:disabled) {
  transform: scale(1.1);
}

.preset-swatch.active {
  border-color: var(--color-text-primary);
}

.preset-swatch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
