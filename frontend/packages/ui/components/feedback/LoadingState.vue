<script setup lang="ts">
/**
 * LoadingState - 載入狀態組件
 *
 * 顯示載入中的狀態，支援不同尺寸和訊息
 */

interface Props {
  /** 載入訊息 */
  message?: string
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  message: '載入中...',
  size: 'md'
})

const spinnerSizes = {
  sm: 24,
  md: 40,
  lg: 56
}
</script>

<template>
  <div :class="['loading-state', `size-${size}`]">
    <div
      class="loading-spinner"
      :style="{
        width: `${spinnerSizes[size]}px`,
        height: `${spinnerSizes[size]}px`
      }"
    />
    <p v-if="message" class="text-secondary loading-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.size-sm {
  padding: var(--space-lg);
  gap: var(--space-sm);
}

.size-md {
  padding: var(--space-3xl);
  gap: var(--space-md);
}

.size-lg {
  padding: var(--space-3xl);
  gap: var(--space-lg);
}

.loading-spinner {
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.size-sm .loading-spinner {
  border-width: 2px;
}

.loading-message {
  margin: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
