/**
 * Tests for useAuthMethods composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ../utils/apiHelpers module
vi.mock('../utils/apiHelpers', () => ({
  extractErrorMessage: (error: unknown, fallback: string) => {
    if (!error) return fallback
    if (error instanceof Error) {
      return error.message || fallback
    }
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>
      if ('data' in err && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, unknown>
        if ('message' in data) return String(data.message)
      }
      if ('message' in err) return String(err.message)
    }
    return fallback
  },
}))

// Create mock state and cookie storage
const stateStore = new Map<string, { value: unknown }>()
const cookieStore = new Map<string, { value: string | null | undefined }>()

// Mock functions
const mockSetTokens = vi.fn((access: string, refresh: string) => {
  cookieStore.set('member_access_token', { value: access })
  cookieStore.set('member_refresh_token', { value: refresh })
})
const mockClearTokens = vi.fn(() => {
  cookieStore.set('member_access_token', { value: null })
  cookieStore.set('member_refresh_token', { value: null })
})
const mockFetchMember = vi.fn()
const mockClearSession = vi.fn(() => {
  stateStore.set('current_member', { value: null })
})
const mockSetLoading = vi.fn((loading: boolean) => {
  if (!stateStore.has('member_auth_loading')) {
    stateStore.set('member_auth_loading', { value: false })
  }
  stateStore.get('member_auth_loading')!.value = loading
})
const mockNavigateTo = vi.fn()

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

vi.stubGlobal('navigateTo', mockNavigateTo)

// Mock useAuthTokens
vi.stubGlobal('useAuthTokens', () => ({
  setTokens: mockSetTokens,
  clearTokens: mockClearTokens,
  getAuthHeader: () => {
    const token = cookieStore.get('member_access_token')?.value
    return token ? { 'X-Member-Token': token } : {}
  },
}))

// Mock useAuthSession
vi.stubGlobal('useAuthSession', () => ({
  fetchMember: mockFetchMember,
  clearSession: mockClearSession,
  setLoading: mockSetLoading,
  member: stateStore.get('current_member') || { value: null },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Import after mocks
import { useAuthMethods } from './useAuthMethods'

describe('useAuthMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    stateStore.set('current_member', { value: null })
    mockFetchMember.mockResolvedValue(true)
  })

  describe('sendOtp', () => {
    it('should send OTP successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '驗證碼已發送',
        data: {
          expiresIn: 300,
          otp: '123456',
        },
      })

      const { sendOtp } = useAuthMethods()
      const result = await sendOtp('0912345678')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/otp/send',
        {
          method: 'POST',
          body: {
            identifier: '0912345678',
            type: 'phone',
          },
        }
      )
      expect(result.success).toBe(true)
      expect(result.message).toBe('驗證碼已發送')
      expect(result.otp).toBe('123456')
    })

    it('should handle send OTP error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '發送太頻繁，請稍後再試' },
      })

      const { sendOtp } = useAuthMethods()
      const result = await sendOtp('0912345678')

      expect(result.success).toBe(false)
      expect(result.message).toBe('發送太頻繁，請稍後再試')
    })
  })

  describe('verifyOtp', () => {
    it('should verify OTP and login successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '登入成功',
        data: {
          member: { id: 'member-1', fullName: 'Test' },
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 86400,
        },
      })

      const { verifyOtp } = useAuthMethods()
      const result = await verifyOtp('0912345678', '123456')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/otp/verify',
        {
          method: 'POST',
          body: {
            identifier: '0912345678',
            type: 'phone',
            code: '123456',
          },
        }
      )
      expect(mockSetTokens).toHaveBeenCalledWith('new-access-token', 'new-refresh-token')
      expect(mockFetchMember).toHaveBeenCalledWith('new-access-token')
      expect(result.success).toBe(true)
    })

    it('should handle invalid OTP', async () => {
      mockFetch.mockResolvedValueOnce({
        success: false,
        message: '驗證碼錯誤',
      })

      const { verifyOtp } = useAuthMethods()
      const result = await verifyOtp('0912345678', '000000')

      expect(result.success).toBe(false)
      expect(result.message).toBe('驗證碼錯誤')
      expect(mockSetTokens).not.toHaveBeenCalled()
    })

    it('should handle verify error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { verifyOtp } = useAuthMethods()
      const result = await verifyOtp('0912345678', '123456')

      expect(result.success).toBe(false)
      // extractErrorMessage returns the Error message when available
      expect(result.message).toBe('Network error')
    })
  })

  describe('loginWithOtp', () => {
    it('should be an alias for verifyOtp', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '登入成功',
        data: {
          member: { id: 'member-1' },
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 86400,
        },
      })

      const { loginWithOtp } = useAuthMethods()
      const result = await loginWithOtp('0912345678', '123456')

      expect(result.success).toBe(true)
    })
  })

  describe('login', () => {
    it('should login with email/password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '登入成功',
        data: {
          member: { id: 'member-1', fullName: 'Test' },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 86400,
        },
      })

      const { login } = useAuthMethods()
      const result = await login('test@example.com', 'password123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/auth/login',
        {
          method: 'POST',
          body: { email: 'test@example.com', password: 'password123' },
        }
      )
      expect(mockSetTokens).toHaveBeenCalledWith('access-token', 'refresh-token')
      expect(mockFetchMember).toHaveBeenCalledWith('access-token')
      expect(result.success).toBe(true)
    })

    it('should handle invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        success: false,
        message: '帳號或密碼錯誤',
      })

      const { login } = useAuthMethods()
      const result = await login('test@example.com', 'wrong')

      expect(result.success).toBe(false)
      expect(result.message).toBe('帳號或密碼錯誤')
    })

    it('should handle login network error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '伺服器錯誤' },
      })

      const { login } = useAuthMethods()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toBe('伺服器錯誤')
    })
  })

  describe('forgotPassword', () => {
    it('should request password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '重設密碼郵件已發送',
        data: {
          resetUrl: 'http://localhost/reset?token=abc',
        },
      })

      const { forgotPassword } = useAuthMethods()
      const result = await forgotPassword('test@example.com')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/auth/forgot-password',
        {
          method: 'POST',
          body: { email: 'test@example.com' },
        }
      )
      expect(result.success).toBe(true)
      expect(result.resetUrl).toBe('http://localhost/reset?token=abc')
    })

    it('should handle forgot password error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { forgotPassword } = useAuthMethods()
      const result = await forgotPassword('test@example.com')

      expect(result.success).toBe(false)
      // extractErrorMessage returns the Error message when available
      expect(result.message).toBe('Network error')
    })
  })

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '密碼已重設',
      })

      const { resetPassword } = useAuthMethods()
      const result = await resetPassword('valid-token', 'newPassword123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/auth/reset-password',
        {
          method: 'POST',
          body: {
            token: 'valid-token',
            password: 'newPassword123',
          },
        }
      )
      expect(result.success).toBe(true)
    })

    it('should handle invalid reset token', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '重設連結已過期' },
      })

      const { resetPassword } = useAuthMethods()
      const result = await resetPassword('expired-token', 'newPassword123')

      expect(result.success).toBe(false)
      expect(result.message).toBe('重設連結已過期')
    })
  })

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '密碼已變更',
      })

      const { changePassword } = useAuthMethods()
      const result = await changePassword('oldPassword', 'newPassword123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/auth/change-password',
        {
          method: 'POST',
          headers: { 'X-Member-Token': 'valid-token' },
          body: {
            currentPassword: 'oldPassword',
            newPassword: 'newPassword123',
          },
        }
      )
      expect(result.success).toBe(true)
    })

    it('should fail when not authenticated', async () => {
      const { changePassword } = useAuthMethods()
      const result = await changePassword('oldPassword', 'newPassword123')

      expect(result.success).toBe(false)
      expect(result.message).toBe('請先登入')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle wrong current password', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockRejectedValueOnce({
        data: { message: '目前密碼錯誤' },
      })

      const { changePassword } = useAuthMethods()
      const result = await changePassword('wrongPassword', 'newPassword123')

      expect(result.success).toBe(false)
      expect(result.message).toBe('目前密碼錯誤')
    })
  })

  describe('completeProfile', () => {
    it('should complete profile successfully', async () => {
      // Set up auth token
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '資料已更新',
        data: {
          member: {
            id: 'member-1',
            memberCode: 'M001',
            fullName: 'Test User',
          },
        },
      })

      const { completeProfile } = useAuthMethods()
      const result = await completeProfile({
        fullName: 'Test User',
        phone: '0912345678',
        gender: 'MALE',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/me/complete-profile',
        {
          method: 'POST',
          headers: { 'X-Member-Token': 'valid-token' },
          body: {
            fullName: 'Test User',
            phone: '0912345678',
            gender: 'MALE',
          },
        }
      )
      expect(result.success).toBe(true)
    })

    it('should handle profile completion error', async () => {
      // Set up auth token
      cookieStore.set('member_access_token', { value: 'valid-token' })

      mockFetch.mockRejectedValueOnce({
        data: { message: '電話號碼已被使用' },
      })

      const { completeProfile } = useAuthMethods()
      const result = await completeProfile({
        fullName: 'Test User',
        phone: '0912345678',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('電話號碼已被使用')
    })
  })

  describe('logout', () => {
    it('should clear tokens, session, and navigate to login', async () => {
      const { logout } = useAuthMethods()
      await logout()

      expect(mockClearTokens).toHaveBeenCalled()
      expect(mockClearSession).toHaveBeenCalled()
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })
  })

  describe('loginWithOAuth', () => {
    it('should login via OAuth session successfully', async () => {
      // Set up auth token (simulating OAuth callback setting the token)
      cookieStore.set('member_access_token', { value: 'oauth-token' })

      const { loginWithOAuth } = useAuthMethods()
      const result = await loginWithOAuth()

      expect(mockFetchMember).toHaveBeenCalledWith('oauth-token')
      expect(result.success).toBe(true)
    })

    it('should handle missing token', async () => {
      // No token set - simulates OAuth callback failure
      const { loginWithOAuth } = useAuthMethods()
      const result = await loginWithOAuth()

      expect(result.success).toBe(false)
      expect(result.error).toBe('無法取得認證資訊')
    })

    it('should handle OAuth error', async () => {
      cookieStore.set('member_access_token', { value: 'oauth-token' })
      mockFetchMember.mockRejectedValueOnce(new Error('Session expired'))

      const { loginWithOAuth } = useAuthMethods()
      const result = await loginWithOAuth()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Session expired')
    })
  })
})
