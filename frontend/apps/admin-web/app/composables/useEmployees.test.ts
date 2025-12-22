import { describe, it, expect, beforeEach } from 'vitest'
import { mockDirectusInstance } from '../../vitest.setup'
import { useEmployees } from './useEmployees'

describe('useEmployees', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { employees, isLoading, totalCount } = useEmployees()

      expect(employees.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(totalCount.value).toBe(0)
    })
  })

  describe('fetchEmployees', () => {
    it('應該成功取得員工列表', async () => {
      const mockEmployees = [
        {
          id: 'emp-1',
          full_name: '張三',
          employee_code: 'EMP001',
          branch_id: { name: '總店' },
          job_title_id: { name: '經理' }
        },
        {
          id: 'emp-2',
          full_name: '李四',
          employee_code: 'EMP002',
          branch_id: { name: '分店A' },
          job_title_id: { name: '教練' }
        }
      ]

      mockDirectusInstance.request
        .mockResolvedValueOnce(mockEmployees)
        .mockResolvedValueOnce([{ count: 2 }])

      const { fetchEmployees, employees, totalCount } = useEmployees()
      await fetchEmployees()

      expect(employees.value).toEqual(mockEmployees)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援分頁查詢', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 50 }])

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({ page: 2, limit: 10 })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該支援搜尋功能', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({ search: '張三' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該支援分店過濾', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({ branchId: 'branch-1' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該支援狀態過濾', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({ status: 'ACTIVE' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該支援職位過濾', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({ jobTitleId: 'job-1' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該處理取得失敗', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Failed'))

      const { fetchEmployees, isLoading } = useEmployees()
      await fetchEmployees()

      expect(isLoading.value).toBe(false)
    })

    it('應該在載入時設定 isLoading', async () => {
      let isLoadingDuringFetch = false
      mockDirectusInstance.request.mockImplementation(() => {
        const { isLoading } = useEmployees()
        isLoadingDuringFetch = isLoading.value
        return Promise.resolve([])
      })

      const { fetchEmployees } = useEmployees()
      await fetchEmployees()

      expect(isLoadingDuringFetch).toBe(true)
    })
  })

  describe('getEmployee', () => {
    it('應該成功取得單一員工資訊', async () => {
      const mockEmployee = {
        id: 'emp-1',
        full_name: '張三',
        employee_code: 'EMP001',
        branch_id: { name: '總店', id: 'branch-1' },
        job_title_id: { name: '經理', id: 'job-1' }
      }

      mockDirectusInstance.request.mockResolvedValueOnce(mockEmployee)

      const { getEmployee } = useEmployees()
      const result = await getEmployee('emp-1')

      expect(result).toEqual(mockEmployee)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })

  describe('createEmployee', () => {
    it('應該成功建立員工', async () => {
      const newEmployee = {
        full_name: '王五',
        employee_code: 'EMP003',
        branch_id: 'branch-1',
        job_title_id: 'job-1'
      }

      const createdEmployee = { id: 'emp-3', ...newEmployee }
      mockDirectusInstance.request.mockResolvedValueOnce(createdEmployee)

      const { createEmployee } = useEmployees()
      const result = await createEmployee(newEmployee)

      expect(result).toEqual(createdEmployee)
    })
  })

  describe('updateEmployee', () => {
    it('應該成功更新員工', async () => {
      const updates = { full_name: '張三（已更新）' }
      const updatedEmployee = { id: 'emp-1', ...updates }

      mockDirectusInstance.request.mockResolvedValueOnce(updatedEmployee)

      const { updateEmployee } = useEmployees()
      const result = await updateEmployee('emp-1', updates)

      expect(result).toEqual(updatedEmployee)
    })
  })

  describe('deleteEmployee', () => {
    it('應該成功刪除員工', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce(undefined)

      const { deleteEmployee } = useEmployees()
      await deleteEmployee('emp-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })

  describe('fetchAllEmployees', () => {
    it('應該取得所有在職員工', async () => {
      const mockEmployees = [
        {
          id: 'emp-1',
          full_name: '張三',
          employee_code: 'EMP001',
          branch_id: 'branch-1'
        },
        {
          id: 'emp-2',
          full_name: '李四',
          employee_code: 'EMP002',
          branch_id: 'branch-1'
        }
      ]

      mockDirectusInstance.request.mockResolvedValueOnce(mockEmployees)

      const { fetchAllEmployees } = useEmployees()
      const result = await fetchAllEmployees()

      expect(result).toEqual(mockEmployees)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該在失敗時返回空陣列', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Failed'))

      const { fetchAllEmployees } = useEmployees()
      const result = await fetchAllEmployees()

      expect(result).toEqual([])
    })
  })
})
