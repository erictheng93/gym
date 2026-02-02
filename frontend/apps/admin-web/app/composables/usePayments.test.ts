import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { usePayments } from './usePayments'
import type { Payment } from '~/types/schema'

describe('usePayments', () => {
  beforeEach(() => {
    // mocks are automatically cleared in vitest.setup.ts
  })

  describe('初始化狀態', () => {
    it('應該初始化所有狀態為預設值', () => {
      const { payments, isLoading, totalCount } = usePayments()

      expect(payments.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(totalCount.value).toBe(0)
    })
  })

  describe('fetchPayments', () => {
    const mockPayments: Partial<Payment>[] = [
      {
        id: 'payment-1',
        contract_id: 'contract-1',
        member_id: 'member-1',
        amount: 10000,
        payment_type: 'INCOME',
        payment_date: '2025-01-01'
      },
      {
        id: 'payment-2',
        contract_id: 'contract-2',
        member_id: 'member-2',
        amount: 5000,
        payment_type: 'REFUND',
        payment_date: '2025-01-02'
      }
    ]

    it('應該成功取得支付列表', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPayments, total: 2 })

      const { fetchPayments, payments, totalCount, isLoading } = usePayments()

      await fetchPayments()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(payments.value).toEqual(mockPayments)
      expect(totalCount.value).toBe(2)
      expect(isLoading.value).toBe(false)
    })

    it('應該支援分頁參數', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPayments, total: 100 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ page: 3, limit: 10 })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        page: 3,
        limit: 10
      }))
      expect(payments.value).toEqual(mockPayments)
      expect(totalCount.value).toBe(100)
    })

    it('應該根據會員 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockPayments[0]], total: 1 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ memberId: 'member-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({ member_id: 'member-1' })
      }))
      expect(payments.value).toEqual([mockPayments[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據合約 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockPayments[0]], total: 1 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ contractId: 'contract-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({ contract_id: 'contract-1' })
      }))
      expect(payments.value).toEqual([mockPayments[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據分店 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPayments, total: 2 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ branchId: 'branch-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({ branch_id: 'branch-1' })
      }))
      expect(payments.value).toEqual(mockPayments)
      expect(totalCount.value).toBe(2)
    })

    it('應該根據支付類型過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockPayments[0]], total: 1 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ paymentType: 'INCOME' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({ payment_type: 'INCOME' })
      }))
      expect(payments.value).toEqual([mockPayments[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該根據日期範圍過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPayments, total: 2 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        })
      }))
      expect(payments.value).toEqual(mockPayments)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援多個過濾條件組合', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [mockPayments[0]], total: 1 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({
        memberId: 'member-1',
        branchId: 'branch-1',
        paymentType: 'INCOME',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        page: 2,
        limit: 10
      })

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        page: 2,
        limit: 10,
        filter: expect.objectContaining({
          member_id: 'member-1',
          branch_id: 'branch-1',
          payment_type: 'INCOME',
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        })
      }))
      expect(payments.value).toEqual([mockPayments[0]])
      expect(totalCount.value).toBe(1)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchPayments, payments, totalCount, isLoading } = usePayments()

      await fetchPayments()

      expect(mockHandleError).toHaveBeenCalled()
      expect(payments.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
    })

    it('應該正確排序支付記錄', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: mockPayments, total: 2 })

      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        sort: 'payment_date',
        sortOrder: 'desc'
      }))
      expect(payments.value).toEqual(mockPayments)
      expect(totalCount.value).toBe(2)
    })
  })

  describe('getPayment', () => {
    const mockPayment: Partial<Payment> = {
      id: 'payment-1',
      contract_id: 'contract-1',
      member_id: 'member-1',
      amount: 10000,
      payment_type: 'INCOME'
    }

    it('應該成功取得單個支付詳情', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(mockPayment)

      const { getPayment } = usePayments()

      const result = await getPayment('payment-1')

      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('payments', 'payment-1')
      expect(result).toEqual(mockPayment)
    })

    it('應該在取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.readItem.mockRejectedValueOnce(new Error('Not found'))

      const { getPayment } = usePayments()

      const result = await getPayment('invalid-id')

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createPayment', () => {
    const newPayment: Partial<Payment> = {
      contract_id: 'contract-1',
      member_id: 'member-1',
      amount: 10000,
      payment_method: 'CASH',
      payment_type: 'INCOME',
      payment_date: '2025-01-01'
    }

    it('應該成功創建支付記錄', async () => {
      const createdPayment = { id: 'payment-1', ...newPayment }
      mockFetchInstance.createItem.mockResolvedValueOnce(createdPayment)

      const { createPayment } = usePayments()

      const result = await createPayment(newPayment)

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('payments', newPayment)
      expect(result).toEqual(createdPayment)
    })

    it('應該在創建失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.createItem.mockRejectedValueOnce(new Error('Creation failed'))

      const { createPayment } = usePayments()

      const result = await createPayment(newPayment)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('updatePayment', () => {
    const updatedData: Partial<Payment> = {
      amount: 12000,
      notes: 'Updated payment'
    }

    it('應該成功更新支付記錄', async () => {
      const updatedPayment = { id: 'payment-1', ...updatedData }
      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedPayment)

      const { updatePayment } = usePayments()

      const result = await updatePayment('payment-1', updatedData)

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('payments', 'payment-1', updatedData)
      expect(result).toEqual(updatedPayment)
    })

    it('應該在更新失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.updateItem.mockRejectedValueOnce(new Error('Update failed'))

      const { updatePayment } = usePayments()

      const result = await updatePayment('payment-1', updatedData)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deletePayment', () => {
    it('應該成功刪除支付記錄', async () => {
      mockFetchInstance.deleteItem.mockResolvedValueOnce(true)

      const { deletePayment } = usePayments()

      const result = await deletePayment('payment-1')

      expect(mockFetchInstance.deleteItem).toHaveBeenCalledWith('payments', 'payment-1')
      expect(result).toBe(true)
    })

    it('應該在刪除失敗時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.deleteItem.mockRejectedValueOnce(new Error('Delete failed'))

      const { deletePayment } = usePayments()

      const result = await deletePayment('payment-1')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getPaymentStats', () => {
    it('應該成功取得支付統計資料', async () => {
      const incomePayments = [
        { id: '1', amount: 50000, payment_type: 'INCOME' },
        { id: '2', amount: 50000, payment_type: 'INCOME' }
      ] as Payment[]
      const refundPayments = [
        { id: '3', amount: 10000, payment_type: 'REFUND' }
      ] as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 10 }) // income
        .mockResolvedValueOnce({ data: refundPayments, total: 2 })   // refund

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(2)
      expect(result).toEqual({
        income: {
          count: 10,
          amount: 100000
        },
        refund: {
          count: 2,
          amount: 10000
        },
        netAmount: 90000 // 100000 - 10000
      })
    })

    it('應該根據分店 ID 過濾統計', async () => {
      const incomePayments = [
        { id: '1', amount: 50000, payment_type: 'INCOME' }
      ] as Payment[]
      const refundPayments = [
        { id: '2', amount: 5000, payment_type: 'REFUND' }
      ] as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 5 })
        .mockResolvedValueOnce({ data: refundPayments, total: 1 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(2)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({ branch_id: 'branch-1' })
      }))
      expect(result).toEqual({
        income: { count: 5, amount: 50000 },
        refund: { count: 1, amount: 5000 },
        netAmount: 45000
      })
    })

    it('應該根據日期範圍過濾統計', async () => {
      const incomePayments = [
        { id: '1', amount: 30000, payment_type: 'INCOME' }
      ] as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 3 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats(undefined, '2025-01-01', '2025-01-31')

      expect(mockFetchInstance.readItems).toHaveBeenCalledTimes(2)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('payments', expect.objectContaining({
        filter: expect.objectContaining({
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        })
      }))
      expect(result).toEqual({
        income: { count: 3, amount: 30000 },
        refund: { count: 0, amount: 0 },
        netAmount: 30000
      })
    })

    it('應該處理空結果', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(result).toEqual({
        income: { count: 0, amount: 0 },
        refund: { count: 0, amount: 0 },
        netAmount: 0
      })
    })

    it('應該處理 null 值', async () => {
      const incomePayments = [
        { id: '1', amount: null, payment_type: 'INCOME' }
      ] as unknown as Payment[]
      const refundPayments = [
        { id: '2', amount: null, payment_type: 'REFUND' }
      ] as unknown as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 1 })
        .mockResolvedValueOnce({ data: refundPayments, total: 1 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(result).toEqual({
        income: { count: 1, amount: 0 },
        refund: { count: 1, amount: 0 },
        netAmount: 0
      })
    })

    it('應該處理統計失敗的情況並返回預設值', async () => {
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Stats failed'))

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(mockHandleError).toHaveBeenCalled()
      expect(result).toEqual({
        income: { count: 0, amount: 0 },
        refund: { count: 0, amount: 0 },
        netAmount: 0
      })
    })

    it('應該正確計算淨金額（收入 - 退款）', async () => {
      const incomePayments = [
        { id: '1', amount: 60000, payment_type: 'INCOME' },
        { id: '2', amount: 40000, payment_type: 'INCOME' }
      ] as Payment[]
      const refundPayments = [
        { id: '3', amount: 10000, payment_type: 'REFUND' },
        { id: '4', amount: 5000, payment_type: 'REFUND' }
      ] as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 10 })
        .mockResolvedValueOnce({ data: refundPayments, total: 3 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(result.netAmount).toBe(85000)
    })

    it('應該處理退款大於收入的情況', async () => {
      const incomePayments = [
        { id: '1', amount: 10000, payment_type: 'INCOME' }
      ] as Payment[]
      const refundPayments = [
        { id: '2', amount: 15000, payment_type: 'REFUND' }
      ] as Payment[]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: incomePayments, total: 1 })
        .mockResolvedValueOnce({ data: refundPayments, total: 2 })

      const { getPaymentStats } = usePayments()

      const result = await getPaymentStats()

      expect(result.netAmount).toBe(-5000)
    })
  })

  describe('狀態管理', () => {
    it('應該在多次呼叫 usePayments 時共享狀態', () => {
      const instance1 = usePayments()
      const instance2 = usePayments()

      instance1.payments.value = [{ id: 'payment-1' } as Payment]
      instance1.totalCount.value = 100

      expect(instance2.payments.value).toEqual([{ id: 'payment-1' }])
      expect(instance2.totalCount.value).toBe(100)
    })
  })
})
