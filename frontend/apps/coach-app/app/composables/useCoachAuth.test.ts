/**
 * Tests for useCoachAuth composable (Facade)
 *
 * This tests the unified authentication facade that delegates to:
 * - useCoachTokens
 * - useCoachSession
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state stores
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

// Mock navigateTo
const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

// Mock useRouter
vi.stubGlobal('useRouter', () => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

// Mock child composables
const mockTokens = {
  accessToken: { value: null as string | null },
  refreshToken: { value: null as string | null },
  hasAccessToken: { get value() { return !!cookieStore.get('coach_access_token')?.value } },
  hasRefreshToken: { get value() { return !!cookieStore.get('coach_refresh_token')?.value } },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  refreshAccessToken: vi.fn().mockResolvedValue(true),
  getAuthHeader: () => {
    const token = cookieStore.get('coach_access_token')?.value
    return token ? { 'X-Coach-Token': token } : {}
  },
}

const mockSession = {
  coach: stateStore.get('coach') || { value: null },
  isAuthenticated: { get value() { return !!stateStore.get('coach')?.value } },
  isLoading: { value: false },
  displayName: { get value() { return stateStore.get('coach')?.value?.full_name ?? '教練' } },
  fetchCoach: vi.fn().mockResolvedValue(true),
  clearSession: vi.fn(),
  setLoading: vi.fn(),
}

vi.stubGlobal('useCoachTokens', () => mockTokens)
vi.stubGlobal('useCoachSession', () => {
  if (!stateStore.has('coach')) {
    stateStore.set('coach', { value: null })
  }
  return {
    ...mockSession,
    coach: stateStore.get('coach')!,
    isAuthenticated: { get value() { return !!stateStore.get('coach')?.value } },
    displayName: { get value() { return stateStore.get('coach')?.value?.full_name ?? '教練' } },
  }
})

// Import after mocks are set up
import { useCoachAuth } from './useCoachAuth'

describe('useCoachAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    mockFetch.mockReset()
  })

  describe('initialization', () => {
    it('should expose state from useCoachSession', () => {
      const auth = useCoachAuth()

      expect(auth.coach).toBeDefined()
      expect(auth.isAuthenticated).toBeDefined()
      expect(auth.isLoading).toBeDefined()
      expect(auth.displayName).toBeDefined()
    })

    it('should expose token methods from useCoachTokens', () => {
      const auth = useCoachAuth()

      expect(auth.getAuthHeader).toBeDefined()
    })
  })

  describe('isAuthenticated', () => {
    it('should return false when no coach is logged in', () => {
      const { isAuthenticated } = useCoachAuth()
      expect(isAuthenticated.value).toBe(false)
    })

    it('should return true when coach exists', () => {
      const { coach, isAuthenticated } = useCoachAuth()
      coach.value = mockCoach
      expect(isAuthenticated.value).toBe(true)
    })
  })

  describe('displayName', () => {
    it('should return default when no coach', () => {
      const { displayName } = useCoachAuth()
      expect(displayName.value).toBe('教練')
    })

    it('should return coach full name when available', () => {
      const { coach, displayName } = useCoachAuth()
      coach.value = mockCoach
      expect(displayName.value).toBe('Test Coach')
    })
  })

  describe('login', () => {
    it('should call API with credentials and set tokens on success', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          coach: mockCoach,
        },
      })

      const auth = useCoachAuth()
      const result = await auth.login('coach@example.com', 'password123')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: {
            email: 'coach@example.com',
            password: 'password123',
          },
        })
      )
    })

    it('should return error on failed login', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '帳號或密碼錯誤' },
      })

      const auth = useCoachAuth()
      const result = await auth.login('wrong@example.com', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(result.message).toBe('帳號或密碼錯誤')
    })
  })

  describe('logout', () => {
    it('should clear tokens and session', async () => {
      stateStore.set('coach', { value: mockCoach })
      cookieStore.set('coach_access_token', { value: 'some-token' })

      const auth = useCoachAuth()
      await auth.logout()

      expect(mockTokens.clearTokens).toHaveBeenCalled()
      expect(mockSession.clearSession).toHaveBeenCalled()
    })
  })

  describe('checkAuth', () => {
    it('should return true if already authenticated', async () => {
      stateStore.set('coach', { value: mockCoach })

      const auth = useCoachAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
    })

    it('should try to fetch coach with access token', async () => {
      cookieStore.set('coach_access_token', { value: 'valid-token' })
      mockSession.fetchCoach.mockResolvedValueOnce(true)

      const auth = useCoachAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
      expect(mockSession.fetchCoach).toHaveBeenCalled()
    })

    it('should try to refresh token if access token fetch fails', async () => {
      cookieStore.set('coach_access_token', { value: 'expired-token' })
      cookieStore.set('coach_refresh_token', { value: 'valid-refresh-token' })

      mockSession.fetchCoach.mockResolvedValueOnce(false)
      mockTokens.refreshAccessToken.mockResolvedValueOnce(true)
      mockSession.fetchCoach.mockResolvedValueOnce(true)

      const auth = useCoachAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(true)
      expect(mockTokens.refreshAccessToken).toHaveBeenCalled()
    })

    it('should return false if all auth methods fail', async () => {
      mockSession.fetchCoach.mockResolvedValue(false)
      mockTokens.refreshAccessToken.mockResolvedValue(false)

      const auth = useCoachAuth()
      const result = await auth.checkAuth()

      expect(result).toBe(false)
    })
  })

  describe('getAuthHeader', () => {
    it('should return empty object when no token', () => {
      const { getAuthHeader } = useCoachAuth()
      expect(getAuthHeader()).toEqual({})
    })

    it('should return X-Coach-Token header when token exists', () => {
      cookieStore.set('coach_access_token', { value: 'my-token' })

      const { getAuthHeader } = useCoachAuth()
      expect(getAuthHeader()).toEqual({
        'X-Coach-Token': 'my-token',
      })
    })
  })

  describe('changePassword', () => {
    it('should call API to change password', async () => {
      cookieStore.set('coach_access_token', { value: 'valid-token' })
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '密碼已更新',
      })

      const auth = useCoachAuth()
      const result = await auth.changePassword('oldpass', 'newpass')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/auth/change-password',
        expect.objectContaining({
          method: 'POST',
          body: {
            current_password: 'oldpass',
            new_password: 'newpass',
          },
        })
      )
    })
  })

  describe('facade pattern', () => {
    it('should provide unified interface to all auth functionality', () => {
      const auth = useCoachAuth()

      const expectedProperties = [
        // State
        'coach',
        'isAuthenticated',
        'isLoading',
        'displayName',
        // Methods
        'login',
        'logout',
        'checkAuth',
        'changePassword',
        'getAuthHeader',
      ]

      for (const prop of expectedProperties) {
        expect(auth).toHaveProperty(prop)
      }
    })
  })
})
