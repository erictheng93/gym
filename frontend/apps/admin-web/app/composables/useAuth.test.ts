import { describe, it, expect, beforeEach } from 'vitest'
import { mockGlobalFetch, mockHandleError, mockNavigateTo, mockToast } from '@test/setup'
import { useAuth } from './useAuth'
import { loadSession, saveSession } from '~/utils/session-storage'

const mockFetchResponse = (data: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(data)
})

const apiUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: 'admin',
  employeeId: 'emp-1',
  tenantId: 'tenant-1'
}

const apiEmployee = {
  id: 'emp-1',
  fullName: 'Test User',
  employeeCode: 'EMP001',
  phone: null,
  branchId: 'branch-1',
  branchName: '總店',
  jobTitleId: 'job-1',
  jobTitleName: '經理'
}

const expectedEmployee = {
  id: 'emp-1',
  full_name: 'Test User',
  employee_code: 'EMP001',
  branch_id: 'branch-1',
  branch_name: '總店',
  job_title_id: 'job-1',
  job_title_name: '經理'
}

const calledEndpoints = () => mockGlobalFetch.mock.calls.map(call => String(call[0]))

describe('useAuth', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { user, currentEmployee, isAuthenticated, isLoading } = useAuth()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
      expect(isAuthenticated.value).toBe(false)
      expect(isLoading.value).toBe(false)
    })
  })

  describe('login', () => {
    it('應該成功登入、設定用戶與員工資訊並保存 session', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: apiUser, employee: apiEmployee }
      }))

      const { login, user, currentEmployee, isAuthenticated, isLoading } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(true)
      expect(user.value).toEqual(apiUser)
      expect(currentEmployee.value).toEqual(expectedEmployee)
      expect(isAuthenticated.value).toBe(true)
      expect(isLoading.value).toBe(false)
      expect(mockToast.success).toHaveBeenCalled()
      expect(loadSession()?.user).toEqual(apiUser)

      const [url, init] = mockGlobalFetch.mock.calls[0]!
      expect(String(url)).toContain('/api/auth/login')
      expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
      expect(JSON.parse(init.body)).toEqual({ email: 'test@example.com', password: 'password' })
    })

    it('應該在沒有員工資料時將 currentEmployee 設為 null', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: apiUser, employee: null }
      }))

      const { login, user, currentEmployee } = useAuth()
      currentEmployee.value = { ...expectedEmployee }
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(true)
      expect(user.value).toEqual(apiUser)
      expect(currentEmployee.value).toBeNull()
    })

    it('應該處理登入失敗：回傳錯誤訊息、呼叫 handleError、不設定用戶', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: false,
        error: 'Invalid credentials'
      }, false))

      const { login, user, isLoading } = useAuth()
      const result = await login('test@example.com', 'wrong')

      expect(result).toEqual({ success: false, error: 'Invalid credentials' })
      expect(user.value).toBeNull()
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockToast.success).not.toHaveBeenCalled()
      expect(loadSession()).toBeNull()
    })

    it('應該處理網路錯誤並呼叫 handleError', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'))

      const { login, isLoading } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result).toEqual({ success: false, error: 'Network error' })
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('應該呼叫登出 API、清除狀態與 session 並導向登入頁', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }))

      const { user, currentEmployee, logout } = useAuth()
      user.value = { ...apiUser }
      currentEmployee.value = { ...expectedEmployee }
      saveSession(user.value, currentEmployee.value)

      await logout()

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/logout'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
      expect(loadSession()).toBeNull()
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在登出 API 失敗時仍然清除狀態並導向登入頁', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Logout failed'))

      const { user, currentEmployee, logout } = useAuth()
      user.value = { ...apiUser }
      currentEmployee.value = { ...expectedEmployee }

      await logout()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })
  })

  describe('fetchUser', () => {
    it('應該成功取得用戶與員工資訊（不含 isActive）', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: { ...apiUser, isActive: true }, employee: apiEmployee }
      }))

      const { fetchUser, user, currentEmployee } = useAuth()
      await fetchUser()

      expect(user.value).toEqual(apiUser)
      expect(currentEmployee.value).toEqual(expectedEmployee)
    })

    it('應該在回應沒有用戶時清除狀態', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true, data: null }))

      const { fetchUser, user, currentEmployee } = useAuth()
      user.value = { ...apiUser }
      currentEmployee.value = { ...expectedEmployee }
      await fetchUser()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
    })

    it('應該在取得失敗時清除狀態', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchUser, user, currentEmployee } = useAuth()
      user.value = { ...apiUser }
      currentEmployee.value = { ...expectedEmployee }

      await fetchUser()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('checkAuth', () => {
    it('應該在伺服器驗證失敗且沒有快取 session 時返回 false', async () => {
      mockGlobalFetch.mockRejectedValue(new Error('Not authenticated'))

      const { checkAuth, user } = useAuth()
      const result = await checkAuth()

      expect(result).toBe(false)
      expect(user.value).toBeNull()
      expect(calledEndpoints().some(url => url.includes('/api/auth/refresh'))).toBe(false)
    })

    it('應該在沒有用戶時向伺服器驗證、設定用戶與員工並保存 session', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: { ...apiUser, isActive: true }, employee: apiEmployee }
      }))

      const { checkAuth, user, currentEmployee } = useAuth()
      const result = await checkAuth()

      expect(result).toBe(true)
      expect(user.value).toEqual(apiUser)
      expect(currentEmployee.value).toEqual(expectedEmployee)
      expect(loadSession()?.user).toEqual(apiUser)
    })

    it('應該在已有用戶時仍向伺服器重新驗證並更新資料', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: { ...apiUser, role: 'manager', isActive: true }, employee: apiEmployee }
      }))

      const { checkAuth, user, currentEmployee } = useAuth()
      user.value = { ...apiUser }
      currentEmployee.value = null

      const result = await checkAuth()

      expect(result).toBe(true)
      expect(calledEndpoints()[0]).toContain('/api/auth/me')
      expect(user.value?.role).toBe('manager')
      expect(currentEmployee.value).toEqual(expectedEmployee)
    })

    it('應該在已有用戶但伺服器 session 已失效時返回 false 並清除用戶', async () => {
      // default fetch mock answers { success: true, data: null } for every call
      const { checkAuth, user } = useAuth()
      user.value = { ...apiUser }

      const result = await checkAuth()

      expect(result).toBe(false)
      expect(user.value).toBeNull()
    })

    it('應該在伺服器驗證失敗但有快取 session 時嘗試 refresh 並恢復登入', async () => {
      saveSession({ ...apiUser }, null)
      mockGlobalFetch
        .mockRejectedValueOnce(new Error('401'))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }))
        .mockResolvedValueOnce(mockFetchResponse({
          success: true,
          data: { user: { ...apiUser, isActive: true }, employee: apiEmployee }
        }))

      const { checkAuth, user } = useAuth()
      const result = await checkAuth()

      expect(result).toBe(true)
      expect(user.value).toEqual(apiUser)
      expect(calledEndpoints().map(url => url.replace(/^.*\/api\/auth/, ''))).toEqual(['/me', '/refresh', '/me'])
    })

    it('應該在 refresh 失敗時清除快取 session 並返回 false', async () => {
      saveSession({ ...apiUser }, null)
      mockGlobalFetch
        .mockRejectedValueOnce(new Error('401'))
        .mockRejectedValueOnce(new Error('refresh failed'))

      const { checkAuth, user } = useAuth()
      const result = await checkAuth()

      expect(result).toBe(false)
      expect(user.value).toBeNull()
      expect(loadSession()).toBeNull()
    })
  })

  describe('changePassword', () => {
    it('應該送出新舊密碼並顯示成功訊息', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }))

      const { changePassword } = useAuth()
      const result = await changePassword('old-pass', 'new-pass')

      expect(result).toEqual({ success: true })
      const [url, init] = mockGlobalFetch.mock.calls[0]!
      expect(String(url)).toContain('/api/auth/change-password')
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'old-pass', newPassword: 'new-pass' })
      expect(mockToast.success).toHaveBeenCalled()
    })

    it('應該在失敗時回傳 success: false 並呼叫 handleError', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: false,
        error: 'Wrong password'
      }, false))

      const { changePassword } = useAuth()
      const result = await changePassword('bad', 'new-pass')

      expect(result).toEqual({ success: false })
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockToast.success).not.toHaveBeenCalled()
    })
  })
})
