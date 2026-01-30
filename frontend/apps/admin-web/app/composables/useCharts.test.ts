/**
 * useCharts Composable Unit Tests
 * 測試 Chart.js 圖表工具函數
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================
// Mock Chart.js
// ============================================

// Mock chart.js - using hoisted mock with all dependencies inline
vi.mock('chart.js', () => {
  // Create mock functions inside the factory to avoid hoisting issues
  const mockUpdate = vi.fn()
  const mockDestroy = vi.fn()

  const MockChart = vi.fn().mockImplementation(() => ({
    data: {
      labels: [] as string[],
      datasets: [] as any[]
    },
    update: mockUpdate,
    destroy: mockDestroy
  })) as any

  // Add static methods
  MockChart.register = vi.fn()

  // Attach mock functions to the constructor for test access
  MockChart._mockUpdate = mockUpdate
  MockChart._mockDestroy = mockDestroy

  return {
    Chart: MockChart,
    CategoryScale: vi.fn(),
    LinearScale: vi.fn(),
    PointElement: vi.fn(),
    LineElement: vi.fn(),
    BarElement: vi.fn(),
    ArcElement: vi.fn(),
    Title: vi.fn(),
    Tooltip: vi.fn(),
    Legend: vi.fn(),
    Filler: vi.fn()
  }
})

// Mock onUnmounted
vi.stubGlobal('onUnmounted', vi.fn())

// Now import the composable after mocks are set up
import { useCharts } from './useCharts'
import { Chart } from 'chart.js'

// Get the mocked Chart constructor and helper methods
const MockChart = vi.mocked(Chart) as any
const getMockUpdate = () => MockChart._mockUpdate as ReturnType<typeof vi.fn>
const getMockDestroy = () => MockChart._mockDestroy as ReturnType<typeof vi.fn>

// ============================================
// Test Utilities
// ============================================

function createMockCanvas(): HTMLCanvasElement {
  const canvas = {
    getContext: vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn()
      })
    }),
    width: 800,
    height: 400
  }
  return canvas as unknown as HTMLCanvasElement
}

// ============================================
// Tests
// ============================================

describe('useCharts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockChart.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // 基本功能測試
  // ============================================
  describe('Basic Functionality', () => {
    it('應該返回所有必要的屬性和方法', () => {
      const charts = useCharts()

      // State
      expect(charts.charts).toBeDefined()
      expect(charts.colors).toBeDefined()
      expect(charts.colorPalette).toBeDefined()

      // Chart creation
      expect(charts.createLineChart).toBeDefined()
      expect(charts.createBarChart).toBeDefined()
      expect(charts.createDoughnutChart).toBeDefined()

      // Chart management
      expect(charts.destroyChart).toBeDefined()
      expect(charts.destroyAllCharts).toBeDefined()
      expect(charts.updateChartData).toBeDefined()
      expect(charts.debouncedUpdateChart).toBeDefined()

      // Utilities
      expect(charts.formatNumber).toBeDefined()
      expect(charts.formatCurrency).toBeDefined()
      expect(charts.getHeatmapColor).toBeDefined()
    })

    it('應該包含預設的顏色配置', () => {
      const { colors } = useCharts()

      expect(colors.primary).toBe('#0071e3')
      expect(colors.secondary).toBe('#5856d6')
      expect(colors.success).toBe('#34c759')
      expect(colors.warning).toBe('#ff9f0a')
      expect(colors.error).toBe('#ff3b30')
      expect(colors.info).toBe('#5ac8fa')
      expect(colors.accent).toBe('#af52de')
    })

    it('應該包含顏色調色盤', () => {
      const { colorPalette } = useCharts()

      expect(Array.isArray(colorPalette)).toBe(true)
      expect(colorPalette.length).toBeGreaterThan(0)
      expect(colorPalette[0]).toBe('#0071e3') // primary color
    })
  })

  // ============================================
  // createLineChart 測試
  // ============================================
  describe('createLineChart', () => {
    it('應該創建折線圖', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createLineChart(canvas, 'test-line-chart', {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [
          { label: 'Revenue', data: [100, 200, 150] }
        ]
      })

      expect(MockChart).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('應該使用正確的圖表類型', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-line-chart', {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{ label: 'Test', data: [1, 2, 3] }]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.type).toBe('line')
    })

    it('應該正確設置數據集', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-chart', {
        labels: ['A', 'B', 'C'],
        datasets: [
          { label: 'Dataset 1', data: [10, 20, 30], color: '#ff0000' },
          { label: 'Dataset 2', data: [5, 15, 25] }
        ]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.data.labels).toEqual(['A', 'B', 'C'])
      expect(chartConfig.data.datasets).toHaveLength(2)
      expect(chartConfig.data.datasets[0].label).toBe('Dataset 1')
      expect(chartConfig.data.datasets[0].borderColor).toBe('#ff0000')
    })

    it('應該支持填充選項', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [
          { label: 'Filled', data: [1, 2], fill: true }
        ]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.data.datasets[0].fill).toBe(true)
    })

    it('應該支持標題選項', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }],
        title: 'My Chart Title'
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.title.display).toBe(true)
      expect(chartConfig.options.plugins.title.text).toBe('My Chart Title')
    })

    it('應該支持 Y 軸標籤', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }],
        yAxisLabel: 'Revenue (NT$)'
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.scales.y.title.display).toBe(true)
      expect(chartConfig.options.scales.y.title.text).toBe('Revenue (NT$)')
    })

    it('應該支持隱藏圖例', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      createLineChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }],
        showLegend: false
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.legend.display).toBe(false)
    })

    it('應該在創建新圖表前銷毀舊圖表', () => {
      const { createLineChart, charts } = useCharts()
      const canvas = createMockCanvas()

      // Create first chart
      createLineChart(canvas, 'test-chart', {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      })

      // Create second chart with same ID
      createLineChart(canvas, 'test-chart', {
        labels: ['B'],
        datasets: [{ label: 'Test 2', data: [2] }]
      })

      expect(getMockDestroy()).toHaveBeenCalled()
    })

    it('應該在 canvas context 無效時返回 null', () => {
      const { createLineChart } = useCharts()
      const canvas = {
        getContext: vi.fn().mockReturnValue(null)
      } as unknown as HTMLCanvasElement

      const result = createLineChart(canvas, 'test-chart', {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      })

      expect(result).toBeNull()
    })

    it('應該處理創建錯誤', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      MockChart.mockImplementationOnce(() => {
        throw new Error('Chart creation failed')
      })

      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createLineChart(canvas, 'test-chart', {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      })

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useCharts] createLineChart error:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })
  })

  // ============================================
  // createBarChart 測試
  // ============================================
  describe('createBarChart', () => {
    it('應該創建長條圖', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createBarChart(canvas, 'test-bar-chart', {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [
          { label: 'Sales', data: [100, 200, 150, 300] }
        ]
      })

      expect(MockChart).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('應該使用正確的圖表類型', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      createBarChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.type).toBe('bar')
    })

    it('應該支持水平長條圖', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      createBarChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }],
        horizontal: true
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.indexAxis).toBe('y')
    })

    it('應該支持堆疊長條圖', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      createBarChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [
          { label: 'Test 1', data: [1, 2] },
          { label: 'Test 2', data: [3, 4] }
        ],
        stacked: true
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.scales.x.stacked).toBe(true)
      expect(chartConfig.options.scales.y.stacked).toBe(true)
    })

    it('應該在多數據集時顯示圖例', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      createBarChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [
          { label: 'Test 1', data: [1, 2] },
          { label: 'Test 2', data: [3, 4] }
        ]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.legend.display).toBe(true)
    })

    it('應該在單數據集時隱藏圖例', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      createBarChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.legend.display).toBe(false)
    })

    it('應該處理創建錯誤', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      MockChart.mockImplementationOnce(() => {
        throw new Error('Chart creation failed')
      })

      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createBarChart(canvas, 'test-chart', {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      })

      expect(result).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  // ============================================
  // createDoughnutChart 測試
  // ============================================
  describe('createDoughnutChart', () => {
    it('應該創建圓餅圖', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createDoughnutChart(canvas, 'test-doughnut', {
        labels: ['Male', 'Female'],
        data: [60, 40]
      })

      expect(MockChart).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('應該使用正確的圖表類型', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        data: [50, 50]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.type).toBe('doughnut')
    })

    it('應該支持自定義顏色', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      const customColors = ['#ff0000', '#00ff00']
      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        data: [50, 50],
        colors: customColors
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.data.datasets[0].backgroundColor).toEqual(customColors)
    })

    it('應該使用預設顏色調色盤', () => {
      const { createDoughnutChart, colorPalette } = useCharts()
      const canvas = createMockCanvas()

      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B', 'C'],
        data: [30, 40, 30]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.data.datasets[0].backgroundColor).toEqual(
        colorPalette.slice(0, 3)
      )
    })

    it('應該支持標題', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        data: [50, 50],
        title: 'Distribution'
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.title.display).toBe(true)
      expect(chartConfig.options.plugins.title.text).toBe('Distribution')
    })

    it('應該設置正確的 cutout 百分比', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        data: [50, 50]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.cutout).toBe('65%')
    })

    it('應該將圖例放在底部', () => {
      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      createDoughnutChart(canvas, 'test-chart', {
        labels: ['A', 'B'],
        data: [50, 50]
      })

      const chartConfig = MockChart.mock.calls[0][1]
      expect(chartConfig.options.plugins.legend.position).toBe('bottom')
    })

    it('應該處理創建錯誤', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      MockChart.mockImplementationOnce(() => {
        throw new Error('Chart creation failed')
      })

      const { createDoughnutChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createDoughnutChart(canvas, 'test-chart', {
        labels: ['A'],
        data: [100]
      })

      expect(result).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  // ============================================
  // Chart Management 測試
  // ============================================
  describe('Chart Management', () => {
    describe('destroyChart', () => {
      it('應該銷毀指定的圖表', () => {
        const { createLineChart, destroyChart, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'chart-1', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        destroyChart('chart-1')

        expect(getMockDestroy()).toHaveBeenCalled()
      })

      it('應該從 charts Map 中移除圖表', () => {
        const { createLineChart, destroyChart, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'chart-1', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        expect(charts.has('chart-1')).toBe(true)

        destroyChart('chart-1')

        expect(charts.has('chart-1')).toBe(false)
      })

      it('應該安全處理不存在的圖表', () => {
        const { destroyChart } = useCharts()

        // Should not throw
        expect(() => destroyChart('non-existent')).not.toThrow()
      })
    })

    describe('destroyAllCharts', () => {
      it('應該銷毀所有圖表', () => {
        const { createLineChart, createBarChart, destroyAllCharts, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'line-1', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        createBarChart(canvas, 'bar-1', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        destroyAllCharts()

        expect(charts.size).toBe(0)
      })
    })

    describe('updateChartData', () => {
      it('應該更新圖表數據', () => {
        const { createLineChart, updateChartData, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'test-chart', {
          labels: ['A', 'B'],
          datasets: [{ label: 'Test', data: [1, 2] }]
        })

        // Get the chart from the map
        const chart = charts.get('test-chart')
        if (chart) {
          chart.data.labels = ['A', 'B']
          chart.data.datasets = [{ label: 'Test', data: [1, 2] }]
        }

        updateChartData('test-chart', ['C', 'D'], [
          { label: 'Updated', data: [3, 4] }
        ])

        expect(getMockUpdate()).toHaveBeenCalledWith('none')
      })

      it('應該安全處理不存在的圖表', () => {
        const { updateChartData } = useCharts()

        // Should not throw
        expect(() => updateChartData('non-existent', [], [])).not.toThrow()
      })
    })

    describe('debouncedUpdateChart', () => {
      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('應該延遲執行更新', () => {
        const { createLineChart, debouncedUpdateChart, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'test-chart', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        const chart = charts.get('test-chart')
        if (chart) {
          chart.data.labels = ['A']
          chart.data.datasets = [{ label: 'Test', data: [1] }]
        }

        debouncedUpdateChart('test-chart', ['B'], [{ label: 'Updated', data: [2] }])

        // Update should not happen immediately
        expect(getMockUpdate()).not.toHaveBeenCalled()

        // Fast forward time
        vi.advanceTimersByTime(150)

        expect(getMockUpdate()).toHaveBeenCalled()
      })

      it('應該取消之前的更新', () => {
        const { createLineChart, debouncedUpdateChart, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'test-chart', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        const chart = charts.get('test-chart')
        if (chart) {
          chart.data.labels = ['A']
          chart.data.datasets = [{ label: 'Test', data: [1] }]
        }

        // First update
        debouncedUpdateChart('test-chart', ['B'], [{ label: 'First', data: [2] }])

        // Second update before debounce completes
        vi.advanceTimersByTime(50)
        debouncedUpdateChart('test-chart', ['C'], [{ label: 'Second', data: [3] }])

        // Complete the debounce
        vi.advanceTimersByTime(150)

        // Should only update once
        expect(getMockUpdate()).toHaveBeenCalledTimes(1)
      })

      it('應該支持自定義延遲', () => {
        const { createLineChart, debouncedUpdateChart, charts } = useCharts()
        const canvas = createMockCanvas()

        createLineChart(canvas, 'test-chart', {
          labels: ['A'],
          datasets: [{ label: 'Test', data: [1] }]
        })

        const chart = charts.get('test-chart')
        if (chart) {
          chart.data.labels = ['A']
          chart.data.datasets = [{ label: 'Test', data: [1] }]
        }

        debouncedUpdateChart('test-chart', ['B'], [{ label: 'Updated', data: [2] }], 300)

        vi.advanceTimersByTime(150)
        expect(getMockUpdate()).not.toHaveBeenCalled()

        vi.advanceTimersByTime(150)
        expect(getMockUpdate()).toHaveBeenCalled()
      })
    })
  })

  // ============================================
  // Utility Functions 測試
  // ============================================
  describe('Utility Functions', () => {
    describe('formatNumber', () => {
      it('應該格式化數字為千分位', () => {
        const { formatNumber } = useCharts()

        expect(formatNumber(1000)).toBe('1,000')
        expect(formatNumber(1000000)).toBe('1,000,000')
        expect(formatNumber(123456789)).toBe('123,456,789')
      })

      it('應該處理小數', () => {
        const { formatNumber } = useCharts()

        expect(formatNumber(1234.56)).toBe('1,234.56')
      })

      it('應該處理零', () => {
        const { formatNumber } = useCharts()

        expect(formatNumber(0)).toBe('0')
      })

      it('應該處理負數', () => {
        const { formatNumber } = useCharts()

        expect(formatNumber(-1000)).toBe('-1,000')
      })
    })

    describe('formatCurrency', () => {
      it('應該格式化為台幣格式', () => {
        const { formatCurrency } = useCharts()

        const result = formatCurrency(50000)
        expect(result).toContain('50,000')
        // Should contain TWD currency symbol or NT$
        expect(result).toMatch(/\$|NT/)
      })

      it('應該不顯示小數', () => {
        const { formatCurrency } = useCharts()

        const result = formatCurrency(50000.99)
        expect(result).toContain('50,001')
      })

      it('應該處理大金額', () => {
        const { formatCurrency } = useCharts()

        const result = formatCurrency(1000000)
        expect(result).toContain('1,000,000')
      })
    })

    describe('getHeatmapColor', () => {
      it('應該返回最小值的顏色', () => {
        const { getHeatmapColor } = useCharts()

        const result = getHeatmapColor(0, 100)
        expect(result).toContain('rgba')
      })

      it('應該返回最大值的顏色', () => {
        const { getHeatmapColor } = useCharts()

        const result = getHeatmapColor(100, 100)
        expect(result).toContain('rgba')
        expect(result).toContain('1)') // Full opacity
      })

      it('應該處理 max=0 的情況', () => {
        const { getHeatmapColor } = useCharts()

        const result = getHeatmapColor(0, 0)
        expect(result).toBe('#f0f4ff') // Default min color
      })

      it('應該限制比率不超過 1', () => {
        const { getHeatmapColor } = useCharts()

        const result = getHeatmapColor(200, 100)
        expect(result).toContain('rgba')
        expect(result).toContain('1)') // Should be capped at max
      })

      it('應該根據比率返回漸變顏色', () => {
        const { getHeatmapColor } = useCharts()

        const low = getHeatmapColor(25, 100)
        const mid = getHeatmapColor(50, 100)
        const high = getHeatmapColor(75, 100)

        // All should be valid rgba colors
        expect(low).toContain('rgba')
        expect(mid).toContain('rgba')
        expect(high).toContain('rgba')
      })

      it('應該支持自定義顏色比例', () => {
        const { getHeatmapColor } = useCharts()

        const customScale = {
          min: '#ffffff',
          mid: '#888888',
          max: '#000000'
        }

        // When max is 0, should return scale.min
        const result = getHeatmapColor(0, 0, customScale)
        expect(result).toBe('#ffffff')
      })
    })
  })

  // ============================================
  // Cleanup 測試
  // ============================================
  describe('Cleanup', () => {
    it('應該在 onUnmounted 時清理所有圖表', () => {
      // onUnmounted is mocked, we just verify it's called
      useCharts()

      expect(vi.mocked(onUnmounted as any)).toHaveBeenCalled()
    })
  })

  // ============================================
  // Edge Cases 測試
  // ============================================
  describe('Edge Cases', () => {
    it('應該處理空數據集', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createLineChart(canvas, 'empty-chart', {
        labels: [],
        datasets: []
      })

      expect(result).toBeDefined()
    })

    it('應該處理大量數據點', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      const labels = Array(1000).fill(0).map((_, i) => `Point ${i}`)
      const data = Array(1000).fill(0).map(() => Math.random() * 100)

      const result = createLineChart(canvas, 'large-chart', {
        labels,
        datasets: [{ label: 'Large Dataset', data }]
      })

      expect(result).toBeDefined()
    })

    it('應該處理特殊字符在標籤中', () => {
      const { createLineChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createLineChart(canvas, 'special-chart', {
        labels: ['台北總店', '台中店', 'New York'],
        datasets: [{ label: '營收 (NT$)', data: [100, 200, 150] }]
      })

      expect(result).toBeDefined()
    })

    it('應該處理負數數據', () => {
      const { createBarChart } = useCharts()
      const canvas = createMockCanvas()

      const result = createBarChart(canvas, 'negative-chart', {
        labels: ['Q1', 'Q2', 'Q3'],
        datasets: [{ label: 'Profit', data: [100, -50, 75] }]
      })

      expect(result).toBeDefined()
    })
  })
})
