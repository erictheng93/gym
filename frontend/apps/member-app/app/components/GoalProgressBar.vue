<script setup lang="ts">
/**
 * Goal Progress Bar Component
 * Displays goal progress with animated bar
 */

const props = withDefaults(defineProps<{
  progress: number
  showLabel?: boolean
  height?: number
  color?: string
}>(), {
  showLabel: true,
  height: 8,
  color: 'primary',
})

const clampedProgress = computed(() => Math.min(100, Math.max(0, props.progress)))
</script>

<template>
  <div class="progress-container">
    <div
      class="progress-bar"
      :style="{ height: `${height}px` }"
    >
      <div
        class="progress-fill"
        :class="`color-${color}`"
        :style="{ width: `${clampedProgress}%` }"
      />
    </div>
    <span v-if="showLabel" class="progress-label">
      {{ Math.round(clampedProgress) }}%
    </span>
  </div>
</template>

<style scoped>
.progress-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  background-color: var(--color-border);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease-out;
}

.color-primary {
  background-color: var(--color-primary);
}

.color-success {
  background-color: #22c55e;
}

.color-warning {
  background-color: #f59e0b;
}

.color-error {
  background-color: var(--color-error);
}

.progress-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  min-width: 40px;
  text-align: right;
}
</style>
