// -nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockAuthInstance, mockNavigateTo } from '@test/setup'

// Mock session-storage module
const mockLoadSession = vi.fn()
vi.mock('~/utils/session-storage', () => ({
  loadSession: () => mockLoadSession()
}))

import authMiddleware from './auth'

/**
 * 注意：在 Vitest 環境下，import.meta.client 和 import.meta.server 的行為
 * 取決於 vitest.config.ts 的 environment 設定。
 *
 * 在 jsdom 環境下，middleware 可能在 server-side 或 client-side 模式下執行。
 * 這些測試著重於驗證 middleware 的核心邏輯：
 * 1. 登入頁面跳過認證
 * 2. 有 user state 時允許訪問
 * 3. 快取行為（當 import.meta.client 為 true 時）
 */

describe('auth middleware', () => {
  beforeEach(() => {
    // Reset mocks
    mockAuthInstance.checkAuth.mockClear()
    mockAuthInstance.user.value = null
    mockAuthInstance.currentEmployee.value = null
    mockNavigateTo.mockClear()
    mockLoadSession.mockReset()
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

  describe('已認證用戶 (有 state)', () => {
    it('應該允許已有 user state 的用戶訪問', async () => {
      const to = { path: '/dashboard' }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
    })

    it('應該允許已認證用戶訪問首頁', async () => {
      const to = { path: '/' }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
    })

    it('應該允許已認證用戶訪問深層路由', async () => {
      const to = { path: '/members/123/contracts' }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
    })
  })

  describe('localStorage 快取處理', () => {
    const mockCachedSession = {
      user: { id: 'user-1', email: 'test@test.com', role: 'admin', employeeId: 'emp-1', tenantId: 'tenant-1' },
      employee: { id: 'emp-1', full_name: 'Test User' },
      timestamp: Date.now()
    }

    it('應該在有快取時不 throw 錯誤', async () => {
      const to = { path: '/dashboard' }
      mockLoadSession.mockReturnValue(mockCachedSession)
      mockAuthInstance.checkAuth.mockResolvedValue(true)

      // middleware 應該能正常執行不拋錯
      await expect(authMiddleware(to)).resolves.not.toThrow()
    })

    it('應該在有快取時返回 undefined', async () => {
      const to = { path: '/dashboard' }
      mockLoadSession.mockReturnValue(mockCachedSession)
      mockAuthInstance.checkAuth.mockResolvedValue(true)

      const result = await authMiddleware(to)

      // 有快取時，middleware 會立即返回
      expect(result).toBeUndefined()
    })
  })

  describe('邊界情況', () => {
    it('應該處理帶有查詢參數的路由', async () => {
      const to = { path: '/dashboard', query: { tab: 'overview' } }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
    })

    it('應該處理帶有 hash 的路由', async () => {
      const to = { path: '/dashboard', hash: '#section1' }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      const result = await authMiddleware(to)

      expect(result).toBeUndefined()
    })

    it('應該在空路徑時不拋出錯誤', async () => {
      const to = { path: '' }
      mockAuthInstance.user.value = { id: 'user-1' }
      mockLoadSession.mockReturnValue(null)

      await expect(authMiddleware(to)).resolves.not.toThrow()
    })
  })
})
