import { describe, it, expect, beforeEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { usePlans } from './usePlans'

describe('usePlans', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { plans, isLoading } = usePlans()

      expect(plans.value).toEqual([])
      expect(isLoading.value).toBe(false)
    })
  })

  describe('fetchPlans', () => {
    it('應該成功取得方案列表', async () => {
      const mockPlans = [
        {
          id: 'plan-1',
          name: '月會員',
          plan_type: 'TIME_BASED',
          price: 2000,
          status: 'active'
        },
        {
          id: 'plan-2',
          name: '年會員',
          plan_type: 'TIME_BASED',
          price: 20000,
          status: 'active'
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPlans, total: 2 })

      const { fetchPlans, plans } = usePlans()
      await fetchPlans()

      expect(plans.value).toEqual(mockPlans)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.any(Object))
    })

    it('應該支援狀態過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: 'active' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.objectContaining({
        filter: { status: 'active' }
      }))
    })

    it('應該支援方案類型過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPlans } = usePlans()
      await fetchPlans({ planType: 'TIME_BASED' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.objectContaining({
        filter: { plan_type: 'TIME_BASED' }
      }))
    })

    it('應該忽略空字串的過濾條件', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: '', planType: '' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.objectContaining({
        filter: {}
      }))
    })

    it('應該同時支援多個過濾條件', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: 'active', planType: 'COUNT_BASED' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.objectContaining({
        filter: { status: 'active', plan_type: 'COUNT_BASED' }
      }))
    })

    it('應該按價格排序', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })

      const { fetchPlans } = usePlans()
      await fetchPlans()

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('membership-plans', expect.objectContaining({
        sort: 'price'
      }))
    })

    it('應該處理取得失敗', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Failed'))

      const { fetchPlans, isLoading, plans } = usePlans()
      await fetchPlans()

      expect(isLoading.value).toBe(false)
      expect(plans.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該在載入時設定 isLoading', async () => {
      let isLoadingDuringFetch = false
      mockFetchInstance.readItems.mockImplementation(() => {
        const { isLoading } = usePlans()
        isLoadingDuringFetch = isLoading.value
        return Promise.resolve({ data: [], total: 0 })
      })

      const { fetchPlans } = usePlans()
      await fetchPlans()

      expect(isLoadingDuringFetch).toBe(true)
    })
  })

  describe('getPlan', () => {
    it('應該成功取得單一方案資訊', async () => {
      const mockPlan = {
        id: 'plan-1',
        name: '月會員',
        plan_type: 'TIME_BASED',
        duration_months: 1,
        price: 2000,
        status: 'active'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(mockPlan)

      const { getPlan } = usePlans()
      const result = await getPlan('plan-1')

      expect(result).toEqual(mockPlan)
      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('membership-plans', 'plan-1')
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Plan not found'))

      const { getPlan } = usePlans()
      const result = await getPlan('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createPlan', () => {
    it('應該成功建立方案', async () => {
      const newPlan = {
        name: '季會員',
        plan_type: 'TIME_BASED',
        duration_months: 3,
        price: 5000
      }

      const createdPlan = { id: 'plan-3', ...newPlan, status: 'active' }
      mockFetchInstance.createItem.mockResolvedValueOnce(createdPlan)

      const { createPlan } = usePlans()
      const result = await createPlan(newPlan)

      expect(result).toEqual(createdPlan)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('membership-plans', newPlan)
    })

    it('應該在建立失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Create failed'))

      const { createPlan } = usePlans()
      const result = await createPlan({ name: 'Test' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updatePlan', () => {
    it('應該成功更新方案', async () => {
      const updates = { price: 2500 }
      const updatedPlan = { id: 'plan-1', name: '月會員', ...updates }

      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedPlan)

      const { updatePlan } = usePlans()
      const result = await updatePlan('plan-1', updates)

      expect(result).toEqual(updatedPlan)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('membership-plans', 'plan-1', updates)
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updatePlan } = usePlans()
      const result = await updatePlan('plan-1', { price: 2500 })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deletePlan', () => {
    it('應該成功刪除方案', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)

      const { deletePlan } = usePlans()
      const result = await deletePlan('plan-1')

      expect(result).toBe(true)
      expect(mockFetchInstance.deleteItem).toHaveBeenCalledWith('membership-plans', 'plan-1')
    })

    it('應該在刪除失敗時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))

      const { deletePlan } = usePlans()
      const result = await deletePlan('plan-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })
})
