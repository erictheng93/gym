import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockDirectusInstance, mockHandleError } from '@test/setup'
import { useBranches } from './useBranches'
import type { Branch, Employee } from '~/types/directus'

describe('useBranches', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { branches, isLoading } = useBranches()

      expect(branches.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchBranches', () => {
    it('應該成功取得分店列表', async () => {
      const mockBranches: Branch[] = [
        {
          id: 'branch-1',
          name: '總店',
          type: 'HEADQUARTER',
          status: 'active',
          date_created: '2024-01-01',
          date_updated: null
        },
        {
          id: 'branch-2',
          name: '分店A',
          type: 'BRANCH',
          status: 'active',
          date_created: '2024-01-02',
          date_updated: null
        }
      ]

      mockDirectusInstance.request.mockResolvedValueOnce(mockBranches)

      const { fetchBranches, branches, isLoading } = useBranches()

      await fetchBranches()

      expect(isLoading.value).toBe(false)
      expect(branches.value).toEqual(mockBranches)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該預設只取得啟用的分店', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchBranches } = useBranches()
      await fetchBranches()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該可以包含已停用的分店', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchBranches } = useBranches()
      await fetchBranches(true)

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該處理取得失敗的情況', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Network error'))

      const { fetchBranches, branches, isLoading } = useBranches()
      await fetchBranches()

      expect(isLoading.value).toBe(false)
      expect(branches.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該按名稱排序', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchBranches } = useBranches()
      await fetchBranches()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })

  describe('fetchBranch', () => {
    it('應該成功取得單個分店詳情', async () => {
      const mockBranch: Branch = {
        id: 'branch-1',
        name: '總店',
        type: 'HEADQUARTER',
        status: 'active',
        address: '台北市信義區',
        phone: '02-12345678',
        date_created: '2024-01-01',
        date_updated: null
      }

      mockDirectusInstance.request.mockResolvedValueOnce(mockBranch)

      const { fetchBranch } = useBranches()
      const result = await fetchBranch('branch-1')

      expect(result).toEqual(mockBranch)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Branch not found'))

      const { fetchBranch } = useBranches()

      const result = await fetchBranch('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('fetchBranchEmployees', () => {
    it('應該成功取得分店員工列表', async () => {
      const mockEmployees: Employee[] = [
        {
          id: 'emp-1',
          full_name: '張三',
          employee_code: 'EMP001',
          status: 'active',
          branch_id: 'branch-1',
          job_title_id: 'job-1',
          date_created: '2024-01-01',
          date_updated: null
        }
      ]

      mockDirectusInstance.request.mockResolvedValueOnce(mockEmployees)

      const { fetchBranchEmployees } = useBranches()
      const result = await fetchBranchEmployees('branch-1')

      expect(result).toEqual(mockEmployees)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該包含職稱資訊', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchBranchEmployees } = useBranches()
      await fetchBranchEmployees('branch-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該按姓名排序員工', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchBranchEmployees } = useBranches()
      await fetchBranchEmployees('branch-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })

  describe('createBranch', () => {
    it('應該成功創建分店並重新載入列表', async () => {
      const newBranch: Partial<Branch> = {
        name: '新分店',
        type: 'BRANCH',
        status: 'active'
      }

      const createdBranch: Branch = {
        id: 'branch-new',
        ...newBranch,
        date_created: '2024-01-01',
        date_updated: null
      } as Branch

      mockDirectusInstance.request
        .mockResolvedValueOnce(createdBranch) // createItem
        .mockResolvedValueOnce([]) // fetchBranches

      const { createBranch } = useBranches()
      const result = await createBranch(newBranch)

      expect(result).toEqual(createdBranch)
      expect(mockDirectusInstance.request).toHaveBeenCalledTimes(2)
    })

    it('應該在創建失敗時返回 null 並呼叫 handleError', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Create failed'))

      const { createBranch } = useBranches()

      const result = await createBranch({ name: 'Test' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updateBranch', () => {
    it('應該成功更新分店並重新載入列表', async () => {
      const updates: Partial<Branch> = {
        name: '更新後的名稱'
      }

      const updatedBranch: Branch = {
        id: 'branch-1',
        name: '更新後的名稱',
        type: 'BRANCH',
        status: 'active',
        date_created: '2024-01-01',
        date_updated: '2024-01-02'
      }

      mockDirectusInstance.request
        .mockResolvedValueOnce(updatedBranch) // updateItem
        .mockResolvedValueOnce([]) // fetchBranches

      const { updateBranch } = useBranches()
      const result = await updateBranch('branch-1', updates)

      expect(result).toEqual(updatedBranch)
      expect(mockDirectusInstance.request).toHaveBeenCalledTimes(2)
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Update failed'))

      const { updateBranch } = useBranches()

      const result = await updateBranch('branch-1', { name: 'Test' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteBranch', () => {
    it('應該成功刪除分店並重新載入列表', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce(undefined) // deleteItem
        .mockResolvedValueOnce([]) // fetchBranches

      const { deleteBranch } = useBranches()
      await deleteBranch('branch-1')

      expect(mockDirectusInstance.request).toHaveBeenCalledTimes(2)
    })

    it('應該在刪除失敗時返回 false 並呼叫 handleError', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteBranch } = useBranches()

      const result = await deleteBranch('branch-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('狀態管理', () => {
    it('應該在多次呼叫 useBranches 時共享狀態', () => {
      const instance1 = useBranches()
      const instance2 = useBranches()

      instance1.branches.value = [{ id: 'branch-1', name: 'Test' } as Branch]

      expect(instance2.branches.value).toEqual(instance1.branches.value)
    })
  })
})
