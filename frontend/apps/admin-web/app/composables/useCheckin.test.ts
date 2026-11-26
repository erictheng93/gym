import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useCheckin, pickActiveContract, parseQrPayload, isQrExpired } from './useCheckin'

vi.mock('~/composables/core/useApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/core/useApi')>()
  return { ...actual, useApi: () => ({ invalidateCache: vi.fn() }) }
})

// =============================================================================
// Fixtures in the exact wire format of backend/src/routes/check-ins.ts and
// GET /api/members/:id/contracts (backend/src/routes/members.ts)
// =============================================================================

const MEMBER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const BRANCH_ID = 'b0000000-0000-4000-8000-000000000001'
const DESK_BRANCH_ID = 'b0000000-0000-4000-8000-000000000002'

const member = { id: MEMBER_ID, fullName: '張三', memberCode: 'M000001' }

/** POST /api/check-ins 201 */
const created = (contract: Record<string, unknown>) => ({
  success: true,
  message: '入場成功',
  data: {
    id: 'ci-1',
    memberId: MEMBER_ID,
    branchId: BRANCH_ID,
    contractId: 'c-1',
    checkInTime: '2026-11-26T02:00:00.000Z',
    checkInMethod: 'MANUAL',
    member: { ...member, phone: '0912345678', email: null, status: 'ACTIVE' },
    contract
  }
})

const countContract = { id: 'c-1', contractNo: 'C2026000001', planName: '十堂課', planType: 'COUNT_BASED', remainingCounts: 4, countDeducted: true }

/** GET /api/members/:id/contracts row: the full contract with { id, name, planType } plan */
const memberContract = (over: Record<string, unknown>) => ({
  id: 'c-1',
  contractNo: 'C2026000001',
  memberId: MEMBER_ID,
  planId: 'p-1',
  branchId: BRANCH_ID,
  status: 'ACTIVE',
  startDate: '2026-11-01',
  endDate: '2027-11-01',
  originalEndDate: '2027-11-01',
  remainingCounts: null,
  totalAmount: '30000.00',
  paidAmount: '30000.00',
  paymentStatus: 'PAID',
  plan: { id: 'p-1', name: '年卡', planType: 'TIME_BASED' },
  ...over
})

const api = mockFetchInstance.apiFetch

