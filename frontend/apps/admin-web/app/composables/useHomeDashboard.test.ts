import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useHomeDashboard } from './useHomeDashboard'
import { toLocalDateString } from '~/utils/date'

// =============================================================================
// Fixtures in the exact wire format of the backend:
// - GET /api/dashboard/overview (routes/dashboard.ts): numbers already summed
//   server-side; revenue = COMPLETED INCOME only
// - GET /api/reports/revenue (routes/reports.ts): { data: { total, byBranch, byDay } }
// - GET /api/contracts: rows nested as { contract, member, plan }, decimals as strings,
//   totals in both `pagination` and `meta`
// - GET /api/members: flat camelCase rows, totals in `pagination`
// =============================================================================

const overviewResponse = {
  success: true,
  data: {
    members: { total: 128, active: 97, newThisMonth: 11 },
    contracts: { active: 84, expiringSoon: 6 },
    revenue: { thisMonth: 245000, lastMonth: 198000, growth: 23.7 },
    checkIns: { today: 42, thisMonth: 913 }
  }
}

const draftContractsResponse = {
  success: true,
  data: [],
  meta: { total: 3, page: 1, limit: 1, totalPages: 3 },
  pagination: { total: 3, page: 1, limit: 1, totalPages: 3 }
}

const todayRevenueResponse = {
  success: true,
  data: { total: 12500, byBranch: [{ branchId: 'b1', branchName: '台北店', total: 12500 }], byDay: [] }
}

const membersResponse = {
  success: true,
  data: [{
    id: 'm1',
    memberCode: 'M0001',
    fullName: '王小明',
    phone: '0912345678',
    email: null,
    status: 'ACTIVE',
    branchId: 'b1',
    createdAt: '2026-11-25T02:00:00.000Z'
  }],
  pagination: { total: 128, page: 1, limit: 5, totalPages: 26 }
}

const contractsResponse = {
  success: true,
  data: [{
    contract: { id: 'c1', contractNo: 'CT-2026-0001', memberId: 'm1', planId: 'p1', branchId: 'b1', status: 'ACTIVE', totalAmount: '36000.00', paidAmount: '12000.00', startDate: '2026-11-01', endDate: '2027-10-31' },
    member: { id: 'm1', fullName: '王小明', memberCode: 'M0001' },
    plan: { id: 'p1', name: '年卡', planType: 'TIME_BASED', price: '36000.00' }
  }],
  meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
  pagination: { total: 1, page: 1, limit: 5, totalPages: 1 }
}

const routeResponses = (endpoint: string, params: Record<string, unknown> = {}) => {
  if (endpoint === '/dashboard/overview') return overviewResponse
  if (endpoint === '/reports/revenue') return todayRevenueResponse
  if (endpoint === '/members') return membersResponse
  if (endpoint === '/contracts') return params.status === 'DRAFT' ? draftContractsResponse : contractsResponse
  throw new Error(`unexpected ${endpoint}`)
}

describe('useHomeDashboard.fetchHomeDashboard', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    mockHandleError.mockClear()
  })

  it('shows the backend member and revenue numbers as-is', async () => {
    mockFetchInstance.apiFetch.mockImplementation(async (endpoint: string, opts?: { params?: Record<string, unknown> }) =>
      routeResponses(endpoint, opts?.params))

    const result = await useHomeDashboard().fetchHomeDashboard()

    expect(result).not.toBeNull()
    expect(result!.members).toEqual({ total: 128, active: 97, newThisMonth: 11 })
    expect(result!.contracts).toEqual({ active: 84, expiringSoon: 6, draft: 3 })
    expect(result!.revenue).toEqual({ today: 12500, thisMonth: 245000 })
  })

  it('asks for today as a single local day (end day inclusive on the backend)', async () => {
    mockFetchInstance.apiFetch.mockImplementation(async (endpoint: string, opts?: { params?: Record<string, unknown> }) =>
      routeResponses(endpoint, opts?.params))

    await useHomeDashboard().fetchHomeDashboard()

    const today = toLocalDateString()
    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/reports/revenue', {
      params: { startDate: today, endDate: today, branchId: undefined }
    })
    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/contracts', {
      params: { status: 'DRAFT', limit: 1, branchId: undefined }
    })
  })

  it('flattens the nested contract rows and converts decimal strings', async () => {
    mockFetchInstance.apiFetch.mockImplementation(async (endpoint: string, opts?: { params?: Record<string, unknown> }) =>
      routeResponses(endpoint, opts?.params))

    const result = await useHomeDashboard().fetchHomeDashboard()

    expect(result!.recentContracts[0]).toMatchObject({
      id: 'c1',
      contractNo: 'CT-2026-0001',
      status: 'ACTIVE',
      totalAmount: 36000,
      member: { fullName: '王小明' }
    })
    expect(result!.recentMembers[0]).toMatchObject({ fullName: '王小明', memberCode: 'M0001', status: 'ACTIVE' })
  })

  it('returns null and reports the error instead of showing zeros when a request fails', async () => {
    mockFetchInstance.apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/dashboard/overview') throw new Error('HTTP 500')
      return routeResponses(endpoint)
    })

    const result = await useHomeDashboard().fetchHomeDashboard()

    expect(result).toBeNull()
    expect(mockHandleError).toHaveBeenCalledTimes(1)
  })

  it('forwards a branch filter to every request', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    mockFetchInstance.apiFetch.mockImplementation(async (endpoint: string, opts?: { params?: Record<string, unknown> }) => {
      calls.push([endpoint, opts?.params ?? {}])
      return routeResponses(endpoint, opts?.params)
    })

    await useHomeDashboard().fetchHomeDashboard('b1')

    expect(calls).toHaveLength(5)
    for (const [, params] of calls) expect(params.branchId).toBe('b1')
  })
})
