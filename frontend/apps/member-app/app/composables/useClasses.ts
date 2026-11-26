/**
 * useClasses composable
 * Handles fetching and managing gym classes and schedules
 */

import { deduplicateRequest } from '../utils/debounce'
import { getDayName } from '@gym-nexus/shared'

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
  schedule_id?: string | null
  schedule?: ClassSchedule
  session_date: string
  start_time: string // HH:MM:SS
  end_time: string
  room?: string | null
  max_capacity: number
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

// --- Backend payload (backend/src/routes/member-classes.ts, camelCase) ---

export interface ApiClassSession {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  room: string | null
  maxCapacity: number
  currentCount: number
  waitlistCount: number
  sessionStatus: ClassSession['session_status']
  cancelledReason: string | null
  class: {
    id: string
    name: string
    description: string | null
    category: string | null
    difficultyLevel: string | null
    durationMinutes: number
    imageUrl: string | null
  }
  instructor: { id: string; fullName: string } | null
  branch: { id: string; name: string } | null
}

interface SessionsResponse {
  success: boolean
  data: { sessions: ApiClassSession[] }
}

export function toClassSession(s: ApiClassSession): ClassSession {
  return {
    id: s.id,
    session_date: s.sessionDate,
    start_time: s.startTime,
    end_time: s.endTime,
    room: s.room,
    max_capacity: s.maxCapacity,
    current_count: s.currentCount,
    waitlist_count: s.waitlistCount,
    session_status: s.sessionStatus,
    cancellation_reason: s.cancelledReason ?? undefined,
    class: {
      id: s.class.id,
      name: s.class.name,
      description: s.class.description ?? undefined,
      duration_minutes: s.class.durationMinutes,
      max_capacity: s.maxCapacity,
      category: s.class.category ?? undefined,
      difficulty_level: s.class.difficultyLevel ?? undefined,
      status: 'ACTIVE',
    },
    instructor: s.instructor ? { id: s.instructor.id, full_name: s.instructor.fullName } : undefined,
    branch: s.branch ?? undefined,
  }
}

