/**
 * KpiGrid Component Unit Tests
 * 測試 KPI 網格元件
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KpiGrid from './KpiGrid.vue'
import KpiCard from './KpiCard.vue'
import type { DashboardKPIs } from '~/composables/useDashboard'

// ============================================
// Test Data
// ============================================

const mockKPIs: DashboardKPIs = {
  success: true,
  period: {
    type: 'today',
    start_date: '2024-01-15',
    end_date: '2024-01-15'
  },
  revenue: {
    today: 50000,
    mtd: 500000,
    ytd: 2000000,
    period: 50000,
    change: 12.5,
    transactions: {
      today: 15,
      period: 15
    },
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

// ============================================
// Tests
// ============================================

describe('KpiGrid', () => {
  // ============================================
  // 基本渲染測試
  // ============================================
  describe('Basic Rendering', () => {
    it('應該渲染 4 個 KPI 卡片', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      expect(cards).toHaveLength(4)
    })

    it('應該有正確的 CSS class', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      expect(wrapper.find('.kpi-grid').exists()).toBe(true)
    })
  })

  // ============================================
  // 營收 KPI 測試
  // ============================================
  describe('Revenue KPI', () => {
    it('應該顯示正確的今日營收', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const revenueCard = cards.find(card => card.props('title') === '今日營收')

      expect(revenueCard).toBeDefined()
      expect(revenueCard?.props('icon')).toBe('revenue')
    })

    it('應該傳遞變化值', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const revenueCard = cards.find(card => card.props('title') === '今日營收')

      expect(revenueCard?.props('change')).toBe(12.5)
    })
  })

  // ============================================
  // 會員 KPI 測試
  // ============================================
  describe('Members KPI', () => {
    it('應該顯示正確的活躍會員數', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const membersCard = cards.find(card => card.props('title') === '活躍會員')

      expect(membersCard).toBeDefined()
      expect(membersCard?.props('value')).toBe(350)
      expect(membersCard?.props('icon')).toBe('members')
    })

    it('應該顯示活躍率作為副標題', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const membersCard = cards.find(card => card.props('title') === '活躍會員')

      expect(membersCard?.props('subtitle')).toContain('70.0%')
    })
  })

  // ============================================
  // 合約警示 KPI 測試
  // ============================================
  describe('Contract Alert KPI', () => {
    it('應該顯示 7 天內到期的合約數', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const alertCard = cards.find(card => card.props('title') === '到期警示')

      expect(alertCard).toBeDefined()
      expect(alertCard?.props('value')).toBe(10)
      expect(alertCard?.props('icon')).toBe('alert')
    })

    it('到期合約超過 5 個時應該顯示警告變體', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const alertCard = cards.find(card => card.props('title') === '到期警示')

      expect(alertCard?.props('variant')).toBe('warning')
    })

    it('到期合約不超過 5 個時應該使用預設變體', () => {
      const lowAlertKPIs = {
        ...mockKPIs,
        contracts: {
          ...mockKPIs.contracts,
          expiring_7: 3
        }
      }

      const wrapper = mount(KpiGrid, {
        props: {
          kpis: lowAlertKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const alertCard = cards.find(card => card.props('title') === '到期警示')

      expect(alertCard?.props('variant')).toBe('default')
    })
  })

  // ============================================
  // 今日入場 KPI 測試
  // ============================================
  describe('Checkin KPI', () => {
    it('應該顯示正確的今日入場數', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const checkinCard = cards.find(card => card.props('title') === '今日入場')

      expect(checkinCard).toBeDefined()
      expect(checkinCard?.props('value')).toBe(89)
      expect(checkinCard?.props('icon')).toBe('checkin')
    })

    it('應該顯示尖峰時段', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const checkinCard = cards.find(card => card.props('title') === '今日入場')

      expect(checkinCard?.props('subtitle')).toContain('18:00')
    })
  })

  // ============================================
  // Loading 狀態測試
  // ============================================
  describe('Loading State', () => {
    it('應該傳遞 loading 狀態給所有卡片', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs,
          loading: true
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      cards.forEach(card => {
        expect(card.props('loading')).toBe(true)
      })
    })

    it('loading 為 false 時卡片應該不是 loading 狀態', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs,
          loading: false
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      cards.forEach(card => {
        expect(card.props('loading')).toBe(false)
      })
    })
  })

  // ============================================
  // Live 顯示測試
  // ============================================
  describe('Live Display', () => {
    it('應該傳遞 live 狀態給營收和入場卡片', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs,
          showLive: true
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const revenueCard = cards.find(card => card.props('title') === '今日營收')
      const checkinCard = cards.find(card => card.props('title') === '今日入場')

      expect(revenueCard?.props('live')).toBe(true)
      expect(checkinCard?.props('live')).toBe(true)
    })

    it('活躍會員和到期警示不應該有 live 狀態', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs,
          showLive: true
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const membersCard = cards.find(card => card.props('title') === '活躍會員')
      const alertCard = cards.find(card => card.props('title') === '到期警示')

      expect(membersCard?.props('live')).toBeFalsy()
      expect(alertCard?.props('live')).toBeFalsy()
    })
  })

  // ============================================
  // Null KPIs 測試
  // ============================================
  describe('Null KPIs', () => {
    it('kpis 為 null 時應該顯示預設值', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: null
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      expect(cards).toHaveLength(4)

      // 營收卡片應該顯示 '--'
      const revenueCard = cards.find(card => card.props('title') === '今日營收')
      expect(revenueCard?.props('value')).toBe('--')
    })

    it('kpis 為 null 時會員數應該是 0', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: null
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const membersCard = cards.find(card => card.props('title') === '活躍會員')

      expect(membersCard?.props('value')).toBe(0)
    })
  })

  // ============================================
  // 預設 Props 測試
  // ============================================
  describe('Default Props', () => {
    it('loading 預設為 false', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      cards.forEach(card => {
        expect(card.props('loading')).toBe(false)
      })
    })

    it('showLive 預設為 false', () => {
      const wrapper = mount(KpiGrid, {
        props: {
          kpis: mockKPIs
        },
        global: {
          components: {
            KpiCard
          }
        }
      })

      const cards = wrapper.findAllComponents(KpiCard)
      const revenueCard = cards.find(card => card.props('title') === '今日營收')

      expect(revenueCard?.props('live')).toBe(false)
    })
  })
})
