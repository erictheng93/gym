/**
 * useCoachClasses - Coach Classes Management Composable
 *
 * Handles fetching and managing coach's classes and attendance.
 */

import type { ClassBooking } from '../types/coach'

interface ClassesResponse {
  success: boolean
  data: ClassBooking[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

interface ClassDetailResponse {
  success: boolean
  data: ClassBooking & {
    cancelled_at?: string
    cancel_reason?: string
    record?: {
      id: string
      class_date: string
      warmup_content?: string
      main_content?: Record<string, unknown>
      cooldown_content?: string
      member_condition?: string
      coach_notes?: string
      next_plan?: string
    }
    lesson_plan?: {
      id: string
      title: string
      objectives?: string[]
      warmup_exercises?: unknown[]
      main_exercises?: unknown[]
      cooldown_exercises?: unknown[]
    }
  }
}

interface ScheduleResponse {
  success: boolean
  data: {
    bookings: ClassBooking[]
    availability: Array<{
      day_of_week: number
      start_time: string
      end_time: string
      is_available: boolean
    }>
  }
}

export const useCoachClasses = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader } = useCoachAuth()

  const classes = ref<ClassBooking[]>([])
  const schedule = ref<{ classes: ClassBooking[]; availability: Array<{ day_of_week: number; start_time: string; end_time: string; is_available: boolean }> } | null>(null)
  const loading = ref(false)
  const total = ref(0)

  /**
   * Fetch classes
   */
  const fetchClasses = async (params?: {
    date?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    try {
      const response = await $fetch<ClassesResponse>(`${apiUrl}/gym/coach/classes`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        classes.value = response.data
        total.value = response.meta.total
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error)
      classes.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /**
   * Get class details
   */
  const getClass = async (id: string): Promise<ClassDetailResponse['data'] | null> => {
    try {
      const response = await $fetch<ClassDetailResponse>(
        `${apiUrl}/gym/coach/classes/${id}`,
        {
          headers: getAuthHeader(),
        }
      )

      return response.success ? response.data : null
    } catch (error) {
      console.error('Failed to fetch class:', error)
      return null
    }
  }

  /**
   * Get weekly schedule
   */
  const getSchedule = async (params?: {
    start_date?: string
    end_date?: string
  }): Promise<ScheduleResponse['data'] | null> => {
    loading.value = true
    try {
      const response = await $fetch<ScheduleResponse>(
        `${apiUrl}/gym/coach/schedule`,
        {
          headers: getAuthHeader(),
          query: params,
        }
      )

      if (response.success) {
        schedule.value = {
          classes: response.data.bookings,
          availability: response.data.availability,
        }
        return response.data
      }
      return null
    } catch (error) {
      console.error('Failed to fetch schedule:', error)
      schedule.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Mark attendance
   */
  const markAttendance = async (
    classId: string,
    data: {
      attended: boolean
      notes?: string
      class_record?: {
        warmup?: string
        main?: Record<string, unknown>
        cooldown?: string
        member_condition?: string
        coach_notes?: string
        next_plan?: string
      }
    }
  ): Promise<{ success: boolean; message?: string; status?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        status: string
      }>(`${apiUrl}/gym/coach/classes/${classId}/attendance`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '點名失敗'
      return { success: false, message }
    }
  }

  /**
   * Cancel class (coach-initiated)
   */
  const cancelClass = async (
    classId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/gym/coach/classes/${classId}/cancel`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: { reason },
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '取消課程失敗'
      return { success: false, message }
    }
  }

  return {
    // State
    classes,
    schedule,
    loading,
    total,

    // Actions
    fetchClasses,
    getClass,
    getSchedule,
    markAttendance,
    cancelClass,
  }
}
