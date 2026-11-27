import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useCheckin, pickActiveContract } from './useCheckin'

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
    const TOKEN = 'eyJ2IjoxfQ.c2ln'

    it('sends the raw scanned token to POST /api/check-ins, with no member lookup or client-side parsing', async () => {
      api.mockResolvedValue(created(countContract))
      const { verifyQrCheckin } = useCheckin()

      const result = await verifyQrCheckin({ payload: `  ${TOKEN}\n`, branchId: DESK_BRANCH_ID })

      expect(api).toHaveBeenCalledTimes(1)
      expect(api).toHaveBeenCalledWith('/check-ins', {
        method: 'POST',
        body: { qrToken: TOKEN, branchId: DESK_BRANCH_ID }
      })
      expect(result).toMatchObject({ success: true, member, contract: { remainingCounts: 4 } })
    })

    it('omits the branch when the staff account has none (the backend uses the member’s own)', async () => {
      api.mockResolvedValue(created(countContract))
      const { verifyQrCheckin } = useCheckin()

      await verifyQrCheckin({ payload: TOKEN })

      expect(api).toHaveBeenCalledWith('/check-ins', { method: 'POST', body: { qrToken: TOKEN } })
    })

    it.each(['QR Code 已過期，請會員重新產生入場碼', 'QR Code 無效', '此 QR Code 不屬於本館', 'QR Code 已使用，請會員重新產生入場碼'])(
      'shows the backend reason: %s',
      async (reason) => {
        api.mockRejectedValue(new Error(reason))
        const { verifyQrCheckin } = useCheckin()

        expect(await verifyQrCheckin({ payload: TOKEN })).toEqual({ success: false, message: reason })
      }
    )

    it('rejects an empty scan without calling the backend', async () => {
      const { verifyQrCheckin } = useCheckin()

      expect(await verifyQrCheckin({ payload: '  ' })).toEqual({ success: false, message: '無效的 QR Code 格式' })
      expect(api).not.toHaveBeenCalled()
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
