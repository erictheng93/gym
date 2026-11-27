import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useContracts, type ApiContract, type ApiContractListRow, type ApiContractDetail } from './useContracts'
import { MESSAGES } from '~/constants'

const mockInvalidateCache = vi.hoisted(() => vi.fn())

vi.mock('~/composables/core/useApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/core/useApi')>()
  return {
    ...actual,
    useApi: () => ({ invalidateCache: mockInvalidateCache })
  }
})

// =============================================================================
// Fixtures in the exact wire format of backend/src/routes/contracts.ts:
// - list items are { contract, member, plan } (CONTRACT_LIST_JOIN_SELECT), camelCase,
//   decimals as strings, pagination in `pagination` (and `meta`)
// - GET /:id adds branch, salesPerson, logs and payments next to them
// =============================================================================

const apiContract: ApiContract = {
  id: 'c0a8012e-0000-4000-8000-000000000001',
  contractNo: 'C2026000001',
  memberId: 'a1b2c3d4-0000-4000-8000-000000000001',
  planId: 'p0000000-0000-4000-8000-000000000001',
  branchId: 'b0000000-0000-4000-8000-000000000001',
  salesPersonId: null,
  status: 'ACTIVE',
  signDate: '2026-11-01',
  startDate: '2026-11-01',
  originalEndDate: '2027-11-01',
  endDate: '2027-11-08',
  remainingCounts: null,
  totalAmount: '30000.00',
  paidAmount: '12000.00',
  paymentStatus: 'PARTIAL',
  digitalSignature: null,
  notes: null,
  createdAt: '2026-11-01T02:00:00.000Z',
  updatedAt: null
}

const listRow: ApiContractListRow = {
  contract: apiContract,
  member: { id: apiContract.memberId, fullName: '王小明', memberCode: 'M0001' },
  plan: { id: apiContract.planId, name: '年卡', planType: 'TIME_BASED' }
}

const draftRow: ApiContractListRow = {
  contract: { ...apiContract, id: 'c0a8012e-0000-4000-8000-000000000002', contractNo: 'C2026000002', status: 'DRAFT', paidAmount: '0.00', paymentStatus: 'UNPAID' },
  member: null,
  plan: null
}

const listResponse = {
  success: true,
  data: [listRow, draftRow],
  meta: { total: 42, page: 1, limit: 20, totalPages: 3 },
  pagination: { total: 42, page: 1, limit: 20, totalPages: 3 }
}

