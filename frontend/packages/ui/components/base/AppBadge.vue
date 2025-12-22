<script setup lang="ts">
/**
 * AppBadge - 狀態標籤組件
 *
 * 用於顯示各種狀態的標籤
 */

interface Props {
  /** 標籤文字 */
  label: string
  /** 標籤變體 */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'
}

withDefaults(defineProps<Props>(), {
  variant: 'default'
})
</script>

<template>
  <span :class="['badge', `badge-${variant}`]">
    <slot>{{ label }}</slot>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.badge-default {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.badge-success {
  background: rgba(52, 199, 89, 0.12);
  color: var(--color-success);
}

.badge-warning {
  background: rgba(255, 159, 10, 0.12);
  color: var(--color-warning);
}

.badge-error {
  background: rgba(255, 59, 48, 0.12);
  color: var(--color-error);
}

.badge-info {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.badge-accent {
  background: var(--color-accent-light);
  color: var(--color-accent);
}
</style>
