/**
 * useBookings composable
 * Handles booking, canceling, and managing class reservations
 * Supports offline caching and queued operations
 */

import type { ClassSession } from './useClasses'
import { extractErrorMessage } from '../utils/apiHelpers'
import { deduplicateRequest } from '../utils/debounce'
import { formatDateWithDay } from '@gym-nexus/shared'

// Cache keys
const CACHE_KEY_MY_BOOKINGS = 'member:bookings'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const ACTIVE_BOOKING_STATUSES = new Set(['CONFIRMED', 'WAITLISTED'])

const BOOKING_STATUS_LABELS: Record<string, string> = {
  'CONFIRMED': '已確認',
  'WAITLISTED': '候補中',
  'CANCELLED': '已取消',
  'NO_SHOW': '未出席',
  'ATTENDED': '已出席',
}

const BOOKING_STATUS_COLORS: Record<string, string> = {
  'CONFIRMED': 'success',
  'WAITLISTED': 'warning',
  'CANCELLED': 'muted',
  'NO_SHOW': 'error',
  'ATTENDED': 'primary',
}

export interface Booking {
  id: string
  session_id: string
  session?: ClassSession
  member_id: string
  contract_id?: string
  contract?: {
    id: string
    contract_no: string
    remaining_counts?: number | null
  }
  booking_status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'NO_SHOW' | 'ATTENDED'
  waitlist_position?: number | null
  booked_at: string
  cancelled_at?: string | null
  attended_at?: string | null
  // Extended session info
  class_name?: string
  session_date?: string
  start_time?: string
  end_time?: string
  instructor_name?: string
  room?: string
  // Review status
  has_review?: boolean
}

interface BookingResult {
  success: boolean
  message: string
  booking?: Booking
  waitlist_position?: number
}

interface BookingsResponse {
  success: boolean
  data: Booking[]
  total?: number
}

