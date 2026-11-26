import { describe, it, expect, vi, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { usePayroll } from './usePayroll'
import type { SalaryRecord, PromotionRecord } from './usePayroll'

// Fixtures in the exact wire format of backend/src/routes/hr-payroll.ts: snake_case rows with
// parseFloat'ed numeric fields, a nested employee {id, full_name, employee_code} and `meta.total`.
const makeRecord = (overrides: Partial<SalaryRecord> = {}): SalaryRecord => ({
  id: 'a0000000-0000-4000-8000-000000000001',
  employee_id: 'e0000000-0000-4000-8000-000000000001',
  employee: {
    id: 'e0000000-0000-4000-8000-000000000001',
    full_name: '張三',
    employee_code: 'E00001',
    job_title: { name: '教練' },
    branch: { name: '信義店' }
  },
  period: '2026-01',
  base_salary: 45000,
  overtime_hours: 0,
  overtime_pay: 0,
  commission: 0,
  bonus: 0,
  deductions: 0,
  net_salary: 45000,
  hourly_rate: 187.5,
  work_days: 0,
  leave_days: null,
  notes: null,
  status: 'PENDING',
  approved_by: null,
  approved_at: null,
  paid_at: null,
  date_created: '2026-01-31T02:00:00.000Z',
  ...overrides
})

const makePromotion = (overrides: Partial<PromotionRecord> = {}): PromotionRecord => ({
  id: 'p0000000-0000-4000-8000-000000000001',
  employee_id: 'e0000000-0000-4000-8000-000000000001',
  employee: { id: 'e0000000-0000-4000-8000-000000000001', full_name: '張三', employee_code: 'E00001' },
  type: 'PROMOTION',
  from_job_title_id: 'j0000000-0000-4000-8000-000000000001',
  to_job_title_id: 'j0000000-0000-4000-8000-000000000002',
  from_branch_id: 'b0000000-0000-4000-8000-000000000001',
  to_branch_id: null,
  effective_date: '2026-02-01',
  new_base_salary: 50000,
  reason: '表現優異',
  date_created: '2026-01-31T02:00:00.000Z',
  ...overrides
})

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('usePayroll', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
    vi.unstubAllGlobals()
  })

  describe('fetchSalaryRecords', () => {
    it('通過 apiFetch（帶 session）讀取列表與 meta.total', async () => {
      const rows = [makeRecord(), makeRecord({ id: 'a0000000-0000-4000-8000-000000000002', status: 'APPROVED' })]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: rows, meta: { total: 42 } })

      const { fetchSalaryRecords, salaryRecords, totalCount } = usePayroll()
      await fetchSalaryRecords({ page: 3, limit: 10, period: '2026-01', branch_id: 'b1', status: 'PENDING' })

      expect(lastCall()[0]).toBe('/payroll/salary-records')
      expect(lastCall()[1].params).toEqual({ period: '2026-01', branch_id: 'b1', status: 'PENDING', limit: 10, offset: 20 })
      expect(salaryRecords.value).toEqual(rows)
      expect(salaryRecords.value[0]!.employee?.full_name).toBe('張三')
      expect(totalCount.value).toBe(42)
    })

    it('失敗時清空列表並回報後端錯誤訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { fetchSalaryRecords, salaryRecords, totalCount, isLoading } = usePayroll()
      await fetchSalaryRecords({ period: 'x-fail' })

      expect(salaryRecords.value).toEqual([])
      expect(totalCount.value).toBe(0)
      expect(isLoading.value).toBe(false)
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'usePayroll.fetchSalaryRecords', customMessage: '權限不足' })
      )
    })
  })

  describe('fetchSalaryRecord', () => {
    it('讀取單筆薪資', async () => {
      const row = makeRecord()
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: row })

      const { fetchSalaryRecord, currentSalaryRecord } = usePayroll()
      await fetchSalaryRecord(row.id)

      expect(lastCall()[0]).toBe(`/payroll/salary-records/${row.id}`)
      expect(currentSalaryRecord.value).toEqual(row)
    })

    it('404 時清空目前紀錄', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到薪資記錄'))

      const { fetchSalaryRecord, currentSalaryRecord } = usePayroll()
      await fetchSalaryRecord('missing')

      expect(currentSalaryRecord.value).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('generateSalaryRecords', () => {
    it('送出請求並回傳 generated / skipped', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { generated: 3, skipped: 2 } })

      const { generateSalaryRecords } = usePayroll()
      const result = await generateSalaryRecords({ period: '2026-01', branch_id: 'b1' })

      expect(lastCall()[0]).toBe('/payroll/generate')
      expect(lastCall()[1]).toEqual({ method: 'POST', body: { period: '2026-01', branch_id: 'b1' } })
      expect(result).toEqual({ generated: 3, skipped: 2 })
    })

    it('後端錯誤直接拋出，讓頁面顯示後端訊息', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))

      const { generateSalaryRecords } = usePayroll()
      await expect(generateSalaryRecords({ period: '2026-01' })).rejects.toThrow('無效的分店')
    })
  })

  describe('updateSalaryRecord / approveSalary / markAsPaid（後端只回 message）', () => {
    it('updateSalaryRecord 成功但沒有 data 時不視為失敗，且把字串數字轉成 number', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '薪資記錄已更新' })

      const { updateSalaryRecord } = usePayroll()
      await expect(updateSalaryRecord('r1', {
        overtime_hours: '5' as unknown as number,
        bonus: '1000' as unknown as number,
        deductions: 200,
        notes: '加班'
      })).resolves.toBeUndefined()

      expect(lastCall()[0]).toBe('/payroll/salary-records/r1')
      expect(lastCall()[1]).toEqual({
        method: 'PATCH',
        body: { overtime_hours: 5, bonus: 1000, deductions: 200, notes: '加班' }
      })
    })

    it('updateSalaryRecord 不送出未提供的欄位', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: 'ok' })

      const { updateSalaryRecord } = usePayroll()
      await updateSalaryRecord('r1', { bonus: 10 })

      expect(lastCall()[1].body).toEqual({ bonus: 10 })
    })

    it('updateSalaryRecord 遇到已發放記錄時拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('已發放的薪資不能修改'))

      const { updateSalaryRecord } = usePayroll()
      await expect(updateSalaryRecord('r1', { bonus: 10 })).rejects.toThrow('已發放的薪資不能修改')
    })

    it('approveSalary 成功但沒有 data 時不視為失敗', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '薪資已核准' })

      const { approveSalary } = usePayroll()
      await expect(approveSalary('r1')).resolves.toBeUndefined()

      expect(lastCall()[0]).toBe('/payroll/salary-records/r1/approve')
      expect(lastCall()[1]).toEqual({ method: 'POST' })
    })

    it('approveSalary 對無法核准的記錄拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('此記錄無法核准'))

      const { approveSalary } = usePayroll()
      await expect(approveSalary('r1')).rejects.toThrow('此記錄無法核准')
    })

    it('markAsPaid 成功但沒有 data 時不視為失敗', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '已標記為已發放' })

      const { markAsPaid } = usePayroll()
      await expect(markAsPaid('r1')).resolves.toBeUndefined()

      expect(lastCall()[0]).toBe('/payroll/salary-records/r1/pay')
    })

    it('markAsPaid 對權限不足（403）拋出後端錯誤', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { markAsPaid } = usePayroll()
      await expect(markAsPaid('r1')).rejects.toThrow('權限不足')
    })
  })

  describe('batchApproveSalary', () => {
    it('回傳實際核准的筆數', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { approved_count: 2 } })

      const { batchApproveSalary } = usePayroll()
      const result = await batchApproveSalary(['a', 'b', 'c'])

      expect(lastCall()[0]).toBe('/payroll/batch-approve')
      expect(lastCall()[1]).toEqual({ method: 'POST', body: { ids: ['a', 'b', 'c'] } })
      expect(result).toEqual({ approved_count: 2 })
    })
  })

  describe('exportPayroll', () => {
    it('以 session cookie 下載檔案', async () => {
      const blob = new Blob(['a,b'])
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
      vi.stubGlobal('fetch', fetchMock)

      const { exportPayroll } = usePayroll()
      const result = await exportPayroll({ period: '2026-01', branch_id: 'b1', format: 'xlsx' })

      const [url, init] = fetchMock.mock.calls[0]!
      expect(new URL(String(url)).pathname).toBe('/api/payroll/export')
      expect(new URL(String(url)).searchParams.get('format')).toBe('xlsx')
      expect(new URL(String(url)).searchParams.get('branch_id')).toBe('b1')
      expect(init).toEqual({ credentials: 'include' })
      expect(result).toBe(blob)
    })

    it('失敗時拋出後端 JSON 錯誤訊息', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ success: false, error: '權限不足' })
      }))

      const { exportPayroll } = usePayroll()
      await expect(exportPayroll({ period: '2026-01' })).rejects.toThrow('權限不足')
    })
  })

  describe('fetchPromotions', () => {
    it('讀取異動列表與 meta.total', async () => {
      const rows = [makePromotion()]
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: rows, meta: { total: 7 } })

      const { fetchPromotions, promotions, promotionCount } = usePayroll()
      await fetchPromotions({ type: 'PROMOTION', page: 2, limit: 5 })

      expect(lastCall()[0]).toBe('/payroll/promotions')
      expect(lastCall()[1].params).toEqual({ type: 'PROMOTION', limit: 5, offset: 5 })
      expect(promotions.value).toEqual(rows)
      expect(promotionCount.value).toBe(7)
    })

    it('失敗時清空列表', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { fetchPromotions, promotions, promotionCount } = usePayroll()
      await fetchPromotions({ type: 'DEMOTION' })

      expect(promotions.value).toEqual([])
      expect(promotionCount.value).toBe(0)
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('createPromotion', () => {
    const created = {
      id: 'p1',
      employeeId: 'e1',
      type: 'PROMOTION',
      fromJobTitleId: 'j1',
      toJobTitleId: 'j2',
      fromBranchId: 'b1',
      toBranchId: null,
      effectiveDate: '2026-02-01',
      newBaseSalary: '50000.00',
      reason: null,
      createdBy: null,
      createdAt: '2026-01-31T02:00:00.000Z',
      tenantId: 't1'
    }

    it('回傳後端的 camelCase 紀錄，並丟掉空字串欄位（後端要求有效 uuid）', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: created })

      const { createPromotion } = usePayroll()
      const result = await createPromotion({
        employee_id: 'e1',
        type: 'PROMOTION',
        effective_date: '2026-02-01',
        to_job_title_id: 'j2',
        to_branch_id: '',
        new_base_salary: 50000,
        reason: ''
      })

      expect(lastCall()[0]).toBe('/payroll/promotions')
      expect(lastCall()[1]).toEqual({
        method: 'POST',
        body: { employee_id: 'e1', type: 'PROMOTION', effective_date: '2026-02-01', to_job_title_id: 'j2', new_base_salary: 50000 }
      })
      expect(result).toEqual(created)
    })

    it('後端錯誤直接拋出', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到員工'))

      const { createPromotion } = usePayroll()
      await expect(createPromotion({ employee_id: 'e1', type: 'TRANSFER', effective_date: '2026-02-01' }))
        .rejects.toThrow('找不到員工')
    })
  })

  describe('helpers', () => {
    it('狀態與類型標籤', () => {
      const { getStatusLabel, getStatusVariant, getPromotionTypeLabel } = usePayroll()

      expect(getStatusLabel('PENDING')).toBe('待審核')
      expect(getStatusLabel('APPROVED')).toBe('已核准')
      expect(getStatusLabel('PAID')).toBe('已發放')
      expect(getStatusVariant('PAID')).toBe('success')
      expect(getPromotionTypeLabel('TRANSFER')).toBe('調動')
    })

    it('formatCurrency 使用新台幣格式', () => {
      const { formatCurrency } = usePayroll()
      expect(formatCurrency(45000)).toContain('45,000')
    })
  })
})
