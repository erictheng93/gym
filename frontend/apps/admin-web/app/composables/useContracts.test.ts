// -nocheck
import { describe, it, expect, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useContracts } from './useContracts'
import type { Contract } from '~/types/schema'

describe('useContracts', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { contracts, isLoading } = useContracts()

      expect(contracts.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchContracts', () => {
    const mockContracts: Partial<Contract>[] = [
      {
        id: 'contract-1',
        contract_no: 'C001',
        member_id: 'member-1',
        plan_id: 'plan-1',
        contract_status: 'ACTIVE',
        total_amount: 10000
      },
      {
        id: 'contract-2',
        contract_no: 'C002',
        member_id: 'member-2',
        plan_id: 'plan-2',
        contract_status: 'EXPIRED',
        total_amount: 8000
      }
    ]

    it('應該成功取得合約列表', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockContracts, total: 2 })

      const { fetchContracts, contracts, isLoading, totalCount } = useContracts()

      await fetchContracts()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual(mockContracts)
      expect(totalCount.value).toBe(2)
      expect(isLoading.value).toBe(false)
    })

    it('應該根據會員 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockContracts[0]], total: 1 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ memberId: 'member-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該根據分店 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockContracts, total: 2 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ branchId: 'branch-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual(mockContracts)
    })

    it('應該根據合約狀態過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockContracts[0]], total: 1 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ status: 'ACTIVE' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該支援自訂限制數量', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockContracts, total: 2 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ limit: 10 })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual(mockContracts)
    })

    it('應該支援多個過濾條件組合', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockContracts[0]], total: 1 })

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({
        memberId: 'member-1',
        branchId: 'branch-1',
        status: 'ACTIVE',
        limit: 20
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchContracts, contracts, isLoading } = useContracts()

      await fetchContracts()

      expect(mockHandleError).toHaveBeenCalled()
      expect(contracts.value).toEqual([])
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
  })

  describe('getContract', () => {
    const mockContract: Partial<Contract> = {
      id: 'contract-1',
      contract_no: 'C001',
      member_id: 'member-1',
      plan_id: 'plan-1',
      contract_status: 'ACTIVE',
      total_amount: 10000
    }

    it('應該成功取得單個合約詳情', async () => {
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

    it('應該成功創建合約', async () => {
      const createdContract = { id: 'contract-1', ...newContract }
      mockFetchInstance.createItem.mockResolvedValueOnce(createdContract)

      const { createContract } = useContracts()

      const result = await createContract(newContract)

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('contracts', newContract)
      expect(result).toEqual(createdContract)
    })

    it('應該在創建失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Creation failed'))

      const { createContract } = useContracts()

      const result = await createContract(newContract)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updateContract', () => {
    const updatedData: Partial<Contract> = {
      contract_status: 'ACTIVE',
      total_amount: 12000
    }

    it('應該成功更新合約', async () => {
      const updatedContract = { id: 'contract-1', ...updatedData }
      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedContract)

      const { updateContract } = useContracts()

      const result = await updateContract('contract-1', updatedData)

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('contracts', 'contract-1', updatedData)
      expect(result).toEqual(updatedContract)
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updateContract } = useContracts()

      const result = await updateContract('contract-1', updatedData)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getContractStats', () => {
    it('應該成功取得合約統計資料', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 10 }) // active
        .mockResolvedValueOnce({ data: [], total: 5 })  // expired
        .mockResolvedValueOnce({ data: [], total: 3 })  // draft

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        active: 10,
        expired: 5,
        draft: 3
      })
    })

    it('應該根據分店 ID 過濾統計資料', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 8 })
        .mockResolvedValueOnce({ data: [], total: 2 })
        .mockResolvedValueOnce({ data: [], total: 1 })

      const { getContractStats } = useContracts()

      const result = await getContractStats('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        active: 8,
        expired: 2,
        draft: 1
      })
    })

    it('應該處理空結果', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({
        active: 0,
        expired: 0,
        draft: 0
      })
    })

    it('應該處理統計失敗的情況並返回預設值', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Stats failed'))

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({
        active: 0,
        expired: 0,
        draft: 0
      })
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('狀態管理', () => {
    it('應該在多次呼叫 useContracts 時共享狀態', () => {
      const instance1 = useContracts()
      const instance2 = useContracts()

      instance1.contracts.value = [{ id: 'contract-1' } as Contract]

      expect(instance2.contracts.value).toEqual([{ id: 'contract-1' }])
    })
  })
})
