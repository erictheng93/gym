/**
 * useGoals composable
 * Handles fitness goal management with offline caching
 */

import type { GoalType, GoalStatus } from '../schemas/goal.schema'
import { extractErrorMessage } from '../utils/apiHelpers'

// Cache settings
const CACHE_KEY_GOALS = 'member:goals'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface Goal {
  id: string
  member_id: string
  goal_type: GoalType
  target_value: Record<string, unknown>
  current_value: Record<string, unknown> | null
  start_date: string
  target_date: string | null
  status: GoalStatus
  notes: string | null
  created_at: string
  updated_at: string
}

interface GoalResult {
  success: boolean
  message: string
  data?: Goal
}

interface GoalsResponse {
  success: boolean
  data: Goal[]
}

export const useGoals = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.directusUrl
  const { getAuthHeader, member } = useMemberAuth()
  const { isOnline, getCache, setCache } = useOfflineSync()

  const goals = useState<Goal[]>('member_goals', () => [])
  const isLoading = useState('goals_loading', () => false)
  const isOfflineData = useState('goals_is_offline', () => false)

  /**
   * Fetch member's goals with optional filters
   */
  const fetchGoals = async (options?: {
    status?: GoalStatus
    limit?: number
    offset?: number
  }) => {
    if (!member.value) return []

    isLoading.value = true
    isOfflineData.value = false

    const cacheKey = `${CACHE_KEY_GOALS}:${member.value.id}:${JSON.stringify(options || {})}`

    try {
      // If offline, try cached data
      if (!isOnline.value) {
        const cached = await getCache<Goal[]>(cacheKey)
        if (cached) {
          goals.value = cached
          isOfflineData.value = true
          return cached
        }
        return []
      }

      const params = new URLSearchParams()
      if (options?.status) params.append('status', options.status)
      if (options?.limit) params.append('limit', String(options.limit))
      if (options?.offset) params.append('offset', String(options.offset))

      const response = await $fetch<GoalsResponse>(`${apiUrl}/gym/goals?${params}`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        goals.value = response.data
        await setCache(cacheKey, response.data, CACHE_TTL)
      }
      return response.data
    } catch {
      // Try cached data on network error
      const cached = await getCache<Goal[]>(cacheKey)
      if (cached) {
        goals.value = cached
        isOfflineData.value = true
        return cached
      }
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get a single goal by ID
   */
  const getGoal = async (id: string): Promise<Goal | null> => {
    if (!member.value) return null

    try {
      const response = await $fetch<{ success: boolean; data: Goal }>(`${apiUrl}/gym/goals/${id}`, {
        headers: getAuthHeader(),
      })

      return response.success ? response.data : null
    } catch {
      return null
    }
  }

  /**
   * Create a new goal
   */
  const createGoal = async (data: {
    goal_type: GoalType
    target_value: Record<string, unknown>
    current_value?: Record<string, unknown>
    start_date?: string
    target_date?: string
    notes?: string
  }): Promise<GoalResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<GoalResult>(`${apiUrl}/gym/goals`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        goals.value.unshift(response.data)
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '建立目標失敗'),
      }
    }
  }

  /**
   * Update a goal
   */
  const updateGoal = async (
    id: string,
    data: {
      current_value?: Record<string, unknown>
      target_value?: Record<string, unknown>
      target_date?: string | null
      status?: GoalStatus
      notes?: string
    }
  ): Promise<GoalResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<GoalResult>(`${apiUrl}/gym/goals/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        const index = goals.value.findIndex(g => g.id === id)
        if (index !== -1) {
          goals.value[index] = response.data
        }
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '更新目標失敗'),
      }
    }
  }

  /**
   * Delete a goal
   */
  const deleteGoal = async (id: string): Promise<GoalResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<GoalResult>(`${apiUrl}/gym/goals/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        goals.value = goals.value.filter(g => g.id !== id)
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '刪除目標失敗'),
      }
    }
  }

  /**
   * Calculate progress percentage for a goal
   */
  const calculateProgress = (goal: Goal): number => {
    const current = goal.current_value?.value as number | undefined
    const target = goal.target_value?.value as number | undefined

    if (current === undefined || target === undefined || target === 0) {
      return 0
    }

    // For weight loss, progress is inverse
    if (goal.goal_type === 'WEIGHT_LOSS') {
      const initial = goal.target_value?.initial as number | undefined
      if (initial !== undefined) {
        const totalLoss = initial - target
        const currentLoss = initial - current
        return Math.min(100, Math.max(0, (currentLoss / totalLoss) * 100))
      }
    }

    // For muscle gain and other goals
    return Math.min(100, Math.max(0, (current / target) * 100))
  }

  /**
   * Get goals by status
   */
  const activeGoals = computed(() => goals.value.filter(g => g.status === 'IN_PROGRESS'))
  const achievedGoals = computed(() => goals.value.filter(g => g.status === 'ACHIEVED'))
  const abandonedGoals = computed(() => goals.value.filter(g => g.status === 'ABANDONED'))

  return {
    goals,
    isLoading,
    isOfflineData,
    isOnline,
    activeGoals,
    achievedGoals,
    abandonedGoals,
    fetchGoals,
    getGoal,
    createGoal,
    updateGoal,
    deleteGoal,
    calculateProgress,
  }
}
