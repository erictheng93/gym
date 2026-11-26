import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { useLeads, type Lead } from './useLeads'

const mockInvalidateCache = vi.fn()
vi.mock('~/composables/core/useApi', () => ({
  useApi: () => ({ invalidateCache: mockInvalidateCache }),
  CACHE_KEYS: { MEMBERS: 'members' }
}))

// Fixtures in the exact wire format of backend/src/routes/leads.ts: LEAD_SELECT spread flat
// (camelCase, pipeline stage in `status`, decimal budget as a string) plus the joined branch / assignedTo.
const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'l0000000-0000-4000-8000-000000000001',
  status: 'NEW',
  createdAt: '2026-03-01T02:00:00.000Z',
  updatedAt: '2026-03-01T02:00:00.000Z',
  fullName: '張三',
  phone: '0912345678',
  email: 'zhang@example.com',
  source: 'WEBSITE',
  sourceDetail: null,
  branchId: 'b0000000-0000-4000-8000-000000000001',
  assignedToId: 'e0000000-0000-4000-8000-000000000001',
  leadStatus: null,
  notes: null,
  interests: null,
  expectedBudget: '12000.00',
  convertedMemberId: null,
  convertedAt: null,
  branch: { id: 'b0000000-0000-4000-8000-000000000001', name: '信義店' },
  assignedTo: { id: 'e0000000-0000-4000-8000-000000000001', fullName: '王教練' },
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('useLeads', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    mockInvalidateCache.mockClear()
  })

  describe('fetchLeads', () => {
    it('讀取後端的 camelCase 列表與 pagination.total', async () => {
      const rows = [makeLead(), makeLead({ id: 'l0000000-0000-4000-8000-000000000002', fullName: '李四', assignedTo: null })]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: rows,
        pagination: { total: 42, page: 2, limit: 20, totalPages: 3 }
      })

      const { fetchLeads, leads, totalCount } = useLeads()
      await fetchLeads({ page: 2 }, true)

      expect(leads.value).toEqual(rows)
      expect(leads.value[0]!.assignedTo?.fullName).toBe('王教練')
      expect(totalCount.value).toBe(42)
    })

    it('以後端支援的 camelCase 查詢參數送出篩選條件', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchLeads } = useLeads()
      await fetchLeads({
        status: 'TRIAL',
        assignedToId: 'emp-1',
        branchId: 'branch-1',
        search: '張三',
        page: 2,
        limit: 10
      }, true)

      expect(lastCall()[0]).toBe('/leads')
      expect(lastCall()[1].params).toEqual({
        status: 'TRIAL',
        assignedToId: 'emp-1',
        branchId: 'branch-1',
        search: '張三',
        page: 2,
        limit: 10
      })
    })

    it('預設為第 1 頁、每頁 20 筆', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })

      const { fetchLeads } = useLeads()
      await fetchLeads({ search: 'default' }, true)

      expect(lastCall()[1].params).toMatchObject({ page: 1, limit: 20 })
    })

    it('沒有 pagination 時以回傳筆數作為總數', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [makeLead()] })

      const { fetchLeads, totalCount } = useLeads()
      await fetchLeads({ search: 'nopagination' }, true)

      expect(totalCount.value).toBe(1)
    })

    it('取得失敗時清空列表並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchLeads, leads, totalCount, isLoading } = useLeads()
      await fetchLeads({ search: 'fail' }, true)

      expect(isLoading.value).toBe(false)
      expect(leads.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('getLead', () => {
    it('取得含 branch / assignedTo / convertedMember 的單一潛在客戶', async () => {
      const lead = makeLead({
        status: 'CONVERTED',
        convertedMemberId: 'm1',
        convertedMember: { id: 'm1', fullName: '張三', memberCode: 'M000001' }
      })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: lead })

      const { getLead } = useLeads()
      const result = await getLead('lead-get-1', true)

      expect(result).toEqual(lead)
      expect(lastCall()[0]).toBe('/leads/lead-get-1')
    })

    it('取得失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('潛在客戶不存在'))

      const { getLead } = useLeads()
      const result = await getLead('lead-get-2', true)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '潛在客戶不存在'
      }))
    })
  })

  describe('createLead', () => {
    const input = {
      fullName: '王五',
      phone: '0911222333',
      source: 'REFERRAL' as const,
      branchId: 'b0000000-0000-4000-8000-000000000001'
    }

    it('以 createLeadSchema 的 camelCase 欄位 POST 並返回建立的客戶', async () => {
      const created = makeLead({ fullName: '王五' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createLead } = useLeads()
      const result = await createLead(input)

      expect(result).toEqual(created)
      expect(lastCall()).toEqual(['/leads', { method: 'POST', body: input }])
    })

    it('後端拒絕時返回 null，並把後端的錯誤訊息交給 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))

      const { createLead } = useLeads()
      const result = await createLead(input)

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '無效的分店'
      }))
    })

    it('沒有可讀的錯誤訊息時使用預設的失敗訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 500'))

      const { createLead } = useLeads()
      await createLead(input)

      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '建立潛在客戶失敗'
      }))
    })
  })

  describe('updateLead', () => {
    it('以 PATCH 送出 status 並返回更新後的客戶', async () => {
      const updated = makeLead({ status: 'TRIAL' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { updateLead } = useLeads()
      const result = await updateLead('lead-1', { status: 'TRIAL' })

      expect(result).toEqual(updated)
      expect(lastCall()).toEqual(['/leads/lead-1', { method: 'PATCH', body: { status: 'TRIAL' } }])
    })

    it('失敗時返回 null 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('潛在客戶不存在'))

      const { updateLead } = useLeads()
      const result = await updateLead('lead-x', { status: 'LOST' })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('assignLead', () => {
    it('只 PATCH assignedToId，不送出 status', async () => {
      const updated = makeLead({ assignedToId: 'emp-9' })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: updated })

      const { assignLead } = useLeads()
      const result = await assignLead('lead-1', 'emp-9')

      expect(result).toEqual(updated)
      expect(lastCall()).toEqual(['/leads/lead-1', { method: 'PATCH', body: { assignedToId: 'emp-9' } }])
    })

    it('失敗時返回 null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('潛在客戶不存在'))

      const { assignLead } = useLeads()
      expect(await assignLead('lead-x', 'emp-9')).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('deleteLead', () => {
    it('成功時 DELETE 並返回 true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '潛在客戶已刪除' })

      const { deleteLead } = useLeads()
      const result = await deleteLead('lead-1')

      expect(result).toBe(true)
      expect(lastCall()).toEqual(['/leads/lead-1', { method: 'DELETE' }])
    })

    it('失敗時返回 false 並呼叫 handleError', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('潛在客戶不存在'))

      const { deleteLead } = useLeads()
      const result = await deleteLead('lead-x')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '潛在客戶不存在'
      }))
    })
  })

  describe('convertToMember', () => {
    it('POST /leads/:id/convert 並返回 {lead, member}，同時使會員快取失效', async () => {
      const data = {
        lead: makeLead({ status: 'CONVERTED', convertedMemberId: 'm1' }),
        member: { id: 'm1', fullName: '張三', memberCode: 'M000001', phone: '0912345678' }
      }
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data, message: '潛在客戶已成功轉換為會員' })

      const { convertToMember } = useLeads()
      const result = await convertToMember('lead-1')

      expect(result).toEqual(data)
      expect(result!.member.id).toBe('m1')
      expect(lastCall()).toEqual(['/leads/lead-1/convert', { method: 'POST' }])
      expect(mockInvalidateCache).toHaveBeenCalledWith(['members'])
    })

    it('後端拒絕時（例如缺少電話）返回 null 並顯示後端訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('需要電話號碼才能轉換為會員'))

      const { convertToMember } = useLeads()
      const result = await convertToMember('lead-1')

      expect(result).toBeNull()
      expect(mockInvalidateCache).not.toHaveBeenCalled()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
        customMessage: '需要電話號碼才能轉換為會員'
      }))
    })
  })

  describe('fetchStats', () => {
    it('讀取 /leads/stats/summary 的 total / byStatus / conversionRate', async () => {
      const data = { total: 10, byStatus: { NEW: 4, TRIAL: 3, CONVERTED: 3 }, conversionRate: '30.0' }
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data })

      const { fetchStats } = useLeads()
      const result = await fetchStats({ branchId: 'branch-1' }, true)

      expect(result).toEqual(data)
      expect(lastCall()[0]).toBe('/leads/stats/summary')
      expect(lastCall()[1].params).toEqual({ branchId: 'branch-1' })
    })

    it('失敗時返回 null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('Failed'))

      const { fetchStats } = useLeads()
      expect(await fetchStats(undefined, true)).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('標籤 helpers', () => {
    it('getStatusLabel 涵蓋後端的所有階段', () => {
      const { getStatusLabel } = useLeads()
      expect(getStatusLabel('NEW')).toBe('新建')
      expect(getStatusLabel('QUALIFIED')).toBe('有意願')
      expect(getStatusLabel('TRIAL')).toBe('體驗中')
      expect(getStatusLabel('NEGOTIATION')).toBe('洽談中')
      expect(getStatusLabel('CONVERTED')).toBe('已轉換')
      expect(getStatusLabel('LOST')).toBe('已流失')
    })

    it('getStatusVariant 對已轉換為 success、已流失為 default', () => {
      const { getStatusVariant } = useLeads()
      expect(getStatusVariant('CONVERTED')).toBe('success')
      expect(getStatusVariant('LOST')).toBe('default')
    })

    it('getSourceLabel 涵蓋後端的來源，且容許空值', () => {
      const { getSourceLabel } = useLeads()
      expect(getSourceLabel('WALK_IN')).toBe('現場來訪')
      expect(getSourceLabel('SOCIAL_MEDIA')).toBe('社群媒體')
      expect(getSourceLabel(null)).toBe('未填寫')
    })
  })
})
