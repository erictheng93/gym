/**
 * RevenueChart behavior tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, watch, onMounted, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import RevenueChart from './RevenueChart.vue'
import type { DashboardKPIs } from '~/composables/useDashboard'

const createLineChart = vi.fn()
const createBarChart = vi.fn()
const destroyChart = vi.fn()
const formatCurrency = vi.fn((value: number) => `NT$${value.toLocaleString()}`)

vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('useCharts', () => ({ createLineChart, createBarChart, destroyChart, formatCurrency }))

type ByBranch = DashboardKPIs['revenue']['by_branch']

const makeKPIs = (by_branch: ByBranch): DashboardKPIs => ({
  success: true,
  period: { type: 'today', start_date: '2024-01-15', end_date: '2024-01-15' },
  revenue: {
    today: 50000,
    mtd: 500000,
    ytd: 2000000,
    period: 150000,
    change: 12.5,
    transactions: { today: 15, period: 45 },
    by_payment_method: [],
    by_branch
  },
  members: {
    total: 500,
    active: 350,
    new: 10,
    churned: 5,
    active_rate: 70,
    by_gender: { male: 200, female: 150 },
    by_age: [],
    by_branch: []
  },
  contracts: {
    active: 400,
    expiring_7: 10,
    expiring_30: 25,
    expiring_90: 50,
    renewal_rate: 75.5,
    avg_value: 12000,
    by_type: []
  },
  operations: {
    today_checkins: 89,
    period_checkins: 89,
    peak_hour: 18,
    hourly_distribution: Array(24).fill(0),
    class_attendance_rate: 82.5,
    by_branch: []
  },
  generated_at: '2024-01-15T10:00:00.000Z'
})

const branches: ByBranch = [
  { branch_id: 'b1', branch_name: '台北總店', revenue: 80000, transactions: 25 },
  { branch_id: 'b2', branch_name: '台中店', revenue: 50000, transactions: 15 },
  { branch_id: 'b3', branch_name: '高雄店', revenue: 20000, transactions: 5 }
]

const mountChart = async (props: { kpis: DashboardKPIs | null, chartType?: 'line' | 'bar', loading?: boolean }) => {
  const wrapper = mount(RevenueChart, { props, attachTo: document.body })
  await nextTick()
  await flushPromises()
  return wrapper
}

describe('RevenueChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws a line chart per branch by default and shows the total revenue', async () => {
    const wrapper = await mountChart({ kpis: makeKPIs(branches) })

    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(wrapper.find('.total-revenue').text()).toBe('總營收：NT$150,000')
    expect(createBarChart).not.toHaveBeenCalled()
    expect(createLineChart).toHaveBeenCalledTimes(1)
    const [canvas, id, config] = createLineChart.mock.calls[0]!
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(id).toBe('revenue-chart')
    expect(config.labels).toEqual(['台北總店', '台中店', '高雄店'])
    expect(config.datasets[0].data).toEqual([80000, 50000, 20000])
    wrapper.unmount()
  })

  it('draws a bar chart when chartType is bar', async () => {
    const wrapper = await mountChart({ kpis: makeKPIs(branches), chartType: 'bar' })

    expect(createLineChart).not.toHaveBeenCalled()
    expect(createBarChart).toHaveBeenCalledTimes(1)
    expect(createBarChart.mock.calls[0]![2].labels).toEqual(['台北總店', '台中店', '高雄店'])
    wrapper.unmount()
  })

  it('coerces string revenue values (decimal columns) to numbers', async () => {
    const stringy = branches.map(b => ({ ...b, revenue: String(b.revenue) })) as unknown as ByBranch
    const wrapper = await mountChart({ kpis: makeKPIs(stringy) })

    expect(createLineChart.mock.calls[0]![2].datasets[0].data).toEqual([80000, 50000, 20000])
    wrapper.unmount()
  })

  it('shows the empty state and draws nothing when there are no branches', async () => {
    const wrapper = await mountChart({ kpis: makeKPIs([]) })

    expect(wrapper.find('.chart-empty').text()).toContain('暫無營收數據')
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(createLineChart).not.toHaveBeenCalled()
    expect(createBarChart).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the empty state and no total when kpis is null', async () => {
    const wrapper = await mountChart({ kpis: null })

    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.total-revenue').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the loading state instead of the chart', async () => {
    const wrapper = await mountChart({ kpis: makeKPIs(branches), loading: true })

    expect(wrapper.find('.chart-loading').exists()).toBe(true)
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(createLineChart).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('redraws when chartType changes and destroys the chart on unmount', async () => {
    const wrapper = await mountChart({ kpis: makeKPIs(branches) })
    await wrapper.setProps({ chartType: 'bar' })
    await flushPromises()
    expect(createBarChart).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(destroyChart).toHaveBeenCalledWith('revenue-chart')
  })
})
