<script setup lang="ts">
/**
 * ErrorBoundary Component
 * Catches errors in child components and displays a fallback UI
 */
import { ref, onErrorCaptured } from 'vue'

interface Props {
  fallbackMessage?: string
  showRetry?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fallbackMessage: '發生錯誤，請稍後再試',
  showRetry: true
})

const emit = defineEmits<{
  error: [error: Error]
}>()

const hasError = ref(false)
const errorMessage = ref('')

const handleRetry = () => {
  hasError.value = false
  errorMessage.value = ''
}

onErrorCaptured((error: Error) => {
  hasError.value = true
  errorMessage.value = error.message || props.fallbackMessage
  emit('error', error)

  // Log to console for debugging
  console.error('[ErrorBoundary] Caught error:', error)

  // Return false to prevent error propagation
  return false
})
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-content">
      <div class="error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="error-title">出了點問題</h3>
      <p class="error-message">{{ errorMessage || fallbackMessage }}</p>
      <button
        v-if="showRetry"
        class="retry-btn"
        type="button"
        @click="handleRetry"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        重試
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 24px;
}

.error-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 300px;
}

.error-icon {
  color: var(--color-error, #ef4444);
  margin-bottom: 16px;
}

.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin-bottom: 8px;
}

.error-message {
  font-size: 14px;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 20px;
  line-height: 1.5;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background-color: var(--color-primary, #10b981);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.retry-btn:active {
  opacity: 0.9;
}
</style>
