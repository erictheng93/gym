// -nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useLeads } from './useLeads'
import type { Lead, LeadActivity, LeadAnalytics } from './useLeads'

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useRuntimeConfig
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
    apiUrl: 'http://localhost:8056/api'
  }
}))

// Mock useState
const mockState: Record<string, unknown> = {}
vi.stubGlobal('useState', (key: string, init: () => unknown) => {
  if (!(key in mockState)) {
    mockState[key] = { value: init() }
  }
  return mockState[key]
})

// Mock useErrorHandler
vi.mock('~/composables/core/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn()
  })
}))

// Mock useApi
vi.mock('~/composables/core/useApi', () => ({
  useApi: () => ({
    invalidateCache: vi.fn()
  }),
  CACHE_KEYS: {
    MEMBERS: 'members'
  }
}))

describe('useLeads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset state
    Object.keys(mockState).forEach(key => delete mockState[key])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchLeads', () => {
    it('應該成功取得潛在客戶列表', async () => {
      const mockLeads: Partial<Lead>[] = [
        {
          id: 'lead-1',
          name: '張三',
          phone: '0912345678',
          source: 'FB_AD',
          status: 'NEW'
        },
        {
          id: 'lead-2',
          name: '李四',
          phone: '0923456789',
          source: 'WALK_IN',
          status: 'CONTACTED'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockLeads,
        meta: { total: 2 }
      })

      const { fetchLeads, leads, totalCount } = useLeads()

      await fetchLeads()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(leads.value).toEqual(mockLeads)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchLeads } = useLeads()

      await fetchLeads({
        status: 'NEW',
        source: 'FB_AD',
        assignedTo: 'emp-1',
        branchId: 'branch-1',
        search: '張三',
        page: 2,
        limit: 10
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=NEW')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('source=FB_AD')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('assigned_to=emp-1')
      )
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchLeads, leads, totalCount } = useLeads()

      await fetchLeads()

      expect(leads.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('getLead', () => {
    it('應該成功取得單一潛在客戶', async () => {
      const mockLead: Partial<Lead> = {
        id: 'lead-1',
        name: '張三',
        phone: '0912345678',
        source: 'FB_AD',
        status: 'NEW',
        activities: []
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockLead
      })

      const { getLead } = useLeads()

      const result = await getLead('lead-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1')
      )
      expect(result).toEqual(mockLead)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getLead } = useLeads()

      const result = await getLead('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('createLead', () => {
    it('應該成功建立潛在客戶', async () => {
      const newLead = {
        name: '新客戶',
        phone: '0912345678',
        source: 'WEBSITE' as const,
        branch_id: 'branch-1'
      }

      const createdLead: Partial<Lead> = {
        id: 'lead-new',
        ...newLead,
        status: 'NEW'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdLead
      })

      const { createLead } = useLeads()

      const result = await createLead(newLead)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads'),
        expect.objectContaining({
          method: 'POST',
          body: newLead
        })
      )
      expect(result).toEqual(createdLead)
    })

    it('應該處理建立失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Validation failed'))

      const { createLead } = useLeads()

      const result = await createLead({ name: '' })

      expect(result).toBeNull()
    })
  })

  describe('updateLead', () => {
    it('應該成功更新潛在客戶', async () => {
      const updateData = {
        status: 'CONTACTED' as const,
        notes: '已聯繫'
      }

      const updatedLead: Partial<Lead> = {
        id: 'lead-1',
        ...updateData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedLead
      })

      const { updateLead } = useLeads()

      const result = await updateLead('lead-1', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: updateData
        })
      )
      expect(result?.status).toBe('CONTACTED')
    })
  })

  describe('deleteLead', () => {
    it('應該成功刪除潛在客戶', async () => {
      mockFetch.mockResolvedValueOnce({ success: true })

      const { deleteLead } = useLeads()

      const result = await deleteLead('lead-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(result).toBe(true)
    })

    it('應該處理刪除失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'))

      const { deleteLead } = useLeads()

      const result = await deleteLead('lead-1')

      expect(result).toBe(false)
    })
  })

  describe('addActivity', () => {
    it('應該成功新增跟進紀錄', async () => {
      const activityData = {
        activity_type: 'CALL',
        content: '電話聯繫客戶',
        result: '有興趣',
        next_action: '安排體驗',
        next_action_date: '2025-02-15'
      }

      const createdActivity: Partial<LeadActivity> = {
        id: 'activity-1',
        lead_id: 'lead-1',
        ...activityData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdActivity
      })

      const { addActivity } = useLeads()

      const result = await addActivity('lead-1', activityData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1/activities'),
        expect.objectContaining({
          method: 'POST',
          body: activityData
        })
      )
      expect(result?.id).toBe('activity-1')
    })
  })

  describe('convertToMember', () => {
    it('應該成功轉換為會員', async () => {
      const convertResult = {
        lead: { id: 'lead-1', status: 'CONVERTED' },
        member: { id: 'member-1', name: '張三' },
        is_new_member: true
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: convertResult
      })

      const { convertToMember } = useLeads()

      const result = await convertToMember('lead-1', 'emp-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1/convert'),
        expect.objectContaining({
          method: 'POST',
          body: { converted_by: 'emp-1' }
        })
      )
      expect(result?.is_new_member).toBe(true)
    })

    it('應該處理轉換失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Convert failed'))

      const { convertToMember } = useLeads()

      const result = await convertToMember('lead-1')

      expect(result).toBeNull()
    })
  })

  describe('assignLead', () => {
    it('應該成功指派潛在客戶', async () => {
      const assignedLead: Partial<Lead> = {
        id: 'lead-1',
        assigned_to: 'emp-2'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: assignedLead
      })

      const { assignLead } = useLeads()

      const result = await assignLead('lead-1', 'emp-2', 'emp-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/lead-1/assign'),
        expect.objectContaining({
          method: 'POST',
          body: { assigned_to: 'emp-2', assigned_by: 'emp-1' }
        })
      )
      expect(result?.assigned_to).toBe('emp-2')
    })
  })

  describe('fetchAnalytics', () => {
    it('應該成功取得分析資料', async () => {
      const mockAnalytics: LeadAnalytics = {
        by_source: [
          { source: 'FB_AD', total: 50, converted: 10, conversion_rate: 20 }
        ],
        by_status: [
          { status: 'NEW', count: 30 }
        ],
        average_conversion_days: 7,
        top_performers: [
          { id: 'emp-1', full_name: '張三', total_leads: 20, converted: 5, conversion_rate: 25 }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockAnalytics
      })

      const { fetchAnalytics } = useLeads()

      const result = await fetchAnalytics({
        branchId: 'branch-1',
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/leads/analytics')
      )
      expect(result?.average_conversion_days).toBe(7)
    })
  })

  describe('Helper functions', () => {
    it('getStatusLabel 應該返回正確的標籤', () => {
      const { getStatusLabel } = useLeads()

      expect(getStatusLabel('NEW')).toBe('新建')
      expect(getStatusLabel('CONTACTED')).toBe('已聯繫')
      expect(getStatusLabel('TRIAL_BOOKED')).toBe('已預約體驗')
      expect(getStatusLabel('VISITED')).toBe('已到訪')
      expect(getStatusLabel('CONVERTED')).toBe('已轉換')
      expect(getStatusLabel('LOST')).toBe('已流失')
    })

    it('getStatusColor 應該返回正確的顏色', () => {
      const { getStatusColor } = useLeads()

      expect(getStatusColor('NEW')).toContain('blue')
      expect(getStatusColor('CONTACTED')).toContain('yellow')
      expect(getStatusColor('CONVERTED')).toContain('emerald')
      expect(getStatusColor('LOST')).toContain('gray')
    })

    it('getSourceLabel 應該返回正確的標籤', () => {
      const { getSourceLabel } = useLeads()

      expect(getSourceLabel('FB_AD')).toBe('Facebook 廣告')
      expect(getSourceLabel('IG_AD')).toBe('Instagram 廣告')
      expect(getSourceLabel('GOOGLE_AD')).toBe('Google 廣告')
      expect(getSourceLabel('WEBSITE')).toBe('官網')
      expect(getSourceLabel('WALK_IN')).toBe('現場來訪')
      expect(getSourceLabel('REFERRAL')).toBe('轉介紹')
    })

    it('getActivityTypeLabel 應該返回正確的標籤', () => {
      const { getActivityTypeLabel } = useLeads()

      expect(getActivityTypeLabel('CALL')).toBe('電話')
      expect(getActivityTypeLabel('SMS')).toBe('簡訊')
      expect(getActivityTypeLabel('EMAIL')).toBe('郵件')
      expect(getActivityTypeLabel('VISIT')).toBe('到訪')
      expect(getActivityTypeLabel('TRIAL')).toBe('體驗')
    })
  })
})