// Cache settings
const CACHE_KEY_CLASSES = 'member:classes'
const CACHE_KEY_SCHEDULE = 'member:class-schedule'
const CACHE_KEY_SESSIONS = 'member:class-sessions'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const CATEGORY_LABELS: Record<string, string> = {
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

const DIFFICULTY_LABELS: Record<string, string> = {
  'BEGINNER': '初級',
  'INTERMEDIATE': '中級',
  'ADVANCED': '高級',
  'ALL_LEVELS': '不限程度',
}

export const useClasses = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useMemberAuth()
  const { isOnline, getCache, setCache } = useOfflineSync()

  const classes = useState<GymClass[]>('gym_classes', () => [])
  const schedules = useState<ClassSchedule[]>('class_schedules', () => [])
  const upcomingSessions = useState<ClassSession[]>('upcoming_sessions', () => [])
  const isLoading = useState('classes_loading', () => false)
  const isOfflineData = useState('classes_is_offline', () => false)

  /**
   * Fetch all active classes (with request deduplication and offline cache)
   */
  const fetchClasses = async (branchId?: string) => {
    const dedupKey = `classes-${branchId || 'all'}`
    const cacheKey = `${CACHE_KEY_CLASSES}:${branchId || 'all'}`

    return deduplicateRequest(dedupKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      try {
        // If offline, try cached data
        if (!isOnline.value) {
          const cached = await getCache<GymClass[]>(cacheKey)
          if (cached) {
            classes.value = cached
            isOfflineData.value = true
            return cached
          }
          return []
        }

        const params = new URLSearchParams()
        if (branchId) params.append('branch_id', branchId)

        const response = await $fetch<ClassesResponse>(`${apiUrl}/api/member/classes?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          classes.value = response.data
          await setCache(cacheKey, response.data, CACHE_TTL)
        }
        return response.data
      } catch {
        // Network error fallback to cache
        const cached = await getCache<GymClass[]>(cacheKey)
        if (cached) {
          classes.value = cached
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
   * Fetch weekly schedule (with request deduplication and offline cache)
   */
  const fetchWeeklySchedule = async (branchId?: string) => {
    const dedupKey = `schedule-${branchId || 'all'}`
    const cacheKey = `${CACHE_KEY_SCHEDULE}:${branchId || 'all'}`

    return deduplicateRequest(dedupKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      try {
        // If offline, try cached data
        if (!isOnline.value) {
          const cached = await getCache<ClassSchedule[]>(cacheKey)
          if (cached) {
            schedules.value = cached
            isOfflineData.value = true
            return cached
          }
          return []
        }

        const params = new URLSearchParams()
        if (branchId) params.append('branch_id', branchId)

        const response = await $fetch<SchedulesResponse>(`${apiUrl}/api/member/classes/schedule?${params}`, {
          headers: getAuthHeader(),
        })

        if (response.success) {
          schedules.value = response.data
          await setCache(cacheKey, response.data, CACHE_TTL)
        }
        return response.data
      } catch {
        // Network error fallback to cache
        const cached = await getCache<ClassSchedule[]>(cacheKey)
        if (cached) {
          schedules.value = cached
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
   * Fetch upcoming sessions for a date range (with offline cache)
   */
  const fetchUpcomingSessions = async (options?: {
    branchId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) => {
    const dedupKey = `member:upcomingSessions:${JSON.stringify(options || {})}`
    return deduplicateRequest(dedupKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      const cacheKey = `${CACHE_KEY_SESSIONS}:${JSON.stringify(options || {})}`

      try {
        // If offline, try cached data
        if (!isOnline.value) {
          const cached = await getCache<ClassSession[]>(cacheKey)
          if (cached) {
            upcomingSessions.value = cached
            isOfflineData.value = true
            return cached
          }
          return []
        }

        const params = new URLSearchParams()
        if (options?.branchId) params.append('branchId', options.branchId)
        if (options?.startDate) params.append('startDate', options.startDate)
        if (options?.endDate) params.append('endDate', options.endDate)
        if (options?.limit) params.append('limit', String(options.limit))

        const response = await $fetch<SessionsResponse>(`${apiUrl}/api/member/classes/sessions?${params}`, {
          headers: getAuthHeader(),
        })

        if (!response.success) return []
        const sessions = response.data.sessions.map(toClassSession)
        upcomingSessions.value = sessions
        await setCache(cacheKey, sessions, CACHE_TTL)
        return sessions
      } catch {
        // Network error fallback to cache
        const cached = await getCache<ClassSession[]>(cacheKey)
        if (cached) {
          upcomingSessions.value = cached
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
   * Get a single session by ID
   */
  const getSession = async (sessionId: string): Promise<ClassSession | null> => {
    return deduplicateRequest(`member:session:${sessionId}`, async () => {
      try {
        const response = await $fetch<{ success: boolean; data: { session: ApiClassSession } }>(
          `${apiUrl}/api/member/classes/sessions/${sessionId}`,
          { headers: getAuthHeader() }
        )
        return response.success ? toClassSession(response.data.session) : null
      } catch {
        return null
      }
    })
  }

  const schedulesByDayMap = computed(() => {
    const map = new Map<number, ClassSchedule[]>()
    for (const s of schedules.value) {
      if (!s.is_active) continue
      let list = map.get(s.day_of_week)
      if (!list) {
        list = []
        map.set(s.day_of_week, list)
      }
      list.push(s)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  })

  /**
   * Get schedules for a specific day of week (O(1) memoized lookup)
   */
  const getSchedulesByDay = (dayOfWeek: number) => {
    return schedulesByDayMap.value.get(dayOfWeek) || []
  }

  const sessionsByDateMap = computed(() => {
    const map = new Map<string, ClassSession[]>()
    for (const s of upcomingSessions.value) {
      let list = map.get(s.session_date)
      if (!list) {
        list = []
        map.set(s.session_date, list)
      }
      list.push(s)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    }
    return map
  })

  /**
   * Get sessions for a specific date (O(1) memoized lookup)
   */
  const getSessionsByDate = (date: string) => {
    return sessionsByDateMap.value.get(date) || []
  }

  /**
   * Check if a session is full
   */
  const isSessionFull = (session: ClassSession): boolean => {
    return session.current_count >= session.max_capacity
  }

  /**
   * Get available spots for a session
   */
  const getAvailableSpots = (session: ClassSession): number => {
    return Math.max(0, session.max_capacity - session.current_count)
  }

  /**
   * Format time range for display
   */
  const formatTimeRange = (startTime: string, endTime: string): string => {
    return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`
  }

  /**
   * Get category label
   */
  const getCategoryLabel = (category?: string): string => {
    return CATEGORY_LABELS[category || ''] || category || '其他'
  }

  /**
   * Get difficulty label
   */
  const getDifficultyLabel = (level?: string): string => {
    return DIFFICULTY_LABELS[level || ''] || level || '不限'
  }

  return {
    classes,
    schedules,
    upcomingSessions,
    isLoading,
    isOfflineData,
    isOnline,
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
