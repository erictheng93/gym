<script setup lang="ts">
interface Props {
  current: number
  limit: number
  label?: string
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
})

const percentage = computed(() => {
  if (props.limit === 0) return 0
  return Math.min(Math.round((props.current / props.limit) * 100), 100)
})

const color = computed(() => {
  if (percentage.value >= 90) return 'error'
  if (percentage.value >= 80) return 'warning'
  return 'success'
})

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('zh-TW').format(num)
}
</script>

<template>
  <div class="quota-bar" :class="{ compact }">
    <div v-if="!compact" class="quota-info">
      <span v-if="label" class="quota-label">{{ label }}</span>
      <span class="quota-value">
        {{ formatNumber(current) }} / {{ formatNumber(limit) }}
      </span>
    </div>

    <div class="quota-track">
      <div
        class="quota-fill"
        :class="`quota-${color}`"
        :style="{ width: `${percentage}%` }"
      >
        <span v-if="!compact" class="quota-percent">{{ percentage }}%</span>
      </div>
    </div>

    <div v-if="compact" class="quota-compact-label">
      {{ formatNumber(current) }}/{{ formatNumber(limit) }} ({{ percentage }}%)
    </div>
  </div>
</template>

<style scoped>
.quota-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quota-bar.compact {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.quota-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.quota-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.quota-value {
  color: var(--color-text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quota-track {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  position: relative;
  min-width: 100px;
  flex: 1;
}

.quota-bar.compact .quota-track {
  height: 6px;
  max-width: 120px;
}

.quota-fill {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  transition: width 0.3s var(--ease-out);
  position: relative;
}

.quota-success {
  background: linear-gradient(90deg, #34c759, #30d158);
}

.quota-warning {
  background: linear-gradient(90deg, #ff9500, #ffcc00);
}

.quota-error {
  background: linear-gradient(90deg, #ff3b30, #ff6961);
}

.quota-percent {
  font-size: 10px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.quota-compact-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
