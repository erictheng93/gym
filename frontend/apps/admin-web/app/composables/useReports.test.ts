/**
 * useReports: request params and response shapes match backend/src/routes/reports.ts
 * and dashboard.ts (camelCase, `{ success, data }` envelopes).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError, mockGlobalFetch } from '@test/setup'
import { useReports } from './useReports'

// ---------------------------------------------------------------------------
// Fixtures in the exact wire format of the backend
// ---------------------------------------------------------------------------

const revenueBody = {
  success: true,
  data: {
    total: 350,
    byBranch: [{ branchId: 'b1', branchName: '台北店', total: 350 }],
    byDay: [{ date: '2025-03-01', total: 100 }, { date: '2025-03-10', total: 250 }]
  }
}

const memberGrowthBody = {
  success: true,
  data: { total: 97, newMembers: 2, byMonth: [{ month: '2025-03', count: 2 }] }
}

const contractExpiryBody = {
  success: true,
  data: [{
    id: 'c1',
    contractNo: 'CT-0001',
    memberId: 'm1',
    planId: 'p1',
    branchId: 'b1',
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2025-03-20',
    remainingCounts: null,
    totalAmount: '3000.00',
    paidAmount: '3000.00',
    paymentStatus: 'PAID',
    member: { id: 'm1', fullName: '王小明', memberCode: 'M0001', phone: '0912345678' },
    branch: { id: 'b1', name: '台北店' },
    daysUntilExpiry: 10
  }]
}

const memberActivityBody = {
  success: true,
  data: {
    totalCheckIns: 2,
    byBranch: [{ branchId: 'b1', branchName: '台北店', checkInCount: 2, uniqueMembers: 1 }],
    byDay: [{ date: '2025-03-01', count: 1 }]
  }
}

const branchPerformanceBody = {
  success: true,
  period: { current: { start: '2025-03-01', end: '2025-03-31' }, previous: { start: '2025-02-01', end: '2025-02-28' } },
  summary: { total_revenue: 1000, total_revenue_growth: 0, total_new_members: 0, total_check_ins: 0, total_active_contracts: 0 },
  data: [],
  ranking: { by_revenue: [], by_growth: [], by_check_ins: [] }
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useReports', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    mockHandleError.mockClear()
    mockGlobalFetch.mockClear()
  })

  describe('getRevenueReport', () => {
    it('sends camelCase startDate/endDate/branchId and returns `data`', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(revenueBody)

      const report = await useReports().getRevenueReport({ startDate: '2025-03-01', endDate: '2025-03-10', branchId: 'b1' })

      expect(lastCall()).toEqual(['/reports/revenue', { params: { startDate: '2025-03-01', endDate: '2025-03-10', branchId: 'b1' } }])
      expect(report).toEqual(revenueBody.data)
      expect(report!.total).toBe(350)
    })

    it('omits params that were not given', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(revenueBody)

      await useReports().getRevenueReport()

      expect(lastCall()).toEqual(['/reports/revenue', { params: {} }])
    })

    it('returns null and reports the error on failure', async () => {
      mockFetchInstance.apiFetch.mockRejectedValue(new Error('HTTP 500'))

      expect(await useReports().getRevenueReport({ startDate: '2025-03-01', endDate: '2025-03-01' })).toBeNull()
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })

    it('shares one request between concurrent identical calls', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(revenueBody)
      const { getRevenueReport } = useReports()

      const [a, b] = await Promise.all([
        getRevenueReport({ startDate: '2025-03-01', endDate: '2025-03-10' }),
        getRevenueReport({ startDate: '2025-03-01', endDate: '2025-03-10' })
      ])

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
      expect(a).toBe(b)
    })
  })

  it('getMemberGrowthReport returns newMembers for the window', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue(memberGrowthBody)

    const report = await useReports().getMemberGrowthReport({ startDate: '2025-03-01', endDate: '2025-03-10' })

    expect(lastCall()).toEqual(['/reports/member-growth', { params: { startDate: '2025-03-01', endDate: '2025-03-10' } }])
    expect(report!.newMembers).toBe(2)
  })

  it('getContractExpiryReport sends `days` and returns the contract array', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue(contractExpiryBody)

    const contracts = await useReports().getContractExpiryReport(30, 'b1')

    expect(lastCall()).toEqual(['/reports/contract-expiry', { params: { days: 30, branchId: 'b1' } }])
    expect(contracts).toHaveLength(1)
    expect(contracts![0]!.member.fullName).toBe('王小明')
    expect(contracts![0]!.daysUntilExpiry).toBe(10)
  })

  it('getMemberActivityReport returns totalCheckIns', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue(memberActivityBody)

    const report = await useReports().getMemberActivityReport({ startDate: '2025-03-01', endDate: '2025-03-10' })

    expect(lastCall()[0]).toBe('/reports/member-activity')
    expect(report!.totalCheckIns).toBe(2)
  })

  it('getRevenueTrend reads GET /dashboard/revenue-trend', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [{ period: '2025-03', amount: 350 }] })

    const trend = await useReports().getRevenueTrend('monthly')

    expect(lastCall()).toEqual(['/dashboard/revenue-trend', { params: { period: 'monthly' } }])
    expect(trend).toEqual([{ period: '2025-03', amount: 350 }])
  })

  it('getBranchPerformanceReport returns the whole body', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue(branchPerformanceBody)

    const report = await useReports().getBranchPerformanceReport('month', 'b1', false)

    expect(lastCall()).toEqual(['/reports/branch-performance', { params: { period: 'month', branchId: 'b1', compareWithPrevious: 'false' } }])
    expect(report).toEqual(branchPerformanceBody)
  })

  it('getCoachPerformanceReport forwards period, coach and branch', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [] })

    await useReports().getCoachPerformanceReport('quarter', 'e1', 'b1')

    expect(lastCall()).toEqual(['/reports/coach-performance', { params: { period: 'quarter', coachId: 'e1', branchId: 'b1' } }])
  })

  describe('downloadReport', () => {
    it('downloads the backend export with cookies and the requested format', async () => {
      const createObjectURL = vi.fn(() => 'blob:x')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['x'])),
        headers: new Headers({ 'Content-Disposition': 'attachment; filename="%E7%87%9F%E6%94%B6.xlsx"' })
      })

      const ok = await useReports().downloadReport('revenue', { startDate: '2025-03-01', endDate: '2025-03-10' }, 'xlsx')

      expect(ok).toBe(true)
      const [url, init] = mockGlobalFetch.mock.calls.at(-1)!
      expect(url).toBe('http://localhost:8056/api/reports/revenue/export?startDate=2025-03-01&endDate=2025-03-10&format=xlsx')
      expect(init).toEqual({ credentials: 'include' })
      expect(click).toHaveBeenCalledTimes(1)
      click.mockRestore()
    })

    it('returns false and reports the error on an HTTP error', async () => {
      mockGlobalFetch.mockResolvedValueOnce({ ok: false, status: 400 })

      expect(await useReports().downloadReport('member-growth', { months: 6 }, 'csv')).toBe(false)
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })
})
