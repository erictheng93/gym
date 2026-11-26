import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useBranches, isBranchActive, type ApiBranch } from './useBranches'
import type { ApiEmployee } from './useEmployees'
import { MESSAGES } from '~/constants'

// Fixtures in the exact wire format of backend/src/routes/branches.ts: BRANCH_SELECT (camelCase,
// `taxId`, status 'published' | 'archived') plus the per-branch stats.
const makeBranch = (overrides: Partial<ApiBranch> = {}): ApiBranch => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: '總店',
  code: 'HQ-AB12',
  type: 'HEADQUARTER',
  address: null,
  phone: null,
  taxId: null,
  settings: null,
  tenantId: 't0000000-0000-4000-8000-000000000001',
  stats: { employeeCount: 3, memberCount: 40 },
  ...overrides
})

const archivedBranch = makeBranch({ id: 'b0000000-0000-4000-8000-000000000002', name: '舊分店', type: 'BRANCH', status: 'archived' })

const makeEmployee = (overrides: Partial<ApiEmployee> = {}): ApiEmployee => ({
  id: 'e0000000-0000-4000-8000-000000000001',
  userId: null,
  branchId: 'b0000000-0000-4000-8000-000000000001',
  jobTitleId: null,
  employeeCode: 'E00001',
  fullName: '張三',
  phone: null,
  email: null,
  status: 'ACTIVE',
  employmentType: 'FULL_TIME',
  hireDate: null,
  resignDate: null,
  basicSalary: null,
  customPermissions: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!
const callsTo = (endpoint: string) => mockFetchInstance.apiFetch.mock.calls.filter(c => c[0] === endpoint)

describe('useBranches', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  describe('isBranchActive', () => {
    it('只有 archived 算停用（null 與 published 都是營運中）', () => {
      expect(isBranchActive({ status: 'published' })).toBe(true)
      expect(isBranchActive({ status: null })).toBe(true)
      expect(isBranchActive({ status: 'archived' })).toBe(false)
    })
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { branches, isLoading } = useBranches()

      expect(branches.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchBranches', () => {
    const response = { success: true, data: [makeBranch(), archivedBranch] }

    it('預設只保留營運中的分店（後端沒有 status 篩選，在前端過濾 archived）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(response)

      const { fetchBranches, branches } = useBranches()
      await fetchBranches()

      expect(branches.value.map(b => b.name)).toEqual(['總店'])
      expect(lastCall()).toEqual(['/branches'])
    })

    it('includeArchived 時保留已封存的分店', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(response)

      const { fetchBranches, branches } = useBranches()
      await fetchBranches(true, true)

      expect(branches.value.map(b => b.name)).toEqual(['總店', '舊分店'])
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchBranches, branches, isLoading } = useBranches()
      await fetchBranches(false, true)

      expect(branches.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('fetchBranch', () => {
    it('應該取得單個分店詳情', async () => {
      const branch = makeBranch({ taxId: '12345678' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: branch })

      const { fetchBranch } = useBranches()
      const result = await fetchBranch(branch.id, true)

      expect(result).toEqual(branch)
      expect(lastCall()).toEqual([`/branches/${branch.id}`])
    })

    it('取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('分店不存在'))

      const { fetchBranch } = useBranches()
      const result = await fetchBranch('missing', true)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('fetchBranchEmployees', () => {
    it('以 branchId 與 status=ACTIVE 查詢員工（後端只認 camelCase 參數）', async () => {
      const employees = [makeEmployee()]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: employees })

      const { fetchBranchEmployees } = useBranches()
      const result = await fetchBranchEmployees('branch-1', true)

      expect(result).toEqual(employees)
      expect(lastCall()).toEqual(['/employees', { params: { branchId: 'branch-1', status: 'ACTIVE' } }])
    })

    it('失敗時返回空陣列', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchBranchEmployees } = useBranches()
      expect(await fetchBranchEmployees('branch-2', true)).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createBranch', () => {
    const input = { name: '新店', type: 'BRANCH' as const, taxId: '12345678' }

    it('以 camelCase（含 taxId）POST 並重新載入列表', async () => {
      const created = makeBranch({ name: '新店', type: 'BRANCH', taxId: '12345678' })
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: created })
        .mockResolvedValueOnce({ success: true, data: [created] })

      const { createBranch } = useBranches()
      const result = await createBranch(input)

      expect(result).toEqual(created)
      expect(callsTo('/branches')[0]).toEqual(['/branches', { method: 'POST', body: input }])
      expect(callsTo('/branches')).toHaveLength(2)
    })

    it('後端回 400 時返回 null，並把後端訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('請輸入分店名稱'))

      const { createBranch } = useBranches()
      const result = await createBranch(input)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '請輸入分店名稱'
      }))
    })
  })

  describe('updateBranch', () => {
    it('封存分店：PATCH status=archived（updateBranchSchema 的合法欄位）並重新載入', async () => {
      const updated = makeBranch({ status: 'archived' })
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: updated })
        .mockResolvedValueOnce({ success: true, data: [] })

      const { updateBranch } = useBranches()
      const result = await updateBranch(updated.id, { status: 'archived' })

      expect(result).toEqual(updated)
      expect(callsTo(`/branches/${updated.id}`)[0]).toEqual([`/branches/${updated.id}`, { method: 'PATCH', body: { status: 'archived' } }])
    })

    it('更新失敗時返回 null（呼叫端不可當成功）並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('分店不存在'))

      const { updateBranch } = useBranches()
      const result = await updateBranch('missing', { name: 'X' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '分店不存在'
      }))
    })
  })

  describe('deleteBranch', () => {
    it('成功時返回 true 並重新載入列表', async () => {
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, message: '分店已封存' })
        .mockResolvedValueOnce({ success: true, data: [] })

      const { deleteBranch } = useBranches()
      const result = await deleteBranch('b-1')

      expect(result).toBe(true)
      expect(callsTo('/branches/b-1')[0]).toEqual(['/branches/b-1', { method: 'DELETE' }])
      expect(callsTo('/branches')).toHaveLength(1)
    })

    it('後端回 400（仍有員工 / 總店）時返回 false，並把後端訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此分店仍有員工，請先轉移員工'))

      const { deleteBranch } = useBranches()
      const result = await deleteBranch('b-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '此分店仍有員工，請先轉移員工'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 403'))

      const { deleteBranch } = useBranches()
      await deleteBranch('b-1')

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: MESSAGES.ERRORS.BRANCH_DELETE_FAILED
      }))
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
