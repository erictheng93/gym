/**
 * Tests for useCheckIns composable
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

import { useCheckIns } from './useCheckIns'

const item = (id: string) => ({
  id,
  checkInTime: '2026-03-01T10:00:00Z',
  checkInType: 'ENTRY',
  checkInMethod: 'QR_CODE',
  branch: { id: 'b1', name: '總店' },
  contractId: null,
  isCrossBranch: false,
})

const history = (rows: unknown[], page: number, totalPages: number) => ({
  success: true,
  data: { checkIns: rows, pagination: { total: 3, page, limit: 20, totalPages } },
})

describe('useCheckIns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockMemberRef.value = { id: 'member-1' }
  })

  it('loads history from /api/member/check-in/history with the member token', async () => {
    mockFetch.mockResolvedValueOnce(history([item('a')], 1, 1))
    const c = useCheckIns()

    await c.fetchCheckIns()

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('http://localhost:8056/api/member/check-in/history')
    expect(opts.headers).toEqual({ 'X-Member-Token': 'test-token' })
    expect(opts.query).toEqual({ page: 1, limit: 20 })
    expect(c.checkIns.value).toHaveLength(1)
    expect(c.hasMore.value).toBe(false)
  })

  it('appends the next page on loadMore', async () => {
    mockFetch
      .mockResolvedValueOnce(history([item('a')], 1, 2))
      .mockResolvedValueOnce(history([item('b')], 2, 2))
    const c = useCheckIns()

    await c.fetchCheckIns()
    expect(c.hasMore.value).toBe(true)
    await c.loadMore()

    expect(mockFetch.mock.calls[1]![1].query).toEqual({ page: 2, limit: 20 })
    expect(c.checkIns.value.map(x => x.id)).toEqual(['a', 'b'])
    expect(await c.loadMore()).toBe(false)
  })

  it('fetches a single check-in by id with the member token', async () => {
    mockFetch.mockResolvedValueOnce({ success: true, data: { id: 'a' } })
    const c = useCheckIns()

    const result = await c.fetchCheckIn('a')

    expect(mockFetch.mock.calls[0]![0]).toBe('http://localhost:8056/api/member/check-in/a')
    expect(mockFetch.mock.calls[0]![1].headers).toEqual({ 'X-Member-Token': 'test-token' })
    expect(result).toEqual({ id: 'a' })
  })

  it('returns null for a 404 / failed detail request', async () => {
    mockFetch.mockRejectedValueOnce(new Error('404'))
    expect(await useCheckIns().fetchCheckIn('nope')).toBeNull()
  })

  it('does nothing when logged out', async () => {
    mockMemberRef.value = null
    const c = useCheckIns()
    expect(await c.fetchCheckIns()).toBe(false)
    expect(await c.fetchCheckIn('a')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
