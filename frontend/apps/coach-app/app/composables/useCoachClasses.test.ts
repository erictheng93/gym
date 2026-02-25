/**
 * Tests for useCoachClasses composable
 *
 * Tests class management functionality including:
 * - Fetching classes list
 * - Getting class details
 * - Marking attendance
 * - Cancelling classes
 * - Getting schedule
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock data
const mockClasses = [
  {
    id: 'class-1',
    scheduled_at: '2024-01-20T10:00:00Z',
    duration_minutes: 60,
    status: 'BOOKED' as const,
    is_charged: false,
    booked_by: 'MEMBER' as const,
    member: {
      id: 'member-1',
      member_code: 'M001',
      full_name: 'Student One',
      phone: '0912345678',
    },
    contract: {
      id: 'contract-1',
      contract_no: 'C2024-001',
      remaining_counts: 8,
      plan_name: '私人教練課程',
      plan_type: 'COUNT_BASED' as const,
    },
    branch_name: 'Main Branch',
  },
  {
    id: 'class-2',
    scheduled_at: '2024-01-20T14:00:00Z',
    duration_minutes: 60,
    status: 'COMPLETED' as const,
    is_charged: true,
    booked_by: 'COACH' as const,
    member: {
      id: 'member-2',
      member_code: 'M002',
      full_name: 'Student Two',
      phone: '0923456789',
    },
    contract: {
      id: 'contract-2',
      contract_no: 'C2024-002',
      remaining_counts: 5,
      plan_name: '私人教練課程',
      plan_type: 'COUNT_BASED' as const,
    },
    branch_name: 'Main Branch',
  },
]

const mockClassDetail = {
  ...mockClasses[0],
  notes: 'Focus on upper body',
  record: null,
  lesson_plan: {
    id: 'plan-1',
    title: '上肢力量訓練',
    objectives: ['增強肩部力量', '改善核心穩定性'],
  },
}

const mockSchedule = {
  bookings: mockClasses,
  availability: [
    { day_of_week: 1, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 2, start_time: '09:00', end_time: '18:00', is_available: true },
  ],
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('ref', (initial: unknown) => ({ value: initial }))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useCoachAuth
vi.stubGlobal('useCoachAuth', () => ({
  getAuthHeader: () => ({ 'X-Coach-Token': 'test-token' }),
}))

// Mock useOfflineSync
const mockGetCache = vi.fn().mockResolvedValue(null)
const mockSetCache = vi.fn().mockResolvedValue(undefined)
const mockQueueMarkAttendance = vi.fn().mockResolvedValue('queue-id-1')
const mockQueueCancelClass = vi.fn().mockResolvedValue('queue-id-2')
vi.stubGlobal('useOfflineSync', () => ({
  isOnline: { value: true },
  getCache: mockGetCache,
  setCache: mockSetCache,
  queueMarkAttendance: mockQueueMarkAttendance,
  queueCancelClass: mockQueueCancelClass,
}))

// Import after mocks
import { useCoachClasses } from './useCoachClasses'

describe('useCoachClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockGetCache.mockReset().mockResolvedValue(null)
    mockSetCache.mockReset().mockResolvedValue(undefined)
    mockQueueMarkAttendance.mockReset().mockResolvedValue('queue-id-1')
    mockQueueCancelClass.mockReset().mockResolvedValue('queue-id-2')
  })

  describe('fetchClasses', () => {
    it('should fetch classes list successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockClasses,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { classes, total, fetchClasses } = useCoachClasses()
      await fetchClasses()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(classes.value).toEqual(mockClasses)
      expect(total.value).toBe(2)
    })

    it('should support filtering by date', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockClasses,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { fetchClasses } = useCoachClasses()
      await fetchClasses({ date: '2024-01-20' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes',
        expect.objectContaining({
          query: { date: '2024-01-20' },
        })
      )
    })

    it('should support filtering by status', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockClasses[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchClasses } = useCoachClasses()
      await fetchClasses({ status: 'BOOKED' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes',
        expect.objectContaining({
          query: { status: 'BOOKED' },
        })
      )
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { classes, total, fetchClasses } = useCoachClasses()
      await fetchClasses()

      expect(classes.value).toEqual([])
      expect(total.value).toBe(0)
    })
  })

  describe('getClass', () => {
    it('should fetch class details successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockClassDetail,
      })

      const { getClass } = useCoachClasses()
      const result = await getClass('class-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes/class-1',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(result).toEqual(mockClassDetail)
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getClass } = useCoachClasses()
      const result = await getClass('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getSchedule', () => {
    it('should fetch schedule successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockSchedule,
      })

      const { schedule, getSchedule } = useCoachClasses()
      await getSchedule({ start_date: '2024-01-15', end_date: '2024-01-21' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/schedule',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
          query: { start_date: '2024-01-15', end_date: '2024-01-21' },
        })
      )
      expect(schedule.value).toEqual({
        classes: mockSchedule.bookings,
        availability: mockSchedule.availability,
      })
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { schedule, getSchedule } = useCoachClasses()
      await getSchedule()

      expect(schedule.value).toBeNull()
    })
  })

  describe('markAttendance', () => {
    it('should mark attendance as attended successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '已標記出席',
        status: 'COMPLETED',
      })

      const { markAttendance } = useCoachClasses()
      const result = await markAttendance('class-1', { attended: true })

      expect(result.success).toBe(true)
      expect(result.status).toBe('COMPLETED')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes/class-1/attendance',
        expect.objectContaining({
          method: 'POST',
          body: { attended: true },
        })
      )
    })

    it('should mark attendance as no-show', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '已標記未到',
        status: 'NO_SHOW',
      })

      const { markAttendance } = useCoachClasses()
      const result = await markAttendance('class-1', { attended: false })

      expect(result.success).toBe(true)
      expect(result.status).toBe('NO_SHOW')
    })

    it('should include notes when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '已標記出席',
        status: 'COMPLETED',
      })

      const { markAttendance } = useCoachClasses()
      await markAttendance('class-1', {
        attended: true,
        notes: 'Great session today',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes/class-1/attendance',
        expect.objectContaining({
          body: {
            attended: true,
            notes: 'Great session today',
          },
        })
      )
    })

    it('should queue attendance when network fails (offline fallback)', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '點名失敗' },
      })

      const { markAttendance } = useCoachClasses()
      const result = await markAttendance('class-1', { attended: true })

      // Network error triggers offline queue fallback
      expect(result.success).toBe(true)
      expect(result.message).toBe('網路異常，點名已排入待同步清單')
      expect(mockQueueMarkAttendance).toHaveBeenCalled()
    })

    it('should return error when both network and queue fail', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '點名失敗' },
      })
      mockQueueMarkAttendance.mockRejectedValueOnce(new Error('Queue failed'))

      const { markAttendance } = useCoachClasses()
      const result = await markAttendance('class-1', { attended: true })

      expect(result.success).toBe(false)
      expect(result.message).toBe('點名失敗')
    })
  })

  describe('cancelClass', () => {
    it('should cancel class successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '課程已取消',
      })

      const { cancelClass } = useCoachClasses()
      const result = await cancelClass('class-1', '教練臨時有事')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/classes/class-1/cancel',
        expect.objectContaining({
          method: 'POST',
          body: { reason: '教練臨時有事' },
        })
      )
    })

    it('should queue cancel when network fails (offline fallback)', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '取消課程失敗' },
      })

      const { cancelClass } = useCoachClasses()
      const result = await cancelClass('class-1', 'reason')

      // Network error triggers offline queue fallback
      expect(result.success).toBe(true)
      expect(result.message).toBe('網路異常，取消請求已排入待同步清單')
      expect(mockQueueCancelClass).toHaveBeenCalled()
    })

    it('should return error when both network and queue fail', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '取消課程失敗' },
      })
      mockQueueCancelClass.mockRejectedValueOnce(new Error('Queue failed'))

      const { cancelClass } = useCoachClasses()
      const result = await cancelClass('class-1', 'reason')

      expect(result.success).toBe(false)
      expect(result.message).toBe('取消課程失敗')
    })
  })
})
