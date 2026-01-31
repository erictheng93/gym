<script setup lang="ts">
/**
 * Checkin Heatmap Component
 * 24x7 打卡熱力圖
 */

interface Props {
  data?: number[][] // 7x24 matrix
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const { getHeatmapColor } = useCharts()

const dayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}`)

// 計算最大值
const maxValue = computed(() => {
  if (!props.data) return 0
  return Math.max(...props.data.flat())
})

// 獲取單元格顏色
const getCellColor = (value: number) => {
  return getHeatmapColor(value, maxValue.value)
}

// 獲取單元格提示
const getCellTooltip = (day: number, hour: number) => {
  const value = props.data?.[day]?.[hour] || 0
  return `${dayLabels[day]} ${hour}:00 - ${value} 次打卡`
}

// 找出尖峰時段
const peakInfo = computed(() => {
  if (!props.data) return null

  let maxVal = 0
  let peakDay = 0
  let peakHour = 0

  props.data.forEach((dayData, day) => {
    dayData.forEach((count, hour) => {
      if (count > maxVal) {
        maxVal = count
        peakDay = day
        peakHour = hour
      }
    })
  })

  return {
    day: dayLabels[peakDay],
    hour: peakHour,
    count: maxVal
  }
})
</script>

<template>
  <div class="heatmap-container">
    <div class="heatmap-header">
      <h3 class="heatmap-title">打卡熱力圖</h3>
      <div v-if="peakInfo" class="peak-info">
        <span class="peak-label">尖峰時段：</span>
        <span class="peak-value">{{ peakInfo.day }} {{ peakInfo.hour }}:00 ({{ peakInfo.count }}次)</span>
      </div>
    </div>

    <div v-if="loading" class="heatmap-loading">
      <div class="loading-spinner" />
      <span>載入中...</span>
    </div>

    <div v-else-if="!data" class="heatmap-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
      <span>暫無打卡數據</span>
    </div>

    <div v-else class="heatmap-wrapper">
      <!-- 小時標籤 (頂部) -->
      <div class="hour-labels">
        <div class="corner-cell" />
        <div
          v-for="hour in hourLabels"
          :key="`hour-${hour}`"
          class="hour-label"
        >
          {{ hour }}
        </div>
      </div>

      <!-- 熱力圖主體 -->
      <div class="heatmap-body">
        <div
          v-for="(dayData, dayIndex) in data"
          :key="`day-${dayIndex}`"
          class="heatmap-row"
        >
          <!-- 星期標籤 -->
          <div class="day-label">{{ dayLabels[dayIndex] }}</div>

          <!-- 每小時數據 -->
          <div
            v-for="(value, hourIndex) in dayData"
            :key="`cell-${dayIndex}-${hourIndex}`"
            class="heatmap-cell"
            :style="{ backgroundColor: getCellColor(value) }"
            :title="getCellTooltip(dayIndex, hourIndex)"
          >
            <span v-if="value > 0" class="cell-value">{{ value }}</span>
          </div>
        </div>
      </div>

      <!-- 圖例 -->
      <div class="heatmap-legend">
        <span class="legend-label">少</span>
        <div class="legend-gradient" />
        <span class="legend-label">多</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.heatmap-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.peak-info {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.peak-label {
  color: var(--color-text-tertiary);
}

.peak-value {
  font-weight: 500;
  color: var(--color-accent);
}

.heatmap-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  overflow-x: auto;
}

.hour-labels {
  display: flex;
  gap: 2px;
  padding-left: 48px;
}

.corner-cell {
  width: 48px;
  flex-shrink: 0;
}

.hour-label {
  width: 24px;
  height: 20px;
  font-size: 10px;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.heatmap-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.heatmap-row {
  display: flex;
  gap: 2px;
}

.day-label {
  width: 48px;
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.heatmap-cell {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
  cursor: default;
  flex-shrink: 0;
}

.heatmap-cell:hover {
  transform: scale(1.2);
  z-index: 1;
}

.cell-value {
  font-size: 9px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.legend-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.legend-gradient {
  width: 100px;
  height: 12px;
  background: linear-gradient(to right,
    rgba(0, 113, 227, 0.1),
    rgba(0, 113, 227, 0.3),
    rgba(0, 113, 227, 0.5),
    rgba(0, 113, 227, 0.7),
    rgba(0, 113, 227, 1)
  );
  border-radius: 6px;
}

.heatmap-loading,
.heatmap-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-tertiary);
  min-height: 200px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.heatmap-empty svg {
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 768px) {
  .heatmap-cell {
    width: 16px;
    height: 16px;
  }

  .hour-label {
    width: 16px;
    font-size: 8px;
  }

  .day-label {
    width: 36px;
    font-size: 10px;
  }

  .cell-value {
    display: none;
  }
}
</style>
