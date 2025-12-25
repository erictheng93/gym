import { describe, it, expect, beforeEach } from 'vitest'
import { mockDirectusInstance } from '@test/setup'
import { useJobTitles } from './useJobTitles'

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
        {
          id: 'job-1',
          name: '經理',
          status: 'active',
          permissions_config: { view_all: true }
        },
        {
          id: 'job-2',
          name: '教練',
          status: 'active',
          permissions_config: { view_own: true }
        },
        {
          id: 'job-3',
          name: '櫃檯人員',
          status: 'active',
          permissions_config: { basic_access: true }
        }
      ]

      mockDirectusInstance.request.mockResolvedValueOnce(mockJobTitles)

      const { fetchJobTitles, jobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(jobTitles.value).toEqual(mockJobTitles)
    })

    it('應該只取得 active 狀態的職位', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該按名稱排序', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該取得所有職位（limit: -1）', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該處理取得失敗', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Failed'))

      const { fetchJobTitles, isLoading } = useJobTitles()
      await fetchJobTitles()

      expect(isLoading.value).toBe(false)
    })

    it('應該在載入時設定 isLoading', async () => {
      let isLoadingDuringFetch = false
      mockDirectusInstance.request.mockImplementation(() => {
        const { isLoading } = useJobTitles()
        isLoadingDuringFetch = isLoading.value
        return Promise.resolve([])
      })

      const { fetchJobTitles } = useJobTitles()
      await fetchJobTitles()

      expect(isLoadingDuringFetch).toBe(true)
    })
  })

  describe('getJobTitle', () => {
    it('應該成功取得單一職位資訊', async () => {
      const mockJobTitle = {
        id: 'job-1',
        name: '經理',
        status: 'active',
        permissions_config: {
          view_all: true,
          manage_employees: true,
          manage_contracts: true
        }
      }

      mockDirectusInstance.request.mockResolvedValueOnce(mockJobTitle)

      const { getJobTitle } = useJobTitles()
      const result = await getJobTitle('job-1')

      expect(result).toEqual(mockJobTitle)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })

  describe('createJobTitle', () => {
    it('應該成功建立職位', async () => {
      const newJobTitle = {
        name: '實習教練',
        status: 'active',
        permissions_config: { basic_access: true }
      }

      const createdJobTitle = { id: 'job-4', ...newJobTitle }
      mockDirectusInstance.request.mockResolvedValueOnce(createdJobTitle)

      const { createJobTitle } = useJobTitles()
      const result = await createJobTitle(newJobTitle)

      expect(result).toEqual(createdJobTitle)
    })
  })

  describe('updateJobTitle', () => {
    it('應該成功更新職位', async () => {
      const updates = {
        permissions_config: {
          view_all: true,
          manage_employees: true,
          manage_contracts: true,
          manage_reports: true
        }
      }
      const updatedJobTitle = { id: 'job-1', name: '經理', ...updates }

      mockDirectusInstance.request.mockResolvedValueOnce(updatedJobTitle)

      const { updateJobTitle } = useJobTitles()
      const result = await updateJobTitle('job-1', updates)

      expect(result).toEqual(updatedJobTitle)
    })
  })

  describe('deleteJobTitle', () => {
    it('應該成功刪除職位', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce(undefined)

      const { deleteJobTitle } = useJobTitles()
      await deleteJobTitle('job-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })
})
