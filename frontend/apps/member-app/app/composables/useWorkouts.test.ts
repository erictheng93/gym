/**
 * Tests for useWorkouts composable
 *
 * Tests workout CRUD, offline caching, helper functions, and computed properties
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
  phone: '0912345678',
  email: 'test@example.com',
}

// Mock workout data
const mockWorkout = {
  id: 'workout-1',
  member_id: 'member-1',
  date: new Date().toISOString().split('T')[0],
  duration: 60,
  calories: 300,
  exercises: [{ name: '跑步機', sets: undefined, reps: undefined, duration: 30 }],
  notes: 'Test workout',
  created_at: '2024-01-15T10:00:00Z',
}

const mockWorkout2 = {
  id: 'workout-2',
  member_id: 'member-1',
  date: '2024-01-10',
  duration: 45,
  calories: 200,
  exercises: null,
  notes: null,
  created_at: '2024-01-10T10:00:00Z',
}

const mockStats = {
  period: 'week' as const,
  total_workouts: 5,
  total_duration: 300,
  total_calories: 1500,
  avg_duration: 60,
  avg_calories: 300,
  workout_days: 5,
}

const mockDailyData = [
  { date: '2024-01-15', duration: 60, calories: 300, count: 1 },
  { date: '2024-01-14', duration: 45, calories: 200, count: 1 },
]

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
const mockQueueCreateWorkout = vi.fn().mockResolvedValue('queue-id-1')
const mockQueueUpdateWorkout = vi.fn().mockResolvedValue('queue-id-2')
const mockQueueDeleteWorkout = vi.fn().mockResolvedValue('queue-id-3')

vi.stubGlobal('useOfflineSync', () => ({
  isOnline: mockIsOnline,
  getCache: mockGetCache,
  setCache: mockSetCache,
  queueCreateWorkout: mockQueueCreateWorkout,
  queueUpdateWorkout: mockQueueUpdateWorkout,
  queueDeleteWorkout: mockQueueDeleteWorkout,
}))

// Import after mocks
import { useWorkouts } from './useWorkouts'

describe('useWorkouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockMemberRef.value = mockMember
    mockIsOnline.value = true
    mockGetCache.mockResolvedValue(null)
    mockQueueCreateWorkout.mockResolvedValue('queue-id-1')
    mockQueueUpdateWorkout.mockResolvedValue('queue-id-2')
    mockQueueDeleteWorkout.mockResolvedValue('queue-id-3')
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const w = useWorkouts()

      expect(w.workouts).toBeDefined()
      expect(w.totalWorkouts).toBeDefined()
      expect(w.stats).toBeDefined()
      expect(w.dailyData).toBeDefined()
      expect(w.isLoading).toBeDefined()
      expect(w.isOfflineData).toBeDefined()
    })

    it('should expose all required methods', () => {
      const w = useWorkouts()

      expect(typeof w.fetchWorkouts).toBe('function')
      expect(typeof w.getWorkout).toBe('function')
      expect(typeof w.fetchStats).toBe('function')
      expect(typeof w.createWorkout).toBe('function')
      expect(typeof w.updateWorkout).toBe('function')
      expect(typeof w.deleteWorkout).toBe('function')
      expect(typeof w.formatDate).toBe('function')
      expect(typeof w.formatDuration).toBe('function')
      expect(typeof w.formatCalories).toBe('function')
    })

    it('should expose computed properties', () => {
      const w = useWorkouts()

      expect(w.recentWorkouts).toBeDefined()
      expect(w.hasWorkoutToday).toBeDefined()
    })
  })

  describe('fetchWorkouts', () => {
    it('should return empty array when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchWorkouts } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch workouts successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockWorkout, mockWorkout2],
        total: 2,
      })

      const { fetchWorkouts, workouts, totalWorkouts, isLoading } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([mockWorkout, mockWorkout2])
      expect(workouts.value).toEqual([mockWorkout, mockWorkout2])
      expect(totalWorkouts.value).toBe(2)
      expect(isLoading.value).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/member/workouts?'),
        { headers: { 'X-Member-Token': 'test-token' } }
      )
    })

    it('should pass filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockWorkout],
        total: 1,
      })

      const { fetchWorkouts } = useWorkouts()
      await fetchWorkouts({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        limit: 10,
        offset: 5,
      })

      const url = mockFetch.mock.calls[0]![0] as string
      expect(url).toContain('start_date=2024-01-01')
      expect(url).toContain('end_date=2024-01-31')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=5')
    })

    it('should cache data after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockWorkout],
        total: 1,
      })

      const { fetchWorkouts } = useWorkouts()
      await fetchWorkouts()

      expect(mockSetCache).toHaveBeenCalledWith(
        expect.any(String),
        [mockWorkout],
        5 * 60 * 1000
      )
    })

    it('should use cached data when offline', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce([mockWorkout])

      const { fetchWorkouts, workouts, isOfflineData } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([mockWorkout])
      expect(workouts.value).toEqual([mockWorkout])
      expect(isOfflineData.value).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return empty array when offline with no cache', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce(null)

      const { fetchWorkouts } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([])
    })

    it('should fall back to cache on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce([mockWorkout])

      const { fetchWorkouts, isOfflineData } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([mockWorkout])
      expect(isOfflineData.value).toBe(true)
    })

    it('should return empty array on network error with no cache', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce(null)

      const { fetchWorkouts } = useWorkouts()
      const result = await fetchWorkouts()

      expect(result).toEqual([])
    })

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [], total: 0 }), 50)
        })
      )

      const { fetchWorkouts, isLoading } = useWorkouts()
      const promise = fetchWorkouts()

      expect(isLoading.value).toBe(true)

      await promise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('getWorkout', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { getWorkout } = useWorkouts()
      const result = await getWorkout('workout-1')

      expect(result).toBeNull()
    })

    it('should fetch a single workout', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: mockWorkout })

      const { getWorkout } = useWorkouts()
      const result = await getWorkout('workout-1')

      expect(result).toEqual(mockWorkout)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/workouts/workout-1',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
    })

    it('should return null on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({ success: false })

      const { getWorkout } = useWorkouts()
      const result = await getWorkout('workout-1')

      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getWorkout } = useWorkouts()
      const result = await getWorkout('workout-1')

      expect(result).toBeNull()
    })
  })

  describe('fetchStats', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchStats } = useWorkouts()
      const result = await fetchStats()

      expect(result).toBeNull()
    })

    it('should fetch stats with default period', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { stats: mockStats, daily: mockDailyData },
      })

      const { fetchStats, stats, dailyData } = useWorkouts()
      const result = await fetchStats()

      expect(result).toEqual(mockStats)
      expect(stats.value).toEqual(mockStats)
      expect(dailyData.value).toEqual(mockDailyData)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/workouts/stats?period=week',
        expect.any(Object)
      )
    })

    it('should fetch stats with specified period', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { stats: mockStats, daily: mockDailyData },
      })

      const { fetchStats } = useWorkouts()
      await fetchStats('month')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/workouts/stats?period=month',
        expect.any(Object)
      )
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'))

      const { fetchStats } = useWorkouts()
      const result = await fetchStats()

      expect(result).toBeNull()
    })
  })

  describe('createWorkout', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { createWorkout } = useWorkouts()
      const result = await createWorkout({ duration: 60 })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should create workout successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Created',
        data: mockWorkout,
      })

      const { createWorkout, workouts, totalWorkouts } = useWorkouts()
      const result = await createWorkout({
        duration: 60,
        calories: 300,
        exercises: [{ name: '跑步機' }],
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockWorkout)
      expect(workouts.value[0]).toEqual(mockWorkout)
      expect(totalWorkouts.value).toBe(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/workouts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Member-Token': 'test-token' },
          body: expect.objectContaining({ duration: 60, calories: 300 }),
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'))
      mockQueueCreateWorkout.mockRejectedValueOnce(new Error('IndexedDB not available'))

      const { createWorkout } = useWorkouts()
      const result = await createWorkout({ duration: 60 })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })

    it('should queue workout when offline', async () => {
      mockIsOnline.value = false

      const { createWorkout, workouts, totalWorkouts } = useWorkouts()
      const result = await createWorkout({ duration: 60, calories: 300 })

      expect(result.success).toBe(true)
      expect(result.message).toBe('已排入待同步')
      expect(result.data?.id).toMatch(/^pending-/)
      expect(workouts.value).toHaveLength(1)
      expect(totalWorkouts.value).toBe(1)
      expect(mockQueueCreateWorkout).toHaveBeenCalledWith(
        { duration: 60, calories: 300 },
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fallback to queue on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { createWorkout, workouts } = useWorkouts()
      const result = await createWorkout({ duration: 60 })

      expect(result.success).toBe(true)
      expect(result.message).toBe('網路異常，已排入待同步')
      expect(workouts.value).toHaveLength(1)
      expect(mockQueueCreateWorkout).toHaveBeenCalled()
    })
  })

  describe('updateWorkout', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { updateWorkout } = useWorkouts()
      const result = await updateWorkout('workout-1', { duration: 90 })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should update workout and local state', async () => {
      const updatedWorkout = { ...mockWorkout, duration: 90 }
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Updated',
        data: updatedWorkout,
      })

      // Pre-populate workouts
      stateStore.set('member_workouts', { value: [mockWorkout, mockWorkout2] })

      const { updateWorkout, workouts } = useWorkouts()
      const result = await updateWorkout('workout-1', { duration: 90 })

      expect(result.success).toBe(true)
      expect(workouts.value[0]).toEqual(updatedWorkout)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/workouts/workout-1',
        expect.objectContaining({
          method: 'PUT',
          body: { duration: 90 },
        })
      )
    })

    it('should handle update error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'))
      mockQueueUpdateWorkout.mockRejectedValueOnce(new Error('IndexedDB not available'))

      const { updateWorkout } = useWorkouts()
      const result = await updateWorkout('workout-1', { duration: 90 })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })

    it('should queue update when offline', async () => {
      mockIsOnline.value = false
      stateStore.set('member_workouts', { value: [{ ...mockWorkout }] })

      const { updateWorkout, workouts } = useWorkouts()
      const result = await updateWorkout('workout-1', { duration: 90 })

      expect(result.success).toBe(true)
      expect(result.message).toBe('已排入待同步')
      expect(workouts.value[0]!.duration).toBe(90)
      expect(mockQueueUpdateWorkout).toHaveBeenCalledWith(
        'workout-1',
        { duration: 90 },
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fallback to queue on network error during update', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      stateStore.set('member_workouts', { value: [{ ...mockWorkout }] })

      const { updateWorkout, workouts } = useWorkouts()
      const result = await updateWorkout('workout-1', { duration: 90 })

      expect(result.success).toBe(true)
      expect(result.message).toBe('網路異常，已排入待同步')
      expect(workouts.value[0]!.duration).toBe(90)
      expect(mockQueueUpdateWorkout).toHaveBeenCalled()
    })
  })

  describe('deleteWorkout', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { deleteWorkout } = useWorkouts()
      const result = await deleteWorkout('workout-1')

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should delete workout and update local state', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Deleted' })

      stateStore.set('member_workouts', { value: [mockWorkout, mockWorkout2] })
      stateStore.set('member_workouts_total', { value: 2 })

      const { deleteWorkout, workouts, totalWorkouts } = useWorkouts()
      const result = await deleteWorkout('workout-1')

      expect(result.success).toBe(true)
      expect(workouts.value).toHaveLength(1)
      expect(workouts.value[0]!.id).toBe('workout-2')
      expect(totalWorkouts.value).toBe(1)
    })

    it('should not remove from local state on failure', async () => {
      mockFetch.mockResolvedValueOnce({ success: false, message: 'Not found' })

      stateStore.set('member_workouts', { value: [mockWorkout] })
      stateStore.set('member_workouts_total', { value: 1 })

      const { deleteWorkout, workouts, totalWorkouts } = useWorkouts()
      await deleteWorkout('workout-1')

      expect(workouts.value).toHaveLength(1)
      expect(totalWorkouts.value).toBe(1)
    })

    it('should handle delete error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'))
      mockQueueDeleteWorkout.mockRejectedValueOnce(new Error('IndexedDB not available'))

      const { deleteWorkout } = useWorkouts()
      const result = await deleteWorkout('workout-1')

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })

    it('should queue delete when offline', async () => {
      mockIsOnline.value = false
      stateStore.set('member_workouts', { value: [{ ...mockWorkout }, { ...mockWorkout2 }] })
      stateStore.set('member_workouts_total', { value: 2 })

      const { deleteWorkout, workouts, totalWorkouts } = useWorkouts()
      const result = await deleteWorkout('workout-1')

      expect(result.success).toBe(true)
      expect(result.message).toBe('已排入待同步')
      expect(workouts.value).toHaveLength(1)
      expect(workouts.value[0]!.id).toBe('workout-2')
      expect(totalWorkouts.value).toBe(1)
      expect(mockQueueDeleteWorkout).toHaveBeenCalledWith(
        'workout-1',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fallback to queue on network error during delete', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      stateStore.set('member_workouts', { value: [{ ...mockWorkout }] })
      stateStore.set('member_workouts_total', { value: 1 })

      const { deleteWorkout, workouts, totalWorkouts } = useWorkouts()
      const result = await deleteWorkout('workout-1')

      expect(result.success).toBe(true)
      expect(result.message).toBe('網路異常，已排入待同步')
      expect(workouts.value).toHaveLength(0)
      expect(totalWorkouts.value).toBe(0)
      expect(mockQueueDeleteWorkout).toHaveBeenCalled()
    })
  })

  describe('formatDate', () => {
    it('should format date with day of week', () => {
      const { formatDate } = useWorkouts()
      // 2024-01-15 is a Monday
      const result = formatDate('2024-01-15')

      expect(result).toContain('1/15')
      expect(result).toContain('週一')
    })

    it('should format another date correctly', () => {
      const { formatDate } = useWorkouts()
      // 2024-01-21 is a Sunday
      const result = formatDate('2024-01-21')

      expect(result).toContain('1/21')
      expect(result).toContain('週日')
    })
  })

  describe('formatDuration', () => {
    it('should return "-" for null', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(null)).toBe('-')
    })

    it('should return "-" for 0', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(0)).toBe('-')
    })

    it('should format minutes under 60', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(30)).toBe('30 分鐘')
    })

    it('should format exactly 60 minutes', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(60)).toBe('1 小時')
    })

    it('should format hours with remaining minutes', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(90)).toBe('1 小時 30 分鐘')
    })

    it('should format multiple hours', () => {
      const { formatDuration } = useWorkouts()
      expect(formatDuration(120)).toBe('2 小時')
    })
  })

  describe('formatCalories', () => {
    it('should return "-" for null', () => {
      const { formatCalories } = useWorkouts()
      expect(formatCalories(null)).toBe('-')
    })

    it('should return "-" for 0', () => {
      const { formatCalories } = useWorkouts()
      expect(formatCalories(0)).toBe('-')
    })

    it('should format calories with unit', () => {
      const { formatCalories } = useWorkouts()
      expect(formatCalories(300)).toBe('300 大卡')
    })
  })

  describe('computed properties', () => {
    it('recentWorkouts should filter workouts from last 7 days', () => {
      const today = new Date()
      const recentDate = new Date(today)
      recentDate.setDate(today.getDate() - 3)
      const oldDate = new Date(today)
      oldDate.setDate(today.getDate() - 10)

      stateStore.set('member_workouts', {
        value: [
          { ...mockWorkout, date: recentDate.toISOString().split('T')[0] },
          { ...mockWorkout2, date: oldDate.toISOString().split('T')[0] },
        ],
      })

      const { recentWorkouts } = useWorkouts()

      expect(recentWorkouts.value).toHaveLength(1)
    })

    it('hasWorkoutToday should return true when workout exists today', () => {
      const today = new Date().toISOString().split('T')[0]
      stateStore.set('member_workouts', {
        value: [{ ...mockWorkout, date: today }],
      })

      const { hasWorkoutToday } = useWorkouts()

      expect(hasWorkoutToday.value).toBe(true)
    })

    it('hasWorkoutToday should return false when no workout today', () => {
      stateStore.set('member_workouts', {
        value: [{ ...mockWorkout, date: '2024-01-01' }],
      })

      const { hasWorkoutToday } = useWorkouts()

      expect(hasWorkoutToday.value).toBe(false)
    })
  })
})