export const useBookings = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()
  const { isOnline, getCache, setCache, queueCancelBooking } = useOfflineSync()

  const myBookings = useState<Booking[]>('my_bookings', () => [])
  const upcomingBookings = useState<Booking[]>('upcoming_bookings', () => [])
  const pastBookings = useState<Booking[]>('past_bookings', () => [])
  const isLoading = useState('bookings_loading', () => false)
  const isOfflineData = useState('bookings_is_offline', () => false)

  /**
   * Split bookings into upcoming and past (single-pass partition)
   */
  const splitBookings = (bookings: Booking[]) => {
    const nowMs = Date.now()
    const upcoming: Booking[] = []
    const past: Booking[] = []

    for (const b of bookings) {
      const dateStr = b.session_date || b.session?.session_date
      const sessionTime = dateStr ? new Date(dateStr).getTime() : 0
      const isUpcomingStatus = b.booking_status === 'CONFIRMED' || b.booking_status === 'WAITLISTED'

      if (sessionTime >= nowMs && isUpcomingStatus) {
        upcoming.push(b)
      } else {
        past.push(b)
      }
    }

    upcomingBookings.value = upcoming
    pastBookings.value = past
  }

  /**
   * Fetch member's bookings with offline support (with request deduplication)
   */
  const fetchMyBookings = async (options?: {
    status?: string
    upcoming?: boolean
    limit?: number
  }) => {
    if (!member.value) return []

    const dedupKey = `bookings:${member.value.id}:${JSON.stringify(options || {})}`
    return deduplicateRequest(dedupKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      // Build cache key based on options
      const cacheKey = `${CACHE_KEY_MY_BOOKINGS}:${member.value!.id}:${JSON.stringify(options || {})}`

      try {
        // If offline, try to use cached data
        if (!isOnline.value) {
          const cached = await getCache<Booking[]>(cacheKey)
          if (cached) {
            myBookings.value = cached
            splitBookings(cached)
            isOfflineData.value = true
            return cached
          }
          // No cached data available
          return []
        }

        const params = new URLSearchParams()
        if (options?.status) params.append('status', options.status)
        if (options?.upcoming !== undefined) params.append('upcoming', String(options.upcoming))
        if (options?.limit) params.append('limit', String(options.limit))

        const response = await $fetch<BookingsResponse>(`${apiUrl}/api/member/bookings?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          myBookings.value = response.data
          splitBookings(response.data)

          // Cache the response for offline use
          await setCache(cacheKey, response.data, CACHE_TTL)
        }
        return response.data
      } catch {
        // On network error, try to use cached data
        const cached = await getCache<Booking[]>(cacheKey)
        if (cached) {
          myBookings.value = cached
          splitBookings(cached)
          isOfflineData.value = true
          return cached
        }
        return []
      } finally {
        isLoading.value = false
      }
    })
  }

  /**
   * Book a class session
   */
  const bookSession = async (sessionId: string, contractId?: string): Promise<BookingResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<BookingResult>(`${apiUrl}/api/member/bookings`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: {
          session_id: sessionId,
          contract_id: contractId,
        },
      })

      if (response.success && response.booking) {
        // Add to bookings list
        myBookings.value.unshift(response.booking)
        if (response.booking.booking_status === 'CONFIRMED' || response.booking.booking_status === 'WAITLISTED') {
          upcomingBookings.value.unshift(response.booking)
        }
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '預約失敗'),
      }
    }
  }

  /**
   * Cancel a booking with offline queue support
   */
  const cancelBooking = async (bookingId: string): Promise<BookingResult> => {
    // Optimistically update local state
    const updateLocalState = () => {
      const index = myBookings.value.findIndex(b => b.id === bookingId)
      const booking = myBookings.value[index]
      if (index !== -1 && booking) {
        booking.booking_status = 'CANCELLED'
      }
      upcomingBookings.value = upcomingBookings.value.filter(b => b.id !== bookingId)
    }

    // If offline, queue the cancellation
    if (!isOnline.value) {
      try {
        await queueCancelBooking(bookingId)
        // Optimistically update local state
        updateLocalState()
        return {
          success: true,
          message: '取消預約已排入待同步清單，將在連線後自動處理',
        }
      } catch (error: unknown) {
        return {
          success: false,
          message: extractErrorMessage(error, '無法排入待同步清單'),
        }
      }
    }

    try {
      const response = await $fetch<BookingResult>(`${apiUrl}/api/member/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        updateLocalState()
      }

      return response
    } catch (error: unknown) {
      // On network error, queue the cancellation
      try {
        await queueCancelBooking(bookingId)
        // Optimistically update local state
        updateLocalState()
        return {
          success: true,
          message: '網路異常，取消預約已排入待同步清單',
        }
      } catch {
        return {
          success: false,
          message: extractErrorMessage(error, '取消失敗'),
        }
      }
    }
  }

  /**
   * Check if member has booked a specific session
   */
  const hasBookedSession = (sessionId: string): boolean => {
    return myBookings.value.some(
      b => b.session_id === sessionId && ACTIVE_BOOKING_STATUSES.has(b.booking_status)
    )
  }

  /**
   * Get booking for a specific session
   */
  const getBookingForSession = (sessionId: string): Booking | undefined => {
    return myBookings.value.find(
      b => b.session_id === sessionId && ACTIVE_BOOKING_STATUSES.has(b.booking_status)
    )
  }

  /**
   * Get booking status label
   */
  const getStatusLabel = (status: string): string => {
    return BOOKING_STATUS_LABELS[status] || status
  }

  /**
   * Get booking status color class
   */
  const getStatusColor = (status: string): string => {
    return BOOKING_STATUS_COLORS[status] || 'muted'
  }

  /**
   * Check if booking can be cancelled
   * Usually can cancel up to X hours before the session
   */
  const canCancel = (booking: Booking, hoursBeforeSession = 2): boolean => {
    if (!ACTIVE_BOOKING_STATUSES.has(booking.booking_status)) {
      return false
    }

    const sessionDate = booking.session_date || booking.session?.session_date
    const startTime = booking.start_time || booking.session?.schedule?.start_time

    if (!sessionDate || !startTime) return false

    const sessionDateTime = new Date(`${sessionDate}T${startTime}`)
    const cutoffTime = new Date(sessionDateTime.getTime() - hoursBeforeSession * 60 * 60 * 1000)
    return new Date() < cutoffTime
  }

  const formatBookingDate = formatDateWithDay

  /**
   * Get upcoming bookings count
   */
  const upcomingCount = computed(() => upcomingBookings.value.length)

  /**
   * Check if member has any upcoming bookings
   */
  const hasUpcomingBookings = computed(() => upcomingBookings.value.length > 0)

  return {
    myBookings,
    upcomingBookings,
    pastBookings,
    isLoading,
    isOfflineData,
    isOnline,
    upcomingCount,
    hasUpcomingBookings,
    fetchMyBookings,
    bookSession,
    cancelBooking,
    hasBookedSession,
    getBookingForSession,
    getStatusLabel,
    getStatusColor,
    canCancel,
    formatBookingDate,
  }
}
