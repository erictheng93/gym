import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useClasses, filterClasses, getCategoryLabel, type ApiClass } from './useClasses'
import { useClassBookings } from './useClassBookings'

// =============================================================================
// Fixtures in the wire format of backend/src/routes/classes.ts and bookings.ts:
// camelCase, list without an envelope total (classes) or with `meta` (bookings)
// =============================================================================

const yoga: ApiClass = {
  id: 'c1',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: null,
  name: '晨間瑜珈',
  description: '伸展與呼吸',
  durationMinutes: 60,
  maxCapacity: 20,
  instructorId: 'e1',
  branchId: 'b1',
  category: 'YOGA',
  difficultyLevel: 'BEGINNER',
  imageUrl: null,
  isActive: true,
  requiresCount: true,
  countDeduction: 1,
  instructor: { id: 'e1', fullName: '林教練' },
  branch: { id: 'b1', name: '台北店' }
}

const spin: ApiClass = { ...yoga, id: 'c2', name: '飛輪燃脂', description: null, category: 'SPINNING', difficultyLevel: 'ADVANCED' }

const bookingRow = {
  id: 'bk1',
  status: 'active',
  sessionId: 's1',
  memberId: 'm1',
  contractId: 'ct1',
  bookingStatus: 'CONFIRMED',
  waitlistPosition: null,
  bookedAt: '2026-11-20T02:00:00.000Z',
  cancelledAt: null,
  cancelReason: null,
  attendedAt: null,
  countDeducted: false,
  session: { id: 's1', sessionDate: '2026-11-27', startTime: '09:00:00', endTime: '10:00:00', sessionStatus: 'SCHEDULED' },
  class: { id: 'c1', name: '晨間瑜珈', category: 'YOGA' },
  member: { id: 'm1', fullName: '王小明', memberCode: 'M0001' }
}

const httpError = (message: string) => Object.assign(new Error(message), { status: 400 })

afterEach(() => {
  mockFetchInstance.apiFetch.mockReset()
  mockHandleError.mockClear()
})

describe('useClasses', () => {
  it('loads the full list and sends branchId in camelCase', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [yoga, spin] })
    const { allClasses, fetchClasses } = useClasses()

    await fetchClasses('b1')

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/classes', { params: { branchId: 'b1' } })
    expect(allClasses.value.map(c => c.name)).toEqual(['晨間瑜珈', '飛輪燃脂'])
  })

  it('createClass posts the camelCase body and returns the created class', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: yoga })
    const input = {
      name: '晨間瑜珈', branchId: 'b1', durationMinutes: 60, maxCapacity: 20,
      difficultyLevel: 'BEGINNER' as const, requiresCount: true, countDeduction: 1, category: 'YOGA' as const
    }

    const result = await useClasses().createClass(input)

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/classes', { method: 'POST', body: input })
    expect(result).toEqual({ ok: true, data: yoga })
  })

  it('createClass reports the backend validation error instead of succeeding', async () => {
    mockFetchInstance.apiFetch.mockRejectedValue(httpError('請輸入課程名稱'))

    const result = await useClasses().createClass({
      name: '', branchId: 'b1', durationMinutes: 60, maxCapacity: 20,
      difficultyLevel: 'BEGINNER', requiresCount: true, countDeduction: 1
    })

    expect(result).toEqual({ ok: false, error: '請輸入課程名稱' })
  })

  it('updateClass PATCHes only the given fields', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: { ...yoga, maxCapacity: 25 } })

    const result = await useClasses().updateClass('c1', { maxCapacity: 25 })

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/classes/c1', { method: 'PATCH', body: { maxCapacity: 25 } })
    expect(result.ok).toBe(true)
  })

  it('createSchedule posts to /classes/schedules and surfaces errors', async () => {
    mockFetchInstance.apiFetch.mockRejectedValueOnce(httpError('無效的課程'))
    const input = { classId: 'c1', branchId: 'b1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }

    expect(await useClasses().createSchedule(input)).toEqual({ ok: false, error: '無效的課程' })
    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/classes/schedules', { method: 'POST', body: input })
  })

  it('fetchSessions reads /classes/:id/sessions with the date window', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [{ id: 's1', sessionDate: '2026-11-27' }] })

    const sessions = await useClasses().fetchSessions('c1', '2026-11-26', '2026-12-10')

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/classes/c1/sessions', { params: { startDate: '2026-11-26', endDate: '2026-12-10' } })
    expect(sessions).toHaveLength(1)
  })

  it('filterClasses applies search, category and difficulty client-side', () => {
    expect(filterClasses([yoga, spin], { search: '呼吸' }).map(c => c.id)).toEqual(['c1'])
    expect(filterClasses([yoga, spin], { category: 'SPINNING' }).map(c => c.id)).toEqual(['c2'])
    expect(filterClasses([yoga, spin], { difficulty: 'BEGINNER' }).map(c => c.id)).toEqual(['c1'])
    expect(filterClasses([yoga, spin], {})).toHaveLength(2)
  })

  it('labels the backend category enum', () => {
    expect(getCategoryLabel('YOGA')).toBe('瑜珈')
    expect(getCategoryLabel(null)).toBe('—')
  })
})

