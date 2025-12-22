import { describe, it, expect, beforeEach } from 'vitest'
import { mockDirectusInstance } from '../../vitest.setup'
import { useContracts } from './useContracts'
import type { Contract } from '~/types/directus'

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
      mockDirectusInstance.request.mockResolvedValueOnce(mockContracts)

      const { fetchContracts, contracts, isLoading } = useContracts()

      await fetchContracts()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual(mockContracts)
      expect(isLoading.value).toBe(false)
    })

    it('應該根據會員 ID 過濾', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([mockContracts[0]])

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ memberId: 'member-1' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該根據分店 ID 過濾', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce(mockContracts)

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ branchId: 'branch-1' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual(mockContracts)
    })

    it('應該根據合約狀態過濾', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([mockContracts[0]])

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ status: 'ACTIVE' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該支援自訂限制數量', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce(mockContracts)

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ limit: 10 })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual(mockContracts)
    })

    it('應該支援多個過濾條件組合', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([mockContracts[0]])

      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({
        memberId: 'member-1',
        branchId: 'branch-1',
        status: 'ACTIVE',
        limit: 20
      })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(contracts.value).toEqual([mockContracts[0]])
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchContracts, contracts, isLoading } = useContracts()

      await fetchContracts()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch contracts:',
        expect.any(Error)
      )
      expect(contracts.value).toEqual([])
      expect(isLoading.value).toBe(false)

      consoleErrorSpy.mockRestore()
    })

    it('應該在取得過程中設定 loading 狀態', async () => {
      let loadingDuringFetch = false

      mockDirectusInstance.request.mockImplementationOnce(() => {
        const { isLoading } = useContracts()
        loadingDuringFetch = isLoading.value
        return Promise.resolve([])
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
      mockDirectusInstance.request.mockResolvedValueOnce(mockContract)

      const { getContract } = useContracts()

      const result = await getContract('contract-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
      expect(result).toEqual(mockContract)
    })

    it('應該在取得失敗時拋出錯誤', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Not found'))

      const { getContract } = useContracts()

      await expect(getContract('invalid-id')).rejects.toThrow('Not found')
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
      mockDirectusInstance.request.mockResolvedValueOnce(createdContract)

      const { createContract } = useContracts()

      const result = await createContract(newContract)

      expect(mockDirectusInstance.request).toHaveBeenCalledWith(
        expect.anything() // createItem function
      )
      expect(result).toEqual(createdContract)
    })

    it('應該在創建失敗時拋出錯誤', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Creation failed'))

      const { createContract } = useContracts()

      await expect(createContract(newContract)).rejects.toThrow('Creation failed')
    })
  })

  describe('updateContract', () => {
    const updatedData: Partial<Contract> = {
      contract_status: 'ACTIVE',
      total_amount: 12000
    }

    it('應該成功更新合約', async () => {
      const updatedContract = { id: 'contract-1', ...updatedData }
      mockDirectusInstance.request.mockResolvedValueOnce(updatedContract)

      const { updateContract } = useContracts()

      const result = await updateContract('contract-1', updatedData)

      expect(mockDirectusInstance.request).toHaveBeenCalledWith(
        expect.anything() // updateItem function
      )
      expect(result).toEqual(updatedContract)
    })

    it('應該在更新失敗時拋出錯誤', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Update failed'))

      const { updateContract } = useContracts()

      await expect(updateContract('contract-1', updatedData)).rejects.toThrow('Update failed')
    })
  })

  describe('getContractStats', () => {
    it('應該成功取得合約統計資料', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([{ count: 10 }]) // active
        .mockResolvedValueOnce([{ count: 5 }])  // expired
        .mockResolvedValueOnce([{ count: 3 }])  // draft

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(mockDirectusInstance.request).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        active: 10,
        expired: 5,
        draft: 3
      })
    })

    it('應該根據分店 ID 過濾統計資料', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([{ count: 8 }])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([{ count: 1 }])

      const { getContractStats } = useContracts()

      const result = await getContractStats('branch-1')

      expect(mockDirectusInstance.request).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        active: 8,
        expired: 2,
        draft: 1
      })
    })

    it('應該處理空結果', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({
        active: 0,
        expired: 0,
        draft: 0
      })
    })

    it('應該處理 count 為 null 的情況', async () => {
      mockDirectusInstance.request
        .mockResolvedValueOnce([{ count: null }])
        .mockResolvedValueOnce([{ count: null }])
        .mockResolvedValueOnce([{ count: null }])

      const { getContractStats } = useContracts()

      const result = await getContractStats()

      expect(result).toEqual({
        active: 0,
        expired: 0,
        draft: 0
      })
    })

    it('應該處理統計失敗的情況', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Stats failed'))

      const { getContractStats } = useContracts()

      await expect(getContractStats()).rejects.toThrow('Stats failed')
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
