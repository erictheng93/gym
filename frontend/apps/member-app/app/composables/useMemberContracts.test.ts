/**
 * Tests for useMemberContracts composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const stateStore = new Map<string, { value: unknown }>()
const mockMemberRef = { value: { id: 'member-1' } as { id: string } | null }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBaseUrl: 'http://localhost:8056' } }))
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) stateStore.set(key, { value: init ? init() : undefined })
  return stateStore.get(key)!
})
vi.stubGlobal('useMemberAuth', () => ({ member: mockMemberRef, getAuthHeader: mockGetAuthHeader }))
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useMemberContracts, CONTRACT_STATUS_LABELS } from './useMemberContracts'

const contract = {
  id: 'c1',
  contractNo: 'C000001',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-02-01',
  remainingCounts: null,
  totalAmount: 1000,
  paidAmount: 1000,
  paymentStatus: 'PAID',
  planName: '月費',
  planType: 'TIME_BASED',
}

describe('useMemberContracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockMemberRef.value = { id: 'member-1' }
  })

  it('calls GET /api/member/contracts with X-Member-Token (no Bearer, no member_id filter)', async () => {
    mockFetch.mockResolvedValueOnce({
      success: true,
      data: { contracts: [contract], pagination: { total: 1, page: 1, limit: 50, totalPages: 1 } },
    })
    const c = useMemberContracts()

    await c.fetchContracts()

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('http://localhost:8056/api/member/contracts')
    expect(opts.headers).toEqual({ 'X-Member-Token': 'test-token' })
    expect(opts.headers).not.toHaveProperty('Authorization')
    expect(c.contracts.value).toHaveLength(1)
    expect(c.isLoading.value).toBe(false)
  })

  it('skips the request when logged out', async () => {
    mockMemberRef.value = null
    expect(await useMemberContracts().fetchContracts()).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('propagates errors and clears loading', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const c = useMemberContracts()
    await expect(c.fetchContracts()).rejects.toThrow('boom')
    expect(c.isLoading.value).toBe(false)
  })

  it('exposes no pause/resume actions (staff-only flow)', () => {
    const c = useMemberContracts() as Record<string, unknown>
    expect(c.pauseContract).toBeUndefined()
    expect(c.resumeContract).toBeUndefined()
  })

  it('labels every backend contract status in Traditional Chinese', () => {
    for (const s of ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED', 'TRANSFERRED']) {
      expect(CONTRACT_STATUS_LABELS[s]).toBeTruthy()
    }
  })
})
