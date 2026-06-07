/**
 * Tests for useGoals composable
 *
 * Tests goal CRUD, offline caching, progress calculation, and computed properties
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state stores
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock member data
const mockMember = {
  id: 'member-1',
  member_code: 'M001',
  full_name: 'Test User',
}

// Mock goal data
const mockGoalInProgress = {
  id: 'goal-1',
  member_id: 'member-1',
  goal_type: 'WEIGHT_LOSS' as const,
  target_value: { value: 70, unit: 'kg', initial: 80 },
  current_value: { value: 75, unit: 'kg' },
  start_date: '2024-01-01',
  target_date: '2024-06-30',
  status: 'IN_PROGRESS' as const,
  notes: 'Lose 10kg',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

const mockGoalAchieved = {
  id: 'goal-2',
  member_id: 'member-1',
  goal_type: 'MUSCLE_GAIN' as const,
  target_value: { value: 50, unit: 'kg' },
  current_value: { value: 50, unit: 'kg' },
  start_date: '2024-01-01',
  target_date: '2024-03-31',
  status: 'ACHIEVED' as const,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-03-15T00:00:00Z',
}

const mockGoalAbandoned = {
  id: 'goal-3',
  member_id: 'member-1',
  goal_type: 'HEALTH' as const,
  target_value: { value: 30, unit: 'min' },
  current_value: null,
  start_date: '2024-01-01',
  target_date: null,
  status: 'ABANDONED' as const,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-02-01T00:00:00Z',
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('useCookie', (name: string) => {
  if (!cookieStore.has(name)) {
    cookieStore.set(name, { value: null })
  }
  return cookieStore.get(name)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useMemberAuth
const mockMemberRef = { value: mockMember }
const mockGetAuthHeader = vi.fn(() => ({ 'X-Member-Token': 'test-token' }))

vi.stubGlobal('useMemberAuth', () => ({
  member: mockMemberRef,
  getAuthHeader: mockGetAuthHeader,
}))

// Mock useOfflineSync
const mockIsOnline = { value: true }
const mockGetCache = vi.fn().mockResolvedValue(null)
const mockSetCache = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('useOfflineSync', () => ({
  isOnline: mockIsOnline,
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

// Import after mocks
import { useGoals } from './useGoals'

describe('useGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockMemberRef.value = mockMember
    mockIsOnline.value = true
    mockGetCache.mockResolvedValue(null)
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const g = useGoals()

      expect(g.goals).toBeDefined()
      expect(g.isLoading).toBeDefined()
      expect(g.isOfflineData).toBeDefined()
      expect(g.goals.value).toEqual([])
    })

    it('should expose all required methods', () => {
      const g = useGoals()

      expect(typeof g.fetchGoals).toBe('function')
      expect(typeof g.getGoal).toBe('function')
      expect(typeof g.createGoal).toBe('function')
      expect(typeof g.updateGoal).toBe('function')
      expect(typeof g.deleteGoal).toBe('function')
      expect(typeof g.calculateProgress).toBe('function')
    })

    it('should expose computed properties', () => {
      const g = useGoals()

      expect(g.activeGoals).toBeDefined()
      expect(g.achievedGoals).toBeDefined()
      expect(g.abandonedGoals).toBeDefined()
    })
  })

  describe('fetchGoals', () => {
    it('should return empty array when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchGoals } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch goals successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockGoalInProgress, mockGoalAchieved],
      })

      const { fetchGoals, goals, isLoading } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([mockGoalInProgress, mockGoalAchieved])
      expect(goals.value).toEqual([mockGoalInProgress, mockGoalAchieved])
      expect(isLoading.value).toBe(false)
    })

    it('should pass filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchGoals } = useGoals()
      await fetchGoals({ status: 'IN_PROGRESS', limit: 10, offset: 5 })

      const url = mockFetch.mock.calls[0]![0] as string
      expect(url).toContain('status=IN_PROGRESS')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=5')
    })

    it('should cache data after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockGoalInProgress],
      })

      const { fetchGoals } = useGoals()
      await fetchGoals()

      expect(mockSetCache).toHaveBeenCalledWith(
        expect.any(String),
        [mockGoalInProgress],
        5 * 60 * 1000
      )
    })

    it('should use cached data when offline', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce([mockGoalInProgress])

      const { fetchGoals, goals, isOfflineData } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([mockGoalInProgress])
      expect(goals.value).toEqual([mockGoalInProgress])
      expect(isOfflineData.value).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return empty array when offline with no cache', async () => {
      mockIsOnline.value = false

      const { fetchGoals } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([])
    })

    it('should fall back to cache on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce([mockGoalInProgress])

      const { fetchGoals, isOfflineData } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([mockGoalInProgress])
      expect(isOfflineData.value).toBe(true)
    })

    it('should return empty array on network error with no cache', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchGoals } = useGoals()
      const result = await fetchGoals()

      expect(result).toEqual([])
    })

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [] }), 50)
        })
      )

      const { fetchGoals, isLoading } = useGoals()
      const promise = fetchGoals()

      expect(isLoading.value).toBe(true)

      await promise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('getGoal', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { getGoal } = useGoals()
      const result = await getGoal('goal-1')

      expect(result).toBeNull()
    })

    it('should fetch a single goal', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: mockGoalInProgress })

      const { getGoal } = useGoals()
      const result = await getGoal('goal-1')

      expect(result).toEqual(mockGoalInProgress)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/goals/goal-1',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
    })

    it('should return null on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { getGoal } = useGoals()
      const result = await getGoal('goal-1')

      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getGoal } = useGoals()
      const result = await getGoal('goal-1')

      expect(result).toBeNull()
    })
  })

  describe('createGoal', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { createGoal } = useGoals()
      const result = await createGoal({
        goal_type: 'WEIGHT_LOSS',
        target_value: { value: 70 },
      })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should create goal successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Created',
        data: mockGoalInProgress,
      })

      const { createGoal, goals } = useGoals()
      const result = await createGoal({
        goal_type: 'WEIGHT_LOSS',
        target_value: { value: 70 },
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockGoalInProgress)
      expect(goals.value[0]).toEqual(mockGoalInProgress)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/goals',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Member-Token': 'test-token' },
          body: expect.objectContaining({ goal_type: 'WEIGHT_LOSS' }),
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'))

      const { createGoal } = useGoals()
      const result = await createGoal({
        goal_type: 'WEIGHT_LOSS',
        target_value: { value: 70 },
      })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('updateGoal', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { updateGoal } = useGoals()
      const result = await updateGoal('goal-1', { status: 'ACHIEVED' })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should update goal and local state', async () => {
      const updatedGoal = { ...mockGoalInProgress, status: 'ACHIEVED' as const }
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        data: updatedGoal,
      })

      stateStore.set('member_goals', { value: [mockGoalInProgress] })

      const { updateGoal, goals } = useGoals()
      const result = await updateGoal('goal-1', { status: 'ACHIEVED' })

      expect(result.success).toBe(true)
      expect(goals.value[0]!.status).toBe('ACHIEVED')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/goals/goal-1',
        expect.objectContaining({
          method: 'PUT',
          body: { status: 'ACHIEVED' },
        })
      )
    })

    it('should handle update error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'))

      const { updateGoal } = useGoals()
      const result = await updateGoal('goal-1', { status: 'ACHIEVED' })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('deleteGoal', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { deleteGoal } = useGoals()
      const result = await deleteGoal('goal-1')

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should delete goal and update local state', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Deleted' })

      stateStore.set('member_goals', {
        value: [mockGoalInProgress, mockGoalAchieved],
      })

      const { deleteGoal, goals } = useGoals()
      const result = await deleteGoal('goal-1')

      expect(result.success).toBe(true)
      expect(goals.value).toHaveLength(1)
      expect(goals.value[0]!.id).toBe('goal-2')
    })

    it('should not remove from local state on failure', async () => {
      mockFetch.mockResolvedValueOnce({ success: false, message: 'Not found' })

      stateStore.set('member_goals', { value: [mockGoalInProgress] })

      const { deleteGoal, goals } = useGoals()
      await deleteGoal('goal-1')

      expect(goals.value).toHaveLength(1)
    })

    it('should handle delete error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteGoal } = useGoals()
      const result = await deleteGoal('goal-1')

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('calculateProgress', () => {
    it('should return 0 when no current value', () => {
      const { calculateProgress } = useGoals()

      const goal = {
        ...mockGoalInProgress,
        current_value: null,
      }

      expect(calculateProgress(goal)).toBe(0)
    })

    it('should return 0 when target is 0', () => {
      const { calculateProgress } = useGoals()

      const goal = {
        ...mockGoalInProgress,
        goal_type: 'MUSCLE_GAIN' as const,
        target_value: { value: 0 },
        current_value: { value: 10 },
      }

      expect(calculateProgress(goal)).toBe(0)
    })

    it('should calculate weight loss progress correctly', () => {
      const { calculateProgress } = useGoals()

      // Initial: 80, Target: 70, Current: 75 → 50% progress
      const goal = {
        ...mockGoalInProgress,
        goal_type: 'WEIGHT_LOSS' as const,
        target_value: { value: 70, initial: 80 },
        current_value: { value: 75 },
      }

      expect(calculateProgress(goal)).toBe(50)
    })

    it('should calculate muscle gain progress correctly', () => {
      const { calculateProgress } = useGoals()

      // Target: 50, Current: 25 → 50%
      const goal = {
        ...mockGoalInProgress,
        goal_type: 'MUSCLE_GAIN' as const,
        target_value: { value: 50 },
        current_value: { value: 25 },
      }

      expect(calculateProgress(goal)).toBe(50)
    })

    it('should cap progress at 100%', () => {
      const { calculateProgress } = useGoals()

      const goal = {
        ...mockGoalInProgress,
        goal_type: 'MUSCLE_GAIN' as const,
        target_value: { value: 50 },
        current_value: { value: 60 },
      }

      expect(calculateProgress(goal)).toBe(100)
    })

    it('should floor progress at 0%', () => {
      const { calculateProgress } = useGoals()

      // Weight loss: initial 80, target 70, current 85 → negative progress → 0
      const goal = {
        ...mockGoalInProgress,
        goal_type: 'WEIGHT_LOSS' as const,
        target_value: { value: 70, initial: 80 },
        current_value: { value: 85 },
      }

      expect(calculateProgress(goal)).toBe(0)
    })
  })

  describe('computed properties', () => {
    it('activeGoals should filter IN_PROGRESS goals', () => {
      stateStore.set('member_goals', {
        value: [mockGoalInProgress, mockGoalAchieved, mockGoalAbandoned],
      })

      const { activeGoals } = useGoals()

      expect(activeGoals.value).toHaveLength(1)
      expect(activeGoals.value[0]!.id).toBe('goal-1')
    })

    it('achievedGoals should filter ACHIEVED goals', () => {
      stateStore.set('member_goals', {
        value: [mockGoalInProgress, mockGoalAchieved, mockGoalAbandoned],
      })

      const { achievedGoals } = useGoals()

      expect(achievedGoals.value).toHaveLength(1)
      expect(achievedGoals.value[0]!.id).toBe('goal-2')
    })

    it('abandonedGoals should filter ABANDONED goals', () => {
      stateStore.set('member_goals', {
        value: [mockGoalInProgress, mockGoalAchieved, mockGoalAbandoned],
      })

      const { abandonedGoals } = useGoals()

      expect(abandonedGoals.value).toHaveLength(1)
      expect(abandonedGoals.value[0]!.id).toBe('goal-3')
    })

    it('should return empty arrays when no goals', () => {
      stateStore.set('member_goals', { value: [] })

      const { activeGoals, achievedGoals, abandonedGoals } = useGoals()

      expect(activeGoals.value).toHaveLength(0)
      expect(achievedGoals.value).toHaveLength(0)
      expect(abandonedGoals.value).toHaveLength(0)
    })
  })
})
