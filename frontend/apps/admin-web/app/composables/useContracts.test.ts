import { describe, it, expect, vi } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useContracts } from './useContracts'
import type { Contract } from '~/types/schema'

const mockInvalidateCache = vi.hoisted(() => vi.fn())

vi.mock('~/composables/core/useApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/core/useApi')>()
  return {
    ...actual,
    useApi: () => ({ invalidateCache: mockInvalidateCache })
  }
})

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-1',
  contract_no: 'C001',
  member_id: 'member-1',
  plan_id: 'plan-1',
  contract_status: 'ACTIVE',
  total_amount: 10000,
  ...overrides
} as Contract)

describe('useContracts', () => {
  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { contracts, isLoading, totalCount } = useContracts()

      expect(contracts.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(totalCount.value).toBe(0)
    })
  })

  describe('fetchContracts', () => {
    const mockContracts = [
      makeContract(),
      makeContract({ id: 'contract-2', contract_no: 'C002', member_id: 'member-2', plan_id: 'plan-2', contract_status: 'EXPIRED', total_amount: 8000 })
    ]

    it('應該成功取得合約列表，預設第 1 頁、每頁 20 筆、建立時間倒序', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockContracts, total: 2 })

      const { fetchContracts, contracts, isLoading, totalCount } = useContracts()

      await fetchContracts()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', expect.objectContaining({
        page: 1,
        limit: 20,
        filter: {},
        sort: 'date_created',
        sortOrder: 'desc'
      }))
      expect(contracts.value).toEqual(mockContracts)
      expect(totalCount.value).toBe(2)
      expect(isLoading.value).toBe(false)
    })

    it('應該把過濾條件轉成後端欄位名稱', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockContracts[0]], total: 1 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({
        memberId: 'member-1',
        branchId: 'branch-1',
        status: 'ACTIVE',
        search: 'C001',
        page: 3,
        limit: 10
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', expect.objectContaining({
        page: 3,
        limit: 10,
        search: 'C001',
        filter: { member_id: 'member-1', branch_id: 'branch-1', contract_status: 'ACTIVE' }
      }))
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('只帶部分條件時不應送出其他過濾欄位', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchContracts } = useContracts()

      await fetchContracts({ status: 'DRAFT' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', expect.objectContaining({
        filter: { contract_status: 'DRAFT' }
      }))
    })

    it('應該處理取得失敗的情況並清空資料', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchContracts, contracts, totalCount, isLoading } = useContracts()
      contracts.value = mockContracts
      totalCount.value = 2

      await fetchContracts()

      expect(mockHandleError).toHaveBeenCalled()
      expect(contracts.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
    })

    it('應該在取得過程中設定 loading 狀態', async () => {
      let loadingDuringFetch = false

      mockFetchInstance.readItems.mockImplementationOnce(() => {
        const { isLoading } = useContracts()
        loadingDuringFetch = isLoading.value
        return Promise.resolve({ data: [], total: 0 })
      })

      const { fetchContracts } = useContracts()

      await fetchContracts()

      expect(loadingDuringFetch).toBe(true)
    })

    it('相同條件的並行請求應該只送出一次', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockContracts, total: 2 })

      const { fetchContracts } = useContracts()

      await Promise.all([fetchContracts({ memberId: 'member-1' }), fetchContracts({ memberId: 'member-1' })])

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
    })
  })

  describe('getContract', () => {
    it('應該成功取得單個合約詳情', async () => {
      const mockContract = makeContract()
      mockFetchInstance.readItem.mockResolvedValueOnce(mockContract)

      const { getContract } = useContracts()

      const result = await getContract('contract-1')

      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('contracts', 'contract-1')
      expect(result).toEqual(mockContract)
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Not found'))

      const { getContract } = useContracts()

      const result = await getContract('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createContract', () => {
    const newContract: Partial<Contract> = {
      member_id: 'member-1',
      plan_id: 'plan-1',
      start_date: '2025-01-01',
      contract_status: 'DRAFT',
      total_amount: 10000
    }

    it('應該成功創建合約並失效合約與會員快取', async () => {
      const createdContract = makeContract({ ...newContract })
      mockFetchInstance.createItem.mockResolvedValueOnce(createdContract)

      const { createContract } = useContracts()

      const result = await createContract(newContract)

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('contracts', newContract)
      expect(result).toEqual(createdContract)
      expect(mockInvalidateCache).toHaveBeenCalledWith(['contracts', 'members'])
    })

    it('應該在創建失敗時返回 null、呼叫 handleError 且不失效快取', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Creation failed'))

      const { createContract } = useContracts()

      const result = await createContract(newContract)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockInvalidateCache).not.toHaveBeenCalled()
    })
  })

  describe('updateContract', () => {
    const updatedData: Partial<Contract> = {
      contract_status: 'ACTIVE',
      total_amount: 12000
    }

    it('應該成功更新合約並失效合約與會員快取', async () => {
      const updatedContract = makeContract(updatedData)
      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedContract)

      const { updateContract } = useContracts()

      const result = await updateContract('contract-1', updatedData)

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('contracts', 'contract-1', updatedData)
      expect(result).toEqual(updatedContract)
      expect(mockInvalidateCache).toHaveBeenCalledWith(['contracts', 'members'])
    })

    it('應該在更新失敗時返回 null、呼叫 handleError 且不失效快取', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updateContract } = useContracts()

      const result = await updateContract('contract-1', updatedData)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockInvalidateCache).not.toHaveBeenCalled()
    })
  })

  describe('activateContract', () => {
    it('應該呼叫啟用端點、回傳合約並失效合約與會員快取', async () => {
      const activated = makeContract()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: activated })

      const { activateContract } = useContracts()
      const result = await activateContract('contract-1')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/contracts/contract-1/activate', { method: 'POST' })
      expect(result).toEqual(activated)
      expect(mockInvalidateCache).toHaveBeenCalledWith(['contracts', 'members'])
    })

    it('應該在啟用失敗時返回 null、呼叫 handleError 且不失效快取', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('只有草稿狀態的合約可以啟用'))

      const { activateContract } = useContracts()
      const result = await activateContract('contract-1')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
      expect(mockInvalidateCache).not.toHaveBeenCalled()
    })
  })

  describe('pauseContract', () => {
    it('應該呼叫後端暫停端點（由後端驗證日期並延長到期日）', async () => {
      const paused = { id: 'contract-1', contract_status: 'PAUSED' }
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: paused })

      const { pauseContract } = useContracts()
      const body = { startDate: '2026-12-01', endDate: '2026-12-08', reason: '出國' }
      const result = await pauseContract('contract-1', body)

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/contracts/contract-1/pause', { method: 'POST', body })
      expect(mockFetchInstance.updateItem).not.toHaveBeenCalled()
      expect(result).toEqual(paused)
    })

    it('後端拒絕（例如日期不合法）時應該返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('暫停結束日必須晚於開始日'))

      const { pauseContract } = useContracts()
      const result = await pauseContract('contract-1', { startDate: '2026-12-08', endDate: '2026-12-01' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getContractStats', () => {
    // Resolve by the requested status so the test does not depend on call order
    const mockTotalsByStatus = (totals: Record<string, number>) => {
      mockFetchInstance.readItems.mockImplementation(async (_collection: string, options: { filter: { contract_status: string } }) => ({
        data: [],
        total: totals[options.filter.contract_status] ?? 0
      }))
    }

    it('應該依狀態分別查詢並回傳統計資料', async () => {
      mockTotalsByStatus({ ACTIVE: 10, EXPIRED: 5, DRAFT: 3 })

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(3)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', { limit: 1, filter: { contract_status: 'ACTIVE' } })
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', { limit: 1, filter: { contract_status: 'EXPIRED' } })
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', { limit: 1, filter: { contract_status: 'DRAFT' } })
      expect(result).toEqual({ active: 10, expired: 5, draft: 3 })
    })

    it('應該把分店 ID 帶進每一個統計查詢', async () => {
      mockTotalsByStatus({ ACTIVE: 8, EXPIRED: 2, DRAFT: 1 })

      const { getContractStats } = useContracts()

      const result = await getContractStats('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(3)
      for (const status of ['ACTIVE', 'EXPIRED', 'DRAFT']) {
        expect(mockFetchInstance.readItems).toHaveBeenCalledWith('contracts', {
          limit: 1,
          filter: { branch_id: 'branch-1', contract_status: status }
        })
      }
      expect(result).toEqual({ active: 8, expired: 2, draft: 1 })
    })

    it('應該處理空結果', async () => {
      mockTotalsByStatus({})

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({ active: 0, expired: 0, draft: 0 })
    })

    it('應該處理統計失敗的情況並返回預設值', async () => {
      mockFetchInstance.readItems.mockRejectedValue(new Error('Stats failed'))

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({ active: 0, expired: 0, draft: 0 })
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('狀態管理', () => {
    it('應該在多次呼叫 useContracts 時共享狀態', () => {
      const instance1 = useContracts()
      const instance2 = useContracts()

      instance1.contracts.value = [makeContract()]

      expect(instance2.contracts.value).toEqual([makeContract()])
    })
  })
})