describe('useCheckin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T10:00:00'))
  })

  afterEach(() => {
    api.mockReset()
    vi.useRealTimers()
  })

  describe('performCheckin', () => {
    it('POSTs /check-ins and returns the sessions left from the response (no second lookup)', async () => {
      api.mockResolvedValueOnce(created(countContract))
      const { performCheckin, todayCheckins, todayCount } = useCheckin()
      todayCount.value = 3

      const result = await performCheckin({ memberId: MEMBER_ID, branchId: BRANCH_ID, contractId: 'c-1' })

      expect(api).toHaveBeenCalledTimes(1)
      expect(api).toHaveBeenCalledWith('/check-ins', {
        method: 'POST',
        body: { memberId: MEMBER_ID, branchId: BRANCH_ID, contractId: 'c-1', checkInMethod: 'MANUAL' }
      })
      expect(result).toMatchObject({
        alreadyCheckedIn: false,
        contract: { countDeducted: true, remainingCounts: 4 },
        record: { id: 'ci-1', member, branchId: BRANCH_ID }
      })
      expect(todayCheckins.value[0]).toMatchObject({ id: 'ci-1', member: { fullName: '張三' } })
      expect(todayCount.value).toBe(4)
    })

    it('does not add a same-day repeat to today’s list', async () => {
      const repeat = created({ ...countContract, countDeducted: false })
      api.mockResolvedValueOnce({ ...repeat, message: '會員今日已入場', data: { ...repeat.data, alreadyCheckedIn: true } })
      const { performCheckin, todayCheckins, todayCount } = useCheckin()
      todayCheckins.value = []
      todayCount.value = 3

      const result = await performCheckin({ memberId: MEMBER_ID, branchId: BRANCH_ID })

      expect(result?.alreadyCheckedIn).toBe(true)
      expect(todayCheckins.value).toEqual([])
      expect(todayCount.value).toBe(3)
    })

    it('returns null and shows the backend reason when entry is refused', async () => {
      api.mockRejectedValueOnce(new Error('剩餘次數不足'))
      const { performCheckin } = useCheckin()

      expect(await performCheckin({ memberId: MEMBER_ID, branchId: BRANCH_ID })).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: '剩餘次數不足' }))
    })
  })

  describe('getMemberActiveContract', () => {
    it('reads this member’s contracts from /members/:id/contracts (not the tenant-wide list)', async () => {
      api.mockResolvedValueOnce({ success: true, data: [memberContract({})] })
      const { getMemberActiveContract } = useCheckin()

      const contract = await getMemberActiveContract(MEMBER_ID)

      expect(api).toHaveBeenCalledWith(`/members/${MEMBER_ID}/contracts`)
      expect(contract).toMatchObject({ id: 'c-1', contractNo: 'C2026000001', plan: { planType: 'TIME_BASED' }, exhausted: false })
    })

    it('returns null for a member without an ACTIVE in-date contract', async () => {
      api.mockResolvedValueOnce({
        success: true,
        data: [
          memberContract({ id: 'paused', status: 'PAUSED' }),
          memberContract({ id: 'expired', endDate: '2026-11-25' }),
          memberContract({ id: 'future', startDate: '2026-12-01' })
        ]
      })
      const { getMemberActiveContract } = useCheckin()

      expect(await getMemberActiveContract(MEMBER_ID)).toBeNull()
    })
  })

  describe('pickActiveContract', () => {
    it('picks the latest-ending ACTIVE contract, like the backend', () => {
      const rows = [
        memberContract({ id: 'short', endDate: '2026-12-31' }),
        memberContract({ id: 'long', endDate: '2027-06-30' })
      ]
      expect(pickActiveContract(rows as never, '2026-11-26')?.id).toBe('long')
    })

    it('flags a COUNT_BASED contract with no sessions left', () => {
      const rows = [memberContract({ remainingCounts: 0, plan: { id: 'p-2', name: '十堂課', planType: 'COUNT_BASED' } })]
      expect(pickActiveContract(rows as never, '2026-11-26')).toMatchObject({ exhausted: true, remainingCounts: 0 })
    })
  })

  describe('verifyQrCheckin', () => {
    const qr = (over: Record<string, unknown> = {}) => JSON.stringify({ m: 'M000001', t: Date.now() - 5000, ...over })

    it('looks the member up by code, then records a QR_CODE entry with the QR contract, with credentials via apiFetch', async () => {
      api.mockImplementation(async (url: string) => {
        if (url === '/members') {
          return { success: true, data: [{ ...member, memberCode: 'M0000010', id: 'other' }, { ...member, branchId: BRANCH_ID }], pagination: { total: 2 } }
        }
        return created(countContract)
      })
      const { verifyQrCheckin } = useCheckin()

      const result = await verifyQrCheckin({ payload: qr({ c: 'c-1' }), branchId: DESK_BRANCH_ID })

      expect(api).toHaveBeenCalledWith('/members', expect.objectContaining({ params: expect.objectContaining({ search: 'M000001' }) }))
      expect(api).toHaveBeenLastCalledWith('/check-ins', {
        method: 'POST',
        body: { memberId: MEMBER_ID, branchId: DESK_BRANCH_ID, contractId: 'c-1', checkInMethod: 'QR_CODE' }
      })
      expect(result).toMatchObject({ success: true, member, contract: { remainingCounts: 4 } })
      // no unmounted /api/admin/* route
      expect(api.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false)
    })

    it('records at the member’s own branch when the staff account has no branch', async () => {
      api.mockImplementation(async (url: string) =>
        url === '/members' ? { success: true, data: [{ ...member, branchId: BRANCH_ID }] } : created(countContract))
      const { verifyQrCheckin } = useCheckin()

      await verifyQrCheckin({ payload: qr() })

      expect(api).toHaveBeenLastCalledWith('/check-ins', expect.objectContaining({ body: expect.objectContaining({ branchId: BRANCH_ID }) }))
    })

    it('returns the backend reason when the entry is refused', async () => {
      api.mockImplementation(async (url: string) => {
        if (url === '/members') return { success: true, data: [{ ...member, branchId: BRANCH_ID }] }
        throw new Error('會員無有效合約')
      })
      const { verifyQrCheckin } = useCheckin()

      expect(await verifyQrCheckin({ payload: qr() })).toEqual({ success: false, message: '會員無有效合約' })
    })

    it('rejects an expired, malformed or unknown-member QR without recording anything', async () => {
      api.mockResolvedValue({ success: true, data: [] })
      const { verifyQrCheckin } = useCheckin()

      expect(await verifyQrCheckin({ payload: qr({ t: Date.now() - 31_000 }) })).toMatchObject({ success: false })
      expect(await verifyQrCheckin({ payload: 'not json' })).toEqual({ success: false, message: '無效的 QR Code 格式' })
      expect(await verifyQrCheckin({ payload: qr() })).toMatchObject({ success: false, message: expect.stringContaining('M000001') })
      expect(api.mock.calls.some(([url]) => url === '/check-ins')).toBe(false)
    })
  })

  describe('QR helpers', () => {
    it('parses the member-app payload', () => {
      expect(parseQrPayload('{"m":"M1","t":1000,"c":"c-1"}')).toEqual({ memberCode: 'M1', timestamp: 1000, contractId: 'c-1' })
      expect(parseQrPayload('{"t":1000}')).toBeNull()
    })

    it('treats codes older than 30 seconds as expired', () => {
      expect(isQrExpired(1000, 30_000)).toBe(false)
      expect(isQrExpired(1000, 31_001)).toBe(true)
    })
  })

  it('loads today’s entries from GET /check-ins with pagination.total', async () => {
    api.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'ci-9', memberId: MEMBER_ID, branchId: BRANCH_ID, contractId: null, checkInTime: '2026-11-26T01:00:00.000Z', checkInType: 'ENTRY', checkInMethod: 'MANUAL', member, branch: { id: BRANCH_ID, name: '總店' } }],
      pagination: { total: 17, page: 1, limit: 50, totalPages: 1 }
    })
    const { fetchTodayCheckins, todayCheckins, todayCount } = useCheckin()

    await fetchTodayCheckins(BRANCH_ID, true)

    expect(api).toHaveBeenCalledWith('/check-ins', { params: expect.objectContaining({ branchId: BRANCH_ID, limit: 50 }) })
    expect(todayCheckins.value).toEqual([{ id: 'ci-9', member, time: '2026-11-26T01:00:00.000Z', branchId: BRANCH_ID }])
    expect(todayCount.value).toBe(17)
  })
})
