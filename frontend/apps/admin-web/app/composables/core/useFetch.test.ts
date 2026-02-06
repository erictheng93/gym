/**
 * useFetch.test.ts
 * Tests for the API fetch utility composable
 *
 * Note: This test needs to unmock useFetch since vitest.setup.ts mocks it globally
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock useFetch to test the actual implementation
vi.unmock('~/composables/core/useFetch')

// Create mock for native fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after unmock and stubbing
import { useFetch } from './useFetch'

describe('useFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('apiFetch - 基本請求', () => {
    it('應該構建正確的 URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/members')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/members',
        expect.any(Object)
      )
    })

    it('應該使用 GET 方法作為預設', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('應該設置正確的 headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        })
      )
    })

    it('應該處理查詢參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/members', {
        params: { page: 1, limit: 20, search: 'test' }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=1')
      expect(calledUrl).toContain('limit=20')
      expect(calledUrl).toContain('search=test')
    })

    it('應該忽略 undefined 和空字串的查詢參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/members', {
        params: { page: 1, limit: undefined, search: '' }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=1')
      expect(calledUrl).not.toContain('limit')
      expect(calledUrl).not.toContain('search')
    })

    it('應該處理 boolean 查詢參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/members', {
        params: { active: true }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('active=true')
    })
  })

  describe('apiFetch - Body 處理', () => {
    it('應該在 POST 請求中序列化 body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      const body = { name: 'Test', email: 'test@example.com' }
      await apiFetch('/members', { method: 'POST', body })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body)
        })
      )
    })

    it('應該在 PATCH 請求中序列化 body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      const body = { name: 'Updated' }
      await apiFetch('/members/123', { method: 'PATCH', body })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(body)
        })
      )
    })

    it('應該在 GET 請求中不包含 body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { apiFetch } = useFetch()
      await apiFetch('/members', { method: 'GET', body: { test: true } })

      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit
      expect(calledOptions.body).toBeUndefined()
    })
  })

  describe('apiFetch - 錯誤處理', () => {
    it('應該在 HTTP 錯誤時拋出 Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad Request' })
      })

      const { apiFetch } = useFetch()

      await expect(apiFetch('/test')).rejects.toThrow('Bad Request')
    })

    it('應該使用 HTTP 狀態碼作為後備錯誤訊息', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({})
      })

      const { apiFetch } = useFetch()

      await expect(apiFetch('/test')).rejects.toThrow('HTTP 500')
    })
  })

  describe('readItems - 分頁、搜尋、排序', () => {
    it('應該返回 data 和 total', async () => {
      const mockData = [
        { id: '1', name: 'Member 1' },
        { id: '2', name: 'Member 2' }
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockData,
          pagination: { total: 50, page: 1, limit: 20, totalPages: 3 }
        })
      })

      const { readItems } = useFetch()
      const result = await readItems<{ id: string; name: string }>('members')

      expect(result.data).toEqual(mockData)
      expect(result.total).toBe(50)
    })

    it('應該處理分頁參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } })
      })

      const { readItems } = useFetch()
      await readItems('members', { page: 2, limit: 10 })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=2')
      expect(calledUrl).toContain('limit=10')
    })

    it('應該處理搜尋參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } })
      })

      const { readItems } = useFetch()
      await readItems('members', { search: 'john' })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('search=john')
    })

    it('應該處理排序參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } })
      })

      const { readItems } = useFetch()
      await readItems('members', { sort: 'created_at', sortOrder: 'desc' })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('sortBy=created_at')
      expect(calledUrl).toContain('sortOrder=desc')
    })

    it('應該處理篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } })
      })

      const { readItems } = useFetch()
      await readItems('members', {
        filter: { status: 'active', branch_id: 'branch-1' }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('status=active')
      expect(calledUrl).toContain('branch_id=branch-1')
    })

    it('應該忽略 undefined 和 null 的篩選值', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } })
      })

      const { readItems } = useFetch()
      await readItems('members', {
        filter: { status: 'active', branch_id: undefined }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('status=active')
      expect(calledUrl).not.toContain('branch_id')
    })

    it('應該在沒有分頁資訊時返回空陣列和 total 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { readItems } = useFetch()
      const result = await readItems('members')

      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('readItem - 單項讀取', () => {
    it('應該成功讀取單一項目', async () => {
      const mockMember = { id: 'member-1', name: 'John Doe' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockMember })
      })

      const { readItem } = useFetch()
      const result = await readItem<{ id: string; name: string }>('members', 'member-1')

      expect(result).toEqual(mockMember)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/members/member-1',
        expect.any(Object)
      )
    })

    it('應該在失敗時返回 null', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { readItem } = useFetch()
      const result = await readItem('members', 'non-existent')

      expect(result).toBeNull()
    })

    it('應該在沒有 data 時返回 null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { readItem } = useFetch()
      const result = await readItem('members', 'member-1')

      expect(result).toBeNull()
    })
  })

  describe('createItem - 創建項目', () => {
    it('應該成功創建項目', async () => {
      const newMember = { name: 'John', email: 'john@example.com' }
      const createdMember = { id: 'member-1', ...newMember }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: createdMember })
      })

      const { createItem } = useFetch()
      const result = await createItem('members', newMember)

      expect(result).toEqual(createdMember)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/members',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newMember)
        })
      )
    })

    it('應該在失敗時返回 null', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Create failed'))

      const { createItem } = useFetch()
      const result = await createItem('members', { name: 'Test' })

      expect(result).toBeNull()
    })
  })

  describe('updateItem - 更新項目', () => {
    it('應該成功更新項目', async () => {
      const updateData = { name: 'Updated Name' }
      const updatedMember = { id: 'member-1', name: 'Updated Name' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: updatedMember })
      })

      const { updateItem } = useFetch()
      const result = await updateItem('members', 'member-1', updateData)

      expect(result).toEqual(updatedMember)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/members/member-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData)
        })
      )
    })

    it('應該在失敗時返回 null', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'))

      const { updateItem } = useFetch()
      const result = await updateItem('members', 'member-1', { name: 'Test' })

      expect(result).toBeNull()
    })
  })

  describe('deleteItem - 刪除項目', () => {
    it('應該成功刪除項目並返回 true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { deleteItem } = useFetch()
      const result = await deleteItem('members', 'member-1')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/members/member-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('應該在失敗時返回 false', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteItem } = useFetch()
      const result = await deleteItem('members', 'member-1')

      expect(result).toBe(false)
    })
  })
})
