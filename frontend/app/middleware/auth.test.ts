import { describe, it, expect, beforeEach } from 'vitest'
import { mockAuthInstance, mockNavigateTo } from '../../vitest.setup'
import authMiddleware from './auth'

describe('auth middleware', () => {
  beforeEach(() => {
    // Reset mocks
    mockAuthInstance.checkAuth.mockClear()
    mockNavigateTo.mockClear()
  })

  describe('登入頁面處理', () => {
    it('應該跳過 /login 頁面的認證檢查', async () => {
      const to = { path: '/login' }

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
      expect(mockAuthInstance.checkAuth).not.toHaveBeenCalled()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('應該跳過 /login?redirect=xxx 頁面的認證檢查', async () => {
      const to = { path: '/login', query: { redirect: '/dashboard' } }

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
      expect(mockAuthInstance.checkAuth).not.toHaveBeenCalled()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('已認證用戶', () => {
    it('應該允許已認證用戶訪問受保護頁面', async () => {
      const to = { path: '/dashboard' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(true)

      const result = await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(result).toBeUndefined()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('應該允許已認證用戶訪問首頁', async () => {
      const to = { path: '/' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(true)

      const result = await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(result).toBeUndefined()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('應該允許已認證用戶訪問深層路由', async () => {
      const to = { path: '/members/123/contracts' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(true)

      const result = await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(result).toBeUndefined()
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('未認證用戶', () => {
    it('應該重定向未認證用戶到登入頁面', async () => {
      const to = { path: '/dashboard' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在訪問首頁時重定向未認證用戶', async () => {
      const to = { path: '/' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在訪問任意受保護路由時重定向未認證用戶', async () => {
      const to = { path: '/members' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在訪問員工頁面時重定向未認證用戶', async () => {
      const to = { path: '/employees' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在訪問合約頁面時重定向未認證用戶', async () => {
      const to = { path: '/contracts' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })
  })

  describe('邊界情況', () => {
    it('應該處理 checkAuth 拋出錯誤的情況', async () => {
      const to = { path: '/dashboard' }
      const error = new Error('Network error')
      mockAuthInstance.checkAuth.mockRejectedValueOnce(error)

      await expect(authMiddleware(to)).rejects.toThrow('Network error')
    })

    it('應該處理空路徑', async () => {
      const to = { path: '' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(false)

      await authMiddleware(to)

      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該處理帶有查詢參數的路由', async () => {
      const to = { path: '/dashboard', query: { tab: 'overview' } }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(true)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
    })

    it('應該處理帶有 hash 的路由', async () => {
      const to = { path: '/dashboard', hash: '#section1' }
      mockAuthInstance.checkAuth.mockResolvedValueOnce(true)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
      expect(mockAuthInstance.checkAuth).toHaveBeenCalledTimes(1)
    })
  })
})
