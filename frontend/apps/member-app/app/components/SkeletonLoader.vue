<script setup lang="ts">
/**
 * iOS-style Skeleton Loader Component
 * Provides shimmer loading animation for content placeholders
 */
defineProps<{
  /** Width of skeleton (CSS value) */
  width?: string
  /** Height of skeleton (CSS value) */
  height?: string
  /** Border radius (CSS value) */
  radius?: string
  /** Variant type */
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
}>()
</script>

<template>
  <div
    class="skeleton"
    :class="[`skeleton--${variant || 'rectangular'}`]"
    :style="{
      width: width || '100%',
      height: height || (variant === 'text' ? '1em' : '100%'),
      borderRadius: radius || (variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '8px')
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface) 25%,
    rgba(255, 255, 255, 0.5) 50%,
    var(--color-surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite ease-in-out;
}

:root.theme-dark .skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    var(--color-surface) 75%
  );
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton--text {
  display: inline-block;
}

.skeleton--circular {
  flex-shrink: 0;
}

.skeleton--card {
  border-radius: 12px;
}
</style>
