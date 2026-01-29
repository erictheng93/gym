/**
 * useWorkouts composable
 * Handles workout logging with offline caching
 */

import type { Exercise, WorkoutStatsPeriod } from '../schemas/workout.schema'
import { extractErrorMessage } from '../utils/apiHelpers'

// Cache settings
const CACHE_KEY_WORKOUTS = 'member:workouts'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface Workout {
  id: string
  member_id: string
  date: string
  duration: number | null
  calories: number | null
  exercises: Exercise[] | null
  notes: string | null
  created_at: string
}

export interface WorkoutStats {
  period: WorkoutStatsPeriod
  total_workouts: number
  total_duration: number
  total_calories: number
  avg_duration: number
  avg_calories: number
  workout_days: number
}

export interface DailyWorkoutData {
  date: string
  duration: number
  calories: number
  count: number
}

interface WorkoutResult {
  success: boolean
  message: string
  data?: Workout
}

interface WorkoutsResponse {
  success: boolean
  data: Workout[]
  total: number
}

interface StatsResponse {
  success: boolean
  data: {
    stats: WorkoutStats
    daily: DailyWorkoutData[]
  }
}

export const useWorkouts = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader, member } = useMemberAuth()
  const { isOnline, getCache, setCache } = useOfflineSync()

  const workouts = useState<Workout[]>('member_workouts', () => [])
  const totalWorkouts = useState<number>('member_workouts_total', () => 0)
  const stats = useState<WorkoutStats | null>('member_workout_stats', () => null)
  const dailyData = useState<DailyWorkoutData[]>('member_workout_daily', () => [])
  const isLoading = useState('workouts_loading', () => false)
  const isOfflineData = useState('workouts_is_offline', () => false)

  /**
   * Fetch member's workout logs with pagination
   */
  const fetchWorkouts = async (options?: {
    start_date?: string
    end_date?: string
    limit?: number
    offset?: number
  }) => {
    if (!member.value) return []

    isLoading.value = true
    isOfflineData.value = false

    const cacheKey = `${CACHE_KEY_WORKOUTS}:${member.value.id}:${JSON.stringify(options || {})}`

    try {
      // If offline, try cached data
      if (!isOnline.value) {
        const cached = await getCache<Workout[]>(cacheKey)
        if (cached) {
          workouts.value = cached
          isOfflineData.value = true
          return cached
        }
        return []
      }

      const params = new URLSearchParams()
      if (options?.start_date) params.append('start_date', options.start_date)
      if (options?.end_date) params.append('end_date', options.end_date)
      if (options?.limit) params.append('limit', String(options.limit))
      if (options?.offset) params.append('offset', String(options.offset))

      const response = await $fetch<WorkoutsResponse>(`${apiUrl}/gym/workouts?${params}`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        workouts.value = response.data
        totalWorkouts.value = response.total
        await setCache(cacheKey, response.data, CACHE_TTL)
      }
      return response.data
    } catch {
      // Try cached data on network error
      const cached = await getCache<Workout[]>(cacheKey)
      if (cached) {
        workouts.value = cached
        isOfflineData.value = true
        return cached
      }
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get a single workout by ID
   */
  const getWorkout = async (id: string): Promise<Workout | null> => {
    if (!member.value) return null

    try {
      const response = await $fetch<{ success: boolean; data: Workout }>(
        `${apiUrl}/gym/workouts/${id}`,
        { headers: getAuthHeader() }
      )

      return response.success ? response.data : null
    } catch {
      return null
    }
  }

  /**
   * Get workout statistics
   */
  const fetchStats = async (period: WorkoutStatsPeriod = 'week'): Promise<WorkoutStats | null> => {
    if (!member.value) return null

    try {
      const response = await $fetch<StatsResponse>(
        `${apiUrl}/gym/workouts/stats?period=${period}`,
        { headers: getAuthHeader() }
      )

      if (response.success) {
        stats.value = response.data.stats
        dailyData.value = response.data.daily
      }
      return response.data.stats
    } catch {
      return null
    }
  }

  /**
   * Record a new workout
   */
  const createWorkout = async (data: {
    date?: string
    duration?: number | null
    calories?: number | null
    exercises?: Exercise[]
    notes?: string
  }): Promise<WorkoutResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<WorkoutResult>(`${apiUrl}/gym/workouts`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        workouts.value.unshift(response.data)
        totalWorkouts.value++
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '記錄運動失敗'),
      }
    }
  }

  /**
   * Update a workout
   */
  const updateWorkout = async (
    id: string,
    data: {
      date?: string
      duration?: number | null
      calories?: number | null
      exercises?: Exercise[]
      notes?: string
    }
  ): Promise<WorkoutResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<WorkoutResult>(`${apiUrl}/gym/workouts/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        const index = workouts.value.findIndex(w => w.id === id)
        if (index !== -1) {
          workouts.value[index] = response.data
        }
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '更新運動記錄失敗'),
      }
    }
  }

  /**
   * Delete a workout
   */
  const deleteWorkout = async (id: string): Promise<WorkoutResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<WorkoutResult>(`${apiUrl}/gym/workouts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        workouts.value = workouts.value.filter(w => w.id !== id)
        totalWorkouts.value = Math.max(0, totalWorkouts.value - 1)
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '刪除運動記錄失敗'),
      }
    }
  }

  /**
   * Format workout date for display
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
    const month = date.getMonth() + 1
    const day = date.getDate()
    const dayName = days[date.getDay()]
    return `${month}/${day} (${dayName})`
  }

  /**
   * Format duration for display
   */
  const formatDuration = (minutes: number | null): string => {
    if (!minutes) return '-'
    if (minutes < 60) return `${minutes} 分鐘`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours} 小時 ${mins} 分鐘` : `${hours} 小時`
  }

  /**
   * Format calories for display
   */
  const formatCalories = (calories: number | null): string => {
    if (!calories) return '-'
    return `${calories} 大卡`
  }

  /**
   * Get recent workouts (last 7 days)
   */
  const recentWorkouts = computed(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return workouts.value.filter(w => new Date(w.date) >= weekAgo)
  })

  /**
   * Check if member has workout today
   */
  const hasWorkoutToday = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    return workouts.value.some(w => w.date === today)
  })

  return {
    workouts,
    totalWorkouts,
    stats,
    dailyData,
    isLoading,
    isOfflineData,
    isOnline,
    recentWorkouts,
    hasWorkoutToday,
    fetchWorkouts,
    getWorkout,
    fetchStats,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    formatDate,
    formatDuration,
    formatCalories,
  }
}
