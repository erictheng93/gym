/**
 * ContractAlerts behavior tests
 */

import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import ContractAlerts from './ContractAlerts.vue'
import type { ContractAlertsResponse, ContractAlert } from '~/composables/useDashboard'

vi.stubGlobal('computed', computed)

const makeAlert = (overrides: Partial<ContractAlert> = {}): ContractAlert => ({
  contract_id: 'contract-1',
  contract_no: 'C2024-001',
  days_until_expiry: 3,
  member_name: '王小明',
  member_phone: '0912345678',
  plan_name: '年費會員',
  branch_name: '台北總店',
  urgency: 'URGENT',
  ...overrides
})

const makeResponse = (alerts: ContractAlert[], total = alerts.length): ContractAlertsResponse => ({
  success: true,
  summary: { total, urgent: 5, soon: 10, upcoming: 10 },
  grouped: { urgent: [], soon: [], upcoming: [] },
  alerts
})

const threeAlerts = makeResponse([
  makeAlert(),
  makeAlert({ contract_id: 'contract-2', days_until_expiry: 15, member_name: '李美玲', urgency: 'SOON' }),
  makeAlert({ contract_id: 'contract-3', days_until_expiry: 45, member_name: '陳大華', urgency: 'UPCOMING' })
])

const mountAlerts = (props: { alerts: ContractAlertsResponse | null, loading?: boolean, limit?: number }) =>
  mount(ContractAlerts, { props })

describe('ContractAlerts', () => {
  it('renders one row per alert with member, plan and expiry', () => {
    const items = mountAlerts({ alerts: threeAlerts }).findAll('.alert-item')
    expect(items).toHaveLength(3)
    expect(items[0]!.find('.member-name').text()).toBe('王小明')
    expect(items[0]!.find('.plan-name').text()).toBe('年費會員')
    expect(items[0]!.find('.expiry-date').text()).toBe('3 天後到期')
  })

  it('shows summary badges from the summary counts', () => {
    const w = mountAlerts({ alerts: threeAlerts })
    expect(w.find('.badge-urgent').text()).toBe('5 緊急')
    expect(w.find('.badge-soon').text()).toBe('10 即將')
  })

  it('maps each urgency level to its label and class', () => {
    const badges = mountAlerts({ alerts: threeAlerts }).findAll('.urgency-badge')
    expect(badges.map(b => b.text())).toEqual(['緊急', '即將', '注意'])
    expect(badges[0]!.classes()).toContain('urgency-urgent')
    expect(badges[1]!.classes()).toContain('urgency-soon')
    expect(badges[2]!.classes()).toContain('urgency-upcoming')
  })

  it.each([
    [1, '明天到期'],
    [2, '2 天後到期']
  ])('formats %i days until expiry as "%s"', (days, expected) => {
    const w = mountAlerts({ alerts: makeResponse([makeAlert({ days_until_expiry: days })]) })
    expect(w.find('.expiry-date').text()).toBe(expected)
  })

  it.each([-2, 0])('shows "已到期" once for %i days until expiry', (days) => {
    const w = mountAlerts({ alerts: makeResponse([makeAlert({ days_until_expiry: days })]) })
    expect(w.find('.expiry-date').text()).toBe('已到期')
  })

  it('emits view-contract with the contract id when a row is clicked', async () => {
    const w = mountAlerts({ alerts: threeAlerts })
    await w.findAll('.alert-item')[1]!.trigger('click')
    expect(w.emitted('view-contract')).toEqual([['contract-2']])
  })

  describe('limit and view-all', () => {
    const many = makeResponse(
      Array.from({ length: 12 }, (_, i) => makeAlert({ contract_id: `c-${i}` })),
      12
    )

    it('shows at most 10 rows by default and offers view-all when total exceeds it', async () => {
      const w = mountAlerts({ alerts: many })
      expect(w.findAll('.alert-item')).toHaveLength(10)
      const btn = w.find('.view-all-btn')
      expect(btn.text()).toBe('查看全部 12 筆警示')
      await btn.trigger('click')
      expect(w.emitted('view-all')).toHaveLength(1)
    })

    it('respects a custom limit', () => {
      expect(mountAlerts({ alerts: many, limit: 3 }).findAll('.alert-item')).toHaveLength(3)
    })

    it('hides view-all when the total does not exceed the limit', () => {
      expect(mountAlerts({ alerts: makeResponse([makeAlert()], 10) }).find('.view-all-btn').exists()).toBe(false)
      expect(mountAlerts({ alerts: makeResponse([makeAlert()], 11) }).find('.view-all-btn').exists()).toBe(true)
    })
  })

  describe('empty and loading states', () => {
    it('shows the empty state for null alerts', () => {
      const w = mountAlerts({ alerts: null })
      expect(w.find('.alerts-empty').text()).toContain('目前無到期警示')
      expect(w.find('.alerts-list').exists()).toBe(false)
      expect(w.find('.summary-badges').exists()).toBe(false)
    })

    it('shows the empty state for an empty list', () => {
      const w = mountAlerts({ alerts: makeResponse([]) })
      expect(w.find('.alerts-empty').exists()).toBe(true)
      expect(w.find('.alerts-list').exists()).toBe(false)
    })

    it('shows loading instead of the list', () => {
      const w = mountAlerts({ alerts: threeAlerts, loading: true })
      expect(w.find('.alerts-loading').text()).toContain('載入中')
      expect(w.find('.alerts-list').exists()).toBe(false)
      expect(w.find('.alerts-empty').exists()).toBe(false)
    })
  })
})
