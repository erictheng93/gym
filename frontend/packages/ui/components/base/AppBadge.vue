<script setup lang="ts">
/**
 * AppBadge - 狀態標籤組件 (Awwwards Grade)
 *
 * 用於顯示各種狀態的奢華微膠囊標籤，支援呼吸指示燈與邊緣高光
 */

interface Props {
  /** 標籤文字 */
  label?: string
  /** 標籤變體 */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'
  /** 是否顯示呼吸圓點 */
  dot?: boolean
  /** 是否具備發光光暈 */
  glow?: boolean
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  label: '',
  variant: 'default',
  dot: false,
  glow: false,
  size: 'md'
})
</script>

<template>
  <span
    :class="[
      'badge',
      `badge-${variant}`,
      `badge-${size}`,
      { 'badge-glow': glow }
    ]"
  >
    <span v-if="dot" class="badge-dot" />
    <span class="badge-content">
      <slot>{{ label }}</slot>
    </span>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-weight: 500;
  border-radius: var(--radius-full);
  white-space: nowrap;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  transition: all var(--duration-fast) var(--ease-out);
}

/* Sizes */
.badge-sm {
  font-size: 11px;
  padding: 2px 7px;
  gap: 4px;
}

.badge-md {
  font-size: 12px;
  padding: 3px 10px;
}

.badge-lg {
  font-size: 13px;
  padding: 5px 12px;
  gap: 7px;
}

/* Status Dot with pulse ring */
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  position: relative;
  flex-shrink: 0;
}

.badge-dot::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: inherit;
  opacity: 0.4;
  animation: dotPulse 2s infinite ease-out;
}

@keyframes dotPulse {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  70% {
    transform: scale(2.2);
    opacity: 0;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

/* Variants with Inset Specular Rim */
.badge-default {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.badge-success {
  background: var(--color-success-light, rgba(16, 185, 129, 0.12));
  color: var(--color-success);
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.2);
}

.badge-warning {
  background: var(--color-warning-light, rgba(245, 158, 11, 0.12));
  color: var(--color-warning);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.2);
}

.badge-error {
  background: var(--color-error-light, rgba(239, 68, 68, 0.12));
  color: var(--color-error);
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.2);
}

.badge-info {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.2);
}

[data-theme="dark"] .badge-info {
  color: #38bdf8;
}

.badge-accent {
  background: var(--color-accent-light);
  color: var(--color-accent);
  box-shadow: inset 0 0 0 1px rgba(0, 102, 255, 0.2);
}

[data-theme="dark"] .badge-accent {
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.25);
}

/* Glowing Aura Option */
.badge-glow.badge-success {
  box-shadow: 0 0 12px -2px rgba(16, 185, 129, 0.4), inset 0 0 0 1px rgba(16, 185, 129, 0.25);
}

.badge-glow.badge-warning {
  box-shadow: 0 0 12px -2px rgba(245, 158, 11, 0.4), inset 0 0 0 1px rgba(245, 158, 11, 0.25);
}

.badge-glow.badge-error {
  box-shadow: 0 0 12px -2px rgba(239, 68, 68, 0.4), inset 0 0 0 1px rgba(239, 68, 68, 0.25);
}

.badge-glow.badge-accent {
  box-shadow: 0 0 12px -2px var(--color-accent-glow), inset 0 0 0 1px rgba(0, 102, 255, 0.25);
}
</style>
