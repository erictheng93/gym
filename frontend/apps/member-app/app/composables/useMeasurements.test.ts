/**
 * Tests for useMeasurements composable
 *
 * Tests measurement CRUD, offline caching, trend helpers, and formatting
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

// Mock measurement data
const mockMeasurement1 = {
  id: 'meas-1',
  member_id: 'member-1',
  date: '2024-01-15',
  weight: 75.5,
  body_fat: 20.0,
  muscle_mass: 35.0,
  bmi: 23.5,
  source: 'MANUAL' as const,
  raw_data: null,
  created_at: '2024-01-15T10:00:00Z',
}

const mockMeasurement2 = {
  id: 'meas-2',
  member_id: 'member-1',
  date: '2024-01-01',
  weight: 77.0,
  body_fat: 21.5,
  muscle_mass: 34.0,
  bmi: 24.0,
  source: 'INBODY' as const,
  raw_data: { device: 'InBody 770' },
  created_at: '2024-01-01T10:00:00Z',
}

const mockStats = {
  total_records: 10,
  period_days: 30,
  weight: { first: 77.0, last: 75.5, change: -1.5, trend: 'down' as const },
  body_fat: { first: 21.5, last: 20.0, change: -1.5, trend: 'down' as const },
  muscle_mass: { first: 34.0, last: 35.0, change: 1.0, trend: 'up' as const },
  bmi: { first: 24.0, last: 23.5, change: -0.5, trend: 'down' as const },
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
import { useMeasurements } from './useMeasurements'

describe('useMeasurements', () => {
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
      const m = useMeasurements()

      expect(m.measurements).toBeDefined()
      expect(m.latestMeasurement).toBeDefined()
      expect(m.stats).toBeDefined()
      expect(m.isLoading).toBeDefined()
      expect(m.isOfflineData).toBeDefined()
      expect(m.measurements.value).toEqual([])
      expect(m.latestMeasurement.value).toBeNull()
      expect(m.stats.value).toBeNull()
    })

    it('should expose all required methods', () => {
      const m = useMeasurements()

      expect(typeof m.fetchMeasurements).toBe('function')
      expect(typeof m.fetchLatestMeasurement).toBe('function')
      expect(typeof m.fetchStats).toBe('function')
      expect(typeof m.createMeasurement).toBe('function')
      expect(typeof m.deleteMeasurement).toBe('function')
      expect(typeof m.formatDate).toBe('function')
      expect(typeof m.getTrendIcon).toBe('function')
      expect(typeof m.getTrendColor).toBe('function')
    })
  })

  describe('fetchMeasurements', () => {
    it('should return empty array when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchMeasurements } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch measurements successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMeasurement1, mockMeasurement2],
      })

      const { fetchMeasurements, measurements, isLoading } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([mockMeasurement1, mockMeasurement2])
      expect(measurements.value).toEqual([mockMeasurement1, mockMeasurement2])
      expect(isLoading.value).toBe(false)
    })

    it('should pass filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchMeasurements } = useMeasurements()
      await fetchMeasurements({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        limit: 20,
        offset: 5,
      })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('start_date=2024-01-01')
      expect(url).toContain('end_date=2024-01-31')
      expect(url).toContain('limit=20')
      expect(url).toContain('offset=5')
    })

    it('should cache data after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockMeasurement1],
      })

      const { fetchMeasurements } = useMeasurements()
      await fetchMeasurements()

      expect(mockSetCache).toHaveBeenCalledWith(
        expect.any(String),
        [mockMeasurement1],
        5 * 60 * 1000
      )
    })

    it('should use cached data when offline', async () => {
      mockIsOnline.value = false
      mockGetCache.mockResolvedValueOnce([mockMeasurement1])

      const { fetchMeasurements, measurements, isOfflineData } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([mockMeasurement1])
      expect(measurements.value).toEqual([mockMeasurement1])
      expect(isOfflineData.value).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return empty array when offline with no cache', async () => {
      mockIsOnline.value = false

      const { fetchMeasurements } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([])
    })

    it('should fall back to cache on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      mockGetCache.mockResolvedValueOnce([mockMeasurement1])

      const { fetchMeasurements, isOfflineData } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([mockMeasurement1])
      expect(isOfflineData.value).toBe(true)
    })

    it('should return empty array on network error with no cache', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchMeasurements } = useMeasurements()
      const result = await fetchMeasurements()

      expect(result).toEqual([])
    })

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: [] }), 50)
        })
      )

      const { fetchMeasurements, isLoading } = useMeasurements()
      const promise = fetchMeasurements()

      expect(isLoading.value).toBe(true)

      await promise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchLatestMeasurement', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchLatestMeasurement } = useMeasurements()
      const result = await fetchLatestMeasurement()

      expect(result).toBeNull()
    })

    it('should fetch latest measurement', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockMeasurement1,
      })

      const { fetchLatestMeasurement, latestMeasurement } = useMeasurements()
      const result = await fetchLatestMeasurement()

      expect(result).toEqual(mockMeasurement1)
      expect(latestMeasurement.value).toEqual(mockMeasurement1)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/measurements/latest',
        { headers: { 'X-Member-Token': 'test-token' } }
      )
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'))

      const { fetchLatestMeasurement } = useMeasurements()
      const result = await fetchLatestMeasurement()

      expect(result).toBeNull()
    })
  })

  describe('fetchStats', () => {
    it('should return null when no member', async () => {
      mockMemberRef.value = null as never

      const { fetchStats } = useMeasurements()
      const result = await fetchStats()

      expect(result).toBeNull()
    })

    it('should fetch stats with default period', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { stats: mockStats, daily: [] },
      })

      const { fetchStats, stats } = useMeasurements()
      const result = await fetchStats()

      expect(result).toEqual(mockStats)
      expect(stats.value).toEqual(mockStats)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/measurements/stats?period=30',
        expect.any(Object)
      )
    })

    it('should fetch stats with specified period', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { stats: mockStats, daily: [] },
      })

      const { fetchStats } = useMeasurements()
      await fetchStats('90')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/measurements/stats?period=90',
        expect.any(Object)
      )
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'))

      const { fetchStats } = useMeasurements()
      const result = await fetchStats()

      expect(result).toBeNull()
    })
  })

  describe('createMeasurement', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { createMeasurement } = useMeasurements()
      const result = await createMeasurement({ weight: 75 })

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should create measurement successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: 'Created',
        data: mockMeasurement1,
      })

      const { createMeasurement, measurements, latestMeasurement } = useMeasurements()
      const result = await createMeasurement({
        weight: 75.5,
        body_fat: 20.0,
        source: 'MANUAL',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockMeasurement1)
      expect(measurements.value[0]).toEqual(mockMeasurement1)
      expect(latestMeasurement.value).toEqual(mockMeasurement1)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/measurements',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Member-Token': 'test-token' },
          body: expect.objectContaining({ weight: 75.5 }),
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'))

      const { createMeasurement } = useMeasurements()
      const result = await createMeasurement({ weight: 75 })

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('deleteMeasurement', () => {
    it('should return error when no member', async () => {
      mockMemberRef.value = null as never

      const { deleteMeasurement } = useMeasurements()
      const result = await deleteMeasurement('meas-1')

      expect(result).toEqual({ success: false, message: '請先登入' })
    })

    it('should delete measurement and update local state', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Deleted' })

      stateStore.set('member_measurements', {
        value: [mockMeasurement1, mockMeasurement2],
      })

      const { deleteMeasurement, measurements } = useMeasurements()
      const result = await deleteMeasurement('meas-1')

      expect(result.success).toBe(true)
      expect(measurements.value).toHaveLength(1)
      expect(measurements.value[0].id).toBe('meas-2')
    })

    it('should update latestMeasurement when deleting the latest', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Deleted' })

      stateStore.set('member_measurements', {
        value: [mockMeasurement1, mockMeasurement2],
      })
      stateStore.set('member_latest_measurement', { value: mockMeasurement1 })

      const { deleteMeasurement, latestMeasurement } = useMeasurements()
      await deleteMeasurement('meas-1')

      expect(latestMeasurement.value).toEqual(mockMeasurement2)
    })

    it('should set latestMeasurement to null when deleting last measurement', async () => {
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Deleted' })

      stateStore.set('member_measurements', { value: [mockMeasurement1] })
      stateStore.set('member_latest_measurement', { value: mockMeasurement1 })

      const { deleteMeasurement, latestMeasurement } = useMeasurements()
      await deleteMeasurement('meas-1')

      expect(latestMeasurement.value).toBeNull()
    })

    it('should not remove from local state on failure', async () => {
      mockFetch.mockResolvedValueOnce({ success: false, message: 'Not found' })

      stateStore.set('member_measurements', { value: [mockMeasurement1] })

      const { deleteMeasurement, measurements } = useMeasurements()
      await deleteMeasurement('meas-1')

      expect(measurements.value).toHaveLength(1)
    })

    it('should handle delete error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteMeasurement } = useMeasurements()
      const result = await deleteMeasurement('meas-1')

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('getTrendIcon', () => {
    it('should return arrow-up for up trend', () => {
      const { getTrendIcon } = useMeasurements()
      expect(getTrendIcon('up')).toBe('arrow-up')
    })

    it('should return arrow-down for down trend', () => {
      const { getTrendIcon } = useMeasurements()
      expect(getTrendIcon('down')).toBe('arrow-down')
    })

    it('should return minus for stable trend', () => {
      const { getTrendIcon } = useMeasurements()
      expect(getTrendIcon('stable')).toBe('minus')
    })

    it('should return minus for null trend', () => {
      const { getTrendIcon } = useMeasurements()
      expect(getTrendIcon(null)).toBe('minus')
    })
  })

  describe('getTrendColor', () => {
    it('should return success for body_fat going down', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('down', 'body_fat')).toBe('text-success')
    })

    it('should return warning for body_fat going up', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('up', 'body_fat')).toBe('text-warning')
    })

    it('should return success for muscle_mass going up', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('up', 'muscle_mass')).toBe('text-success')
    })

    it('should return warning for muscle_mass going down', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('down', 'muscle_mass')).toBe('text-warning')
    })

    it('should return success for weight going down', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('down', 'weight')).toBe('text-success')
    })

    it('should return warning for weight going up', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('up', 'weight')).toBe('text-warning')
    })

    it('should return text-muted for stable trend', () => {
      const { getTrendColor } = useMeasurements()
      expect(getTrendColor('stable', 'weight')).toBe('text-muted')
    })
  })

  describe('formatDate', () => {
    it('should format date in zh-TW locale', () => {
      const { formatDate } = useMeasurements()
      const result = formatDate('2024-01-15')

      // Should contain year, month, day in some format
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })
})
