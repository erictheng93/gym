/**
 * Tests for useClasses composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassSession } from './useClasses'

// Create mock state storage
const stateStore = new Map<string, { value: unknown }>()

// Mock Nuxt composables
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useMemberAuth
vi.stubGlobal('useMemberAuth', () => ({
  getAuthHeader: () => ({ 'X-Member-Token': 'mock-token' }),
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
import { useClasses } from './useClasses'

describe('useClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockIsOnline.value = true
    mockGetCache.mockResolvedValue(null)
  })

  // Backend payload (backend/src/routes/member-classes.ts)
  const apiSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    sessionDate: '2024-01-15',
    startTime: '09:00:00',
    endTime: '10:00:00',
    room: 'A 教室',
    maxCapacity: 20,
    currentCount: 10,
    waitlistCount: 2,
    sessionStatus: 'SCHEDULED',
    cancelledReason: null,
    class: { id: 'class-1', name: 'Yoga', description: null, category: 'YOGA', difficultyLevel: 'BEGINNER', durationMinutes: 60, imageUrl: null },
    instructor: { id: 'emp-1', fullName: '陳教練' },
    branch: { id: 'branch-1', name: '台北總店' },
    ...overrides,
  })

  const session = (overrides: Partial<ClassSession> = {}): ClassSession => ({
    id: 'sess1',
    session_date: '2024-01-15',
    start_time: '09:00:00',
    end_time: '10:00:00',
    max_capacity: 20,
    current_count: 0,
    waitlist_count: 0,
    session_status: 'SCHEDULED',
    ...overrides,
  })

  describe('fetchUpcomingSessions', () => {
    it('should fetch sessions with camelCase query and map them', async () => {
      const { fetchUpcomingSessions, upcomingSessions } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { sessions: [apiSession()] },
      })

      const result = await fetchUpcomingSessions({
        branchId: 'branch-1',
        startDate: '2024-01-15',
        endDate: '2024-01-22',
        limit: 10,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes/sessions?branchId=branch-1&startDate=2024-01-15&endDate=2024-01-22&limit=10',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      const expected: ClassSession = {
        id: 'session-1',
        session_date: '2024-01-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        room: 'A 教室',
        max_capacity: 20,
        current_count: 10,
        waitlist_count: 2,
        session_status: 'SCHEDULED',
        cancellation_reason: undefined,
        class: {
          id: 'class-1',
          name: 'Yoga',
          description: undefined,
          duration_minutes: 60,
          max_capacity: 20,
          category: 'YOGA',
          difficulty_level: 'BEGINNER',
          status: 'ACTIVE',
        },
        instructor: { id: 'emp-1', full_name: '陳教練' },
        branch: { id: 'branch-1', name: '台北總店' },
      }
      expect(result).toEqual([expected])
      expect(upcomingSessions.value).toEqual([expected])
    })

    it('should map a session without instructor', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: { sessions: [apiSession({ instructor: null })] } })

      const [mapped] = await useClasses().fetchUpcomingSessions()

      expect(mapped!.instructor).toBeUndefined()
    })

    it('should use cached sessions when offline', async () => {
      mockIsOnline.value = false
      const cachedSessions = [session()]
      mockGetCache.mockResolvedValueOnce(cachedSessions)

      const { fetchUpcomingSessions, upcomingSessions, isOfflineData } = useClasses()
      const result = await fetchUpcomingSessions({ branchId: 'branch-1' })

      expect(result).toEqual(cachedSessions)
      expect(upcomingSessions.value).toEqual(cachedSessions)
      expect(isOfflineData.value).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return empty when offline with no cache for sessions', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce(null)

      const { fetchUpcomingSessions } = useClasses()
      const result = await fetchUpcomingSessions()

      expect(result).toEqual([])
    })

    it('should cache the mapped sessions after a successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: { sessions: [apiSession()] } })

      const { fetchUpcomingSessions } = useClasses()
      const result = await fetchUpcomingSessions()

      expect(mockSetCache).toHaveBeenCalledWith(
        expect.stringContaining('member:class-sessions:'),
        result,
        10 * 60 * 1000
      )
    })

    it('should fallback to cache on network error for sessions', async () => {
      const cachedSessions = [session()]
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce(cachedSessions)

      const { fetchUpcomingSessions, isOfflineData } = useClasses()
      const result = await fetchUpcomingSessions()

      expect(result).toEqual(cachedSessions)
      expect(isOfflineData.value).toBe(true)
    })
  })

  describe('getSession', () => {
    it('should fetch and map a single session', async () => {
      const { getSession } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { session: apiSession() },
      })

      const result = await getSession('session-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes/sessions/session-1',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toMatchObject({ id: 'session-1', start_time: '09:00:00', max_capacity: 20, class: { name: 'Yoga' } })
    })

    it('should return null on error', async () => {
      const { getSession } = useClasses()

      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const result = await getSession('invalid-id')

      expect(result).toBeNull()
    })
  })

  describe('getSessionsByDate', () => {
    it('should filter sessions by date and sort by start time', () => {
      const { getSessionsByDate, upcomingSessions } = useClasses()

      upcomingSessions.value = [
        session({ id: 'sess1', start_time: '14:00:00' }),
        session({ id: 'sess2', start_time: '09:00:00' }),
        session({ id: 'sess3', session_date: '2024-01-16', start_time: '10:00:00' }),
      ]

      const sessions = getSessionsByDate('2024-01-15')

      expect(sessions).toHaveLength(2)
      expect(sessions[0]!.id).toBe('sess2') // 09:00 first
      expect(sessions[1]!.id).toBe('sess1') // 14:00 second
    })
  })

  describe('isSessionFull', () => {
    it('should return true when session is at capacity', () => {
      expect(useClasses().isSessionFull(session({ current_count: 20, max_capacity: 20 }))).toBe(true)
    })

    it('should return false when session has available spots', () => {
      expect(useClasses().isSessionFull(session({ current_count: 15, max_capacity: 20 }))).toBe(false)
    })

    it('should use the session capacity, not the class default', () => {
      const s = session({
        current_count: 15,
        max_capacity: 15,
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 30, status: 'ACTIVE' },
      })
      expect(useClasses().isSessionFull(s)).toBe(true)
    })
  })

  describe('getAvailableSpots', () => {
    it('should return correct number of available spots', () => {
      expect(useClasses().getAvailableSpots(session({ current_count: 12, max_capacity: 20 }))).toBe(8)
    })

    it('should return 0 when session is full', () => {
      expect(useClasses().getAvailableSpots(session({ current_count: 20, max_capacity: 20 }))).toBe(0)
    })

    it('should never return negative', () => {
      expect(useClasses().getAvailableSpots(session({ current_count: 25, max_capacity: 20 }))).toBe(0)
    })
  })

  describe('formatTimeRange', () => {
    it('should format time range correctly', () => {
      const { formatTimeRange } = useClasses()

      expect(formatTimeRange('09:00:00', '10:00:00')).toBe('09:00 - 10:00')
      expect(formatTimeRange('14:30', '15:45')).toBe('14:30 - 15:45')
    })
  })

  describe('getDayName', () => {
    it('should return correct day names in Traditional Chinese', () => {
      const { getDayName } = useClasses()

      expect(getDayName(0)).toBe('週日')
      expect(getDayName(1)).toBe('週一')
      expect(getDayName(2)).toBe('週二')
      expect(getDayName(3)).toBe('週三')
      expect(getDayName(4)).toBe('週四')
      expect(getDayName(5)).toBe('週五')
      expect(getDayName(6)).toBe('週六')
    })

    it('should return empty string for invalid day', () => {
      const { getDayName } = useClasses()

      expect(getDayName(7)).toBe('')
      expect(getDayName(-1)).toBe('')
    })
  })

  describe('getCategoryLabel', () => {
    it('should return correct category labels', () => {
      const { getCategoryLabel } = useClasses()

      expect(getCategoryLabel('YOGA')).toBe('瑜珈')
      expect(getCategoryLabel('PILATES')).toBe('皮拉提斯')
      expect(getCategoryLabel('SPINNING')).toBe('飛輪')
      expect(getCategoryLabel('AEROBICS')).toBe('有氧')
      expect(getCategoryLabel('DANCE')).toBe('舞蹈')
      expect(getCategoryLabel('STRENGTH')).toBe('重訓')
      expect(getCategoryLabel('HIIT')).toBe('HIIT')
      expect(getCategoryLabel('BOXING')).toBe('拳擊')
      expect(getCategoryLabel('SWIMMING')).toBe('游泳')
      expect(getCategoryLabel('OTHER')).toBe('其他')
    })

    it('should return original value for unknown category', () => {
      const { getCategoryLabel } = useClasses()

      expect(getCategoryLabel('CUSTOM')).toBe('CUSTOM')
    })

    it('should return "其他" for undefined', () => {
      const { getCategoryLabel } = useClasses()

      expect(getCategoryLabel(undefined)).toBe('其他')
    })
  })

  describe('getDifficultyLabel', () => {
    it('should return correct difficulty labels', () => {
      const { getDifficultyLabel } = useClasses()

      expect(getDifficultyLabel('BEGINNER')).toBe('初級')
      expect(getDifficultyLabel('INTERMEDIATE')).toBe('中級')
      expect(getDifficultyLabel('ADVANCED')).toBe('高級')
      expect(getDifficultyLabel('ALL_LEVELS')).toBe('不限程度')
    })

    it('should return "不限" for undefined', () => {
      const { getDifficultyLabel } = useClasses()

      expect(getDifficultyLabel(undefined)).toBe('不限')
    })

    it('should return original value for unknown difficulty', () => {
      const { getDifficultyLabel } = useClasses()

      expect(getDifficultyLabel('EXPERT')).toBe('EXPERT')
    })
  })
})