const detailResponse: { success: true; data: ApiContractDetail & { payments: unknown[] } } = {
  success: true,
  data: {
    contract: apiContract,
    member: { ...listRow.member!, phone: '0912345678', email: 'ming@example.com' },
    plan: { ...listRow.plan!, price: '30000.00', durationMonths: 12, classCounts: null, allowPause: true, allowTransfer: false },
    branch: { id: apiContract.branchId, name: '信義店' },
    salesPerson: { id: 'e0000000-0000-4000-8000-000000000001', fullName: '林業務' },
    logs: [{
      id: 'l-1',
      contractId: apiContract.id,
      logType: 'PAUSE',
      startDate: '2026-12-01',
      endDate: '2026-12-08',
      daysAffected: 7,
      reason: '出差',
      dateCreated: '2026-11-20T03:00:00.000Z',
      createdByName: '林業務'
    }],
    payments: []
  }
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useContracts', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  describe('fetchContracts', () => {
    it('GET /contracts，把巢狀列轉成扁平的 camelCase 並讀取 pagination.total', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { fetchContracts, contracts, totalCount, isLoading } = useContracts()

      await fetchContracts({}, true)

      expect(lastCall()).toEqual(['/contracts', { params: { page: 1, limit: 20 } }])
      expect(contracts.value).toHaveLength(2)
      expect(contracts.value[0]).toMatchObject({
        id: apiContract.id,
        contractNo: 'C2026000001',
        status: 'ACTIVE',
        totalAmount: 30000,
        paidAmount: 12000,
        member: { fullName: '王小明', memberCode: 'M0001' },
        plan: { name: '年卡', planType: 'TIME_BASED' }
      })
      expect(contracts.value[1]).toMatchObject({ status: 'DRAFT', member: null, plan: null })
      expect(totalCount.value).toBe(42)
      expect(isLoading.value).toBe(false)
    })

    it('篩選條件使用後端讀取的參數名稱（memberId / branchId / status / search）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ ...listResponse, data: [listRow] })
      const { fetchContracts } = useContracts()

      await fetchContracts({
        memberId: 'm-1',
        branchId: 'b-1',
        status: 'PAUSED',
        search: 'C2026',
        page: 3,
        limit: 10
      }, true)

      const params = lastCall()[1].params
      expect(params).toEqual({ page: 3, limit: 10, memberId: 'm-1', branchId: 'b-1', status: 'PAUSED', search: 'C2026' })
      // the old snake_case names are ignored by the backend
      expect(Object.keys(params)).not.toContain('member_id')
      expect(Object.keys(params)).not.toContain('contract_status')
    })

    it('未設定的篩選不送出', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(listResponse)
      const { fetchContracts } = useContracts()

      await fetchContracts({ status: '', search: undefined }, true)

      expect(lastCall()[1].params).toEqual({ page: 1, limit: 20 })
    })

    it('API 失敗時清空列表並回報錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Network error'))
      const { fetchContracts, contracts, totalCount } = useContracts()

      await fetchContracts({ page: 7 }, true)

      expect(contracts.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'useContracts.fetchContracts',
        customMessage: MESSAGES.ERRORS.CONTRACT_FETCH_FAILED
      }))
    })

    it('相同參數的並行請求只呼叫一次 API', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue(listResponse)
      const { fetchContracts } = useContracts()

      await Promise.all([fetchContracts({ page: 5 }), fetchContracts({ page: 5 })])

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getContract', () => {
    it('把 { contract, member, plan, branch, salesPerson, logs } 攤平成詳情', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce(detailResponse)
      const { getContract } = useContracts()

      const contract = await getContract(apiContract.id, true)

      expect(lastCall()[0]).toBe(`/contracts/${apiContract.id}`)
      expect(contract).toMatchObject({
        id: apiContract.id,
        contractNo: 'C2026000001',
        status: 'ACTIVE',
        endDate: '2027-11-08',
        totalAmount: 30000,
        paidAmount: 12000,
        member: { fullName: '王小明', phone: '0912345678' },
        plan: { price: 30000, durationMonths: 12, allowPause: true, allowTransfer: false },
        branch: { name: '信義店' },
        salesPerson: { fullName: '林業務' }
      })
      expect(contract!.logs[0]).toMatchObject({ logType: 'PAUSE', daysAffected: 7, createdByName: '林業務' })
    })

    it('404 時回傳 null 並顯示後端訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('合約不存在'))
      const { getContract } = useContracts()

      expect(await getContract('missing', true)).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'useContracts.getContract',
        customMessage: '合約不存在'
      }))
    })
  })

  describe('createContract', () => {
    const input = {
      memberId: apiContract.memberId,
      planId: apiContract.planId,
      branchId: apiContract.branchId,
      startDate: '2026-11-01',
      totalAmount: 30000,
      notes: ''
    }

    it('POST /contracts 的 body 完全符合後端 zod schema', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...apiContract, status: 'DRAFT' } })
      const { createContract } = useContracts()

      const created = await createContract(input)

      expect(lastCall()).toEqual(['/contracts', {
        method: 'POST',
        body: {
          memberId: apiContract.memberId,
          planId: apiContract.planId,
          branchId: apiContract.branchId,
          startDate: '2026-11-01',
          totalAmount: 30000,
          notes: null
        }
      }])
      expect(created).toMatchObject({ id: apiContract.id, status: 'DRAFT', totalAmount: 30000 })
      expect(mockInvalidateCache).toHaveBeenCalled()
    })

    it('後端 400 時回傳 null、顯示原因，且不清除快取', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))
      const { createContract } = useContracts()

      expect(await createContract(input)).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'useContracts.createContract',
        customMessage: '無效的分店'
      }))
      expect(mockInvalidateCache).not.toHaveBeenCalled()
    })

    it('zod 驗證錯誤（非字串）時顯示預設訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('[object Object]'))
      const { createContract } = useContracts()

      expect(await createContract(input)).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: MESSAGES.ERRORS.CONTRACT_CREATE_FAILED
      }))
    })
  })

  describe('合約動作只呼叫各自的後端端點', () => {
    const ok = (data: unknown = apiContract) => mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data })

    it('activate / pause / resume / extend', async () => {
      const { activateContract, pauseContract, resumeContract, extendContract } = useContracts()

      ok(); await activateContract('c-1')
      expect(lastCall()).toEqual(['/contracts/c-1/activate', { method: 'POST' }])

      ok(); await pauseContract('c-1', { startDate: '2026-12-01', endDate: '2026-12-08' })
      expect(lastCall()).toEqual(['/contracts/c-1/pause', { method: 'POST', body: { startDate: '2026-12-01', endDate: '2026-12-08' } }])

      ok(); await resumeContract('c-1')
      expect(lastCall()).toEqual(['/contracts/c-1/resume', { method: 'POST' }])

      ok(); await extendContract('c-1', { days: 14, reason: '補償' })
      expect(lastCall()).toEqual(['/contracts/c-1/extend', { method: 'POST', body: { days: 14, reason: '補償' } }])

      expect(mockFetchInstance.apiFetch.mock.calls.some(([path]) => String(path).includes('contract_logs'))).toBe(false)
    })

    it('cancel 把退款一起送到 /cancel（同一 transaction），金額 0 時不送 refund', async () => {
      const { cancelContract } = useContracts()

      ok({ contract: { ...apiContract, status: 'CANCELLED' }, refund: { id: 'p-1' } })
      const result = await cancelContract('c-1', { reason: '搬家', refund: { amount: 1200, paymentMethod: 'CASH' } })
      expect(lastCall()).toEqual(['/contracts/c-1/cancel', {
        method: 'POST',
        body: { reason: '搬家', refund: { amount: 1200, paymentMethod: 'CASH' } }
      }])
      expect(result).toMatchObject({ contract: { status: 'CANCELLED' } })

      ok({ contract: { ...apiContract, status: 'CANCELLED' }, refund: null })
      await cancelContract('c-1', { refund: { amount: 0, paymentMethod: 'CASH' } })
      expect(lastCall()[1]).toEqual({ method: 'POST', body: {} })

      // no separate payment or PATCH call
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(2)
    })

    it('失敗時回傳 null 並顯示後端原因', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('退款金額不可超過已收金額（可退 NT$ 500.00）'))
      const { cancelContract } = useContracts()

      expect(await cancelContract('c-1', { refund: { amount: 900, paymentMethod: 'CASH' } })).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'useContracts.cancelContract',
        customMessage: '退款金額不可超過已收金額（可退 NT$ 500.00）'
      }))
    })
  })

  describe('轉讓 / 續約 / 簽名', () => {
    const ok = (data: unknown) => mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data })

    it('transfer 送到 /transfer；手續費為 0 時不送 fee / paymentMethod', async () => {
      const { transferContract } = useContracts()

      ok({ original: { ...apiContract, status: 'TRANSFERRED' }, contract: { ...apiContract, id: 'c-2', totalAmount: '0.00' }, fee: null })
      const result = await transferContract('c-1', { toMemberId: 'm-2', fee: 300, paymentMethod: 'CASH', reason: '出國' })
      expect(lastCall()).toEqual(['/contracts/c-1/transfer', {
        method: 'POST',
        body: { toMemberId: 'm-2', fee: 300, paymentMethod: 'CASH', reason: '出國' }
      }])
      expect(result?.original.status).toBe('TRANSFERRED')
      expect(result?.contract).toMatchObject({ id: 'c-2', totalAmount: 0 })

      ok({ original: apiContract, contract: apiContract, fee: null })
      await transferContract('c-1', { toMemberId: 'm-2', fee: 0, paymentMethod: 'CASH' })
      expect(lastCall()[1]).toEqual({ method: 'POST', body: { toMemberId: 'm-2' } })
    })

    it('renew POST /renew（無 body），回傳新的草稿合約', async () => {
      const { renewContract } = useContracts()
      ok({ ...apiContract, id: 'c-3', status: 'DRAFT', totalAmount: '4800.00' })

      const result = await renewContract('c-1')

      expect(lastCall()).toEqual(['/contracts/c-1/renew', { method: 'POST' }])
      expect(result).toMatchObject({ id: 'c-3', status: 'DRAFT', totalAmount: 4800 })
    })

    it('sign 把 PNG data URL 送到 /signature', async () => {
      const { signContract } = useContracts()
      ok({ ...apiContract, digitalSignature: 'file-1' })

      const result = await signContract('c-1', 'data:image/png;base64,AAAA')

      expect(lastCall()).toEqual(['/contracts/c-1/signature', { method: 'POST', body: { image: 'data:image/png;base64,AAAA' } }])
      expect(result?.digitalSignature).toBe('file-1')
    })

    it('轉讓被後端拒絕時回傳 null 並顯示原因', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此方案不允許轉讓'))
      const { transferContract } = useContracts()

      expect(await transferContract('c-1', { toMemberId: 'm-2' })).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        context: 'useContracts.transferContract',
        customMessage: '此方案不允許轉讓'
      }))
    })
  })

  describe('getContractStats', () => {
    it('每個狀態各查一次（status + limit=1），取 pagination.total', async () => {
      mockFetchInstance.apiFetch.mockImplementation(async (_path: string, options: { params: { status: string } }) => ({
        success: true,
        data: [],
        pagination: { total: ({ ACTIVE: 12, EXPIRED: 3, DRAFT: 1 } as Record<string, number>)[options.params.status] }
      }))
      const { getContractStats } = useContracts()

      const stats = await getContractStats('b-1', true)

      expect(stats).toEqual({ active: 12, expired: 3, draft: 1 })
      const params = mockFetchInstance.apiFetch.mock.calls.map(([, options]) => options.params)
      expect(params).toEqual([
        { status: 'ACTIVE', branchId: 'b-1', limit: 1 },
        { status: 'EXPIRED', branchId: 'b-1', limit: 1 },
        { status: 'DRAFT', branchId: 'b-1', limit: 1 }
      ])
    })

    it('失敗時回傳 0 且不跳出提示', async () => {
      mockFetchInstance.apiFetch.mockRejectedValue(new Error('boom'))
      const { getContractStats } = useContracts()

      expect(await getContractStats(undefined, true)).toEqual({ active: 0, expired: 0, draft: 0 })
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ showToast: false }))
    })
  })
})
