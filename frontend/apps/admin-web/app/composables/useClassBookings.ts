/**
 * 課程預約 Composable
 *
 * Mirrors the staff bookings API (backend/src/routes/bookings.ts), camelCase:
 * - GET  /api/bookings?memberId=&sessionId=&status=&date=&page=&limit=   totals in `meta`
 * - POST /api/bookings              { sessionId, memberId, contractId? } or, manager+ only,
 *                                   { sessionId, memberId, override: { reason } } (no contract, never deducts)
 * - POST /api/bookings/:id/cancel   { reason? } (not within 2 h of the start; promotes the waitlist)
 * - POST /api/bookings/:id/attend   (session day only; deducts class counts)
 *
 * There is no no-show endpoint, so marking NO_SHOW is not offered.
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import type { ActionResult } from '~/composables/useClasses'

export type BookingStatus = 'CONFIRMED' | 'WAITLIST' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW'

/** A row of GET /api/bookings: the booking with its session, class and member joined */
export interface ApiBooking {
  id: string
  sessionId: string
  memberId: string
  contractId: string | null
  bookingStatus: BookingStatus | null
  waitlistPosition: number | null
  bookedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  attendedAt: string | null
  countDeducted: boolean | null
  session: { id: string; sessionDate: string; startTime: string; endTime: string; sessionStatus: string | null }
  class: { id: string; name: string; category: string | null }
  member: { id: string; fullName: string; memberCode: string }
}

export interface BookingListFilters {
  page?: number
  limit?: number
  memberId?: string
  sessionId?: string
  status?: BookingStatus | ''
  /** Session day, YYYY-MM-DD */
  date?: string
}

export interface BookingStats {
  confirmed: number
  waitlist: number
  attended: number
  noShow: number
  cancelled: number
}

type ListBody = { data?: ApiBooking[]; meta?: { total?: number } }

const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

/** Backend answer when a member has no ACTIVE, in-date contract (offer the manager override) */
export const NO_VALID_CONTRACT = 'NO_VALID_CONTRACT'
export const BOOKING_OVERRIDE_ROLES: readonly string[] = ['super_admin', 'admin', 'manager']

export type BookSessionResult = { ok: true; data: { message: string } } | { ok: false; error: string; code?: string }

export const useClassBookings = () => {
  const { user } = useAuth()
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  const bookings = useState<ApiBooking[]>('class_bookings', () => [])
  const isLoading = useState('class_bookings_loading', () => false)
  const totalCount = useState('class_bookings_total', () => 0)

  const fetchBookings = async (filters: BookingListFilters = {}) => {
    isLoading.value = true
    try {
      const { page = 1, limit = 20, memberId, sessionId, status, date } = filters
      const response = await apiFetch<ApiBooking[]>('/bookings', {
        params: { page, limit, memberId, sessionId, status: status || undefined, date }
      }) as ListBody
      bookings.value = response.data ?? []
      totalCount.value = response.meta?.total ?? 0
    } catch (error) {
      handleError(error, { context: 'useClassBookings.fetchBookings', customMessage: '載入預約資料失敗' })
    } finally {
      isLoading.value = false
    }
  }

  /** Per-status counts (same date filter as the list) from the list endpoint's `meta.total` */
  const getBookingStats = async (date?: string): Promise<BookingStats> => {
    const count = async (status: BookingStatus) => {
      const response = await apiFetch<ApiBooking[]>('/bookings', { params: { status, date, limit: 1 } }) as ListBody
      return response.meta?.total ?? 0
    }
    try {
      const [confirmed, waitlist, attended, noShow, cancelled] = await Promise.all([
        count('CONFIRMED'), count('WAITLIST'), count('ATTENDED'), count('NO_SHOW'), count('CANCELLED')
      ])
      return { confirmed, waitlist, attended, noShow, cancelled }
    } catch (error) {
      handleError(error, { context: 'useClassBookings.getBookingStats', showToast: false })
      return { confirmed: 0, waitlist: 0, attended: 0, noShow: 0, cancelled: 0 }
    }
  }

  /** Book a member into a session; the backend puts them on the waitlist when it is full */
  const bookSession = async (input: {
    sessionId: string
    memberId: string
    contractId?: string | null
    /** Manager+ only: book without a valid contract (trial / make-up class); the reason is required */
    override?: { reason: string }
  }): Promise<BookSessionResult> => {
    try {
      const response = await apiFetch('/bookings', { method: 'POST', body: input }) as { message?: string }
      return { ok: true, data: { message: response.message ?? '預約成功' } }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      return { ok: false, error: errorMessage(error, '預約失敗'), code }
    }
  }

  /** super_admin / admin / manager may book without a valid contract (with a reason) */
  const canOverrideBooking = computed(() => BOOKING_OVERRIDE_ROLES.includes(user.value?.role ?? ''))

  const cancelBooking = async (bookingId: string, reason?: string): Promise<ActionResult> => {
    try {
      await apiFetch(`/bookings/${bookingId}/cancel`, { method: 'POST', body: reason ? { reason } : {} })
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: errorMessage(error, '取消預約失敗') }
    }
  }

  /** Mark attended; `remainingCounts` is the contract's balance after the deduction (null if none) */
  const attendClass = async (bookingId: string): Promise<ActionResult<{ remainingCounts: number | null }>> => {
    try {
      const response = await apiFetch<{ remainingCounts: number | null }>(`/bookings/${bookingId}/attend`, { method: 'POST' })
      return { ok: true, data: { remainingCounts: response.data?.remainingCounts ?? null } }
    } catch (error) {
      return { ok: false, error: errorMessage(error, '簽到失敗') }
    }
  }

  return {
    bookings,
    isLoading,
    totalCount,
    fetchBookings,
    getBookingStats,
    bookSession,
    canOverrideBooking,
    cancelBooking,
    attendClass
  }
}
