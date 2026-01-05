import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockDirectusInstance, mockHandleError } from '@test/setup'
import { useAuth } from './useAuth'

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
        first_name: 'Test',
        last_name: 'User',
        role: 'admin'
      }

      const mockEmployee = {
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: 'EMP001',
        branch_id: 'branch-1',
        job_title_id: 'job-1',
        branch: { name: '總店' },
        job_title: { name: '經理' }
      }

      mockDirectusInstance.login.mockResolvedValueOnce(undefined)
      mockDirectusInstance.request
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce([mockEmployee])

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
      mockDirectusInstance.login.mockRejectedValueOnce(new Error('Invalid credentials'))

      const { login } = useAuth()
      const result = await login('test@example.com', 'wrong')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理未知錯誤並呼叫 handleError', async () => {
      mockDirectusInstance.login.mockRejectedValueOnce('Unknown error')

      const { login } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('應該成功登出並清除狀態', async () => {
      mockDirectusInstance.logout.mockResolvedValueOnce(undefined)

      const { user, currentEmployee, logout } = useAuth()
      user.value = { id: 'user-1' } as any
      currentEmployee.value = { id: 'emp-1' } as any

      await logout()

      expect(mockDirectusInstance.logout).toHaveBeenCalled()
      expect(user.value).toBeNull()
      expect(currentEmployee.value).toBeNull()
    })

    it('應該在登出失敗時仍然清除狀態', async () => {
      mockDirectusInstance.logout.mockRejectedValueOnce(new Error('Logout failed'))

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
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'admin'
      }

      mockDirectusInstance.request.mockResolvedValueOnce(mockUser)

      const { fetchUser, user } = useAuth()
      await fetchUser()

      expect(user.value).toEqual(mockUser)
    })

    it('應該在取得失敗時設定為 null', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Failed'))

      const { fetchUser, user } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchUser()

      expect(user.value).toBeNull()
    })
  })

  describe('fetchCurrentEmployee', () => {
    it('應該成功取得員工資訊', async () => {
      const mockEmployee = {
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: 'EMP001',
        branch_id: 'branch-1',
        job_title_id: 'job-1',
        branch: { name: '總店' },
        job_title: { name: '經理' }
      }

      mockDirectusInstance.request.mockResolvedValueOnce([mockEmployee])

      const { user, fetchCurrentEmployee, currentEmployee } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchCurrentEmployee()

      expect(currentEmployee.value).toMatchObject({
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: 'EMP001',
        branch_id: 'branch-1',
        branch_name: '總店',
        job_title_id: 'job-1',
        job_title_name: '經理'
      })
    })

    it('應該在沒有用戶時設定員工為 null', async () => {
      const { user, fetchCurrentEmployee, currentEmployee } = useAuth()
      user.value = null
      currentEmployee.value = { id: 'emp-1' } as any

      await fetchCurrentEmployee()

      expect(currentEmployee.value).toBeNull()
      expect(mockDirectusInstance.request).not.toHaveBeenCalled()
    })

    it('應該在沒有找到員工時設定為 null', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { user, fetchCurrentEmployee, currentEmployee } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchCurrentEmployee()

      expect(currentEmployee.value).toBeNull()
    })

    it('應該處理取得失敗的情況並呼叫 handleError', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Fetch failed'))

      const { user, fetchCurrentEmployee, currentEmployee } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchCurrentEmployee()

      expect(mockHandleError).toHaveBeenCalled()
      expect(currentEmployee.value).toBeNull()
    })

    it('應該正確處理員工資料中的 null 值', async () => {
      const mockEmployee = {
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: null,
        branch_id: null,
        job_title_id: null
      }

      mockDirectusInstance.request.mockResolvedValueOnce([mockEmployee])

      const { user, fetchCurrentEmployee, currentEmployee } = useAuth()
      user.value = { id: 'user-1' } as any

      await fetchCurrentEmployee()

      expect(currentEmployee.value).toMatchObject({
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: null,
        branch_id: null,
        branch_name: null,
        job_title_id: null,
        job_title_name: null
      })
    })
  })

  describe('checkAuth', () => {
    it('應該在未認證時返回 false', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Not authenticated'))

      const { user, checkAuth } = useAuth()
      user.value = null

      const result = await checkAuth()

      expect(result).toBe(false)
    })

    it('應該在已有用戶時返回 true', async () => {
      const mockEmployee = {
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: 'EMP001',
        branch_id: 'branch-1',
        job_title_id: 'job-1',
        branch: { name: '總店' },
        job_title: { name: '經理' }
      }

      mockDirectusInstance.request.mockResolvedValueOnce([mockEmployee])

      const { user, currentEmployee, checkAuth } = useAuth()
      user.value = { id: 'user-1', email: 'test@example.com' } as any
      currentEmployee.value = null

      const result = await checkAuth()

      expect(result).toBe(true)
      expect(currentEmployee.value).not.toBeNull()
    })

    it('應該在用戶和員工都存在時返回 true', async () => {
      const { user, currentEmployee, checkAuth } = useAuth()
      user.value = { id: 'user-1', email: 'test@example.com' } as any
      currentEmployee.value = { id: 'emp-1', full_name: 'Test User' } as any

      const result = await checkAuth()

      expect(result).toBe(true)
      expect(mockDirectusInstance.request).not.toHaveBeenCalled()
    })

    it('應該在沒有用戶時嘗試取得用戶資訊', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'admin'
      }

      const mockEmployee = {
        id: 'emp-1',
        full_name: 'Test User',
        employee_code: 'EMP001',
        branch_id: 'branch-1',
        job_title_id: 'job-1',
        branch: { name: '總店' },
        job_title: { name: '經理' }
      }

      mockDirectusInstance.request
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce([mockEmployee])

      const { user, checkAuth } = useAuth()
      user.value = null

      const result = await checkAuth()

      expect(result).toBe(true)
      expect(user.value).toEqual(mockUser)
    })
  })
})
