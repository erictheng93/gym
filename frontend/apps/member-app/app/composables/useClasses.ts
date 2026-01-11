/**
 * useClasses composable
 * Handles fetching and managing gym classes and schedules
 */

import { deduplicateRequest } from '../utils/debounce'

export interface GymClass {
  id: string
  name: string
  description?: string
  duration_minutes: number
  max_capacity: number
  instructor_id?: string
  instructor?: {
    id: string
    full_name: string
  }
  branch_id?: string
  branch?: {
    id: string
    name: string
  }
  category?: string
  difficulty_level?: string
  status: 'ACTIVE' | 'INACTIVE'
}

export interface ClassSchedule {
  id: string
  class_id: string
  class?: GymClass
  day_of_week: number // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time: string // HH:MM format
  end_time: string // HH:MM format
  room?: string
  effective_from?: string
  effective_until?: string
  is_active: boolean
}

export interface ClassSession {
  id: string
  schedule_id: string
  schedule?: ClassSchedule
  session_date: string
  current_count: number
  waitlist_count: number
  session_status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  cancellation_reason?: string
  class?: GymClass
  instructor?: {
    id: string
    full_name: string
  }
  branch?: {
    id: string
    name: string
  }
}

interface ClassesResponse {
  success: boolean
  data: GymClass[]
  total?: number
}

interface SchedulesResponse {
  success: boolean
  data: ClassSchedule[]
}

interface SessionsResponse {
  success: boolean
  data: ClassSession[]
  total?: number
}

export const useClasses = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader } = useMemberAuth()

  const classes = useState<GymClass[]>('gym_classes', () => [])
  const schedules = useState<ClassSchedule[]>('class_schedules', () => [])
  const upcomingSessions = useState<ClassSession[]>('upcoming_sessions', () => [])
  const isLoading = useState('classes_loading', () => false)

  /**
   * Fetch all active classes (with request deduplication)
   */
  const fetchClasses = async (branchId?: string) => {
    const cacheKey = `classes-${branchId || 'all'}`

    return deduplicateRequest(cacheKey, async () => {
      isLoading.value = true
      try {
        const params = new URLSearchParams()
        if (branchId) params.append('branch_id', branchId)

        const response = await $fetch<ClassesResponse>(`${apiUrl}/gym/classes?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          classes.value = response.data
        }
        return response.data
      } catch {
        return []
      } finally {
        isLoading.value = false
      }
    })
  }

  /**
   * Fetch weekly schedule (with request deduplication)
   */
  const fetchWeeklySchedule = async (branchId?: string) => {
    const cacheKey = `schedule-${branchId || 'all'}`

    return deduplicateRequest(cacheKey, async () => {
      isLoading.value = true
      try {
        const params = new URLSearchParams()
        if (branchId) params.append('branch_id', branchId)

        const response = await $fetch<SchedulesResponse>(`${apiUrl}/gym/classes/schedule?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          schedules.value = response.data
        }
        return response.data
      } catch {
        return []
      } finally {
        isLoading.value = false
      }
    })
  }

  /**
   * Fetch upcoming sessions for a date range
   */
  const fetchUpcomingSessions = async (options?: {
    branchId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) => {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (options?.branchId) params.append('branch_id', options.branchId)
      if (options?.startDate) params.append('start_date', options.startDate)
      if (options?.endDate) params.append('end_date', options.endDate)
      if (options?.limit) params.append('limit', String(options.limit))

      const response = await $fetch<SessionsResponse>(`${apiUrl}/gym/classes/sessions?${params}`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        upcomingSessions.value = response.data
      }
      return response.data
    } catch {
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get a single session by ID
   */
  const getSession = async (sessionId: string): Promise<ClassSession | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: ClassSession }>(
        `${apiUrl}/gym/classes/sessions/${sessionId}`,
        { headers: getAuthHeader() }
      )
      return response.success ? response.data : null
    } catch {
      return null
    }
  }

  /**
   * Get schedules for a specific day of week
   */
  const getSchedulesByDay = (dayOfWeek: number) => {
    return schedules.value
      .filter(s => s.day_of_week === dayOfWeek && s.is_active)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  /**
   * Get sessions for a specific date
   */
  const getSessionsByDate = (date: string) => {
    return upcomingSessions.value
      .filter(s => s.session_date === date)
      .sort((a, b) => {
        const timeA = a.schedule?.start_time || ''
        const timeB = b.schedule?.start_time || ''
        return timeA.localeCompare(timeB)
      })
  }

  /**
   * Check if a session is full
   */
  const isSessionFull = (session: ClassSession): boolean => {
    const maxCapacity = session.class?.max_capacity || session.schedule?.class?.max_capacity || 0
    return session.current_count >= maxCapacity
  }

  /**
   * Get available spots for a session
   */
  const getAvailableSpots = (session: ClassSession): number => {
    const maxCapacity = session.class?.max_capacity || session.schedule?.class?.max_capacity || 0
    return Math.max(0, maxCapacity - session.current_count)
  }

  /**
   * Format time range for display
   */
  const formatTimeRange = (startTime: string, endTime: string): string => {
    return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`
  }

  /**
   * Get day name in Traditional Chinese
   */
  const getDayName = (dayOfWeek: number): string => {
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
    return days[dayOfWeek] || ''
  }

  /**
   * Get category label
   */
  const getCategoryLabel = (category?: string): string => {
    const labels: Record<string, string> = {
      'YOGA': '瑜珈',
      'PILATES': '皮拉提斯',
      'SPINNING': '飛輪',
      'AEROBICS': '有氧',
      'DANCE': '舞蹈',
      'STRENGTH': '重訓',
      'HIIT': 'HIIT',
      'BOXING': '拳擊',
      'SWIMMING': '游泳',
      'OTHER': '其他',
    }
    return labels[category || ''] || category || '其他'
  }

  /**
   * Get difficulty label
   */
  const getDifficultyLabel = (level?: string): string => {
    const labels: Record<string, string> = {
      'BEGINNER': '初級',
      'INTERMEDIATE': '中級',
      'ADVANCED': '高級',
      'ALL_LEVELS': '不限程度',
    }
    return labels[level || ''] || level || '不限'
  }

  return {
    classes,
    schedules,
    upcomingSessions,
    isLoading,
    fetchClasses,
    fetchWeeklySchedule,
    fetchUpcomingSessions,
    getSession,
    getSchedulesByDay,
    getSessionsByDate,
    isSessionFull,
    getAvailableSpots,
    formatTimeRange,
    getDayName,
    getCategoryLabel,
    getDifficultyLabel,
  }
}
