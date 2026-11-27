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
const runtimePublic: { apiBaseUrl: string; tenantSlug: string } = {
  apiBaseUrl: 'http://localhost:8056',
  tenantSlug: '',
}
vi.stubGlobal('useRuntimeConfig', () => ({ public: runtimePublic }))

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
const mockResetForLogout = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('useOfflineSync', () => ({ resetForLogout: mockResetForLogout }))

// Import after mocks
import { useAuthMethods } from './useAuthMethods'

describe('useAuthMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    cookieStore.clear()
    stateStore.set('current_member', { value: null })
    mockFetchMember.mockResolvedValue(true)
    runtimePublic.tenantSlug = ''
  })

  describe('OTP login tenant scope', () => {
    it('sends the deployment tenantSlug with send and verify when configured', async () => {
      runtimePublic.tenantSlug = 'my-gym'
      mockFetch.mockResolvedValueOnce({ success: true, message: 'ok' })
      mockFetch.mockResolvedValueOnce({ success: false, message: 'x' })

      const { sendOtp, verifyOtp } = useAuthMethods()
      await sendOtp('0912345678')
      await verifyOtp('0912345678', '123456')

      expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8056/api/member/otp/send', {
        method: 'POST',
        body: { identifier: '0912345678', type: 'phone', tenantSlug: 'my-gym' },
      })
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8056/api/member/otp/verify', {
        method: 'POST',
        body: { identifier: '0912345678', type: 'phone', code: '123456', tenantSlug: 'my-gym' },
      })
    })
  })

  describe('password login and forgot-password tenant scope', () => {
    it('sends the deployment tenantSlug with login and forgot-password when configured', async () => {
      runtimePublic.tenantSlug = 'my-gym'
      mockFetch.mockResolvedValueOnce({ success: false, error: 'x' })
      mockFetch.mockResolvedValueOnce({ success: true, message: 'ok' })

      const { login, forgotPassword } = useAuthMethods()
      await login('test@example.com', 'password123')
      await forgotPassword('test@example.com')

      expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8056/api/member/auth/login', {
        method: 'POST',
        body: { email: 'test@example.com', account: 'test@example.com', password: 'password123', tenantSlug: 'my-gym' },
      })
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8056/api/member/auth/forgot-password', {
        method: 'POST',
        body: { email: 'test@example.com', tenantSlug: 'my-gym' },
      })
    })
  })

  describe('sendEmailVerification and changeEmail', () => {
    it('posts the new email, then email + code, and refreshes the member', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockResolvedValueOnce({ success: true, message: '驗證碼已發送', data: { otp: '123456' } })
      mockFetch.mockResolvedValueOnce({ success: true, message: 'Email 已更新' })

      const { sendEmailVerification, changeEmail } = useAuthMethods()
      const sent = await sendEmailVerification('new@example.com')
      const changed = await changeEmail('new@example.com', '123456')

      expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8056/api/member/me/email/otp', {
        method: 'POST',
        headers: { 'X-Member-Token': 'valid-token' },
        body: { email: 'new@example.com' },
      })
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8056/api/member/me/email', {
        method: 'POST',
        headers: { 'X-Member-Token': 'valid-token' },
        body: { email: 'new@example.com', otpCode: '123456' },
      })
      expect(sent).toMatchObject({ success: true, otp: '123456' })
      expect(changed).toEqual({ success: true, message: 'Email 已更新' })
      expect(mockFetchMember).toHaveBeenCalledWith('valid-token')
    })

    it('returns the backend code (e.g. EMAIL_TAKEN) and needs a session', async () => {
      expect((await useAuthMethods().changeEmail('a@b.co', '123456')).code).toBe('UNAUTHORIZED')
      expect((await useAuthMethods().sendEmailVerification('a@b.co')).code).toBe('UNAUTHORIZED')
      expect(mockFetch).not.toHaveBeenCalled()

      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('[POST] 409'), {
        data: { success: false, error: '此 Email 已被其他會員使用', code: 'EMAIL_TAKEN' },
      }))
      const result = await useAuthMethods().changeEmail('a@b.co', '123456')
      expect(result).toMatchObject({ success: false, code: 'EMAIL_TAKEN' })
      expect(mockFetchMember).not.toHaveBeenCalled()
    })
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
          body: { email: 'test@example.com', account: 'test@example.com', password: 'password123' },
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

  describe('sendPhoneVerification', () => {
    it('posts the phone to the member-authenticated endpoint', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockResolvedValueOnce({ success: true, message: '驗證碼已發送', data: { expiresIn: 300, otp: '123456' } })

      const { sendPhoneVerification } = useAuthMethods()
      const result = await sendPhoneVerification('0912345678')

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/me/phone/otp', {
        method: 'POST',
        headers: { 'X-Member-Token': 'valid-token' },
        body: { phone: '0912345678' },
      })
      expect(result).toMatchObject({ success: true, otp: '123456' })
    })

    it('surfaces the backend error and code (409 PHONE_TAKEN)', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('[POST] 409 Conflict'), {
        data: { success: false, error: '此手機號碼已被其他會員使用', code: 'PHONE_TAKEN' },
      }))

      const { sendPhoneVerification } = useAuthMethods()
      const result = await sendPhoneVerification('0912345678')

      expect(result).toEqual({
        success: false,
        message: '此手機號碼已被其他會員使用',
        code: 'PHONE_TAKEN',
        attemptsRemaining: undefined,
      })
    })

    it('does not call the API without a member token', async () => {
      const { sendPhoneVerification } = useAuthMethods()
      const result = await sendPhoneVerification('0912345678')

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' })
    })
  })

  describe('completeProfile', () => {
    it('posts the camelCase body with the OTP code and refreshes the member', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '資料已更新',
        data: { member: { id: 'member-1', memberCode: 'M001', fullName: 'Test User' } },
      })

      const { completeProfile } = useAuthMethods()
      const result = await completeProfile({
        phone: '0912345678',
        otpCode: '123456',
        fullName: 'Test User',
        gender: 'MALE',
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/me/complete-profile', {
        method: 'POST',
        headers: { 'X-Member-Token': 'valid-token' },
        body: { phone: '0912345678', otpCode: '123456', fullName: 'Test User', gender: 'MALE' },
      })
      expect(mockFetchMember).toHaveBeenCalledWith('valid-token')
      expect(result.success).toBe(true)
    })

    it('returns the OTP error code and remaining attempts', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('[POST] 400 Bad Request'), {
        data: { success: false, error: '驗證碼錯誤', code: 'WRONG_CODE', attemptsRemaining: 2 },
      }))

      const { completeProfile } = useAuthMethods()
      const result = await completeProfile({ phone: '0912345678', otpCode: '000000' })

      expect(result).toEqual({ success: false, message: '驗證碼錯誤', code: 'WRONG_CODE', attemptsRemaining: 2 })
    })
  })

  describe('changePhone', () => {
    it('posts phone + code to /api/member/me/phone and refreshes the member', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockResolvedValueOnce({ success: true, message: '手機號碼已更新' })

      const { changePhone } = useAuthMethods()
      const result = await changePhone('0933111222', '123456')

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8056/api/member/me/phone', {
        method: 'POST',
        headers: { 'X-Member-Token': 'valid-token' },
        body: { phone: '0933111222', otpCode: '123456' },
      })
      expect(mockFetchMember).toHaveBeenCalledWith('valid-token')
      expect(result).toEqual({ success: true, message: '手機號碼已更新' })
    })

    it('returns the backend code (e.g. PHONE_TAKEN)', async () => {
      cookieStore.set('member_access_token', { value: 'valid-token' })
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('[POST] 409'), {
        data: { success: false, error: '此手機號碼已被其他會員使用', code: 'PHONE_TAKEN' },
      }))

      const result = await useAuthMethods().changePhone('0933111222', '123456')
      expect(result).toMatchObject({ success: false, code: 'PHONE_TAKEN' })
      expect(mockFetchMember).not.toHaveBeenCalled()
    })

    it('requires a session', async () => {
      const result = await useAuthMethods().changePhone('0933111222', '123456')
      expect(result.code).toBe('UNAUTHORIZED')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('should clear tokens, session, and navigate to login', async () => {
      const { logout } = useAuthMethods()
      await logout()

      expect(mockClearTokens).toHaveBeenCalled()
      // offline data must be flushed/wiped while the member's token is still set
      expect(mockResetForLogout.mock.invocationCallOrder[0]).toBeLessThan(mockClearTokens.mock.invocationCallOrder[0]!)
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
