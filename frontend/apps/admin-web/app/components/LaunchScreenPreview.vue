<script setup lang="ts">
/**
 * LaunchScreenPreview - Launch Screen 預覽組件
 *
 * 顯示迷你版的 Launch Screen 預覽，支援即時反映顏色變化
 *
 * @example
 * <LaunchScreenPreview
 *   :brand-name="form.brandName"
 *   :suffix="form.appSuffix.admin"
 *   :colors="form.colors.admin"
 *   theme="dark"
 * />
 */

interface GradientColors {
  start: string
  end: string
}

interface Props {
  /** 品牌名稱 */
  brandName: string
  /** 應用程式後綴 */
  suffix?: string
  /** 漸層顏色 */
  colors: GradientColors
  /** 主題模式 */
  theme?: 'light' | 'dark'
  /** 應用程式類型標籤 */
  appLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  suffix: '',
  theme: 'dark',
  appLabel: ''
})

const fullBrandName = computed(() => {
  return props.suffix ? `${props.brandName} ${props.suffix}` : props.brandName
})

const backgroundStyle = computed(() => {
  if (props.theme === 'light') {
    return { backgroundColor: '#f5f5f7' }
  }
  return { backgroundColor: '#000' }
})

const textStyle = computed(() => {
  if (props.theme === 'light') {
    return { color: '#1d1d1f' }
  }
  return { color: '#f5f5f7' }
})

const dotStyle = computed(() => {
  if (props.theme === 'light') {
    return { backgroundColor: 'rgba(0, 0, 0, 0.2)' }
  }
  return { backgroundColor: 'rgba(255, 255, 255, 0.3)' }
})

const iconGradient = computed(() => {
  return `linear-gradient(135deg, ${props.colors.start} 0%, ${props.colors.end} 100%)`
})
</script>

<template>
  <div class="preview-container">
    <!-- App label -->
    <div v-if="appLabel" class="preview-label">{{ appLabel }}</div>

    <!-- Preview box -->
    <div class="preview-box" :style="backgroundStyle">
      <!-- Logo -->
      <div class="logo">
        <div class="logo-icon" :style="{ background: iconGradient }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 12h-4v5" />
            <path d="M12 7v5" />
          </svg>
        </div>
        <span class="logo-text" :style="textStyle">{{ fullBrandName }}</span>
      </div>

      <!-- Loading dots -->
      <div class="loading-dots">
        <span :style="dotStyle" />
        <span :style="dotStyle" />
        <span :style="dotStyle" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.preview-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
}

.preview-box {
  width: 100%;
  aspect-ratio: 9 / 16;
  max-width: 200px;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  animation: breathe 2s ease-in-out infinite;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-icon svg {
  width: 18px;
  height: 18px;
  color: #fff;
}

.logo-text {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.loading-dots {
  display: flex;
  gap: 4px;
  margin-top: 20px;
}

.loading-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  animation: dotPulse 1.4s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes breathe {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(0.98);
  }
}

@keyframes dotPulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  40% {
    opacity: 1;
    transform: scale(1.2);
  }
}
</style>
