/**
 * useReports Composable Unit Tests
 * 測試報表 API 呼叫功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useReports } from './useReports'

// ============================================
// Mock Setup
// ============================================

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock useRuntimeConfig
const mockRuntimeConfig = {
  public: {
    apiBaseUrl: 'http://localhost:8056',
    apiUrl: 'http://localhost:8056/api'
  }
}
vi.stubGlobal('useRuntimeConfig', () => mockRuntimeConfig)

// Mock MESSAGES constant
vi.mock('~/constants', () => ({
  MESSAGES: {
    ERRORS: {
      REPORT_FETCH_FAILED: '載入報表失敗'
    }
  }
}))

// ============================================
// Test Utilities
// ============================================

function createMockResponse<T>(data: T, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data)
  }
}

const mockRevenueReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_income: 100000,
    total_refund: 5000,
    net_revenue: 95000,
    total_transactions: 50,
    average_daily_revenue: '3166.67'
  },
  data: [
    {
      payment_day: '2024-01-15',
      branch_id: 'branch-1',
      branch_name: '台北總店',
      transaction_count: '10',
      total_income: '50000',
      total_refund: '1000',
      net_revenue: '49000'
    }
  ]
}

const mockMemberGrowthReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_new_members: 20,
    total_members: 500,
    average_daily_growth: '0.65',
    gender_distribution: { male: 12, female: 8 }
  },
  data: []
}

const mockContractExpiryReport = {
  success: true,
  summary: {
    total_expiring: 10,
    urgent_count: 2,
    soon_count: 5,
    upcoming_count: 3
  },
  grouped: {
    urgent: [],
    soon: [],
    upcoming: []
  },
  data: []
}

const mockMemberActivityReport = {
  success: true,
  period: { start_date: '2024-01-01', end_date: '2024-01-31' },
  summary: {
    total_check_ins: 1000,
    average_daily_check_ins: '32.26',
    method_distribution: { qr_code: 600, manual: 300, card: 100 }
  },
  data: []
}

// ============================================
// Tests
// ============================================

describe('useReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue('test-token-123')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // 認證令牌測試
  // ============================================
  describe('Authentication Token', () => {
    it('應該在請求中包含 Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      )
    })

    it('應該使用 credentials: include 發送請求', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport()

      const callArgs = mockFetch.mock.calls[0][1]
      expect(callArgs.credentials).toBe('include')
    })

    it('應該為所有報表 API 都使用 session cookies 認證', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }))

      const reports = useReports()

      await reports.getRevenueReport()
      await reports.getMemberGrowthReport()
      await reports.getContractExpiryReport()
      await reports.getMemberActivityReport()
      await reports.refreshReports()

      expect(mockFetch).toHaveBeenCalledTimes(5)

      // 檢查每個請求都有 credentials: include
      mockFetch.mock.calls.forEach(call => {
        expect(call[1].credentials).toBe('include')
      })
    })
  })

  // ============================================
  // getRevenueReport 測試
  // ============================================
  describe('getRevenueReport', () => {
    it('應該成功獲取營收報表', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport('2024-01-01', '2024-01-31')

      expect(result).toEqual(mockRevenueReport)
      expect(result?.success).toBe(true)
      expect(result?.summary.total_income).toBe(100000)
    })

    it('應該正確構建查詢參數', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport('2024-01-01', '2024-01-31', 'branch-uuid-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('start_date=2024-01-01')
      expect(calledUrl).toContain('end_date=2024-01-31')
      expect(calledUrl).toContain('branch_id=branch-uuid-1')
    })

    it('應該在沒有參數時正確處理', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/reports/revenue?')
    })

    it('應該處理 API 錯誤並返回 null', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })

    it('應該處理網路錯誤', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })
  })

  // ============================================
  // getMemberGrowthReport 測試
  // ============================================
  describe('getMemberGrowthReport', () => {
    it('應該成功獲取會員成長報表', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberGrowthReport))

      const { getMemberGrowthReport } = useReports()
      const result = await getMemberGrowthReport('2024-01-01', '2024-01-31')

      expect(result).toEqual(mockMemberGrowthReport)
      expect(result?.summary.total_new_members).toBe(20)
      expect(result?.summary.gender_distribution).toEqual({ male: 12, female: 8 })
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberGrowthReport))

      const { getMemberGrowthReport } = useReports()
      await getMemberGrowthReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/reports/member-growth')
    })

    it('應該支持分店篩選', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberGrowthReport))

      const { getMemberGrowthReport } = useReports()
      await getMemberGrowthReport(undefined, undefined, 'branch-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('branch_id=branch-1')
    })
  })

  // ============================================
  // getContractExpiryReport 測試
  // ============================================
  describe('getContractExpiryReport', () => {
    it('應該成功獲取合約到期報表', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      const { getContractExpiryReport } = useReports()
      const result = await getContractExpiryReport(30)

      expect(result).toEqual(mockContractExpiryReport)
      expect(result?.summary.total_expiring).toBe(10)
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      const { getContractExpiryReport } = useReports()
      await getContractExpiryReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/reports/contract-expiry')
    })

    it('應該支持自定義 days_ahead 和 limit', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      const { getContractExpiryReport } = useReports()
      await getContractExpiryReport(60, 'branch-1', 50)

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('days_ahead=60')
      expect(calledUrl).toContain('limit=50')
      expect(calledUrl).toContain('branch_id=branch-1')
    })

    it('應該使用預設值', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractExpiryReport))

      const { getContractExpiryReport } = useReports()
      await getContractExpiryReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('days_ahead=30')
      expect(calledUrl).toContain('limit=100')
    })
  })

  // ============================================
  // getMemberActivityReport 測試
  // ============================================
  describe('getMemberActivityReport', () => {
    it('應該成功獲取會員活躍度報表', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberActivityReport))

      const { getMemberActivityReport } = useReports()
      const result = await getMemberActivityReport('2024-01-01', '2024-01-31')

      expect(result).toEqual(mockMemberActivityReport)
      expect(result?.summary.total_check_ins).toBe(1000)
      expect(result?.summary.method_distribution).toEqual({
        qr_code: 600,
        manual: 300,
        card: 100
      })
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMemberActivityReport))

      const { getMemberActivityReport } = useReports()
      await getMemberActivityReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/reports/member-activity')
    })
  })

  // ============================================
  // refreshReports 測試
  // ============================================
  describe('refreshReports', () => {
    it('應該成功刷新報表', async () => {
      const mockResponse = {
        success: true,
        message: '報表資料已更新',
        refreshed_at: '2024-01-15T10:00:00.000Z',
        cache_cleared: true
      }
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const { refreshReports } = useReports()
      const result = await refreshReports()

      expect(result.success).toBe(true)
      expect(result.message).toBe('報表資料已更新')
    })

    it('應該使用 POST 方法', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, message: 'ok' }))

      const { refreshReports } = useReports()
      await refreshReports()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, message: 'ok' }))

      const { refreshReports } = useReports()
      await refreshReports()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/reports/refresh')
    })

    it('應該在失敗時返回錯誤訊息', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      const { refreshReports } = useReports()
      const result = await refreshReports()

      expect(result.success).toBe(false)
      expect(result.message).toBe('刷新報表失敗')
    })

    it('應該處理網路錯誤', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { refreshReports } = useReports()
      const result = await refreshReports()

      expect(result.success).toBe(false)
      expect(result.message).toBe('刷新報表失敗')
    })
  })

  // ============================================
  // URL 構建測試
  // ============================================
  describe('URL Construction', () => {
    it('應該使用 runtimeConfig 中的 apiBaseUrl', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('http://localhost:8056')
    })

    it('應該正確編碼查詢參數', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport('2024-01-01', '2024-01-31')

      const calledUrl = mockFetch.mock.calls[0][0]
      // URLSearchParams 會自動編碼
      expect(calledUrl).toMatch(/start_date=2024-01-01/)
      expect(calledUrl).toMatch(/end_date=2024-01-31/)
    })
  })

  // ============================================
  // 錯誤處理測試
  // ============================================
  describe('Error Handling', () => {
    it('應該處理 401 未授權錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 401))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })

    it('應該處理 403 權限不足錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })

    it('應該處理 500 伺服器錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })

    it('應該處理 JSON 解析錯誤', async () => {
      // 模擬 response.json() 拋出異常的情況
      const mockJsonFn = vi.fn().mockImplementation(() => {
        throw new Error('Invalid JSON')
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mockJsonFn
      })

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })

    it('應該處理超時錯誤', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'))

      const { getRevenueReport } = useReports()
      const result = await getRevenueReport()

      expect(result).toBeNull()
    })
  })

  // ============================================
  // Headers 測試
  // ============================================
  describe('Request Headers', () => {
    it('應該包含 Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueReport))

      const { getRevenueReport } = useReports()
      await getRevenueReport()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('POST 請求應該包含正確的 headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, message: 'ok' }))

      const { refreshReports } = useReports()
      await refreshReports()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-123'
          })
        })
      )
    })
  })
})
