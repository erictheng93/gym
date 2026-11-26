/**
 * useReports Composable Unit Tests
 * 測試報表 API 呼叫功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockHandleError } from '@test/setup'
import { useReports } from './useReports'

// ============================================
// Mock Setup
// ============================================

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockRuntimeConfig = {
  public: {
    apiBaseUrl: 'http://localhost:8056',
    apiUrl: 'http://localhost:8056/api'
  }
}
vi.stubGlobal('useRuntimeConfig', () => mockRuntimeConfig)

vi.mock('~/constants', () => ({
  MESSAGES: {
    ERRORS: {
      REPORT_FETCH_FAILED: '載入報表失敗'
    }
  }
}))

// ============================================
// Test Utilities
// ============================================

function calledUrl(n = 0): string {
  return mockFetch.mock.calls[n]![0] as string
}

function calledInit(n = 0): RequestInit {
  return mockFetch.mock.calls[n]![1] as RequestInit
}

function createMockResponse<T>(data: T, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data)
  }
}

const mockRevenueReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_income: 100000,
    total_refund: 5000,
    net_revenue: 95000,
    total_transactions: 50,
    average_daily_revenue: '3166.67'
  },
  data: [
    {
      payment_day: '2024-01-15',
      branch_id: 'branch-1',
      branch_name: '台北總店',
      transaction_count: '10',
      total_income: '50000',
      total_refund: '1000',
      net_revenue: '49000'
    }
  ]
}

const mockMemberGrowthReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_new_members: 20,
    total_members: 500,
    average_daily_growth: '0.65',
    gender_distribution: { male: 12, female: 8 }
  },
  data: []
}

const mockContractExpiryReport = {
  success: true,
  summary: {
    total_expiring: 10,
    urgent_count: 2,
    soon_count: 5,
    upcoming_count: 3
  },
  grouped: {
    urgent: [],
    soon: [],
    upcoming: []
  },
  data: []
}

const mockMemberActivityReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_check_ins: 1000,
    average_daily_check_ins: '32.26',
    method_distribution: { qr_code: 600, manual: 300, card: 100 }
  },
  data: []
}

// ============================================
// Tests
// ============================================

describe('useReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('request basics', () => {
    it('sends every request with session cookies and a JSON content type', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }))
      const reports = useReports()

      await reports.getRevenueReport()
      await reports.getMemberGrowthReport()
      await reports.getContractExpiryReport()
      await reports.getMemberActivityReport()
      await reports.getBranchPerformanceReport()
      await reports.getCoachPerformanceReport()
      await reports.refreshReports()

      expect(mockFetch).toHaveBeenCalledTimes(7)
      mockFetch.mock.calls.forEach((call) => {
        const init = call[1] as RequestInit
        expect(init.credentials).toBe('include')
        expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
      })
    })

    it('prefixes URLs with runtimeConfig apiBaseUrl', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      await useReports().getRevenueReport()

      expect(calledUrl()).toMatch(/^http:\/\/localhost:8056\/api\/reports\/revenue\?/)
    })

    it('shares one request between concurrent identical calls', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockRevenueReport))
      const { getRevenueReport } = useReports()

      const [a, b] = await Promise.all([
        getRevenueReport('2024-01-01', '2024-01-31'),
        getRevenueReport('2024-01-01', '2024-01-31')
      ])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(a).toEqual(b)
    })
  })

  describe('getRevenueReport', () => {
    it('returns the report body', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const result = await useReports().getRevenueReport('2024-01-01', '2024-01-31')

      expect(result).toEqual(mockRevenueReport)
    })

    it('builds the query string from the given params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      await useReports().getRevenueReport('2024-01-01', '2024-01-31', 'branch-uuid-1')

      const params = new URL(calledUrl()).searchParams
      expect(params.get('start_date')).toBe('2024-01-01')
      expect(params.get('end_date')).toBe('2024-01-31')
      expect(params.get('branch_id')).toBe('branch-uuid-1')
    })

    it('omits params that were not given', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      await useReports().getRevenueReport()

      expect(new URL(calledUrl()).search).toBe('')
    })

    it.each([401, 403, 500])('returns null and reports the error on HTTP %i', async (status) => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, status))

      const result = await useReports().getRevenueReport()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: `HTTP ${status}` }),
        expect.objectContaining({ context: 'useReports.getRevenueReport' })
      )
    })

    it('returns null on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      expect(await useReports().getRevenueReport()).toBeNull()
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })

    it('returns null when the body is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockRejectedValue(new Error('Invalid JSON')) })

      expect(await useReports().getRevenueReport()).toBeNull()
    })
  })

  describe('getMemberGrowthReport', () => {
    it('returns the report from the member-growth endpoint with branch filter', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberGrowthReport))

      const result = await useReports().getMemberGrowthReport('2024-01-01', '2024-01-31', 'branch-1')

      expect(result).toEqual(mockMemberGrowthReport)
      const url = new URL(calledUrl())
      expect(url.pathname).toBe('/api/reports/member-growth')
      expect(url.searchParams.get('branch_id')).toBe('branch-1')
      expect(url.searchParams.get('start_date')).toBe('2024-01-01')
    })
  })

  describe('getContractExpiryReport', () => {
    it('returns the report from the contract-expiry endpoint', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      const result = await useReports().getContractExpiryReport(30)

      expect(result).toEqual(mockContractExpiryReport)
      expect(new URL(calledUrl()).pathname).toBe('/api/reports/contract-expiry')
    })

    it('defaults to days_ahead=30 and limit=100', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      await useReports().getContractExpiryReport()

      const params = new URL(calledUrl()).searchParams
      expect(params.get('days_ahead')).toBe('30')
      expect(params.get('limit')).toBe('100')
      expect(params.has('branch_id')).toBe(false)
    })

    it('supports custom days_ahead, branch and limit', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      await useReports().getContractExpiryReport(60, 'branch-1', 50)

      const params = new URL(calledUrl()).searchParams
      expect(params.get('days_ahead')).toBe('60')
      expect(params.get('limit')).toBe('50')
      expect(params.get('branch_id')).toBe('branch-1')
    })
  })

  describe('getMemberActivityReport', () => {
    it('returns the report from the member-activity endpoint', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberActivityReport))

      const result = await useReports().getMemberActivityReport('2024-01-01', '2024-01-31')

      expect(result).toEqual(mockMemberActivityReport)
      expect(new URL(calledUrl()).pathname).toBe('/api/reports/member-activity')
    })
  })

  describe('getBranchPerformanceReport', () => {
    it('defaults to month with previous-period comparison', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }))

      await useReports().getBranchPerformanceReport()

      const url = new URL(calledUrl())
      expect(url.pathname).toBe('/api/reports/branch-performance')
      expect(url.searchParams.get('period')).toBe('month')
      expect(url.searchParams.get('compareWithPrevious')).toBe('true')
      expect(url.searchParams.has('branch_id')).toBe(false)
    })

    it('forwards period, branch and comparison flag', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }))

      await useReports().getBranchPerformanceReport('year', 'branch-1', false)

      const params = new URL(calledUrl()).searchParams
      expect(params.get('period')).toBe('year')
      expect(params.get('branch_id')).toBe('branch-1')
      expect(params.get('compareWithPrevious')).toBe('false')
    })

    it('returns null on HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      expect(await useReports().getBranchPerformanceReport()).toBeNull()
    })
  })

  describe('getCoachPerformanceReport', () => {
    it('defaults to month and omits coach and branch filters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }))

      await useReports().getCoachPerformanceReport()

      const url = new URL(calledUrl())
      expect(url.pathname).toBe('/api/reports/coach-performance')
      expect(url.searchParams.get('period')).toBe('month')
      expect(url.searchParams.has('coach_id')).toBe(false)
      expect(url.searchParams.has('branch_id')).toBe(false)
    })

    it('forwards period, coach and branch', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }))

      await useReports().getCoachPerformanceReport('quarter', 'coach-1', 'branch-1')

      const params = new URL(calledUrl()).searchParams
      expect(params.get('period')).toBe('quarter')
      expect(params.get('coach_id')).toBe('coach-1')
      expect(params.get('branch_id')).toBe('branch-1')
    })

    it('returns null on HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      expect(await useReports().getCoachPerformanceReport()).toBeNull()
    })
  })

  describe('refreshReports', () => {
    it('POSTs to the refresh endpoint and returns the body', async () => {
      const body = { success: true, message: '報表資料已更新' }
      mockFetch.mockResolvedValueOnce(createMockResponse(body))

      const result = await useReports().refreshReports()

      expect(new URL(calledUrl()).pathname).toBe('/api/reports/refresh')
      expect(calledInit().method).toBe('POST')
      expect(result).toEqual(body)
    })

    it('returns a failure result on HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      const result = await useReports().refreshReports()

      expect(result).toEqual({ success: false, message: '刷新報表失敗' })
    })

    it('returns a failure result on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useReports().refreshReports()

      expect(result).toEqual({ success: false, message: '刷新報表失敗' })
    })
  })
})
