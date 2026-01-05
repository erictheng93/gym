/**
 * 課程預約 Composable
 * 管理會員課程預約
 */

import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { Booking, ClassSession, Member } from '~/types/directus'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

// 預約狀態標籤
export const BOOKING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: '已確認', color: 'green' },
  WAITLIST: { label: '候補中', color: 'yellow' },
  CANCELLED: { label: '已取消', color: 'gray' },
  ATTENDED: { label: '已出席', color: 'blue' },
  NO_SHOW: { label: '未出席', color: 'red' }
}

export const useClassBookings = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()
  const config = useRuntimeConfig()

  const bookings = useState<Booking[]>('class_bookings', () => [])
  const isLoading = useState('class_bookings_loading', () => false)
  const totalCount = useState('class_bookings_total', () => 0)

  /**
   * 獲取預約列表
   */
  const fetchBookings = async (options?: {
    page?: number
    limit?: number
    sessionId?: string
    memberId?: string
    bookingStatus?: string
    startDate?: string
    endDate?: string
  }) => {
    isLoading.value = true
    const { page = 1, limit = 20, sessionId, memberId, bookingStatus, startDate, endDate } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (sessionId) filter.session_id = { _eq: sessionId }
      if (memberId) filter.member_id = { _eq: memberId }
      if (bookingStatus) filter.booking_status = { _eq: bookingStatus }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('bookings', {
            filter,
            fields: [
              '*',
              'session.id', 'session.session_date', 'session.start_time', 'session.end_time',
              'session.class.id', 'session.class.name',
              'session.branch.id', 'session.branch.name',
              'member.id', 'member.full_name', 'member.phone', 'member.member_code',
              'contract.id', 'contract.contract_no'
            ],
            sort: ['-booked_at'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      bookings.value = data as Booking[]
      totalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.fetchBookings',
        customMessage: '載入預約資料失敗'
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取單一預約詳情
   */
  const getBooking = async (id: string): Promise<Booking | null> => {
    try {
      const data = await directus.request(
        readItem('bookings', id, {
          fields: [
            '*',
            'session.*',
            'session.class.*',
            'session.branch.*',
            'session.instructor.*',
            'member.*',
            'contract.*'
          ]
        })
      )
      return data as Booking
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.getBooking',
        customMessage: '載入預約資料失敗'
      })
      return null
    }
  }

  /**
   * 預約課程（使用原子函數）
   */
  const bookSession = async (
    sessionId: string,
    memberId: string,
    contractId?: string
  ): Promise<{ success: boolean; bookingId?: string; status?: string; message: string }> => {
    try {
      // 調用後端原子函數 book_class_session
      const response = await $fetch<{
        success: boolean
        booking_id: string | null
        booking_status: string | null
        waitlist_position: number | null
        message: string
      }>('/gym/classes/book', {
        method: 'POST',
        body: {
          session_id: sessionId,
          member_id: memberId,
          contract_id: contractId
        },
        baseURL: config.public.directusUrl
      })

      return {
        success: response.success,
        bookingId: response.booking_id || undefined,
        status: response.booking_status || undefined,
        message: response.message
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.bookSession',
        customMessage: '預約課程失敗'
      })
      return { success: false, message: '預約課程失敗，請稍後再試' }
    }
  }

  /**
   * 取消預約（使用原子函數）
   */
  const cancelBooking = async (
    bookingId: string,
    reason?: string
  ): Promise<{ success: boolean; promotedMemberId?: string; message: string }> => {
    try {
      // 調用後端原子函數 cancel_booking
      const response = await $fetch<{
        success: boolean
        promoted_booking_id: string | null
        promoted_member_id: string | null
        message: string
      }>('/gym/classes/cancel-booking', {
        method: 'POST',
        body: {
          booking_id: bookingId,
          reason
        },
        baseURL: config.public.directusUrl
      })

      return {
        success: response.success,
        promotedMemberId: response.promoted_member_id || undefined,
        message: response.message
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.cancelBooking',
        customMessage: '取消預約失敗'
      })
      return { success: false, message: '取消預約失敗，請稍後再試' }
    }
  }

  /**
   * 課程簽到（使用原子函數）
   */
  const attendClass = async (
    bookingId: string
  ): Promise<{ success: boolean; remainingCounts?: number; message: string }> => {
    try {
      // 調用後端原子函數 attend_class
      const response = await $fetch<{
        success: boolean
        remaining_counts: number | null
        message: string
      }>('/gym/classes/attend', {
        method: 'POST',
        body: { booking_id: bookingId },
        baseURL: config.public.directusUrl
      })

      return {
        success: response.success,
        remainingCounts: response.remaining_counts ?? undefined,
        message: response.message
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.attendClass',
        customMessage: '簽到失敗'
      })
      return { success: false, message: '簽到失敗，請稍後再試' }
    }
  }

  /**
   * 標記未出席
   */
  const markNoShow = async (bookingId: string): Promise<boolean> => {
    try {
      await directus.request(updateItem('bookings', bookingId, {
        booking_status: 'NO_SHOW'
      }))
      return true
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.markNoShow',
        customMessage: '標記未出席失敗'
      })
      return false
    }
  }

  /**
   * 獲取會員的預約列表
   */
  const getMemberBookings = async (
    memberId: string,
    options?: { upcoming?: boolean; limit?: number }
  ): Promise<Booking[]> => {
    const { upcoming = true, limit = 10 } = options || {}

    try {
      const filter: Record<string, unknown> = {
        member_id: { _eq: memberId },
        booking_status: { _in: ['CONFIRMED', 'WAITLIST'] }
      }

      // 只顯示未來的課程
      if (upcoming) {
        filter['session'] = {
          session_date: { _gte: new Date().toISOString().split('T')[0] }
        }
      }

      const data = await directus.request(
        readItems('bookings', {
          filter,
          fields: [
            '*',
            'session.id', 'session.session_date', 'session.start_time', 'session.end_time',
            'session.class.id', 'session.class.name',
            'session.branch.name',
            'session.instructor.full_name'
          ],
          sort: ['session.session_date', 'session.start_time'],
          limit
        })
      )

      return data as Booking[]
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.getMemberBookings',
        showToast: false
      })
      return []
    }
  }

  /**
   * 獲取場次的預約列表
   */
  const getSessionBookings = async (sessionId: string): Promise<Booking[]> => {
    try {
      const data = await directus.request(
        readItems('bookings', {
          filter: {
            session_id: { _eq: sessionId },
            booking_status: { _nin: ['CANCELLED'] }
          },
          fields: [
            '*',
            'member.id', 'member.full_name', 'member.phone', 'member.member_code'
          ],
          sort: ['waitlist_position', 'booked_at']
        })
      )

      return data as Booking[]
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.getSessionBookings',
        showToast: false
      })
      return []
    }
  }

  /**
   * 獲取預約統計
   */
  const getBookingStats = async (options?: {
    sessionId?: string
    branchId?: string
    startDate?: string
    endDate?: string
  }) => {
    const { sessionId, branchId, startDate, endDate } = options || {}

    try {
      const baseFilter: Record<string, unknown> = {}
      if (sessionId) baseFilter.session_id = { _eq: sessionId }

      const [confirmed, waitlist, cancelled, attended, noShow] = await Promise.all([
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter: { ...baseFilter, booking_status: { _eq: 'CONFIRMED' } } }
          })
        ),
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter: { ...baseFilter, booking_status: { _eq: 'WAITLIST' } } }
          })
        ),
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter: { ...baseFilter, booking_status: { _eq: 'CANCELLED' } } }
          })
        ),
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter: { ...baseFilter, booking_status: { _eq: 'ATTENDED' } } }
          })
        ),
        directus.request(
          aggregate('bookings', {
            aggregate: { count: '*' },
            query: { filter: { ...baseFilter, booking_status: { _eq: 'NO_SHOW' } } }
          })
        )
      ])

      return {
        confirmed: Number(confirmed[0]?.count) || 0,
        waitlist: Number(waitlist[0]?.count) || 0,
        cancelled: Number(cancelled[0]?.count) || 0,
        attended: Number(attended[0]?.count) || 0,
        noShow: Number(noShow[0]?.count) || 0
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassBookings.getBookingStats',
        showToast: false
      })
      return { confirmed: 0, waitlist: 0, cancelled: 0, attended: 0, noShow: 0 }
    }
  }

  return {
    bookings,
    isLoading,
    totalCount,
    // CRUD
    fetchBookings,
    getBooking,
    // 預約操作
    bookSession,
    cancelBooking,
    attendClass,
    markNoShow,
    // 查詢
    getMemberBookings,
    getSessionBookings,
    getBookingStats,
    // 常數
    BOOKING_STATUS_LABELS
  }
}
