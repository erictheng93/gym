/**
 * Tests for useClasses composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassSession, ClassSchedule, GymClass } from './useClasses'

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

// Import after mocks
import { useClasses } from './useClasses'

describe('useClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
  })

  describe('fetchClasses', () => {
    it('should fetch all classes', async () => {
      const mockClassesData: GymClass[] = [
        {
          id: 'class-1',
          name: 'Yoga Basics',
          duration_minutes: 60,
          max_capacity: 20,
          status: 'ACTIVE',
        },
        {
          id: 'class-2',
          name: 'HIIT Training',
          duration_minutes: 45,
          max_capacity: 15,
          status: 'ACTIVE',
        },
      ]

      const { fetchClasses, classes } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockClassesData,
      })

      const result = await fetchClasses()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes?',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toHaveLength(2)
      expect(classes.value).toEqual(mockClassesData)
    })

    it('should fetch classes filtered by branch', async () => {
      const { fetchClasses } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [{ id: 'class-1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' }],
      })

      await fetchClasses('branch-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes?branch_id=branch-123',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
    })

    it('should return empty array on error', async () => {
      const { fetchClasses } = useClasses()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchClasses()

      expect(result).toEqual([])
    })
  })

  describe('fetchWeeklySchedule', () => {
    it('should fetch weekly schedule', async () => {
      const mockScheduleData: ClassSchedule[] = [
        {
          id: 'schedule-1',
          class_id: 'class-1',
          day_of_week: 1,
          start_time: '09:00',
          end_time: '10:00',
          is_active: true,
        },
      ]

      const { fetchWeeklySchedule, schedules } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockScheduleData,
      })

      const result = await fetchWeeklySchedule()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes/schedule?',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toHaveLength(1)
      expect(schedules.value).toEqual(mockScheduleData)
    })

    it('should return empty array on error', async () => {
      const { fetchWeeklySchedule } = useClasses()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchWeeklySchedule()

      expect(result).toEqual([])
    })
  })

  describe('fetchUpcomingSessions', () => {
    it('should fetch upcoming sessions with options', async () => {
      const mockSessionsData: ClassSession[] = [
        {
          id: 'session-1',
          schedule_id: 'schedule-1',
          session_date: '2024-01-15',
          current_count: 10,
          waitlist_count: 2,
          session_status: 'SCHEDULED',
        },
      ]

      const { fetchUpcomingSessions, upcomingSessions } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockSessionsData,
      })

      const result = await fetchUpcomingSessions({
        branchId: 'branch-1',
        startDate: '2024-01-15',
        endDate: '2024-01-22',
        limit: 10,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('branch_id=branch-1'),
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toHaveLength(1)
      expect(upcomingSessions.value).toEqual(mockSessionsData)
    })
  })

  describe('getSession', () => {
    it('should fetch a single session', async () => {
      const mockSession: ClassSession = {
        id: 'session-1',
        schedule_id: 'schedule-1',
        session_date: '2024-01-15',
        current_count: 10,
        waitlist_count: 0,
        session_status: 'SCHEDULED',
      }

      const { getSession } = useClasses()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockSession,
      })

      const result = await getSession('session-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/classes/sessions/session-1',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toEqual(mockSession)
    })

    it('should return null on error', async () => {
      const { getSession } = useClasses()

      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const result = await getSession('invalid-id')

      expect(result).toBeNull()
    })
  })

  describe('getSchedulesByDay', () => {
    it('should filter schedules by day of week and sort by time', () => {
      const { getSchedulesByDay, schedules } = useClasses()

      schedules.value = [
        { id: 's1', class_id: 'c1', day_of_week: 1, start_time: '14:00', end_time: '15:00', is_active: true },
        { id: 's2', class_id: 'c2', day_of_week: 1, start_time: '09:00', end_time: '10:00', is_active: true },
        { id: 's3', class_id: 'c3', day_of_week: 2, start_time: '10:00', end_time: '11:00', is_active: true },
        { id: 's4', class_id: 'c4', day_of_week: 1, start_time: '11:00', end_time: '12:00', is_active: false },
      ]

      const mondaySchedules = getSchedulesByDay(1)

      expect(mondaySchedules).toHaveLength(2)
      expect(mondaySchedules[0].id).toBe('s2') // 09:00 first
      expect(mondaySchedules[1].id).toBe('s1') // 14:00 second
    })

    it('should return empty array for day with no schedules', () => {
      const { getSchedulesByDay, schedules } = useClasses()

      schedules.value = [
        { id: 's1', class_id: 'c1', day_of_week: 1, start_time: '09:00', end_time: '10:00', is_active: true },
      ]

      const sundaySchedules = getSchedulesByDay(0)

      expect(sundaySchedules).toEqual([])
    })
  })

  describe('getSessionsByDate', () => {
    it('should filter sessions by date and sort by time', () => {
      const { getSessionsByDate, upcomingSessions } = useClasses()

      upcomingSessions.value = [
        {
          id: 'sess1',
          schedule_id: 's1',
          session_date: '2024-01-15',
          current_count: 5,
          waitlist_count: 0,
          session_status: 'SCHEDULED',
          schedule: { id: 's1', class_id: 'c1', day_of_week: 1, start_time: '14:00', end_time: '15:00', is_active: true },
        },
        {
          id: 'sess2',
          schedule_id: 's2',
          session_date: '2024-01-15',
          current_count: 10,
          waitlist_count: 0,
          session_status: 'SCHEDULED',
          schedule: { id: 's2', class_id: 'c2', day_of_week: 1, start_time: '09:00', end_time: '10:00', is_active: true },
        },
        {
          id: 'sess3',
          schedule_id: 's3',
          session_date: '2024-01-16',
          current_count: 8,
          waitlist_count: 0,
          session_status: 'SCHEDULED',
          schedule: { id: 's3', class_id: 'c3', day_of_week: 2, start_time: '10:00', end_time: '11:00', is_active: true },
        },
      ]

      const sessions = getSessionsByDate('2024-01-15')

      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('sess2') // 09:00 first
      expect(sessions[1].id).toBe('sess1') // 14:00 second
    })
  })

  describe('isSessionFull', () => {
    it('should return true when session is at capacity', () => {
      const { isSessionFull } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 20,
        waitlist_count: 5,
        session_status: 'SCHEDULED',
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' },
      }

      expect(isSessionFull(session)).toBe(true)
    })

    it('should return false when session has available spots', () => {
      const { isSessionFull } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 15,
        waitlist_count: 0,
        session_status: 'SCHEDULED',
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' },
      }

      expect(isSessionFull(session)).toBe(false)
    })

    it('should use schedule class capacity as fallback', () => {
      const { isSessionFull } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 15,
        waitlist_count: 0,
        session_status: 'SCHEDULED',
        schedule: {
          id: 's1',
          class_id: 'c1',
          day_of_week: 1,
          start_time: '09:00',
          end_time: '10:00',
          is_active: true,
          class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 15, status: 'ACTIVE' },
        },
      }

      expect(isSessionFull(session)).toBe(true)
    })
  })

  describe('getAvailableSpots', () => {
    it('should return correct number of available spots', () => {
      const { getAvailableSpots } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 12,
        waitlist_count: 0,
        session_status: 'SCHEDULED',
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' },
      }

      expect(getAvailableSpots(session)).toBe(8)
    })

    it('should return 0 when session is full', () => {
      const { getAvailableSpots } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 20,
        waitlist_count: 5,
        session_status: 'SCHEDULED',
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' },
      }

      expect(getAvailableSpots(session)).toBe(0)
    })

    it('should never return negative', () => {
      const { getAvailableSpots } = useClasses()

      const session: ClassSession = {
        id: 'sess1',
        schedule_id: 's1',
        session_date: '2024-01-15',
        current_count: 25, // Over capacity
        waitlist_count: 0,
        session_status: 'SCHEDULED',
        class: { id: 'c1', name: 'Yoga', duration_minutes: 60, max_capacity: 20, status: 'ACTIVE' },
      }

      expect(getAvailableSpots(session)).toBe(0)
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
