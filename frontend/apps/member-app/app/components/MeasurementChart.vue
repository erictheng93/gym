<script setup lang="ts">
/**
 * Measurement Chart Component
 * Simple line chart for body measurement trends
 */
import type { Measurement } from '../composables/useMeasurements'

const props = defineProps<{
  measurements: Measurement[]
  metric: 'weight' | 'body_fat' | 'muscle_mass' | 'bmi'
  label: string
  unit: string
}>()

// Get the last N measurements for the chart
const chartData = computed(() => {
  const sorted = [...props.measurements]
    .filter(m => m[props.metric] != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-10) // Last 10 measurements

  return sorted.map(m => ({
    date: m.date,
    value: m[props.metric] as number,
  }))
})

const minValue = computed(() => {
  if (chartData.value.length === 0) return 0
  return Math.min(...chartData.value.map(d => d.value)) * 0.95
})

const maxValue = computed(() => {
  if (chartData.value.length === 0) return 100
  return Math.max(...chartData.value.map(d => d.value)) * 1.05
})

const range = computed(() => maxValue.value - minValue.value || 1)

const latestValue = computed(() => {
  if (chartData.value.length === 0) return null
  return chartData.value[chartData.value.length - 1].value
})

const change = computed(() => {
  if (chartData.value.length < 2) return null
  const first = chartData.value[0].value
  const last = chartData.value[chartData.value.length - 1].value
  return last - first
})

const trendColor = computed(() => {
  if (change.value === null) return ''
  // For body_fat and weight, down is usually good
  const isGoodTrend = (
    (props.metric === 'body_fat' && change.value < 0) ||
    (props.metric === 'weight' && change.value < 0) ||
    (props.metric === 'muscle_mass' && change.value > 0)
  )
  return isGoodTrend ? 'text-success' : change.value === 0 ? '' : 'text-warning'
})

// Generate SVG path
const pathD = computed(() => {
  if (chartData.value.length < 2) return ''

  const width = 100
  const height = 50
  const points = chartData.value.map((d, i) => {
    const x = (i / (chartData.value.length - 1)) * width
    const y = height - ((d.value - minValue.value) / range.value) * height
    return `${x},${y}`
  })

  return `M ${points.join(' L ')}`
})

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<template>
  <div class="measurement-chart">
    <div class="chart-header">
      <div class="chart-info">
        <span class="chart-label">{{ label }}</span>
        <span v-if="latestValue !== null" class="chart-value">
          {{ latestValue.toFixed(1) }}
          <small>{{ unit }}</small>
        </span>
      </div>
      <span v-if="change !== null" class="chart-change" :class="trendColor">
        <svg v-if="change > 0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <svg v-else-if="change < 0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {{ change > 0 ? '+' : '' }}{{ change.toFixed(1) }}
      </span>
    </div>

    <!-- Chart -->
    <div v-if="chartData.length >= 2" class="chart-container">
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" class="chart-svg">
        <!-- Grid lines -->
        <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
        <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
        <!-- Line -->
        <path :d="pathD" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Points -->
        <circle
          v-for="(d, i) in chartData"
          :key="d.date"
          :cx="(i / (chartData.length - 1)) * 100"
          :cy="50 - ((d.value - minValue) / range) * 50"
          r="2"
          fill="var(--color-primary)"
        />
      </svg>
      <div class="chart-dates">
        <span>{{ formatDate(chartData[0].date) }}</span>
        <span>{{ formatDate(chartData[chartData.length - 1].date) }}</span>
      </div>
    </div>

    <p v-else class="chart-empty">需要至少 2 筆數據才能顯示趨勢圖</p>
  </div>
</template>

<style scoped>
.measurement-chart {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.chart-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chart-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.chart-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.chart-value small {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-left: 2px;
}

.chart-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.text-success {
  color: #22c55e;
}

.text-warning {
  color: #f59e0b;
}

.chart-container {
  position: relative;
}

.chart-svg {
  width: 100%;
  height: 60px;
  color: var(--color-text);
}

.chart-dates {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}

.chart-dates span {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.chart-empty {
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-align: center;
  padding: 16px 0;
  margin: 0;
}
</style>
