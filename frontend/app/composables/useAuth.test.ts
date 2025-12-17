import { describe, it, expect, beforeEach } from 'vitest'
import { mockDirectusInstance } from '../../vitest.setup'
import { useAuth } from './useAuth'
import { MESSAGES } from '~/constants'

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

    it('應該處理登入失敗', async () => {
      mockDirectusInstance.login.mockRejectedValueOnce(new Error('Invalid credentials'))

      const { login } = useAuth()
      const result = await login('test@example.com', 'wrong')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')
    })

    it('應該處理未知錯誤', async () => {
      mockDirectusInstance.login.mockRejectedValueOnce('Unknown error')

      const { login } = useAuth()
      const result = await login('test@example.com', 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe(MESSAGES.AUTH.LOGIN_ERROR)
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

  describe('checkAuth', () => {
    it('應該在未認證時返回 false', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Not authenticated'))

      const { user, checkAuth } = useAuth()
      user.value = null

      const result = await checkAuth()

      expect(result).toBe(false)
    })
  })
})
