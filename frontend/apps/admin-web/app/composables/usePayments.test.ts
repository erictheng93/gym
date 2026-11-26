import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError, mockGlobalFetch } from '@test/setup'
import { usePayments, normalizePayment, type ApiPayment } from './usePayments'
import { MESSAGES } from '~/constants'

// =============================================================================
// Fixtures in the exact wire format of backend/src/routes/payments.ts:
// - each list item is PAYMENT_SELECT spread flat, with the joined `member` and
//   `contract` nested (PAYMENT_LIST_JOIN_SELECT), camelCase, decimal amounts as
//   strings and timestamps as ISO strings (JSON of a Date)
// - pagination is in `meta`, not `pagination`
// =============================================================================

const completedIncome: ApiPayment = {
  id: '6f1c1f9e-4b1a-4c43-9d55-5b1e0c7a0001',
  contractId: 'c0a8012e-0000-4000-8000-000000000001',
  memberId: 'a1b2c3d4-0000-4000-8000-000000000001',
  branchId: 'b0000000-0000-4000-8000-000000000001',
  amount: '12000.00',
  paymentMethod: 'CASH',
  paymentDate: '2026-11-20T03:15:00.000Z',
  type: 'INCOME',
  status: 'COMPLETED',
  receiptNo: null,
  notes: null,
  createdBy: 'e0000000-0000-4000-8000-000000000001',
  createdAt: '2026-11-20T03:15:00.000Z',
  tenantId: 't0000000-0000-4000-8000-000000000001',
  member: { id: 'a1b2c3d4-0000-4000-8000-000000000001', fullName: '王小明', memberCode: 'M0001' },
  contract: { id: 'c0a8012e-0000-4000-8000-000000000001', contractNo: 'CT-2026-0001' }
}

const pendingCheckout: ApiPayment = {
  ...completedIncome,
  id: '6f1c1f9e-4b1a-4c43-9d55-5b1e0c7a0002',
  amount: '3000.00',
  paymentMethod: 'CREDIT_CARD',
  status: 'PENDING',
  notes: 'Payment via stripe'
}

