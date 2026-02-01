/**
 * useSocialAuth Composable Tests
 *
 * Tests for the social authentication composable that handles
 * OAuth login with Google, LINE, and Apple.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock useRuntimeConfig
const mockConfig = {
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => mockConfig),
  ref: vi.fn((val) => ({ value: val })),
  computed: vi.fn((fn) => ({ value: fn() })),
  readonly: vi.fn((val) => val),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock window.location
const mockLocation = {
  href: '',
  origin: 'http://localhost:3000',
}
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
})

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {}
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn((key: string) => mockSessionStorage[key] || null),
    setItem: vi.fn((key: string, value: string) => { mockSessionStorage[key] = value }),
    removeItem: vi.fn((key: string) => { delete mockSessionStorage[key] }),
  },
  writable: true,
})

describe('useSocialAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.href = ''
    Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key])
  })

  describe('SOCIAL_PROVIDERS', () => {
    it('should export provider configurations', async () => {
      const { SOCIAL_PROVIDERS } = await import('./useSocialAuth')

      expect(SOCIAL_PROVIDERS).toBeDefined()
      expect(SOCIAL_PROVIDERS).toHaveLength(3)

      const providers = SOCIAL_PROVIDERS.map(p => p.id)
      expect(providers).toContain('google')
      expect(providers).toContain('line')
      expect(providers).toContain('apple')
    })

    it('should have correct provider properties', async () => {
      const { SOCIAL_PROVIDERS } = await import('./useSocialAuth')

      const googleProvider = SOCIAL_PROVIDERS.find(p => p.id === 'google')
      expect(googleProvider).toEqual({
        id: 'google',
        name: 'Google',
        icon: 'google',
        color: '#ffffff',
        textColor: '#757575',
      })

      const lineProvider = SOCIAL_PROVIDERS.find(p => p.id === 'line')
      expect(lineProvider).toEqual({
        id: 'line',
        name: 'LINE',
        icon: 'line',
        color: '#00c300',
        textColor: '#ffffff',
      })
    })
  })

  describe('availableProviders', () => {
    it('should filter to enabled providers', async () => {
      const { useSocialAuth } = await import('./useSocialAuth')
      const { availableProviders } = useSocialAuth()

      // Default enabled providers are line, google, apple
      const providers = availableProviders.value
      expect(providers).toHaveLength(3)

      const ids = providers.map((p: { id: string }) => p.id)
      expect(ids).toContain('google')
      expect(ids).toContain('line')
      expect(ids).toContain('apple')
    })
  })

  describe('fetchEnabledProviders', () => {
    it('should fetch providers from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            providers: [
              { provider: 'google', enabled: true, name: 'Google' },
              { provider: 'line', enabled: true, name: 'LINE' },
            ],
          },
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { fetchEnabledProviders } = useSocialAuth()

      const providers = await fetchEnabledProviders()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/oauth/providers',
        expect.objectContaining({
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
      )
      expect(providers).toHaveLength(2)
    })

    it('should return empty array on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { useSocialAuth } = await import('./useSocialAuth')
      const { fetchEnabledProviders } = useSocialAuth()

      const providers = await fetchEnabledProviders()
      expect(providers).toEqual([])
    })
  })

  describe('loginWithProvider', () => {
    it('should fetch auth URL and redirect', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=xxx'
      const mockState = 'abc123'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            authUrl: mockAuthUrl,
            state: mockState,
          },
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { loginWithProvider } = useSocialAuth()

      await loginWithProvider('google')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/member/oauth/google/init'),
        expect.objectContaining({
          method: 'GET',
        }),
      )

      expect(mockLocation.href).toBe(mockAuthUrl)
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('oauth_state', mockState)
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('oauth_provider', 'google')
    })

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Google 登入尚未設定',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { loginWithProvider, error } = useSocialAuth()

      await loginWithProvider('google')

      // Should not redirect
      expect(mockLocation.href).toBe('')
      expect(error.value).toBe('Google 登入尚未設定')
    })
  })

  describe('handleCallback', () => {
    it('should exchange code for tokens on existing member', async () => {
      // Set stored state
      mockSessionStorage['oauth_state'] = 'stored_state'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            isNewMember: false,
            accessToken: 'access_token_123',
            refreshToken: 'refresh_token_123',
            expiresIn: 3600,
            member: {
              id: 'member-1',
              memberCode: 'M001',
              fullName: '測試會員',
              status: 'ACTIVE',
            },
            branch: {
              name: '台北店',
            },
          },
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { handleCallback } = useSocialAuth()

      const result = await handleCallback('google', 'auth_code_123', 'stored_state')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/oauth/google/callback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'auth_code_123',
            state: 'stored_state',
            user: undefined,
          }),
        }),
      )

      expect(result.success).toBe(true)
      expect(result.isNewMember).toBe(false)
      expect(result.accessToken).toBe('access_token_123')
      expect(result.member?.fullName).toBe('測試會員')

      // Should clear sessionStorage
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('oauth_state')
    })

    it('should handle new member registration flow', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            isNewMember: true,
            needsRegistration: true,
            socialInfo: {
              provider: 'google',
              providerUserId: 'google_123',
              email: 'test@gmail.com',
              displayName: 'Test User',
            },
          },
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { handleCallback } = useSocialAuth()

      const result = await handleCallback('google', 'auth_code_123')

      expect(result.success).toBe(true)
      expect(result.needsRegistration).toBe(true)
      expect(result.socialInfo?.email).toBe('test@gmail.com')
    })

    it('should handle invalid state error', async () => {
      // Set different stored state
      mockSessionStorage['oauth_state'] = 'different_state'

      const { useSocialAuth } = await import('./useSocialAuth')
      const { handleCallback } = useSocialAuth()

      const result = await handleCallback('google', 'auth_code_123', 'wrong_state')

      expect(result.success).toBe(false)
      expect(result.error).toBe('授權狀態無效，請重新登入')
    })

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: '授權失敗，請重試',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { handleCallback } = useSocialAuth()

      const result = await handleCallback('google', 'invalid_code')

      expect(result.success).toBe(false)
      expect(result.error).toBe('授權失敗，請重試')
    })
  })

  describe('linkSocialAccount', () => {
    it('should link social account to existing member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: '已成功連結 google 帳號',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { linkSocialAccount } = useSocialAuth()

      const result = await linkSocialAccount('google', 'auth_code', 'member_token')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/oauth/link',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Member-Token': 'member_token',
          }),
          body: JSON.stringify({
            provider: 'google',
            code: 'auth_code',
          }),
        }),
      )

      expect(result.success).toBe(true)
    })

    it('should handle already linked error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: '此帳號已連結',
          code: 'ALREADY_LINKED',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { linkSocialAccount } = useSocialAuth()

      const result = await linkSocialAccount('google', 'auth_code', 'member_token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('此帳號已連結')
    })
  })

  describe('unlinkSocialAccount', () => {
    it('should unlink social account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: '已取消連結 google 帳號',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { unlinkSocialAccount } = useSocialAuth()

      const result = await unlinkSocialAccount('google', 'member_token')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/oauth/google',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'X-Member-Token': 'member_token',
          }),
        }),
      )

      expect(result.success).toBe(true)
    })

    it('should handle no other login method error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: '無法取消連結，請先設定其他登入方式',
          code: 'NO_OTHER_LOGIN_METHOD',
        }),
      })

      const { useSocialAuth } = await import('./useSocialAuth')
      const { unlinkSocialAccount } = useSocialAuth()

      const result = await unlinkSocialAccount('google', 'member_token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('無法取消連結，請先設定其他登入方式')
    })
  })

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'))

      const { useSocialAuth } = await import('./useSocialAuth')
      const { handleCallback, clearError, error } = useSocialAuth()

      await handleCallback('google', 'code')
      expect(error.value).toBeTruthy()

      clearError()
      expect(error.value).toBeNull()
    })
  })
})