describe('useClassBookings', () => {
  it('lists bookings with camelCase filters and reads the total from `meta`', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [bookingRow], meta: { total: 41, page: 2, limit: 20 } })
    const { bookings, totalCount, fetchBookings } = useClassBookings()

    await fetchBookings({ page: 2, status: 'CONFIRMED', date: '2026-11-27' })

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/bookings', {
      params: { page: 2, limit: 20, memberId: undefined, sessionId: undefined, status: 'CONFIRMED', date: '2026-11-27' }
    })
    expect(totalCount.value).toBe(41)
    expect(bookings.value[0]!.member.fullName).toBe('王小明')
  })

  it('cancel and attend call the backend action routes and surface their errors', async () => {
    mockFetchInstance.apiFetch.mockRejectedValueOnce(httpError('課程開始前 2 小時內無法取消'))
    const { cancelBooking, attendClass } = useClassBookings()

    expect(await cancelBooking('bk1')).toEqual({ ok: false, error: '課程開始前 2 小時內無法取消' })
    expect(mockFetchInstance.apiFetch).toHaveBeenLastCalledWith('/bookings/bk1/cancel', { method: 'POST', body: {} })

    mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { remainingCounts: 7 }, message: '簽到成功！' })
    expect(await attendClass('bk1')).toEqual({ ok: true, data: { remainingCounts: 7 } })
    expect(mockFetchInstance.apiFetch).toHaveBeenLastCalledWith('/bookings/bk1/attend', { method: 'POST' })
  })

  it('bookSession posts { sessionId, memberId, contractId } and returns the backend message', async () => {
    mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: { id: 'bk2' }, message: '已加入候補名單，目前排序第 1 位' })

    const result = await useClassBookings().bookSession({ sessionId: 's1', memberId: 'm1', contractId: 'ct1' })

    expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/bookings', { method: 'POST', body: { sessionId: 's1', memberId: 'm1', contractId: 'ct1' } })
    expect(result).toEqual({ ok: true, data: { message: '已加入候補名單，目前排序第 1 位' } })
  })

  it('getBookingStats counts each status via meta.total', async () => {
    const totals: Record<string, number> = { CONFIRMED: 5, WAITLIST: 2, ATTENDED: 9, NO_SHOW: 1, CANCELLED: 3 }
    mockFetchInstance.apiFetch.mockImplementation(async (_: string, opts: { params: { status: string } }) =>
      ({ success: true, data: [], meta: { total: totals[opts.params.status] } }))

    expect(await useClassBookings().getBookingStats('2026-11-27')).toEqual({ confirmed: 5, waitlist: 2, attended: 9, noShow: 1, cancelled: 3 })
  })
})
