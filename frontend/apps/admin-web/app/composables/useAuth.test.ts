import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockGlobalFetch, mockHandleError, mockToast } from '@test/setup'
import { useAuth } from './useAuth'

// Helper to create a mock fetch response
const mockFetchResponse = (data: any, ok = true) => {
  return {
    ok,
    json: () => Promise.resolve(data)
  }
}

describe('useAuth', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
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
    it('應該成功登入並取得用戶資訊', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        employeeId: 'emp-1',
        tenantId: 'tenant-1'
      }

      const mockEmployeeData = {
        id: 'emp-1',
        fullName: 'Test User',
        employeeCode: 'EMP001',
        branchId: 'branch-1',
        branchName: '總店',
        jobTitleId: 'job-1',
        jobTitleName: '經理'
      }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: { user: mockUser, employee: mockEmployeeData }
      }))

      const { login, user, currentEmployee } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(true)
      expect(user.value).toEqual(mockUser)
      expect(currentEmployee.value).toMatchObject({
        id: 'emp-1',
        full_name: 'Test User'
      })
    })

    it('應該處理登入失敗並呼叫 handleError', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: false,
        error: 'Invalid credentials'
      }, false))

      const { login } = useAuth()
      const result = await login('test@example.com', 'wrong')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理網路錯誤並呼叫 handleError', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'))

      const { login } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('應該成功登出並清除狀態', async () => {
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }))

      const { user, currentEmployee, logout } = useAuth()
      user.value = { id: 'user-1' } as any
      currentEmployee.value = { id: 'emp-1' } as any

      await logout()

      expect(mockGlobalFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/logout'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
    })

    it('應該在登出失敗時仍然清除狀態', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Logout failed'))

      const { user, currentEmployee, logout } = useAuth()
      user.value = { id: 'user-1' } as any
      currentEmployee.value = { id: 'emp-1' } as any

      await logout()

      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
    })
  })

  describe('fetchUser', () => {
    it('應該成功取得用戶資訊', async () => {
      const mockMeData = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        employeeId: 'emp-1',
        tenantId: 'tenant-1',
        isActive: true,
        employee: null
      }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: mockMeData
      }))

      const { fetchUser, user } = useAuth()
      await fetchUser()

      expect(user.value).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        employeeId: 'emp-1',
        tenantId: 'tenant-1'
      })
    })

    it('應該在取得失敗時設定為 null', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchUser, user } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchUser()

      expect(user.value).toBeNull()
    })
  })

  describe('checkAuth', () => {
    it('應該在未認證時返回 false', async () => {
      mockGlobalFetch.mockRejectedValueOnce(new Error('Not authenticated'))

      const { user, checkAuth } = useAuth()
      user.value = null

      const result = await checkAuth()

      expect(result).toBe(false)
    })

    it('應該在已有用戶時返回 true 並獲取員工資訊', async () => {
      const mockEmployeeData = {
        id: 'emp-1',
        fullName: 'Test User',
        employeeCode: 'EMP001',
        branchId: 'branch-1',
        branchName: '總店',
        jobTitleId: 'job-1',
        jobTitleName: '經理'
      }

      // Mock session check returning user with employee
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: { id: 'user-1', email: 'test@example.com' },
          employee: mockEmployeeData
        }
      }))

      const { user, currentEmployee, checkAuth } = useAuth()
      user.value = { id: 'user-1', email: 'test@example.com' } as any
      currentEmployee.value = null

      const result = await checkAuth()

      expect(result).toBe(true)
    })

    it('應該在用戶和員工都存在時直接返回 true', async () => {
      // Mock session check
      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: {
          user: { id: 'user-1' },
          employee: { id: 'emp-1' }
        }
      }))

      const { user, currentEmployee, checkAuth } = useAuth()
      user.value = { id: 'user-1', email: 'test@example.com' } as any
      currentEmployee.value = { id: 'emp-1', full_name: 'Test User' } as any

      const result = await checkAuth()

      expect(result).toBe(true)
    })

    it('應該在沒有用戶時嘗試取得用戶資訊', async () => {
      const mockMeData = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        employeeId: 'emp-1',
        tenantId: 'tenant-1',
        isActive: true,
        employee: {
          id: 'emp-1',
          fullName: 'Test User',
          employeeCode: 'EMP001',
          phone: null,
          branchId: 'branch-1',
          branchName: '總店',
          jobTitleId: 'job-1',
          jobTitleName: '經理'
        }
      }

      mockGlobalFetch.mockResolvedValueOnce(mockFetchResponse({
        success: true,
        data: mockMeData
      }))

      const { user, checkAuth } = useAuth()
      user.value = null

      const result = await checkAuth()

      expect(result).toBe(true)
      expect(user.value).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: 'admin',
        employeeId: 'emp-1',
        tenantId: 'tenant-1'
      })
    })
  })
})
