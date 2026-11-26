/**
 * KpiGrid behavior tests
 */

import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import KpiGrid from './KpiGrid.vue'
import KpiCard from './KpiCard.vue'
import type { DashboardKPIs } from '~/composables/useDashboard'

vi.stubGlobal('computed', computed)

const baseKPIs: DashboardKPIs = {
  success: true,
  period: { type: 'today', start_date: '2024-01-15', end_date: '2024-01-15' },
  revenue: {
    today: 50000,
    mtd: 500000,
    ytd: 2000000,
    period: 50000,
    change: 12.5,
    transactions: { today: 15, period: 15 },
    by_payment_method: [],
    by_branch: []
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
}

const withExpiring = (expiring_7: number): DashboardKPIs => ({
  ...baseKPIs,
  contracts: { ...baseKPIs.contracts, expiring_7 }
})

const mountGrid = (props: { kpis: DashboardKPIs | null, loading?: boolean, showLive?: boolean }) => {
  const wrapper = mount(KpiGrid, { props, global: { components: { KpiCard } } })
  return { wrapper, cards: wrapper.findAllComponents(KpiCard) }
}

describe('KpiGrid', () => {
  it('renders the four cards in order with their values', () => {
    const { cards } = mountGrid({ kpis: baseKPIs })
    expect(cards.map(c => c.props('title'))).toEqual(['今日營收', '活躍會員', '到期警示', '今日入場'])
    expect(cards[0]!.find('.kpi-value').text()).toBe('$50,000')
    expect(cards[0]!.props('change')).toBe(12.5)
    expect(cards[1]!.find('.kpi-value').text()).toBe('350')
    expect(cards[1]!.find('.kpi-subtitle').text()).toBe('70.0% 活躍率')
    expect(cards[2]!.find('.kpi-value').text()).toBe('10')
    expect(cards[3]!.find('.kpi-value').text()).toBe('89')
    expect(cards[3]!.find('.kpi-subtitle').text()).toBe('尖峰時段 18:00')
  })

  it('falls back to placeholders when kpis is null', () => {
    const { cards } = mountGrid({ kpis: null })
    expect(cards).toHaveLength(4)
    expect(cards[0]!.find('.kpi-value').text()).toBe('--')
    expect(cards[0]!.props('change')).toBeUndefined()
    expect(cards[1]!.find('.kpi-value').text()).toBe('0')
    expect(cards[1]!.find('.kpi-subtitle').text()).toBe('0.0% 活躍率')
    expect(cards[3]!.find('.kpi-subtitle').text()).toBe('尖峰時段 0:00')
  })

  it('switches the expiring card to the warning variant above 5 contracts', () => {
    expect(mountGrid({ kpis: withExpiring(5) }).cards[2]!.props('variant')).toBe('default')
    expect(mountGrid({ kpis: withExpiring(6) }).cards[2]!.props('variant')).toBe('warning')
  })

  it('only the revenue and check-in cards show the live badge', () => {
    const { cards } = mountGrid({ kpis: baseKPIs, showLive: true })
    expect(cards.map(c => c.props('live'))).toEqual([true, false, false, true])
  })

  it('passes loading to every card', () => {
    const { cards } = mountGrid({ kpis: baseKPIs, loading: true })
    expect(cards.every(c => c.props('loading') === true)).toBe(true)
    expect(cards.every(c => c.find('.loading-skeleton').exists())).toBe(true)
  })
})
