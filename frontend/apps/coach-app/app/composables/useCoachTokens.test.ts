/**
 * Tests for useCoachTokens composable
 *
 * Tests JWT token management including:
 * - Token storage via cookies
 * - Token presence detection
 * - Set/clear tokens
 * - Token refresh
 * - Auth header generation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cookie store
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

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

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { PROD: false } } })

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Import after mocks
import { useCoachTokens } from './useCoachTokens'

describe('useCoachTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieStore.clear()
    mockFetch.mockReset()
  })

  describe('initial state', () => {
    it('should have null tokens initially', () => {
      const { accessToken, refreshToken } = useCoachTokens()

      expect(accessToken.value).toBeNull()
      expect(refreshToken.value).toBeNull()
    })

    it('should report no tokens available', () => {
      const { hasAccessToken, hasRefreshToken } = useCoachTokens()

      expect(hasAccessToken.value).toBe(false)
      expect(hasRefreshToken.value).toBe(false)
    })
  })

  describe('setTokens', () => {
    it('should store access and refresh tokens', () => {
      const { setTokens, accessToken, refreshToken } = useCoachTokens()

      setTokens('access-123', 'refresh-456')

      expect(accessToken.value).toBe('access-123')
      expect(refreshToken.value).toBe('refresh-456')
    })

    it('should update hasAccessToken and hasRefreshToken', () => {
      const { setTokens, hasAccessToken, hasRefreshToken } = useCoachTokens()

      setTokens('access-123', 'refresh-456')

      expect(hasAccessToken.value).toBe(true)
      expect(hasRefreshToken.value).toBe(true)
    })
  })

  describe('clearTokens', () => {
    it('should clear all tokens', () => {
      const { setTokens, clearTokens, accessToken, refreshToken } = useCoachTokens()

      setTokens('access-123', 'refresh-456')
      clearTokens()

      expect(accessToken.value).toBeNull()
      expect(refreshToken.value).toBeNull()
    })

    it('should update hasAccessToken and hasRefreshToken to false', () => {
      const { setTokens, clearTokens, hasAccessToken, hasRefreshToken } = useCoachTokens()

      setTokens('access-123', 'refresh-456')
      clearTokens()

      expect(hasAccessToken.value).toBe(false)
      expect(hasRefreshToken.value).toBe(false)
    })
  })

  describe('refreshAccessToken', () => {
    it('should return false when no refresh token exists', async () => {
      const { refreshAccessToken } = useCoachTokens()

      const result = await refreshAccessToken()

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should refresh tokens successfully', async () => {
      cookieStore.set('coach_refresh_token', { value: 'old-refresh' })
      cookieStore.set('coach_access_token', { value: 'old-access' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      })

      const { refreshAccessToken } = useCoachTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: { refresh_token: 'old-refresh' },
        })
      )
      expect(cookieStore.get('coach_access_token')!.value).toBe('new-access')
      expect(cookieStore.get('coach_refresh_token')!.value).toBe('new-refresh')
    })

    it('should return false on refresh failure', async () => {
      cookieStore.set('coach_refresh_token', { value: 'expired-refresh' })

      mockFetch.mockResolvedValueOnce({
        success: false,
      })

      const { refreshAccessToken } = useCoachTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      cookieStore.set('coach_refresh_token', { value: 'some-refresh' })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { refreshAccessToken } = useCoachTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(false)
    })
  })

  describe('getAuthHeader', () => {
    it('should return empty object when no access token', () => {
      const { getAuthHeader } = useCoachTokens()

      expect(getAuthHeader()).toEqual({})
    })

    it('should return X-Coach-Token header when token exists', () => {
      cookieStore.set('coach_access_token', { value: 'my-token' })

      const { getAuthHeader } = useCoachTokens()

      expect(getAuthHeader()).toEqual({
        'X-Coach-Token': 'my-token',
      })
    })
  })

  describe('getTokenState', () => {
    it('should return null tokens when empty', () => {
      const { getTokenState } = useCoachTokens()
      const state = getTokenState()

      expect(state).toEqual({
        accessToken: null,
        refreshToken: null,
      })
    })

    it('should return current token values', () => {
      cookieStore.set('coach_access_token', { value: 'access-123' })
      cookieStore.set('coach_refresh_token', { value: 'refresh-456' })

      const { getTokenState } = useCoachTokens()
      const state = getTokenState()

      expect(state).toEqual({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      })
    })
  })
})
