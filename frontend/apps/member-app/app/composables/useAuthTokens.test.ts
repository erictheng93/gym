/**
 * Tests for useAuthTokens composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock cookie storage
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

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Import after mocks
import { useAuthTokens } from './useAuthTokens'

describe('useAuthTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieStore.clear()
  })

  describe('hasAccessToken', () => {
    it('should return false when no access token', () => {
      const { hasAccessToken } = useAuthTokens()
      expect(hasAccessToken.value).toBe(false)
    })

    it('should return true when access token exists', () => {
      cookieStore.set('member_access_token', { value: 'valid-access-token' })
      const { hasAccessToken } = useAuthTokens()
      expect(hasAccessToken.value).toBe(true)
    })
  })

  describe('hasRefreshToken', () => {
    it('should return false when no refresh token', () => {
      const { hasRefreshToken } = useAuthTokens()
      expect(hasRefreshToken.value).toBe(false)
    })

    it('should return true when refresh token exists', () => {
      cookieStore.set('member_refresh_token', { value: 'valid-refresh-token' })
      const { hasRefreshToken } = useAuthTokens()
      expect(hasRefreshToken.value).toBe(true)
    })
  })

  describe('setTokens', () => {
    it('should set both access and refresh tokens', () => {
      const { setTokens } = useAuthTokens()

      setTokens('new-access-token', 'new-refresh-token')

      expect(cookieStore.get('member_access_token')?.value).toBe('new-access-token')
      expect(cookieStore.get('member_refresh_token')?.value).toBe('new-refresh-token')
    })
  })

  describe('clearTokens', () => {
    it('should clear both tokens', () => {
      cookieStore.set('member_access_token', { value: 'access-token' })
      cookieStore.set('member_refresh_token', { value: 'refresh-token' })

      const { clearTokens } = useAuthTokens()
      clearTokens()

      expect(cookieStore.get('member_access_token')?.value).toBeNull()
      expect(cookieStore.get('member_refresh_token')?.value).toBeNull()
    })
  })

  describe('refreshAccessToken', () => {
    it('should return false when no refresh token', async () => {
      const { refreshAccessToken } = useAuthTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should refresh tokens successfully', async () => {
      cookieStore.set('member_refresh_token', { value: 'old-refresh-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        },
      })

      const { refreshAccessToken } = useAuthTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/otp/refresh',
        {
          method: 'POST',
          body: { refreshToken: 'old-refresh-token' },
        }
      )
      expect(cookieStore.get('member_access_token')?.value).toBe('new-access-token')
      expect(cookieStore.get('member_refresh_token')?.value).toBe('new-refresh-token')
    })

    it('should return false on refresh failure', async () => {
      cookieStore.set('member_refresh_token', { value: 'old-refresh-token' })

      mockFetch.mockResolvedValueOnce({
        success: false,
      })

      const { refreshAccessToken } = useAuthTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      cookieStore.set('member_refresh_token', { value: 'old-refresh-token' })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { refreshAccessToken } = useAuthTokens()
      const result = await refreshAccessToken()

      expect(result).toBe(false)
    })
  })

  describe('getAuthHeader', () => {
    it('should return empty object when no access token', () => {
      const { getAuthHeader } = useAuthTokens()
      const header = getAuthHeader()

      expect(header).toEqual({})
    })

    it('should return X-Member-Token header when access token exists', () => {
      cookieStore.set('member_access_token', { value: 'valid-access-token' })

      const { getAuthHeader } = useAuthTokens()
      const header = getAuthHeader()

      expect(header).toEqual({
        'X-Member-Token': 'valid-access-token',
      })
    })
  })

  describe('getTokenState', () => {
    it('should return current token state', () => {
      cookieStore.set('member_access_token', { value: 'access-token' })
      cookieStore.set('member_refresh_token', { value: 'refresh-token' })

      const { getTokenState } = useAuthTokens()
      const state = getTokenState()

      expect(state).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    it('should return null values when no tokens', () => {
      const { getTokenState } = useAuthTokens()
      const state = getTokenState()

      expect(state).toEqual({
        accessToken: null,
        refreshToken: null,
      })
    })
  })

  describe('accessToken computed', () => {
    it('should return current access token value', () => {
      cookieStore.set('member_access_token', { value: 'my-access-token' })

      const { accessToken } = useAuthTokens()

      expect(accessToken.value).toBe('my-access-token')
    })
  })

  describe('refreshToken computed', () => {
    it('should return current refresh token value', () => {
      cookieStore.set('member_refresh_token', { value: 'my-refresh-token' })

      const { refreshToken } = useAuthTokens()

      expect(refreshToken.value).toBe('my-refresh-token')
    })
  })
})
