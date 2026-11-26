/**
 * Tests for usePayments composable (member payment history)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const stateStore = new Map<string, { value: unknown }>()

const mockMember = { id: 'member-1', member_code: 'M001', full_name: 'Test User' }
const mockMemberRef = { value: mockMember as typeof mockMember | null }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBaseUrl: 'http://localhost:8056' } }))
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})
vi.stubGlobal('useMemberAuth', () => ({ member: mockMemberRef, getAuthHeader: mockGetAuthHeader }))

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { usePayments, getPaymentStatusDisplay } from './usePayments'

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  amount: 1000,
  paymentMethod: 'CASH',
  paymentDate: '2026-01-01T00:00:00Z',
  type: 'INCOME',
  status: 'COMPLETED',
  contractId: 'c1',
  contractNo: 'C000001',
  planName: '月費方案',
  ...overrides,
})

const response = (rows: unknown[], page: number, totalPages: number) => ({
  success: true,
  data: {
    payments: rows,
    summary: { totalPaid: 1000, totalRefunded: 0 },
    pagination: { total: 3, page, limit: 20, totalPages },
  },
})

describe('usePayments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockMemberRef.value = mockMember
  })

  it('calls GET /api/member/payments with the member token (not the removed member_id filter)', async () => {
    mockFetch.mockResolvedValueOnce(response([row('p1')], 1, 1))
    const p = usePayments()

    await p.fetchPayments()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('http://localhost:8056/api/member/payments')
    expect(opts.headers).toEqual({ 'X-Member-Token': 'test-token' })
    expect(opts.query).toEqual({ page: 1, limit: 20 })
    expect(p.payments.value).toHaveLength(1)
    expect(p.summary.value).toEqual({ totalPaid: 1000, totalRefunded: 0 })
    expect(p.hasMore.value).toBe(false)
  })

  it('does nothing when no member is logged in', async () => {
    mockMemberRef.value = null
    const p = usePayments()

    expect(await p.fetchPayments()).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('appends the next page on loadMore and stops at the last page', async () => {
    mockFetch
      .mockResolvedValueOnce(response([row('p1')], 1, 2))
      .mockResolvedValueOnce(response([row('p2')], 2, 2))
    const p = usePayments()

    await p.fetchPayments()
    expect(p.hasMore.value).toBe(true)

    await p.loadMore()
    expect(mockFetch.mock.calls[1]![1].query).toEqual({ page: 2, limit: 20 })
    expect(p.payments.value.map(x => x.id)).toEqual(['p1', 'p2'])
    expect(p.hasMore.value).toBe(false)

    expect(await p.loadMore()).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('propagates API errors and clears the loading flag', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const p = usePayments()

    await expect(p.fetchPayments()).rejects.toThrow('boom')
    expect(p.isLoading.value).toBe(false)
  })
})

describe('getPaymentStatusDisplay', () => {
  it('labels statuses in Traditional Chinese with design-system tones', () => {
    expect(getPaymentStatusDisplay('COMPLETED')).toEqual({ label: '已付款', tone: 'success' })
    expect(getPaymentStatusDisplay('PENDING')).toEqual({ label: '處理中', tone: 'warning' })
    expect(getPaymentStatusDisplay('FAILED')).toEqual({ label: '付款失敗', tone: 'error' })
    expect(getPaymentStatusDisplay('COMPLETED', 'REFUND').label).toBe('已退款')
    expect(getPaymentStatusDisplay('FAILED', 'REFUND').label).toBe('退款失敗')
  })
})
