import { describe, it, expect, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useJobTitles } from './useJobTitles'
import type { JobTitle } from '~/types/schema'

const makeJobTitle = (overrides: Partial<JobTitle> = {}): JobTitle => ({
  id: 'job-1',
  name: '經理',
  status: 'active',
  permissions_config: null,
  date_created: '2024-01-01',
  date_updated: null,
  user_created: null,
  user_updated: null,
  ...overrides
})

describe('useJobTitles', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { jobTitles, isLoading } = useJobTitles()

      expect(jobTitles.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchJobTitles', () => {
    it('應該成功取得職位列表', async () => {
      const mockJobTitles = [
        makeJobTitle({ permissions_config: { members: { view_all: true } } }),
        makeJobTitle({ id: 'job-2', name: '教練', permissions_config: { members: { view_own: true } } }),
        makeJobTitle({ id: 'job-3', name: '櫃檯人員', permissions_config: { members: { basic_access: true } } })
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockJobTitles, total: 3 })

      const { fetchJobTitles, jobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(jobTitles.value).toEqual(mockJobTitles)
    })

    it('應該只取得 active 狀態的職位', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('job-titles', {
        filter: { status: 'active' },
        sort: 'name',
        limit: 1000
      })
    })

    it('應該處理取得失敗', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Failed'))

      const { fetchJobTitles, isLoading, jobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(isLoading.value).toBe(false)
      expect(jobTitles.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該在載入時設定 isLoading', async () => {
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockFetchInstance.readItems.mockReturnValueOnce(pendingPromise)

      const { fetchJobTitles, isLoading } = useJobTitles()
      const fetchPromise = fetchJobTitles()

      expect(isLoading.value).toBe(true)

      resolvePromise!({ data: [], total: 0 })
      await fetchPromise

      expect(isLoading.value).toBe(false)
    })
  })

  describe('getJobTitle', () => {
    it('應該成功取得單一職位資訊', async () => {
      const mockJobTitle = makeJobTitle({
        permissions_config: {
          members: { view_all: true },
          employees: { manage: true },
          contracts: { manage: true }
        }
      })

      mockFetchInstance.readItem.mockResolvedValueOnce(mockJobTitle)

      const { getJobTitle } = useJobTitles()
      const result = await getJobTitle('job-1')

      expect(result).toEqual(mockJobTitle)
      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('job-titles', 'job-1')
    })

    it('應該處理取得失敗並返回 null', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Not found'))

      const { getJobTitle } = useJobTitles()
      const result = await getJobTitle('job-999')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createJobTitle', () => {
    it('應該成功建立職位', async () => {
      const newJobTitle: Partial<JobTitle> = {
        name: '實習教練',
        status: 'active',
        permissions_config: { members: { basic_access: true } }
      }

      const createdJobTitle = makeJobTitle({ id: 'job-4', ...newJobTitle })
      mockFetchInstance.createItem.mockResolvedValueOnce(createdJobTitle)

      const { createJobTitle } = useJobTitles()
      const result = await createJobTitle(newJobTitle)

      expect(result).toEqual(createdJobTitle)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('job-titles', newJobTitle)
    })

    it('應該處理建立失敗並返回 null', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Create failed'))

      const { createJobTitle } = useJobTitles()
      const result = await createJobTitle({ name: '測試職位' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updateJobTitle', () => {
    it('應該成功更新職位', async () => {
      const updates: Partial<JobTitle> = {
        permissions_config: {
          members: { view_all: true },
          employees: { manage: true },
          contracts: { manage: true },
          reports: { manage: true }
        }
      }
      const updatedJobTitle = makeJobTitle(updates)

      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedJobTitle)

      const { updateJobTitle } = useJobTitles()
      const result = await updateJobTitle('job-1', updates)

      expect(result).toEqual(updatedJobTitle)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('job-titles', 'job-1', updates)
    })

    it('應該處理更新失敗並返回 null', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updateJobTitle } = useJobTitles()
      const result = await updateJobTitle('job-1', { name: '新名稱' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteJobTitle', () => {
    it('應該成功刪除職位', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)

      const { deleteJobTitle } = useJobTitles()
      const result = await deleteJobTitle('job-1')

      expect(result).toBe(true)
      expect(mockFetchInstance.deleteItem).toHaveBeenCalledWith('job-titles', 'job-1')
    })

    it('應該處理刪除失敗並返回 false', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteJobTitle } = useJobTitles()
      const result = await deleteJobTitle('job-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })
})
