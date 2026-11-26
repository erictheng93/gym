/**
 * Unit tests for useBookings composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ../utils/apiHelpers module
vi.mock('../utils/apiHelpers', () => ({
  extractErrorMessage: (error: unknown, fallback: string) => {
    if (!error) return fallback
    // Handle Error instance
    if (error instanceof Error) {
      return error.message || fallback
    }
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>
      if ('data' in err && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, unknown>
        if ('message' in data) return String(data.message)
      }
      if ('message' in err) return String(err.message)
    }
    return fallback
  },
}))

// Create mock state storage
const stateStore = new Map<string, { value: unknown }>()

// Mock Nuxt composables
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

// Mock useOfflineSync
const mockOfflineSync = {
  isOnline: { value: true },
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  queueCancelBooking: vi.fn().mockResolvedValue('queue-id'),
}

vi.stubGlobal('useOfflineSync', () => mockOfflineSync)

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useMemberAuth
const mockMember = { value: { id: 'member-1', full_name: 'Test Member' } }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useMemberAuth', () => ({
  member: mockMember,
  getAuthHeader: mockGetAuthHeader,
}))

// Import after mocking
import { useBookings, type Booking } from './useBookings'

// Backend booking payload (backend/src/routes/member-bookings.ts)
const ab = (o: { id: string; bookingStatus: string; sessionDate?: string; sessionId?: string }) => ({
  id: o.id,
  sessionId: o.sessionId ?? 'session-x',
  contractId: null,
  bookingStatus: o.bookingStatus,
  waitlistPosition: null,
  bookedAt: '2025-01-01T00:00:00Z',
  session: { sessionDate: o.sessionDate ?? '2099-01-01', startTime: '10:00:00', endTime: '11:00:00', room: null, sessionStatus: 'SCHEDULED' },
  class: { id: 'class-1', name: '瑜珈', category: 'YOGA' },
  instructor: null,
  hasReview: false,
})

describe('useBookings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    // Reset mockOfflineSync
    mockOfflineSync.isOnline.value = true
    mockOfflineSync.getCache.mockResolvedValue(null)
    mockOfflineSync.setCache.mockResolvedValue(undefined)
    mockOfflineSync.queueCancelBooking.mockResolvedValue('queue-id')
  })

  describe('fetchMyBookings', () => {
    it('should return empty array if no member', async () => {
      mockMember.value = null as unknown as typeof mockMember.value

      const { fetchMyBookings } = useBookings()
      const result = await fetchMyBookings()

      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch bookings with auth header', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: 'booking-1', bookingStatus: 'CONFIRMED', sessionDate: '2025-12-01' }),
        ] },
      })

      const { fetchMyBookings } = useBookings()
      const result = await fetchMyBookings()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/bookings?',
        expect.objectContaining({
          headers: { 'X-Member-Token': 'test-token' },
        })
      )
      expect(result).toEqual([{
        id: 'booking-1',
        session_id: 'session-x',
        member_id: 'member-1',
        contract_id: undefined,
        booking_status: 'CONFIRMED',
        waitlist_position: null,
        booked_at: '2025-01-01T00:00:00Z',
        cancelled_at: null,
        attended_at: null,
        class_name: '瑜珈',
        session_date: '2025-12-01',
        start_time: '10:00',
        end_time: '11:00',
        instructor_name: undefined,
        room: undefined,
        has_review: false,
      }])
    })

    it('should pass filter options to API', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValue({ success: true, data: { bookings: [] } })

      const { fetchMyBookings } = useBookings()
      await fetchMyBookings({ status: 'CONFIRMED', upcoming: true, limit: 10 })
      await fetchMyBookings({ status: 'WAITLISTED' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/bookings?status=CONFIRMED&upcoming=true&limit=10',
        expect.any(Object)
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/bookings?status=WAITLIST',
        expect.any(Object)
      )
    })

    it('should split bookings into upcoming and past', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 7)

      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: 'upcoming-1', bookingStatus: 'CONFIRMED', sessionDate: futureDate.toISOString() }),
          ab({ id: 'past-1', bookingStatus: 'ATTENDED', sessionDate: pastDate.toISOString() }),
        ] },
      })

      const { fetchMyBookings, upcomingBookings, pastBookings } = useBookings()
      await fetchMyBookings()

      expect(upcomingBookings.value).toHaveLength(1)
      expect(upcomingBookings.value[0]!.id).toBe('upcoming-1')
      expect(pastBookings.value).toHaveLength(1)
      expect(pastBookings.value[0]!.id).toBe('past-1')
    })

    it('should return empty array on error', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { fetchMyBookings } = useBookings()
      const result = await fetchMyBookings()

      expect(result).toEqual([])
    })
  })

  describe('bookSession', () => {
    it('should return error if no member', async () => {
      mockMember.value = null as unknown as typeof mockMember.value

      const { bookSession } = useBookings()
      const result = await bookSession('session-1')

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should send booking request with session and contract IDs', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '預約成功！',
        data: { booking: { ...ab({ id: 'booking-1', bookingStatus: 'CONFIRMED', sessionId: 'session-1' }), session: undefined, class: undefined } },
      })
      mockFetch.mockResolvedValueOnce({ success: true, data: { bookings: [] } })

      const { bookSession } = useBookings()
      const result = await bookSession('session-1', 'contract-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/bookings',
        expect.objectContaining({
          method: 'POST',
          body: { sessionId: 'session-1', contractId: 'contract-1' },
        })
      )
      expect(result.success).toBe(true)
      expect(result.message).toBe('預約成功！')
      expect(result.booking?.booking_status).toBe('CONFIRMED')
    })

    it('should add successful booking to myBookings state', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '已加入候補名單，目前排序第 2 位',
        data: { booking: { ...ab({ id: 'booking-new', bookingStatus: 'WAITLIST' }), waitlistPosition: 2 } },
      })
      // the list is reloaded so the new booking carries its session details
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { bookings: [{ ...ab({ id: 'booking-new', bookingStatus: 'WAITLIST' }), waitlistPosition: 2 }] },
      })

      const { bookSession, myBookings, upcomingBookings } = useBookings()
      const result = await bookSession('session-1')

      expect(mockFetch.mock.calls[0]![1].body).toEqual({ sessionId: 'session-1' })
      expect(result.booking?.booking_status).toBe('WAITLISTED')
      expect(result.waitlist_position).toBe(2)
      expect(myBookings.value[0]).toMatchObject({ id: 'booking-new', class_name: '瑜珈', session_date: '2099-01-01', start_time: '10:00' })
      expect(upcomingBookings.value).toHaveLength(1)
    })

    it('should extract error message on failure', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockRejectedValue({
        data: { message: '此課程已額滿' },
      })

      const { bookSession } = useBookings()
      const result = await bookSession('session-1')

      expect(result).toEqual({ success: false, message: '此課程已額滿' })
    })

    it('should return error message from thrown Error', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockRejectedValue(new Error('Network failure'))

      const { bookSession } = useBookings()
      const result = await bookSession('session-1')

      expect(result.success).toBe(false)
      // extractErrorMessage returns the Error's message when it has one
      expect(result.message).toBe('Network failure')
    })
  })

  describe('cancelBooking', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValue({ success: true, message: '取消成功' })

      const { cancelBooking } = useBookings()
      await cancelBooking('booking-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/bookings/booking-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('should update local state on success', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }

      // First set up some bookings
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { bookings: [
          ab({ id: 'booking-1', bookingStatus: 'CONFIRMED', sessionDate: '2099-01-01' }),
        ] },
      })

      const { fetchMyBookings, cancelBooking, myBookings, upcomingBookings } = useBookings()
      await fetchMyBookings()

      expect(myBookings.value[0]!.booking_status).toBe('CONFIRMED')
      expect(upcomingBookings.value).toHaveLength(1)

      // Now cancel
      mockFetch.mockResolvedValueOnce({ success: true, message: '取消成功' })
      await cancelBooking('booking-1')

      expect(myBookings.value[0]!.booking_status).toBe('CANCELLED')
      expect(upcomingBookings.value).toHaveLength(0)
    })

    it('should extract error message on failure', async () => {
      mockFetch.mockRejectedValue({
        data: { message: '已超過取消時限' },
      })
      mockOfflineSync.queueCancelBooking.mockRejectedValueOnce(new Error('Queue failed'))

      const { cancelBooking } = useBookings()
      const result = await cancelBooking('booking-1')

      expect(result).toEqual({ success: false, message: '已超過取消時限' })
    })
  })

  describe('hasBookedSession', () => {
    it('should return true if session is booked', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: 'b-1', sessionId: 'session-1', bookingStatus: 'CONFIRMED' }),
        ] },
      })

      const { fetchMyBookings, hasBookedSession } = useBookings()
      await fetchMyBookings()

      expect(hasBookedSession('session-1')).toBe(true)
      expect(hasBookedSession('session-2')).toBe(false)
    })

    it('should not count cancelled bookings', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: 'b-1', sessionId: 'session-1', bookingStatus: 'CANCELLED' }),
        ] },
      })

      const { fetchMyBookings, hasBookedSession } = useBookings()
      await fetchMyBookings()

      expect(hasBookedSession('session-1')).toBe(false)
    })
  })

  describe('getStatusLabel', () => {
    it('should return Chinese labels for statuses', () => {
      const { getStatusLabel } = useBookings()

      expect(getStatusLabel('CONFIRMED')).toBe('已確認')
      expect(getStatusLabel('WAITLISTED')).toBe('候補中')
      expect(getStatusLabel('CANCELLED')).toBe('已取消')
      expect(getStatusLabel('NO_SHOW')).toBe('未出席')
      expect(getStatusLabel('ATTENDED')).toBe('已出席')
    })

    it('should return original status for unknown', () => {
      const { getStatusLabel } = useBookings()
      expect(getStatusLabel('UNKNOWN')).toBe('UNKNOWN')
    })
  })

  describe('getStatusColor', () => {
    it('should return color classes for statuses', () => {
      const { getStatusColor } = useBookings()

      expect(getStatusColor('CONFIRMED')).toBe('success')
      expect(getStatusColor('WAITLISTED')).toBe('warning')
      expect(getStatusColor('CANCELLED')).toBe('muted')
      expect(getStatusColor('NO_SHOW')).toBe('error')
      expect(getStatusColor('ATTENDED')).toBe('primary')
    })
  })

  describe('canCancel', () => {
    it('should return false for non-active bookings', () => {
      const { canCancel } = useBookings()

      const cancelledBooking: Booking = {
        id: '1',
        session_id: 's1',
        member_id: 'm1',
        booking_status: 'CANCELLED',
        booked_at: '2025-01-01',
      }

      expect(canCancel(cancelledBooking)).toBe(false)
    })

    it('should return true if more than 2 hours before session', () => {
      const { canCancel } = useBookings()

      // Use a far future date to avoid timezone issues
      const futureDate = '2099-12-31'
      const futureTime = '23:59'

      const booking: Booking = {
        id: '1',
        session_id: 's1',
        member_id: 'm1',
        booking_status: 'CONFIRMED',
        booked_at: '2025-01-01',
        session_date: futureDate,
        start_time: futureTime,
      }

      expect(canCancel(booking)).toBe(true)
    })

    it('should return false if less than 2 hours before session', () => {
      const { canCancel } = useBookings()

      // Use current date/time + 30 minutes
      const nearFuture = new Date()
      nearFuture.setMinutes(nearFuture.getMinutes() + 30)

      // Format properly for the composable
      const year = nearFuture.getFullYear()
      const month = String(nearFuture.getMonth() + 1).padStart(2, '0')
      const day = String(nearFuture.getDate()).padStart(2, '0')
      const hours = String(nearFuture.getHours()).padStart(2, '0')
      const minutes = String(nearFuture.getMinutes()).padStart(2, '0')

      const booking: Booking = {
        id: '1',
        session_id: 's1',
        member_id: 'm1',
        booking_status: 'CONFIRMED',
        booked_at: '2025-01-01',
        session_date: `${year}-${month}-${day}`,
        start_time: `${hours}:${minutes}`,
      }

      expect(canCancel(booking)).toBe(false)
    })
  })

  describe('formatBookingDate', () => {
    it('should format date with day of week', () => {
      const { formatBookingDate } = useBookings()

      // We test a fixed date to ensure consistent output
      const result = formatBookingDate('2025-01-15')

      expect(result).toMatch(/1\/15/)
      expect(result).toMatch(/週/)
    })
  })

  describe('computed properties', () => {
    it('upcomingCount should reflect upcoming bookings', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: '1', bookingStatus: 'CONFIRMED', sessionDate: futureDate.toISOString() }),
          ab({ id: '2', bookingStatus: 'WAITLIST', sessionDate: futureDate.toISOString() }),
        ] },
      })

      const { fetchMyBookings, upcomingCount } = useBookings()
      await fetchMyBookings()

      expect(upcomingCount.value).toBe(2)
    })

    it('hasUpcomingBookings should be true when there are upcoming bookings', async () => {
      mockMember.value = { id: 'member-1', full_name: 'Test Member' }
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      mockFetch.mockResolvedValue({
        success: true,
        data: { bookings: [
          ab({ id: '1', bookingStatus: 'CONFIRMED', sessionDate: futureDate.toISOString() }),
        ] },
      })

      const { fetchMyBookings, hasUpcomingBookings } = useBookings()
      await fetchMyBookings()

      expect(hasUpcomingBookings.value).toBe(true)
    })
  })
})
