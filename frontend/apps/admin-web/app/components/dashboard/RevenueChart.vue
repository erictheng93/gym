<script setup lang="ts">
/**
 * Revenue Chart Component
 * 營收趨勢折線/長條圖
 */

import type { DashboardKPIs } from '~/composables/useDashboard'

interface Props {
  kpis: DashboardKPIs | null
  chartType?: 'line' | 'bar'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  chartType: 'line',
  loading: false
})

const { createLineChart, createBarChart, destroyChart, formatCurrency } = useCharts()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
const chartId = 'revenue-chart'

// 生成營收趨勢數據 (基於分店數據)
const chartData = computed(() => {
  if (!props.kpis?.revenue.by_branch) {
    return { labels: [], data: [] }
  }

  const branches = props.kpis.revenue.by_branch
  return {
    labels: branches.map(b => b.branch_name),
    data: branches.map(b => parseFloat(b.revenue as any) || 0)
  }
})

// 渲染圖表
const renderChart = () => {
  if (!chartCanvas.value || props.loading) return

  const { labels, data } = chartData.value

  if (labels.length === 0) {
    destroyChart(chartId)
    return
  }

  if (props.chartType === 'bar') {
    createBarChart(chartCanvas.value, chartId, {
      labels,
      datasets: [{
        label: '營收',
        data
      }],
      showLegend: false
    })
  } else {
    createLineChart(chartCanvas.value, chartId, {
      labels,
      datasets: [{
        label: '營收',
        data,
        fill: true
      }],
      showLegend: false
    })
  }
}

watch(() => [props.kpis, props.chartType], renderChart, { deep: true })

onMounted(() => {
  nextTick(renderChart)
})

onUnmounted(() => {
  destroyChart(chartId)
})
</script>

<template>
  <div class="revenue-chart-container">
    <div class="chart-header">
      <h3 class="chart-title">營收分佈</h3>
      <div class="chart-legend">
        <span v-if="kpis" class="total-revenue">
          總營收：{{ formatCurrency(kpis.revenue.period) }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="chart-loading">
      <div class="loading-spinner" />
      <span>載入中...</span>
    </div>

    <div v-else-if="!kpis || chartData.labels.length === 0" class="chart-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
      <span>暫無營收數據</span>
    </div>

    <div v-else class="chart-wrapper">
      <canvas ref="chartCanvas" />
    </div>
  </div>
</template>

<style scoped>
.revenue-chart-container {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.total-revenue {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.chart-wrapper {
  flex: 1;
  min-height: 250px;
  position: relative;
}

.chart-wrapper canvas {
  width: 100% !important;
  height: 100% !important;
}

.chart-loading,
.chart-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-tertiary);
  min-height: 250px;
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

.chart-empty svg {
  opacity: 0.5;
}
</style>
