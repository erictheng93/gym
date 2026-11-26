import { describe, it, expect, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useBranches } from './useBranches'
import type { Branch, Employee } from '~/types/schema'

const makeBranch = (overrides: Partial<Branch> = {}): Branch => ({
  id: 'branch-1',
  name: '總店',
  type: 'HEADQUARTER',
  status: 'active',
  address: null,
  phone: null,
  tax_id: null,
  settings: null,
  date_created: '2024-01-01',
  date_updated: null,
  user_created: null,
  user_updated: null,
  ...overrides
})

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'emp-1',
  full_name: '張三',
  employee_code: 'EMP001',
  status: 'active',
  user_id: null,
  branch_id: 'branch-1',
  job_title_id: 'job-1',
  supervisor_id: null,
  hire_date: null,
  employment_status: 'ACTIVE',
  employment_type: 'FULL_TIME',
  basic_salary: null,
  custom_permissions: null,
  phone: null,
  email: null,
  date_created: '2024-01-01',
  date_updated: null,
  user_created: null,
  user_updated: null,
  ...overrides
})

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
        makeBranch(),
        makeBranch({ id: 'branch-2', name: '分店A', type: 'BRANCH', date_created: '2024-01-02' })
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockBranches, total: 2 })

      const { fetchBranches, branches, isLoading } = useBranches()

      await fetchBranches()

      expect(isLoading.value).toBe(false)
      expect(branches.value).toEqual(mockBranches)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.any(Object))
    })

    it('應該預設只取得啟用的分店', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchBranches } = useBranches()
      await fetchBranches()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.objectContaining({
        filter: { status: 'active' }
      }))
    })

    it('應該可以包含已停用的分店', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchBranches } = useBranches()
      await fetchBranches(true)

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.objectContaining({
        filter: {}
      }))
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Network error'))

      const { fetchBranches, branches, isLoading } = useBranches()
      await fetchBranches()

      expect(isLoading.value).toBe(false)
      expect(branches.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該按名稱排序', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchBranches } = useBranches()
      await fetchBranches()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.objectContaining({
        sort: 'name',
        sortOrder: 'asc'
      }))
    })
  })

  describe('fetchBranch', () => {
    it('應該成功取得單個分店詳情', async () => {
      const mockBranch = makeBranch({ address: '台北市信義區', phone: '02-12345678' })

      mockFetchInstance.readItem.mockResolvedValueOnce(mockBranch)

      const { fetchBranch } = useBranches()
      const result = await fetchBranch('branch-1')

      expect(result).toEqual(mockBranch)
      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('branches', 'branch-1')
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Branch not found'))

      const { fetchBranch } = useBranches()

      const result = await fetchBranch('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('fetchBranchEmployees', () => {
    it('應該成功取得分店員工列表', async () => {
      const mockEmployees: Employee[] = [
        makeEmployee()
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockEmployees, total: 1 })

      const { fetchBranchEmployees } = useBranches()
      const result = await fetchBranchEmployees('branch-1')

      expect(result).toEqual(mockEmployees)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employees', expect.objectContaining({
        filter: { branch_id: 'branch-1', status: 'active' }
      }))
    })

    it('應該按姓名排序員工', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchBranchEmployees } = useBranches()
      await fetchBranchEmployees('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employees', expect.objectContaining({
        sort: 'full_name',
        sortOrder: 'asc'
      }))
    })
  })

  describe('createBranch', () => {
    it('應該成功創建分店並重新載入列表', async () => {
      const newBranch: Partial<Branch> = {
        name: '新分店',
        type: 'BRANCH',
        status: 'active'
      }

      const createdBranch = makeBranch({ id: 'branch-new', ...newBranch })

      mockFetchInstance.createItem.mockResolvedValueOnce(createdBranch)
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { createBranch } = useBranches()
      const result = await createBranch(newBranch)

      expect(result).toEqual(createdBranch)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('branches', newBranch)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.any(Object))
    })

    it('應該在創建失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Create failed'))
      mockFetchInstance.readItems.mockClear()

      const { createBranch } = useBranches()

      const result = await createBranch({ name: 'Test' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockFetchInstance.readItems).not.toHaveBeenCalled()
    })
  })

  describe('updateBranch', () => {
    it('應該成功更新分店並重新載入列表', async () => {
      const updates: Partial<Branch> = {
        name: '更新後的名稱'
      }

      const updatedBranch = makeBranch({ name: '更新後的名稱', type: 'BRANCH', date_updated: '2024-01-02' })

      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedBranch)
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { updateBranch } = useBranches()
      const result = await updateBranch('branch-1', updates)

      expect(result).toEqual(updatedBranch)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('branches', 'branch-1', updates)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.any(Object))
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updateBranch } = useBranches()

      const result = await updateBranch('branch-1', { name: 'Test' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteBranch', () => {
    it('應該成功刪除分店並重新載入列表', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { deleteBranch } = useBranches()
      const result = await deleteBranch('branch-1')

      expect(result).toBe(true)
      expect(mockFetchInstance.deleteItem).toHaveBeenCalledWith('branches', 'branch-1')
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('branches', expect.any(Object))
    })

    it('應該在刪除失敗時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))

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

      instance1.branches.value = [makeBranch({ name: 'Test' })]

      expect(instance2.branches.value).toEqual(instance1.branches.value)
    })
  })
})
