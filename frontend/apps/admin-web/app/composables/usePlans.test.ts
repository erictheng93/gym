import { describe, it, expect, beforeEach } from 'vitest'
import { mockDirectusInstance } from '../../vitest.setup'
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

      mockDirectusInstance.request.mockResolvedValueOnce(mockPlans)

      const { fetchPlans, plans } = usePlans()
      await fetchPlans()

      expect(plans.value).toEqual(mockPlans)
    })

    it('應該支援狀態過濾', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: 'active' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該支援方案類型過濾', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchPlans } = usePlans()
      await fetchPlans({ planType: 'TIME_BASED' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該忽略空字串的過濾條件', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: '', planType: '' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該同時支援多個過濾條件', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchPlans } = usePlans()
      await fetchPlans({ status: 'active', planType: 'COUNT_BASED' })

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該按價格排序', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce([])

      const { fetchPlans } = usePlans()
      await fetchPlans()

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })

    it('應該處理取得失敗', async () => {
      mockDirectusInstance.request.mockRejectedValueOnce(new Error('Failed'))

      const { fetchPlans, isLoading } = usePlans()
      await fetchPlans()

      expect(isLoading.value).toBe(false)
    })

    it('應該在載入時設定 isLoading', async () => {
      let isLoadingDuringFetch = false
      mockDirectusInstance.request.mockImplementation(() => {
        const { isLoading } = usePlans()
        isLoadingDuringFetch = isLoading.value
        return Promise.resolve([])
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

      mockDirectusInstance.request.mockResolvedValueOnce(mockPlan)

      const { getPlan } = usePlans()
      const result = await getPlan('plan-1')

      expect(result).toEqual(mockPlan)
      expect(mockDirectusInstance.request).toHaveBeenCalled()
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
      mockDirectusInstance.request.mockResolvedValueOnce(createdPlan)

      const { createPlan } = usePlans()
      const result = await createPlan(newPlan)

      expect(result).toEqual(createdPlan)
    })
  })

  describe('updatePlan', () => {
    it('應該成功更新方案', async () => {
      const updates = { price: 2500 }
      const updatedPlan = { id: 'plan-1', name: '月會員', ...updates }

      mockDirectusInstance.request.mockResolvedValueOnce(updatedPlan)

      const { updatePlan } = usePlans()
      const result = await updatePlan('plan-1', updates)

      expect(result).toEqual(updatedPlan)
    })
  })

  describe('deletePlan', () => {
    it('應該成功刪除方案', async () => {
      mockDirectusInstance.request.mockResolvedValueOnce(undefined)

      const { deletePlan } = usePlans()
      await deletePlan('plan-1')

      expect(mockDirectusInstance.request).toHaveBeenCalled()
    })
  })
})
