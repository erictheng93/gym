/**
 * Tests for useCoachSession composable
 *
 * Tests session state management including:
 * - Coach profile state
 * - Authentication state
 * - Loading states
 * - Derived computed properties
 * - fetchCoach / clearSession / updateCoachData
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state store
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock coach data
const mockCoach = {
  id: 'coach-1',
  employee_code: 'EMP001',
  full_name: 'Test Coach',
  phone: '0912345678',
  email: 'coach@example.com',
  branch_id: 'branch-1',
  branch_name: 'Main Branch',
  job_title: {
    id: 'job-1',
    name: '教練',
    code: 'COACH',
  },
  stats: {
    student_count: 10,
    today_class_count: 3,
  },
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

// Mock useCoachTokens
const mockRefreshAccessToken = vi.fn()
vi.stubGlobal('useCoachTokens', () => ({
  accessToken: cookieStore.get('coach_access_token') || { value: null },
  refreshAccessToken: mockRefreshAccessToken,
}))

// Mock useOfflineSync
const mockGetCache = vi.fn().mockResolvedValue(null)
const mockSetCache = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('useOfflineSync', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
  isOnline: { value: true },
  isSyncing: { value: false },
  pendingCount: { value: 0 },
  lastSyncAt: { value: null },
  hasPendingRequests: { value: false },
  syncStatusLabel: { value: '已同步' },
  setupListeners: vi.fn(),
  queueRequest: vi.fn(),
  removeFromQueue: vi.fn(),
  getPendingRequests: vi.fn().mockResolvedValue([]),
  syncPendingRequests: vi.fn().mockResolvedValue({ success: true, synced: 0, failed: 0, errors: [] }),
  clearQueue: vi.fn(),
  deleteCache: vi.fn(),
  clearCache: vi.fn(),
  queueMarkAttendance: vi.fn(),
  queueCancelClass: vi.fn(),
}))

// Import after mocks
import { useCoachSession } from './useCoachSession'

describe('useCoachSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockFetch.mockReset()
    mockRefreshAccessToken.mockReset()
    mockGetCache.mockReset().mockResolvedValue(null)
    mockSetCache.mockReset().mockResolvedValue(undefined)
  })

  describe('initial state', () => {
    it('should have null coach initially', () => {
      const { coach } = useCoachSession()
      expect(coach.value).toBeNull()
    })

    it('should not be authenticated initially', () => {
      const { isAuthenticated } = useCoachSession()
      expect(isAuthenticated.value).toBe(false)
    })

    it('should not be loading initially', () => {
      const { isLoading } = useCoachSession()
      expect(isLoading.value).toBe(false)
    })

    it('should be auth checking initially', () => {
      const { isAuthChecking } = useCoachSession()
      expect(isAuthChecking.value).toBe(true)
    })
  })

  describe('computed properties', () => {
    it('should return default display name when no coach', () => {
      const { displayName } = useCoachSession()
      expect(displayName.value).toBe('教練')
    })

    it('should return coach name when available', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.displayName.value).toBe('Test Coach')
    })

    it('should return null branch name when no coach', () => {
      const { branchName } = useCoachSession()
      expect(branchName.value).toBeNull()
    })

    it('should return branch name when coach available', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.branchName.value).toBe('Main Branch')
    })

    it('should return 0 student count when no coach', () => {
      const { studentCount } = useCoachSession()
      expect(studentCount.value).toBe(0)
    })

    it('should return student count from stats', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.studentCount.value).toBe(10)
    })

    it('should return 0 today class count when no coach', () => {
      const { todayClassCount } = useCoachSession()
      expect(todayClassCount.value).toBe(0)
    })

    it('should return today class count from stats', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.todayClassCount.value).toBe(3)
    })

    it('should be authenticated when coach exists', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.isAuthenticated.value).toBe(true)
    })
  })

  describe('fetchCoach', () => {
    it('should return false when no token available', async () => {
      const { fetchCoach, coach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(false)
      expect(coach.value).toBeNull()
    })

    it('should fetch and set coach profile on success', async () => {
      cookieStore.set('coach_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCoach,
      })

      const { fetchCoach, coach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(true)
      expect(coach.value).toEqual(mockCoach)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/me',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'valid-token' },
        })
      )
    })

    it('should use provided token instead of cookie', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCoach,
      })

      const { fetchCoach } = useCoachSession()
      await fetchCoach('custom-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/me',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'custom-token' },
        })
      )
    })

    it('should return false on unsuccessful response', async () => {
      cookieStore.set('coach_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: false,
      })

      const { fetchCoach, coach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(false)
      expect(coach.value).toBeNull()
    })

    it('should try refresh token on fetch error', async () => {
      cookieStore.set('coach_access_token', { value: 'expired-token' })

      mockFetch.mockRejectedValueOnce(new Error('401 Unauthorized'))
      mockRefreshAccessToken.mockResolvedValueOnce(true)

      // After refresh, the second fetchCoach call should succeed
      cookieStore.set('coach_access_token', { value: 'refreshed-token' })
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockCoach,
      })

      const { fetchCoach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(true)
      expect(mockRefreshAccessToken).toHaveBeenCalledOnce()
    })

    it('should return false if refresh also fails', async () => {
      cookieStore.set('coach_access_token', { value: 'expired-token' })

      mockFetch.mockRejectedValueOnce(new Error('401'))
      mockRefreshAccessToken.mockResolvedValueOnce(false)

      const { fetchCoach, coach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(false)
      expect(coach.value).toBeNull()
    })

    it('should not retry more than once', async () => {
      cookieStore.set('coach_access_token', { value: 'expired-token' })

      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('401'))
      // Refresh succeeds
      mockRefreshAccessToken.mockResolvedValueOnce(true)
      // But second fetch also fails
      mockFetch.mockRejectedValueOnce(new Error('401'))
      // Should NOT try to refresh again

      const { fetchCoach } = useCoachSession()
      const result = await fetchCoach()

      expect(result).toBe(false)
      // refreshAccessToken should only be called once (from the first retry)
      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('clearSession', () => {
    it('should clear coach data', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach
      expect(session.isAuthenticated.value).toBe(true)

      session.clearSession()
      expect(session.coach.value).toBeNull()
      expect(session.isAuthenticated.value).toBe(false)
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      const { isLoading, setLoading } = useCoachSession()

      setLoading(true)
      expect(isLoading.value).toBe(true)

      setLoading(false)
      expect(isLoading.value).toBe(false)
    })
  })

  describe('setAuthChecking', () => {
    it('should set auth checking state', () => {
      const { isAuthChecking, setAuthChecking } = useCoachSession()

      setAuthChecking(false)
      expect(isAuthChecking.value).toBe(false)

      setAuthChecking(true)
      expect(isAuthChecking.value).toBe(true)
    })
  })

  describe('updateCoachData', () => {
    it('should merge updates into coach data', () => {
      const session = useCoachSession()
      session.coach.value = mockCoach

      session.updateCoachData({ full_name: 'Updated Name' })

      expect(session.coach.value!.full_name).toBe('Updated Name')
      // Other fields should remain
      expect(session.coach.value!.email).toBe('coach@example.com')
    })

    it('should do nothing when no coach is set', () => {
      const session = useCoachSession()

      session.updateCoachData({ full_name: 'Updated Name' })

      expect(session.coach.value).toBeNull()
    })
  })
})
