/**
 * Charts Composable
 * Chart.js 圖表工具函數
 */

import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
  type ChartType,
  type ChartData,
  type ChartOptions
} from 'chart.js'

// 註冊 Chart.js 組件
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// ============================================
// Types
// ============================================

export interface ChartColors {
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  info: string
  accent: string
}

export interface LineChartOptions {
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    color?: string
    fill?: boolean
  }>
  title?: string
  yAxisLabel?: string
  showLegend?: boolean
}

export interface BarChartOptions {
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    color?: string
  }>
  title?: string
  horizontal?: boolean
  stacked?: boolean
  showLegend?: boolean
}

export interface DoughnutChartOptions {
  labels: string[]
  data: number[]
  colors?: string[]
  title?: string
  showLegend?: boolean
}

export interface HeatmapOptions {
  data: number[][] // 7x24 matrix
  dayLabels?: string[]
  hourLabels?: string[]
  colorScale?: {
    min: string
    mid: string
    max: string
  }
}

// ============================================
// Composable
// ============================================

export const useCharts = () => {
  // Chart instances map - use any to accept all chart types
  const charts = new Map<string, Chart<any>>()

  // Default colors
  const colors: ChartColors = {
    primary: '#0071e3',
    secondary: '#5856d6',
    success: '#34c759',
    warning: '#ff9f0a',
    error: '#ff3b30',
    info: '#5ac8fa',
    accent: '#af52de'
  }

  // Color palette for multiple datasets
  const colorPalette = [
    colors.primary,
    colors.success,
    colors.warning,
    colors.secondary,
    colors.error,
    colors.info,
    colors.accent,
    '#30d158', // light green
    '#ff6482', // pink
    '#00c7be'  // teal
  ]

  /**
   * 獲取 Chart.js 預設配置
   */
  const getDefaultOptions = (): ChartOptions => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 16,
          font: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13
        },
        bodyFont: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 12
        },
        padding: 12,
        cornerRadius: 8
      }
    }
  })

  /**
   * 銷毀指定圖表
   */
  const destroyChart = (chartId: string) => {
    const chart = charts.get(chartId)
    if (chart) {
      chart.destroy()
      charts.delete(chartId)
    }
  }

  /**
   * 銷毀所有圖表
   */
  const destroyAllCharts = () => {
    charts.forEach((chart, id) => {
      chart.destroy()
    })
    charts.clear()
  }

  /**
   * 創建折線圖
   */
  const createLineChart = (
    canvas: HTMLCanvasElement,
    chartId: string,
    options: LineChartOptions
  ): Chart | null => {
    try {
      // 先銷毀舊圖表
      destroyChart(chartId)

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const datasets = options.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        borderColor: dataset.color || colorPalette[index % colorPalette.length],
        backgroundColor: dataset.fill
          ? `${dataset.color || colorPalette[index % colorPalette.length]}20`
          : 'transparent',
        fill: dataset.fill || false,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }))

      const config = {
        type: 'line' as const,
        data: {
          labels: options.labels,
          datasets
        },
        options: {
          ...getDefaultOptions(),
          plugins: {
            ...getDefaultOptions().plugins,
            legend: {
              ...getDefaultOptions().plugins?.legend,
              display: options.showLegend !== false
            },
            title: options.title ? {
              display: true,
              text: options.title,
              font: {
                size: 16,
                weight: 600
              }
            } : undefined
          },
          scales: {
            x: {
              grid: {
                display: false
              }
            },
            y: {
              title: options.yAxisLabel ? {
                display: true,
                text: options.yAxisLabel
              } : undefined,
              beginAtZero: true
            }
          }
        }
      }

      const chart = new Chart(ctx, config as ChartConfiguration<'line'>)
      charts.set(chartId, chart as Chart<any>)
      return chart
    } catch (error) {
      console.error('[useCharts] createLineChart error:', error)
      return null
    }
  }

  /**
   * 創建長條圖
   */
  const createBarChart = (
    canvas: HTMLCanvasElement,
    chartId: string,
    options: BarChartOptions
  ): Chart | null => {
    try {
      destroyChart(chartId)

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const datasets = options.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        backgroundColor: dataset.color || colorPalette[index % colorPalette.length],
        borderRadius: 4,
        barThickness: 'flex' as const,
        maxBarThickness: 50
      }))

      const config = {
        type: 'bar' as const,
        data: {
          labels: options.labels,
          datasets
        },
        options: {
          ...getDefaultOptions(),
          indexAxis: options.horizontal ? 'y' as const : 'x' as const,
          plugins: {
            ...getDefaultOptions().plugins,
            legend: {
              ...getDefaultOptions().plugins?.legend,
              display: options.showLegend !== false && options.datasets.length > 1
            },
            title: options.title ? {
              display: true,
              text: options.title,
              font: {
                size: 16,
                weight: 600
              }
            } : undefined
          },
          scales: {
            x: {
              stacked: options.stacked,
              grid: {
                display: false
              }
            },
            y: {
              stacked: options.stacked,
              beginAtZero: true
            }
          }
        }
      }

      const chart = new Chart(ctx, config as ChartConfiguration<'bar'>)
      charts.set(chartId, chart as Chart<any>)
      return chart
    } catch (error) {
      console.error('[useCharts] createBarChart error:', error)
      return null
    }
  }

  /**
   * 創建圓餅圖/甜甜圈圖
   */
  const createDoughnutChart = (
    canvas: HTMLCanvasElement,
    chartId: string,
    options: DoughnutChartOptions
  ): Chart | null => {
    try {
      destroyChart(chartId)

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const chartColors = options.colors || colorPalette.slice(0, options.labels.length)

      const config = {
        type: 'doughnut' as const,
        data: {
          labels: options.labels,
          datasets: [{
            data: options.data,
            backgroundColor: chartColors,
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          ...getDefaultOptions(),
          cutout: '65%',
          plugins: {
            ...getDefaultOptions().plugins,
            legend: {
              ...getDefaultOptions().plugins?.legend,
              display: options.showLegend !== false,
              position: 'bottom' as const
            },
            title: options.title ? {
              display: true,
              text: options.title,
              font: {
                size: 16,
                weight: 600
              }
            } : undefined
          }
        }
      }

      const chart = new Chart(ctx, config as ChartConfiguration<'doughnut'>)
      charts.set(chartId, chart as Chart<any>)
      return chart
    } catch (error) {
      console.error('[useCharts] createDoughnutChart error:', error)
      return null
    }
  }

  /**
   * 更新圖表數據
   */
  const updateChartData = (
    chartId: string,
    labels: string[],
    datasets: Array<{ label: string; data: number[] }>
  ) => {
    const chart = charts.get(chartId)
    if (!chart) return

    chart.data.labels = labels
    datasets.forEach((dataset, index) => {
      if (chart.data.datasets[index]) {
        chart.data.datasets[index].data = dataset.data
        if (dataset.label) {
          chart.data.datasets[index].label = dataset.label
        }
      }
    })
    chart.update('none')
  }

  /**
   * 格式化數字 (千分位)
   */
  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('zh-TW').format(value)
  }

  /**
   * 格式化金額
   */
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      maximumFractionDigits: 0
    }).format(value)
  }

  /**
   * 生成熱力圖顏色
   */
  const getHeatmapColor = (
    value: number,
    max: number,
    colorScale?: { min: string; mid: string; max: string }
  ): string => {
    const scale = colorScale || {
      min: '#f0f4ff',
      mid: '#4a90d9',
      max: '#0047ab'
    }

    if (max === 0) return scale.min

    const ratio = Math.min(value / max, 1)

    if (ratio < 0.5) {
      // 從 min 到 mid
      const r = ratio * 2
      return `rgba(0, 113, 227, ${0.1 + r * 0.4})`
    } else {
      // 從 mid 到 max
      const r = (ratio - 0.5) * 2
      return `rgba(0, 113, 227, ${0.5 + r * 0.5})`
    }
  }

  /**
   * Debounced chart update to prevent rapid re-renders
   */
  const debouncedUpdateChart = (() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    return (
      chartId: string,
      labels: string[],
      datasets: Array<{ label: string; data: number[] }>,
      delay: number = 150
    ) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        updateChartData(chartId, labels, datasets)
        timeoutId = null
      }, delay)
    }
  })()

  // 清理
  onUnmounted(() => {
    destroyAllCharts()
  })

  return {
    // State
    charts,
    colors,
    colorPalette,

    // Chart creation
    createLineChart,
    createBarChart,
    createDoughnutChart,

    // Chart management
    destroyChart,
    destroyAllCharts,
    updateChartData,
    debouncedUpdateChart,

    // Utilities
    formatNumber,
    formatCurrency,
    getHeatmapColor
  }
}
