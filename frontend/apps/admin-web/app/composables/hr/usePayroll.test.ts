import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePayroll } from './usePayroll'
import type { SalaryRecord, PromotionRecord } from './usePayroll'

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

describe('usePayroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchSalaryRecords', () => {
    it('應該成功取得薪資紀錄列表', async () => {
      const mockRecords: Partial<SalaryRecord>[] = [
        {
          id: 'salary-1',
          employee_id: 'emp-1',
          period: '2025-01',
          base_salary: 45000,
          net_salary: 42000,
          status: 'PENDING'
        },
        {
          id: 'salary-2',
          employee_id: 'emp-2',
          period: '2025-01',
          base_salary: 55000,
          net_salary: 52000,
          status: 'APPROVED'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockRecords,
        meta: { total: 2 }
      })

      const { fetchSalaryRecords, salaryRecords, totalCount } = usePayroll()

      await fetchSalaryRecords()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(salaryRecords.value).toEqual(mockRecords)
      expect(totalCount.value).toBe(2)
    })

    it('應該支援篩選參數', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchSalaryRecords } = usePayroll()

      await fetchSalaryRecords({
        period: '2025-01',
        status: 'PENDING',
        branch_id: 'branch-1',
        page: 2,
        limit: 10
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('period=2025-01')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=PENDING')
      )
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { fetchSalaryRecords, salaryRecords, totalCount } = usePayroll()

      await fetchSalaryRecords()

      expect(salaryRecords.value).toEqual([])
      expect(totalCount.value).toBe(0)
    })
  })

  describe('fetchSalaryRecord', () => {
    it('應該成功取得單一薪資紀錄', async () => {
      const mockRecord: Partial<SalaryRecord> = {
        id: 'salary-1',
        employee_id: 'emp-1',
        period: '2025-01',
        base_salary: 45000,
        overtime_hours: 10,
        overtime_pay: 2812,
        bonus: 5000,
        deductions: 1000,
        net_salary: 51812,
        status: 'PENDING'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockRecord
      })

      const { fetchSalaryRecord, currentSalaryRecord } = usePayroll()

      await fetchSalaryRecord('salary-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/salary-records/salary-1')
      )
      expect(currentSalaryRecord.value).toEqual(mockRecord)
    })

    it('應該處理取得失敗的情況', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { fetchSalaryRecord, currentSalaryRecord } = usePayroll()

      await fetchSalaryRecord('non-existent')

      expect(currentSalaryRecord.value).toBeNull()
    })
  })

  describe('generateSalaryRecords', () => {
    it('應該成功產生薪資紀錄', async () => {
      const generateData = {
        period: '2025-02'
      }

      const generatedResult = {
        generated: 5,
        records: [
          { id: 'salary-1', period: '2025-02' }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: generatedResult
      })

      const { generateSalaryRecords } = usePayroll()

      const result = await generateSalaryRecords(generateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/generate'),
        expect.objectContaining({
          method: 'POST',
          body: generateData
        })
      )
      expect(result.generated).toBe(5)
    })

    it('應該在產生失敗時拋出錯誤', async () => {
      mockFetch.mockResolvedValueOnce({
        success: false,
        error: 'Generation failed'
      })

      const { generateSalaryRecords } = usePayroll()

      await expect(generateSalaryRecords({ period: '2025-02' }))
        .rejects.toThrow('產生薪資紀錄失敗')
    })
  })

  describe('updateSalaryRecord', () => {
    it('應該成功更新薪資紀錄', async () => {
      const updateData = {
        bonus: 8000,
        deductions: 500,
        notes: '績效獎金調整'
      }

      const updatedRecord: Partial<SalaryRecord> = {
        id: 'salary-1',
        ...updateData,
        net_salary: 52500
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: updatedRecord
      })

      const { updateSalaryRecord } = usePayroll()

      const result = await updateSalaryRecord('salary-1', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/salary-records/salary-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: updateData
        })
      )
      expect(result.bonus).toBe(8000)
    })
  })

  describe('approveSalary', () => {
    it('應該成功核准薪資', async () => {
      const approvedRecord: Partial<SalaryRecord> = {
        id: 'salary-1',
        status: 'APPROVED'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: approvedRecord
      })

      const { approveSalary } = usePayroll()

      const result = await approveSalary('salary-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/salary-records/salary-1/approve'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.status).toBe('APPROVED')
    })
  })

  describe('batchApproveSalary', () => {
    it('應該成功批次核准薪資', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { approved_count: 3 }
      })

      const { batchApproveSalary } = usePayroll()

      const result = await batchApproveSalary(['salary-1', 'salary-2', 'salary-3'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/batch-approve'),
        expect.objectContaining({
          method: 'POST',
          body: { ids: ['salary-1', 'salary-2', 'salary-3'] }
        })
      )
      expect(result.approved_count).toBe(3)
    })
  })

  describe('markAsPaid', () => {
    it('應該成功標記已發放', async () => {
      const paidRecord: Partial<SalaryRecord> = {
        id: 'salary-1',
        status: 'PAID'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: paidRecord
      })

      const { markAsPaid } = usePayroll()

      const result = await markAsPaid('salary-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/salary-records/salary-1/pay'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.status).toBe('PAID')
    })
  })

  describe('fetchPromotions', () => {
    it('應該成功取得異動紀錄列表', async () => {
      const mockPromotions: Partial<PromotionRecord>[] = [
        {
          id: 'promo-1',
          employee_id: 'emp-1',
          type: 'PROMOTION',
          effective_date: '2025-02-01'
        },
        {
          id: 'promo-2',
          employee_id: 'emp-2',
          type: 'TRANSFER',
          effective_date: '2025-02-01'
        }
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockPromotions,
        meta: { total: 2 }
      })

      const { fetchPromotions, promotions, promotionCount } = usePayroll()

      await fetchPromotions()

      expect(promotions.value).toEqual(mockPromotions)
      expect(promotionCount.value).toBe(2)
    })

    it('應該支援類型篩選', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0 }
      })

      const { fetchPromotions } = usePayroll()

      await fetchPromotions({ type: 'PROMOTION' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=PROMOTION')
      )
    })
  })

  describe('createPromotion', () => {
    it('應該成功建立升遷紀錄', async () => {
      const promotionData = {
        employee_id: 'emp-1',
        type: 'PROMOTION',
        effective_date: '2025-03-01',
        to_job_title_id: 'jt-2',
        new_base_salary: 55000,
        reason: '績效優異'
      }

      const createdPromotion: Partial<PromotionRecord> = {
        id: 'promo-new',
        ...promotionData
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: createdPromotion
      })

      const { createPromotion } = usePayroll()

      const result = await createPromotion(promotionData)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/payroll/promotions'),
        expect.objectContaining({
          method: 'POST',
          body: promotionData
        })
      )
      expect(result.id).toBe('promo-new')
    })

    it('應該成功建立調動紀錄', async () => {
      const transferData = {
        employee_id: 'emp-1',
        type: 'TRANSFER',
        effective_date: '2025-03-01',
        to_branch_id: 'branch-2',
        reason: '支援新分店'
      }

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { id: 'promo-transfer', ...transferData }
      })

      const { createPromotion } = usePayroll()

      const result = await createPromotion(transferData)

      expect(result.type).toBe('TRANSFER')
    })
  })

  describe('Helper functions', () => {
    it('getStatusLabel 應該返回正確的標籤', () => {
      const { getStatusLabel } = usePayroll()

      expect(getStatusLabel('PENDING')).toBe('待審核')
      expect(getStatusLabel('APPROVED')).toBe('已核准')
      expect(getStatusLabel('PAID')).toBe('已發放')
    })

    it('getStatusVariant 應該返回正確的樣式', () => {
      const { getStatusVariant } = usePayroll()

      expect(getStatusVariant('PENDING')).toBe('warning')
      expect(getStatusVariant('APPROVED')).toBe('info')
      expect(getStatusVariant('PAID')).toBe('success')
    })

    it('getPromotionTypeLabel 應該返回正確的標籤', () => {
      const { getPromotionTypeLabel } = usePayroll()

      expect(getPromotionTypeLabel('PROMOTION')).toBe('升遷')
      expect(getPromotionTypeLabel('TRANSFER')).toBe('調動')
      expect(getPromotionTypeLabel('DEMOTION')).toBe('降職')
    })

    it('formatCurrency 應該正確格式化金額', () => {
      const { formatCurrency } = usePayroll()

      expect(formatCurrency(45000)).toBe('$45,000')
      expect(formatCurrency(1234567)).toBe('$1,234,567')
      expect(formatCurrency(0)).toBe('$0')
    })
  })
})
