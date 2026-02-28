/**
 * useCoachClasses - Coach Classes Management Composable
 *
 * Handles fetching and managing coach's classes and attendance.
 * Supports offline caching and attendance queue for unreliable network conditions.
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

const CACHE_KEYS = {
  classes: 'coach:classes',
  classDetail: 'coach:class',
  schedule: 'coach:schedule',
} as const

const CACHE_TTL = {
  classes: 2 * 60 * 1000,     // 2 min (attendance changes status quickly)
  classDetail: 5 * 60 * 1000, // 5 min
  schedule: 15 * 60 * 1000,   // 15 min
} as const

export const useCoachClasses = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useCoachAuth()
  const { isOnline, getCache, setCache, queueMarkAttendance, queueCancelClass } = useOfflineSync()

  const classes = ref<ClassBooking[]>([])
  const schedule = ref<{ classes: ClassBooking[]; availability: Array<{ day_of_week: number; start_time: string; end_time: string; is_available: boolean }> } | null>(null)
  const loading = ref(false)
  const total = ref(0)
  const isOfflineData = ref(false)

  /**
   * Fetch classes with offline cache fallback
   */
  const fetchClasses = async (params?: {
    date?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    isOfflineData.value = false
    const cacheKey = `${CACHE_KEYS.classes}:${JSON.stringify(params || {})}`

    try {
      if (!isOnline.value) {
        const cached = await getCache<ClassesResponse>(cacheKey)
        if (cached) {
          classes.value = cached.data
          total.value = cached.meta.total
          isOfflineData.value = true
          return
        }
        // No cache available
        classes.value = []
        total.value = 0
        return
      }

      // Online: fetch + cache
      const response = await $fetch<ClassesResponse>(`${apiUrl}/api/coach/classes`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        classes.value = response.data
        total.value = response.meta.total
        await setCache(cacheKey, response, CACHE_TTL.classes)
      }
    } catch {
      // Network error: fallback to cache
      const cached = await getCache<ClassesResponse>(cacheKey)
      if (cached) {
        classes.value = cached.data
        total.value = cached.meta.total
        isOfflineData.value = true
      } else {
        classes.value = []
        total.value = 0
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Get class details with offline cache fallback
   */
  const getClass = async (id: string): Promise<ClassDetailResponse['data'] | null> => {
    const cacheKey = `${CACHE_KEYS.classDetail}:${id}`

    try {
      if (!isOnline.value) {
        return await getCache<ClassDetailResponse['data']>(cacheKey)
      }

      const response = await $fetch<ClassDetailResponse>(
        `${apiUrl}/api/coach/classes/${id}`,
        {
          headers: getAuthHeader(),
        }
      )

      if (response.success) {
        await setCache(cacheKey, response.data, CACHE_TTL.classDetail)
        return response.data
      }
      return null
    } catch {
      // Network error: fallback to cache
      return await getCache<ClassDetailResponse['data']>(cacheKey)
    }
  }

  /**
   * Get weekly schedule with offline cache fallback
   */
  const getSchedule = async (params?: {
    start_date?: string
    end_date?: string
  }): Promise<ScheduleResponse['data'] | null> => {
    loading.value = true
    const cacheKey = `${CACHE_KEYS.schedule}:${JSON.stringify(params || {})}`

    try {
      if (!isOnline.value) {
        const cached = await getCache<ScheduleResponse['data']>(cacheKey)
        if (cached) {
          schedule.value = {
            classes: cached.bookings,
            availability: cached.availability,
          }
          isOfflineData.value = true
          return cached
        }
        return null
      }

      const response = await $fetch<ScheduleResponse>(
        `${apiUrl}/api/coach/schedule`,
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
        await setCache(cacheKey, response.data, CACHE_TTL.schedule)
        return response.data
      }
      return null
    } catch {
      // Network error: fallback to cache
      const cached = await getCache<ScheduleResponse['data']>(cacheKey)
      if (cached) {
        schedule.value = {
          classes: cached.bookings,
          availability: cached.availability,
        }
        isOfflineData.value = true
        return cached
      }
      schedule.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Mark attendance with offline queue fallback
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
    // Offline: queue directly
    if (!isOnline.value) {
      try {
        await queueMarkAttendance(classId, data)
        return {
          success: true,
          message: '點名已排入待同步清單，將在連線後自動處理',
          status: data.attended ? 'ATTENDED' : 'NO_SHOW',
        }
      } catch {
        return { success: false, message: '無法排入待同步清單' }
      }
    }

    // Online: try direct API call
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        status: string
      }>(`${apiUrl}/api/coach/classes/${classId}/attendance`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      // Network error while online: queue as fallback
      try {
        await queueMarkAttendance(classId, data)
        return {
          success: true,
          message: '網路異常，點名已排入待同步清單',
          status: data.attended ? 'ATTENDED' : 'NO_SHOW',
        }
      } catch {
        const message = (error as { data?: { message?: string } })?.data?.message || '點名失敗'
        return { success: false, message }
      }
    }
  }

  /**
   * Cancel class with offline queue fallback
   */
  const cancelClass = async (
    classId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> => {
    // Offline: queue directly
    if (!isOnline.value) {
      try {
        await queueCancelClass(classId, reason)
        return {
          success: true,
          message: '取消請求已排入待同步清單，將在連線後自動處理',
        }
      } catch {
        return { success: false, message: '無法排入待同步清單' }
      }
    }

    // Online: try direct API call
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/classes/${classId}/cancel`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: { reason },
      })

      return response
    } catch (error: unknown) {
      // Network error while online: queue as fallback
      try {
        await queueCancelClass(classId, reason)
        return {
          success: true,
          message: '網路異常，取消請求已排入待同步清單',
        }
      } catch {
        const message = (error as { data?: { message?: string } })?.data?.message || '取消課程失敗'
        return { success: false, message }
      }
    }
  }

  return {
    // State
    classes,
    schedule,
    loading,
    total,
    isOnline,
    isOfflineData,

    // Actions
    fetchClasses,
    getClass,
    getSchedule,
    markAttendance,
    cancelClass,
  }
}
