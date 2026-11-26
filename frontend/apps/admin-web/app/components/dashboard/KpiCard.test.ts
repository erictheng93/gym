/**
 * KpiCard behavior tests
 */

import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import KpiCard from './KpiCard.vue'

vi.stubGlobal('computed', computed)

const mountCard = (props: Record<string, unknown> = {}) =>
  mount(KpiCard, { props: { title: '今日營收', value: 0, ...props } })

describe('KpiCard', () => {
  describe('value formatting', () => {
    it('formats numbers with thousands separators', () => {
      expect(mountCard({ value: 1234567 }).find('.kpi-value').text()).toBe('1,234,567')
    })

    it('renders string values untouched', () => {
      expect(mountCard({ value: 'NT$50,000' }).find('.kpi-value').text()).toBe('NT$50,000')
    })

    it('renders 0 rather than hiding it', () => {
      expect(mountCard({ value: 0 }).find('.kpi-value').text()).toBe('0')
    })
  })

  describe('change indicator', () => {
    it('shows a signed positive change with the positive class and up arrow', () => {
      const change = mountCard({ change: 12.5 }).find('.kpi-change')
      expect(change.text()).toBe('+12.5%')
      expect(change.classes()).toContain('positive')
      expect(change.find('path').attributes('d')).toBe('m5 12 7-7 7 7')
    })

    it('shows a negative change with the negative class and down arrow', () => {
      const change = mountCard({ change: -3 }).find('.kpi-change')
      expect(change.text()).toBe('-3%')
      expect(change.classes()).toContain('negative')
      expect(change.find('path').attributes('d')).toBe('m19 12-7 7-7-7')
    })

    it('shows zero change neutrally without an arrow', () => {
      const change = mountCard({ change: 0 }).find('.kpi-change')
      expect(change.text()).toBe('0%')
      expect(change.classes()).not.toContain('positive')
      expect(change.classes()).not.toContain('negative')
      expect(change.find('svg').exists()).toBe(false)
    })

    it('omits the indicator when change is undefined', () => {
      expect(mountCard().find('.kpi-change').exists()).toBe(false)
    })
  })

  describe('subtitle', () => {
    it('shows the subtitle', () => {
      expect(mountCard({ subtitle: '7天內到期' }).find('.kpi-subtitle').text()).toBe('7天內到期')
    })

    it('prefers changeLabel over subtitle when both are given', () => {
      const w = mountCard({ subtitle: '7天內到期', changeLabel: '較上期' })
      expect(w.find('.kpi-subtitle').text()).toBe('較上期')
    })

    it('renders no footer without subtitle or change', () => {
      expect(mountCard().find('.kpi-footer').exists()).toBe(false)
    })
  })

  describe('loading state', () => {
    it('replaces the body with a skeleton', () => {
      const w = mountCard({ value: 100, change: 5, loading: true })
      expect(w.find('.loading-skeleton').exists()).toBe(true)
      expect(w.find('.kpi-value').exists()).toBe(false)
      expect(w.find('.kpi-change').exists()).toBe(false)
    })
  })

  describe('optional parts', () => {
    it('renders the LIVE badge only when live', () => {
      expect(mountCard({ live: true }).find('.kpi-live-badge').text()).toContain('LIVE')
      expect(mountCard().find('.kpi-live-badge').exists()).toBe(false)
    })

    it('renders the icon only when given', () => {
      expect(mountCard({ icon: 'members' }).find('.kpi-icon--members svg').exists()).toBe(true)
      expect(mountCard().find('.kpi-icon').exists()).toBe(false)
    })

    it('applies the variant modifier class', () => {
      expect(mountCard({ variant: 'warning' }).classes()).toContain('kpi-card--warning')
      expect(mountCard().classes()).toContain('kpi-card--default')
    })
  })
})
