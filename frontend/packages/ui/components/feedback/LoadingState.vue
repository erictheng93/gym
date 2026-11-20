<script setup lang="ts">
/**
 * LoadingState - 載入狀態組件 (Awwwards Grade)
 *
 * 雙軌軌道立體旋轉光環，搭配柔和光暈與呼吸排版
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
  md: 42,
  lg: 58
}
</script>

<template>
  <div :class="['loading-state', `size-${size}`]">
    <div
      class="loading-orb-wrapper"
      :style="{
        width: `${spinnerSizes[size]}px`,
        height: `${spinnerSizes[size]}px`
      }"
    >
      <div class="loading-glow" />
      <div class="loading-spinner-track" />
      <div class="loading-spinner-active" />
    </div>
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

.loading-orb-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-glow {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: var(--color-accent-glow);
  filter: blur(10px);
  opacity: 0.6;
  animation: pulseGlow 2s ease-in-out infinite alternate;
}

.loading-spinner-track {
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-border);
  border-radius: 50%;
}

.loading-spinner-active {
  position: absolute;
  inset: 0;
  border: 2.5px solid transparent;
  border-top-color: var(--color-accent);
  border-right-color: var(--color-accent);
  border-radius: 50%;
  animation: orbitalSpin 0.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.size-lg .loading-spinner-active {
  border-width: 3.5px;
}

.loading-message {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  animation: pulseText 2s ease-in-out infinite alternate;
}

@keyframes orbitalSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulseGlow {
  0% {
    transform: scale(0.85);
    opacity: 0.3;
  }
  100% {
    transform: scale(1.15);
    opacity: 0.7;
  }
}

@keyframes pulseText {
  0% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}
</style>
