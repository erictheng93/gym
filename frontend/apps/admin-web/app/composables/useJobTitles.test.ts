import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useJobTitles, type ApiJobTitle } from './useJobTitles'
import { MESSAGES } from '~/constants'

// Fixtures in the exact wire format of backend/src/routes/job-titles.ts: JOB_TITLE_SELECT,
// camelCase with `code` and `permissionsConfig`, no status column.
const makeJobTitle = (overrides: Partial<ApiJobTitle> = {}): ApiJobTitle => ({
  id: 'a0000000-0000-4000-8000-000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
  name: '經理',
  code: 'MANAGER',
  description: null,
  level: null,
  sort: null,
  permissionsConfig: null,
  tenantId: 't0000000-0000-4000-8000-000000000001',
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useJobTitles', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { jobTitles, isLoading } = useJobTitles()

      expect(jobTitles.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchJobTitles', () => {
    it('取得職位列表並保留 permissionsConfig', async () => {
      const rows = [
        makeJobTitle({ permissionsConfig: { members: { view: true } } }),
        makeJobTitle({ id: 'a0000000-0000-4000-8000-000000000002', name: '教練', code: 'COACH' })
      ]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: rows })

      const { fetchJobTitles, jobTitles } = useJobTitles()
      await fetchJobTitles(true)

      expect(jobTitles.value).toEqual(rows)
      expect(jobTitles.value[0]!.permissionsConfig).toEqual({ members: { view: true } })
    })

    it('不送出後端不認得的 status / sort 篩選（後端已依名稱排序）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles(true)

      expect(lastCall()).toEqual(['/job-titles'])
    })

    it('應該處理取得失敗', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchJobTitles, jobTitles, isLoading } = useJobTitles()
      await fetchJobTitles(true)

      expect(jobTitles.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getJobTitle', () => {
    it('取得單一職位（含 permissionsConfig）', async () => {
      const row = makeJobTitle({ permissionsConfig: { contracts: { view: true, create: false } } })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: row })

      const { getJobTitle } = useJobTitles()
      const result = await getJobTitle(row.id)

      expect(result).toEqual(row)
      expect(lastCall()).toEqual([`/job-titles/${row.id}`])
    })

    it('取得失敗時返回 null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('職稱不存在'))

      const { getJobTitle } = useJobTitles()
      expect(await getJobTitle('missing')).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createJobTitle', () => {
    const input = { name: '店長', code: 'MANAGER', permissionsConfig: { members: { view: true } } }

    it('POST createJobTitleSchema 的欄位（含必填 code 與 permissionsConfig）', async () => {
      const created = makeJobTitle({ ...input })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createJobTitle } = useJobTitles()
      const result = await createJobTitle(input)

      expect(result).toEqual(created)
      expect(lastCall()).toEqual(['/job-titles', { method: 'POST', body: input }])
    })

    it('後端回 400 時返回 null，並把後端訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('職稱代碼必填'))

      const { createJobTitle } = useJobTitles()
      const result = await createJobTitle({ ...input, code: '' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '職稱代碼必填'
      }))
    })
  })

  describe('updateJobTitle', () => {
    it('PATCH permissionsConfig（camelCase，後端才不會把它當未知欄位丟掉）', async () => {
      const permissionsConfig = { members: { view: true, create: true } }
      const updated = makeJobTitle({ permissionsConfig })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { updateJobTitle } = useJobTitles()
      const result = await updateJobTitle(updated.id, { name: '經理', permissionsConfig })

      expect(result).toEqual(updated)
      expect(lastCall()).toEqual([`/job-titles/${updated.id}`, { method: 'PATCH', body: { name: '經理', permissionsConfig } }])
    })

    it('更新失敗時返回 null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('職稱不存在'))

      const { updateJobTitle } = useJobTitles()
      expect(await updateJobTitle('missing', { name: 'X' })).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteJobTitle', () => {
    it('成功時返回 true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '職稱已刪除' })

      const { deleteJobTitle } = useJobTitles()
      expect(await deleteJobTitle('job-1')).toBe(true)
      expect(lastCall()).toEqual(['/job-titles/job-1', { method: 'DELETE' }])
    })

    it('後端回 403 時返回 false，並把後端訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { deleteJobTitle } = useJobTitles()
      expect(await deleteJobTitle('job-1')).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '權限不足'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 403'))

      const { deleteJobTitle } = useJobTitles()
      await deleteJobTitle('job-1')

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: MESSAGES.ERRORS.JOB_TITLE_DELETE_FAILED
      }))
    })
  })
})
