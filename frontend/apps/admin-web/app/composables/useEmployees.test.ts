import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useEmployees, type ApiEmployee } from './useEmployees'
import { MESSAGES } from '~/constants'

// Fixtures in the exact wire format of backend/src/routes/employees.ts: EMPLOYEE_SELECT spread
// flat (camelCase, `status`, decimal salary as a string) with the joined jobTitle / branch.
const makeEmployee = (overrides: Partial<ApiEmployee> = {}): ApiEmployee => ({
  id: 'e0000000-0000-4000-8000-000000000001',
  userId: null,
  branchId: 'b0000000-0000-4000-8000-000000000001',
  jobTitleId: 'a0000000-0000-4000-8000-000000000001',
  employeeCode: 'E00001',
  fullName: '張三',
  phone: '0912345678',
  email: 'zhang@example.com',
  status: 'ACTIVE',
  employmentType: 'FULL_TIME',
  hireDate: '2026-01-05',
  resignDate: null,
  basicSalary: '45000.00',
  customPermissions: null,
  createdAt: '2026-01-05T02:00:00.000Z',
  updatedAt: '2026-01-05T02:00:00.000Z',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  jobTitle: { id: 'a0000000-0000-4000-8000-000000000001', name: '教練' },
  branch: { id: 'b0000000-0000-4000-8000-000000000001', name: '信義店' },
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useEmployees', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
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
    it('應該讀取後端的 camelCase 員工列表與 meta.total', async () => {
      const rows = [makeEmployee(), makeEmployee({ id: 'e0000000-0000-4000-8000-000000000002', fullName: '李四' })]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: rows,
        meta: { total: 42, page: 2, limit: 20, totalPages: 3 }
      })

      const { fetchEmployees, employees, totalCount } = useEmployees()
      await fetchEmployees({ page: 2 })

      expect(employees.value).toEqual(rows)
      expect(employees.value[0]!.fullName).toBe('張三')
      expect(totalCount.value).toBe(42)
    })

    it('沒有 meta 時以回傳筆數作為總數', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [makeEmployee()] })

      const { fetchEmployees, totalCount } = useEmployees()
      await fetchEmployees()

      expect(totalCount.value).toBe(1)
    })

    it('以後端支援的 camelCase 查詢參數送出分頁與過濾條件', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchEmployees } = useEmployees()
      await fetchEmployees({
        page: 2,
        limit: 10,
        search: '張',
        branchId: 'branch-1',
        status: 'RESIGNED',
        jobTitleId: 'job-1'
      })

      expect(lastCall()[0]).toBe('/employees')
      expect(lastCall()[1].params).toEqual({
        page: 2,
        limit: 10,
        search: '張',
        branchId: 'branch-1',
        status: 'RESIGNED',
        jobTitleId: 'job-1'
      })
    })

    it('預設為第 1 頁、每頁 20 筆', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchEmployees } = useEmployees()
      await fetchEmployees()

      expect(lastCall()[1].params).toMatchObject({ page: 1, limit: 20 })
    })

    it('應該處理取得失敗', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchEmployees, isLoading, employees, totalCount } = useEmployees()
      await fetchEmployees()

      expect(isLoading.value).toBe(false)
      expect(employees.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getEmployee', () => {
    it('應該取得含 jobTitle / branch 的單一員工', async () => {
      const employee = makeEmployee()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: employee })

      const { getEmployee } = useEmployees()
      const result = await getEmployee('emp-1')

      expect(result).toEqual(employee)
      expect(lastCall()[0]).toBe('/employees/emp-1')
    })

    it('取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('員工不存在'))

      const { getEmployee } = useEmployees()
      const result = await getEmployee('emp-x')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createEmployee', () => {
    const input = {
      fullName: '王五',
      branchId: 'b0000000-0000-4000-8000-000000000001',
      jobTitleId: 'a0000000-0000-4000-8000-000000000001',
      employmentType: 'FULL_TIME' as const
    }

    it('以 createEmployeeSchema 的 camelCase 欄位 POST 並返回建立的員工', async () => {
      const created = makeEmployee({ fullName: '王五', employeeCode: 'E00003' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createEmployee } = useEmployees()
      const result = await createEmployee(input)

      expect(result).toEqual(created)
      expect(lastCall()).toEqual(['/employees', { method: 'POST', body: input }])
    })

    it('後端回 400 時返回 null，並把後端的錯誤訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))

      const { createEmployee } = useEmployees()
      const result = await createEmployee(input)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '無效的分店'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { createEmployee } = useEmployees()
      await createEmployee(input)

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: MESSAGES.ERRORS.EMPLOYEE_CREATE_FAILED
      }))
    })
  })

  describe('updateEmployee', () => {
    it('以 PATCH 送出 camelCase 欄位與 customPermissions', async () => {
      const updates = {
        fullName: '張三（已更新）',
        customPermissions: { members: { view: true, edit: false } }
      }
      const updated = makeEmployee(updates)
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { updateEmployee } = useEmployees()
      const result = await updateEmployee('emp-1', updates)

      expect(result).toEqual(updated)
      expect(lastCall()).toEqual(['/employees/emp-1', { method: 'PATCH', body: updates }])
    })

    it('更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('員工不存在'))

      const { updateEmployee } = useEmployees()
      const result = await updateEmployee('emp-1', { fullName: 'X' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteEmployee', () => {
    it('成功時返回 true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '員工已封存' })

      const { deleteEmployee } = useEmployees()
      const result = await deleteEmployee('emp-1')

      expect(result).toBe(true)
      expect(lastCall()).toEqual(['/employees/emp-1', { method: 'DELETE' }])
    })

    it('後端回 403 時返回 false，並把後端的訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { deleteEmployee } = useEmployees()
      const result = await deleteEmployee('emp-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })
  })

  describe('fetchAllEmployees', () => {
    it('以 status=ACTIVE（不帶 page，取得完整列表）取得在職員工', async () => {
      const rows = [makeEmployee(), makeEmployee({ id: 'e0000000-0000-4000-8000-000000000002', fullName: '李四' })]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: rows })

      const { fetchAllEmployees } = useEmployees()
      const result = await fetchAllEmployees()

      expect(result).toEqual(rows)
      expect(lastCall()).toEqual(['/employees', { params: { status: 'ACTIVE' } }])
    })

    it('失敗時返回空陣列', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchAllEmployees } = useEmployees()
      const result = await fetchAllEmployees()

      expect(result).toEqual([])
    })
  })
})