const listResponse = {
  success: true,
  data: [completedIncome, pendingCheckout],
  meta: { total: 42, page: 2, limit: 20, totalPages: 3 }
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('usePayments', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
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
    it('讀取後端 camelCase 欄位、巢狀 member/contract，總數取自 meta.total', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { fetchPayments, payments, totalCount, isLoading } = usePayments()

      await fetchPayments({ page: 2 }, true)

      expect(totalCount.value).toBe(42)
      expect(isLoading.value).toBe(false)
      expect(payments.value).toHaveLength(2)
      expect(payments.value[0]).toMatchObject({
        id: completedIncome.id,
        type: 'INCOME',
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentDate: '2026-11-20T03:15:00.000Z',
        amount: 12000,
        member: { fullName: '王小明', memberCode: 'M0001' },
        contract: { contractNo: 'CT-2026-0001' }
      })
      expect(payments.value[1]).toMatchObject({ status: 'PENDING', amount: 3000 })
    })

    it('decimal 字串金額會轉成數字', () => {
      expect(normalizePayment({ ...completedIncome, amount: '1500.50' }).amount).toBe(1500.5)
    })

    it('篩選條件以後端的 query 參數名稱送出', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [], meta: { total: 0, page: 1, limit: 20 } })
      const { fetchPayments } = usePayments()

      await fetchPayments({
        page: 3,
        limit: 10,
        memberId: 'm-1',
        contractId: 'c-1',
        branchId: 'b-1',
        type: 'REFUND',
        status: 'COMPLETED',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        search: '王'
      }, true)

      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/payments')
      expect(options.params).toEqual({
        page: 3,
        limit: 10,
        memberId: 'm-1',
        contractId: 'c-1',
        branchId: 'b-1',
        type: 'REFUND',
        status: 'COMPLETED',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        search: '王'
      })
      // the old snake_case names are not understood by the backend
      expect(Object.keys(options.params)).not.toContain('member_id')
      expect(Object.keys(options.params)).not.toContain('payment_type')
    })

    it('未設定的篩選不送出', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [], meta: { total: 0, page: 1, limit: 20 } })
      const { fetchPayments } = usePayments()

      await fetchPayments({ branchId: '', search: undefined }, true)

      expect(lastCall()[1].params).toEqual({ page: 1, limit: 20 })
    })

    it('API 失敗時清空列表並回報錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Network error'))
      const { fetchPayments, payments, totalCount } = usePayments()

      await fetchPayments({ page: 9 }, true)

      expect(payments.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'usePayments.fetchPayments',
        customMessage: MESSAGES.ERRORS.PAYMENT_FETCH_FAILED
      }))
    })

    it('相同參數的並行請求只呼叫一次 API', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(listResponse)
      const { fetchPayments } = usePayments()

      await Promise.all([fetchPayments({ page: 5 }), fetchPayments({ page: 5 })])

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getPayment', () => {
    it('讀取 GET /payments/:id 的扁平付款＋巢狀 member/contract', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: {
          ...completedIncome,
          member: { ...completedIncome.member!, phone: '0912345678', email: null },
          contract: { id: completedIncome.contractId, contractNo: 'CT-2026-0001', status: 'ACTIVE', totalAmount: '24000.00' }
        }
      })
      const { getPayment } = usePayments()

      const payment = await getPayment(completedIncome.id, true)

      expect(lastCall()[0]).toBe(`/payments/${completedIncome.id}`)
      expect(payment).toMatchObject({ amount: 12000, status: 'COMPLETED', member: { phone: '0912345678' } })
    })

    it('找不到時回傳 null 並回報錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('付款紀錄不存在'))
      const { getPayment } = usePayments()

      expect(await getPayment('missing', true)).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createPayment', () => {
    const input = {
      contractId: completedIncome.contractId,
      memberId: completedIncome.memberId,
      branchId: completedIncome.branchId,
      amount: 12000,
      paymentMethod: 'BANK_TRANSFER' as const,
      paymentType: 'INCOME' as const,
      paymentDate: '2026-11-20',
      notes: ''
    }

    it('以後端 createPaymentSchema 的欄位名稱 POST /payments', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...completedIncome, amount: '12000.00' } })
      const { createPayment } = usePayments()

      const created = await createPayment(input)

      const [endpoint, options] = lastCall()
      expect(endpoint).toBe('/payments')
      expect(options.method).toBe('POST')
      expect(options.body).toEqual({
        contractId: input.contractId,
        memberId: input.memberId,
        branchId: input.branchId,
        amount: 12000,
        paymentMethod: 'BANK_TRANSFER',
        paymentType: 'INCOME',
        paymentDate: '2026-11-20',
        notes: null
      })
      expect(created).toMatchObject({ id: completedIncome.id, amount: 12000 })
    })

    it('退款同樣走 POST /payments，paymentType 為 REFUND', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...completedIncome, type: 'REFUND' } })
      const { createPayment } = usePayments()

      await createPayment({ ...input, paymentType: 'REFUND', paymentDate: undefined, notes: '退費' })

      expect(lastCall()[1].body).toEqual(expect.objectContaining({ paymentType: 'REFUND', notes: '退費' }))
      expect(lastCall()[1].body).not.toHaveProperty('paymentDate')
    })

    it('後端拒絕時回傳 null，並顯示後端的錯誤訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('合約不存在'))
      const { createPayment } = usePayments()

      expect(await createPayment(input)).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'usePayments.createPayment',
        customMessage: '合約不存在'
      }))
    })

    it('無法讀的錯誤（zod 物件、HTTP 代碼）改用通用訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('[object Object]'))
      const { createPayment } = usePayments()

      await createPayment(input)

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: MESSAGES.ERRORS.PAYMENT_CREATE_FAILED
      }))
    })
  })

  describe('getPaymentStats', () => {
    it('使用 GET /payments/summary（只計入 COMPLETED），不在前端加總列表', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: { totalIncome: 52000, totalRefund: 2000, netIncome: 50000, paymentCount: 7 }
      })
      const { getPaymentStats } = usePayments()

      const stats = await getPaymentStats('b-1', '2026-11-01', '2026-11-30')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
      expect(lastCall()).toEqual(['/payments/summary', {
        params: { branchId: 'b-1', startDate: '2026-11-01', endDate: '2026-11-30' }
      }])
      expect(mockFetchInstance.readItems).not.toHaveBeenCalled()
      expect(stats).toEqual({ totalIncome: 52000, totalRefund: 2000, netIncome: 50000, paymentCount: 7 })
    })

    it('失敗時回傳全零且不跳出提示', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('boom'))
      const { getPaymentStats } = usePayments()

      expect(await getPaymentStats('b-err')).toEqual({ totalIncome: 0, totalRefund: 0, netIncome: 0, paymentCount: 0 })
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ showToast: false }))
    })
  })

  describe('fetchMemberContracts', () => {
    it('讀取 GET /members/:id/contracts，金額轉為數字', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: [{
          id: 'c-1', contractNo: 'CT-1', status: 'DRAFT', branchId: 'b-1',
          totalAmount: '24000.00', paidAmount: '12000.00', paymentStatus: 'PARTIAL',
          plan: { id: 'p-1', name: '年約', planType: 'TIME_BASED' }
        }]
      })
      const { fetchMemberContracts } = usePayments()

      const contracts = await fetchMemberContracts('m-1')

      expect(lastCall()[0]).toBe('/members/m-1/contracts')
      expect(contracts).toEqual([expect.objectContaining({
        id: 'c-1', contractNo: 'CT-1', branchId: 'b-1', totalAmount: 24000, paidAmount: 12000
      })])
    })
  })

  describe('exportPayments', () => {
    it('以登入 cookie 下載 GET /api/payments/export', async () => {
      const blob = new Blob(['csv'])
      mockGlobalFetch.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) })
      const createUrl = vi.fn(() => 'blob:x')
      const revokeUrl = vi.fn()
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }))
      const { exportPayments } = usePayments()

      expect(await exportPayments({ branchId: 'b-1', startDate: '2026-11-01' })).toBe(true)

      const [url, init] = mockGlobalFetch.mock.calls.at(-1)!
      expect(url).toBe('http://localhost:8056/api/payments/export?branchId=b-1&startDate=2026-11-01&format=csv')
      expect(init).toEqual({ credentials: 'include' })
      expect(createUrl).toHaveBeenCalledWith(blob)
    })

    it('失敗時回傳 false', async () => {
      mockGlobalFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      const { exportPayments } = usePayments()

      expect(await exportPayments()).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })
})
