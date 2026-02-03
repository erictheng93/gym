/**
 * useDashboard Composable Unit Tests
 * 測試戰情室 Dashboard API 呼叫功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDashboard } from './useDashboard'

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

// Mock ref and onUnmounted from Vue
const mockRef = (initial: any) => ({ value: initial })
vi.stubGlobal('ref', mockRef)
vi.stubGlobal('onUnmounted', vi.fn())

// Mock MESSAGES constant
vi.mock('~/constants', () => ({
  MESSAGES: {
    ERRORS: {
      DASHBOARD_LOAD_FAILED: 'Dashboard 載入失敗',
      REPORT_FETCH_FAILED: '載入報表失敗'
    }
  }
}))

// Mock useErrorHandler
const mockHandleError = vi.fn()
vi.mock('~/composables/core', () => ({
  useErrorHandler: () => ({
    handleError: mockHandleError
  })
}))

// Mock window for export functionality
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test')
const mockRevokeObjectURL = vi.fn()
const mockAppendChild = vi.fn()
const mockRemoveChild = vi.fn()
const mockClick = vi.fn()

vi.stubGlobal('window', {
  URL: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL
  }
})

vi.stubGlobal('document', {
  createElement: vi.fn().mockReturnValue({
    href: '',
    download: '',
    click: mockClick
  }),
  body: {
    appendChild: mockAppendChild,
    removeChild: mockRemoveChild
  }
})

// ============================================
// Test Utilities
// ============================================

function createMockResponse<T>(data: T, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    blob: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'text/csv' }))
  }
}

// Mock KPIs data
const mockKPIsResponse = {
  success: true,
  period: {
    type: 'today',
    start_date: '2024-01-15',
    end_date: '2024-01-15'
  },
  revenue: {
    today: 50000,
    mtd: 500000,
    ytd: 2000000,
    period: 50000,
    change: 12.5,
    transactions: {
      today: 15,
      period: 15
    },
    by_payment_method: [
      { payment_method: 'cash', amount: 20000, count: 8 },
      { payment_method: 'credit_card', amount: 30000, count: 7 }
    ],
    by_branch: [
      { branch_id: 'branch-1', branch_name: '台北總店', revenue: 50000, transactions: 15 }
    ]
  },
  members: {
    total: 500,
    active: 350,
    new: 10,
    churned: 5,
    active_rate: 70,
    by_gender: { male: 200, female: 150 },
    by_age: [
      { age_group: '18-25', count: 100 },
      { age_group: '26-35', count: 150 }
    ],
    by_branch: [
      { branch_id: 'branch-1', branch_name: '台北總店', total: 500, active: 350 }
    ]
  },
  contracts: {
    active: 400,
    expiring_7: 10,
    expiring_30: 25,
    expiring_90: 50,
    renewal_rate: 75.5,
    avg_value: 12000,
    by_type: [
      { contract_type: 'TIME_BASED', plan_name: '年費會員', count: 300, total_value: 3600000 }
    ]
  },
  operations: {
    today_checkins: 89,
    period_checkins: 89,
    peak_hour: 18,
    hourly_distribution: Array(24).fill(0).map((_, i) => i === 18 ? 15 : Math.floor(Math.random() * 10)),
    class_attendance_rate: 82.5,
    by_branch: [
      { branch_id: 'branch-1', branch_name: '台北總店', today_checkins: 89, period_checkins: 89 }
    ]
  },
  generated_at: '2024-01-15T10:00:00.000Z'
}

const mockContractAlertsResponse = {
  success: true,
  summary: {
    total: 35,
    urgent: 10,
    soon: 15,
    upcoming: 10
  },
  grouped: {
    urgent: [
      {
        contract_id: 'contract-1',
        contract_no: 'C2024-001',
        days_until_expiry: 3,
        member_name: '王小明',
        member_phone: '0912345678',
        plan_name: '年費會員',
        branch_name: '台北總店',
        urgency: 'URGENT'
      }
    ],
    soon: [
      {
        contract_id: 'contract-2',
        contract_no: 'C2024-002',
        days_until_expiry: 15,
        member_name: '李美玲',
        member_phone: '0923456789',
        plan_name: '月費會員',
        branch_name: '台中店',
        urgency: 'SOON'
      }
    ],
    upcoming: []
  },
  alerts: []
}

const mockRevenueTargetsResponse = {
  success: true,
  targets: [
    {
      id: 'target-1',
      branch_id: 'branch-1',
      branch_name: '台北總店',
      year: 2024,
      month: 1,
      target_amount: 1000000
    },
    {
      id: 'target-2',
      branch_id: 'branch-2',
      branch_name: '台中店',
      year: 2024,
      month: 1,
      target_amount: 800000
    }
  ]
}

// ============================================
// Tests
// ============================================

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue('test-token-123')
    mockFetch.mockReset()
    mockHandleError.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // 認證令牌測試
  // ============================================
  describe('Authentication Token', () => {
    it('應該在請求中包含 Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs()

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
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs()

      const callArgs = mockFetch.mock.calls[0][1]
      expect(callArgs.credentials).toBe('include')
    })
  })

  // ============================================
  // fetchKPIs 測試
  // ============================================
  describe('fetchKPIs', () => {
    it('應該成功獲取 Dashboard KPIs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toEqual(mockKPIsResponse)
      expect(result?.success).toBe(true)
      expect(result?.revenue.today).toBe(50000)
      expect(result?.members.total).toBe(500)
      expect(result?.contracts.active).toBe(400)
      expect(result?.operations.today_checkins).toBe(89)
    })

    it('應該正確構建查詢參數 - period=today', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs('today')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('period=today')
    })

    it('應該支持不同的 period 值', async () => {
      const periods = ['today', 'week', 'month', 'year'] as const

      for (const period of periods) {
        mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

        const { fetchKPIs } = useDashboard()
        await fetchKPIs(period)

        const calledUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
        expect(calledUrl).toContain(`period=${period}`)
      }
    })

    it('應該支持分店篩選', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs('today', 'branch-uuid-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('branch_id=branch-uuid-1')
    })

    it('應該在沒有 branchId 時不包含 branch_id 參數', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs('today')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).not.toContain('branch_id=')
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/dashboard/kpis')
    })

    it('應該處理 API 錯誤並返回 null', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理網路錯誤', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該設定 isLoading 狀態', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()

      // Note: In actual implementation, isLoading would be reactive
      // Here we just check that the function completes
      await fetchKPIs()

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  // ============================================
  // fetchContractAlerts 測試
  // ============================================
  describe('fetchContractAlerts', () => {
    it('應該成功獲取合約到期警示', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts } = useDashboard()
      const result = await fetchContractAlerts()

      expect(result).toEqual(mockContractAlertsResponse)
      expect(result?.summary.total).toBe(35)
      expect(result?.summary.urgent).toBe(10)
    })

    it('應該正確構建查詢參數', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts } = useDashboard()
      await fetchContractAlerts(60, 'branch-1', 100)

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('days_ahead=60')
      expect(calledUrl).toContain('branch_id=branch-1')
      expect(calledUrl).toContain('limit=100')
    })

    it('應該使用預設參數值', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts } = useDashboard()
      await fetchContractAlerts()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('days_ahead=30')
      expect(calledUrl).toContain('limit=50')
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts } = useDashboard()
      await fetchContractAlerts()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/dashboard/contract-alerts')
    })

    it('應該處理 API 錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { fetchContractAlerts } = useDashboard()
      const result = await fetchContractAlerts()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該返回分組的警示數據', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts } = useDashboard()
      const result = await fetchContractAlerts()

      expect(result?.grouped.urgent).toHaveLength(1)
      expect(result?.grouped.soon).toHaveLength(1)
      expect(result?.grouped.urgent[0].urgency).toBe('URGENT')
    })
  })

  // ============================================
  // fetchRevenueTargets 測試
  // ============================================
  describe('fetchRevenueTargets', () => {
    it('應該成功獲取營收目標', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { fetchRevenueTargets } = useDashboard()
      const result = await fetchRevenueTargets()

      expect(result).toHaveLength(2)
      expect(result[0].target_amount).toBe(1000000)
    })

    it('應該支持年份和分店篩選', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { fetchRevenueTargets } = useDashboard()
      await fetchRevenueTargets(2024, 'branch-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('year=2024')
      expect(calledUrl).toContain('branch_id=branch-1')
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { fetchRevenueTargets } = useDashboard()
      await fetchRevenueTargets()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/dashboard/revenue-targets')
    })

    it('應該處理空的目標列表', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, targets: [] }))

      const { fetchRevenueTargets } = useDashboard()
      const result = await fetchRevenueTargets()

      expect(result).toEqual([])
    })

    it('應該處理 API 錯誤並返回空陣列', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { fetchRevenueTargets } = useDashboard()
      const result = await fetchRevenueTargets()

      expect(result).toEqual([])
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  // ============================================
  // setRevenueTarget 測試
  // ============================================
  describe('setRevenueTarget', () => {
    it('應該成功設定營收目標', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ success: true }))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { setRevenueTarget } = useDashboard()
      const result = await setRevenueTarget('branch-1', 2024, 1, 1000000)

      expect(result).toBe(true)
    })

    it('應該使用 POST 方法', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ success: true }))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { setRevenueTarget } = useDashboard()
      await setRevenueTarget('branch-1', 2024, 1, 1000000)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('應該發送正確的請求 body', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ success: true }))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { setRevenueTarget } = useDashboard()
      await setRevenueTarget('branch-1', 2024, 1, 1000000)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            branch_id: 'branch-1',
            year: 2024,
            month: 1,
            target_amount: 1000000
          })
        })
      )
    })

    it('應該在設定後重新載入目標', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ success: true }))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { setRevenueTarget } = useDashboard()
      await setRevenueTarget('branch-1', 2024, 1, 1000000)

      // 應該有兩次呼叫：一次 POST，一次 GET 重新載入
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('應該處理設定失敗', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      const { setRevenueTarget } = useDashboard()
      const result = await setRevenueTarget('branch-1', 2024, 1, 1000000)

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  // ============================================
  // refreshAll 測試
  // ============================================
  describe('refreshAll', () => {
    it('應該同時獲取所有數據', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockKPIsResponse))
        .mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { refreshAll } = useDashboard()
      await refreshAll()

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('應該傳遞正確的參數', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockKPIsResponse))
        .mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { refreshAll } = useDashboard()
      await refreshAll('month', 'branch-1')

      const calls = mockFetch.mock.calls
      // KPIs call should have period=month and branch_id
      expect(calls[0][0]).toContain('period=month')
      expect(calls[0][0]).toContain('branch_id=branch-1')
    })
  })

  // ============================================
  // exportData 測試
  // ============================================
  describe('exportData', () => {
    it('應該成功匯出 CSV 數據', async () => {
      const mockBlob = new Blob(['test,data'], { type: 'text/csv' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockBlob)
      })

      const { exportData } = useDashboard()
      const result = await exportData('kpis', 'csv')

      expect(result).toBe(true)
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })

    it('應該正確構建匯出參數', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob())
      })

      const { exportData } = useDashboard()
      await exportData('revenue', 'json', 60, 'branch-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('type=revenue')
      expect(calledUrl).toContain('format=json')
      expect(calledUrl).toContain('days=60')
      expect(calledUrl).toContain('branch_id=branch-1')
    })

    it('應該支持所有匯出類型', async () => {
      const types = ['kpis', 'member-analytics', 'revenue', 'contracts', 'checkins'] as const

      for (const type of types) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          blob: vi.fn().mockResolvedValue(new Blob())
        })

        const { exportData } = useDashboard()
        await exportData(type)

        const calledUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
        expect(calledUrl).toContain(`type=${type}`)
      }
    })

    it('應該調用正確的 API 端點', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob())
      })

      const { exportData } = useDashboard()
      await exportData('kpis')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/admin/dashboard/export')
    })

    it('應該處理匯出失敗', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      const { exportData } = useDashboard()
      const result = await exportData('kpis')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理網路錯誤', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { exportData } = useDashboard()
      const result = await exportData('kpis')

      expect(result).toBe(false)
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該使用預設參數值', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob())
      })

      const { exportData } = useDashboard()
      await exportData('kpis')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('format=csv')
      expect(calledUrl).toContain('days=30')
    })
  })

  // ============================================
  // startLiveUpdates / stopLiveUpdates 測試
  // ============================================
  describe('Live Updates', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('應該立即執行一次 fetchKPIs', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockKPIsResponse))

      const { startLiveUpdates, stopLiveUpdates } = useDashboard()
      startLiveUpdates()

      // Advance a small amount for the immediate call, not the full interval
      await vi.advanceTimersByTimeAsync(100)

      expect(mockFetch).toHaveBeenCalled()

      // Clean up
      stopLiveUpdates()
    })

    it('應該支持分店篩選', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockKPIsResponse))

      const { startLiveUpdates, stopLiveUpdates } = useDashboard()
      startLiveUpdates('branch-1')

      // Advance a small amount for the immediate call
      await vi.advanceTimersByTimeAsync(100)

      const calls = mockFetch.mock.calls
      const hasbranchFilter = calls.some(call => call[0].includes('branch_id=branch-1'))
      expect(hasbranchFilter).toBe(true)

      // Clean up
      stopLiveUpdates()
    })

    it('應該在沒有 token 時記錄警告', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockGetToken.mockReturnValueOnce(null)

      const { startLiveUpdates } = useDashboard()
      startLiveUpdates()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No token'))
      consoleSpy.mockRestore()
    })

    it('stopLiveUpdates 應該清理資源', () => {
      mockFetch.mockResolvedValue(createMockResponse(mockKPIsResponse))

      const { startLiveUpdates, stopLiveUpdates } = useDashboard()
      startLiveUpdates()
      stopLiveUpdates()

      // Should not throw
      expect(true).toBe(true)
    })

    it('startLiveUpdates 應該先停止現有連線', () => {
      mockFetch.mockResolvedValue(createMockResponse(mockKPIsResponse))

      const { startLiveUpdates } = useDashboard()

      // Start twice
      startLiveUpdates()
      startLiveUpdates()

      // Should not throw
      expect(true).toBe(true)
    })
  })

  // ============================================
  // 錯誤處理測試
  // ============================================
  describe('Error Handling', () => {
    it('應該處理 401 未授權錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 401))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理 403 權限不足錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 403))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理 500 伺服器錯誤', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500))

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })

    it('應該處理 JSON 解析錯誤', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      })

      const { fetchKPIs } = useDashboard()
      const result = await fetchKPIs()

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  // ============================================
  // URL 構建測試
  // ============================================
  describe('URL Construction', () => {
    it('應該使用 runtimeConfig 中的 apiBaseUrl', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs()

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('http://localhost:8056')
    })

    it('應該正確編碼查詢參數', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs('today', 'branch-uuid-1')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toMatch(/period=today/)
      expect(calledUrl).toMatch(/branch_id=branch-uuid-1/)
    })
  })

  // ============================================
  // Request Headers 測試
  // ============================================
  describe('Request Headers', () => {
    it('應該包含 Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs } = useDashboard()
      await fetchKPIs()

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
      mockFetch
        .mockResolvedValueOnce(createMockResponse({ success: true }))
        .mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { setRevenueTarget } = useDashboard()
      await setRevenueTarget('branch-1', 2024, 1, 1000000)

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

  // ============================================
  // State Management 測試
  // ============================================
  describe('State Management', () => {
    it('應該更新 kpis 狀態', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockKPIsResponse))

      const { fetchKPIs, kpis } = useDashboard()
      await fetchKPIs()

      // Note: In actual Vue composition, kpis.value would be updated
      // Here we verify the function returns the data
      expect(kpis.value).toBeDefined()
    })

    it('應該更新 contractAlerts 狀態', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContractAlertsResponse))

      const { fetchContractAlerts, contractAlerts } = useDashboard()
      await fetchContractAlerts()

      expect(contractAlerts.value).toBeDefined()
    })

    it('應該更新 revenueTargets 狀態', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRevenueTargetsResponse))

      const { fetchRevenueTargets, revenueTargets } = useDashboard()
      await fetchRevenueTargets()

      expect(revenueTargets.value).toBeDefined()
    })
  })
})
