/**
 * useShiftSchedules.test.ts
 * Tests for the shift schedule management composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockFetchInstance } from '@test/setup'
import { useShiftSchedules } from './useShiftSchedules'
import type { ShiftSchedule, EmployeeShift, Employee } from '~/types/schema'

describe('useShiftSchedules', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('班表 CRUD - fetchShiftSchedules', () => {
    it('應該成功取得班表列表', async () => {
      const mockShifts: Partial<ShiftSchedule>[] = [
        { id: 'shift-1', name: '早班', start_time: '09:00', end_time: '18:00' },
        { id: 'shift-2', name: '晚班', start_time: '14:00', end_time: '23:00' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockShifts,
        total: 2
      })

      const { fetchShiftSchedules, shiftSchedules, isShiftLoading } = useShiftSchedules()

      await fetchShiftSchedules()

      expect(shiftSchedules.value).toEqual(mockShifts)
      expect(isShiftLoading.value).toBe(false)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('shift_schedules', { filter: {}, sort: 'start_time' })
    })

    it('應該支援分店過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchShiftSchedules } = useShiftSchedules()

      await fetchShiftSchedules('branch-1')

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'shift_schedules',
        expect.objectContaining({
          filter: { branch_id: 'branch-1' }
        })
      )
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchShiftSchedules, isShiftLoading, shiftSchedules } = useShiftSchedules()
      shiftSchedules.value = [{ id: 'keep' } as ShiftSchedule]

      await fetchShiftSchedules()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch shift schedules:', expect.any(Error))
      expect(isShiftLoading.value).toBe(false)
      expect(shiftSchedules.value).toEqual([{ id: 'keep' }]) // previous list is kept on failure

      consoleErrorSpy.mockRestore()
    })
  })

  describe('班表 CRUD - getShiftSchedule', () => {
    it('應該成功取得單一班表', async () => {
      const mockShift: Partial<ShiftSchedule> = {
        id: 'shift-1',
        name: '早班',
        start_time: '09:00'
      }

      mockFetchInstance.readItem.mockResolvedValueOnce(mockShift)

      const { getShiftSchedule } = useShiftSchedules()

      const result = await getShiftSchedule('shift-1')

      expect(result).toEqual(mockShift)
      expect(mockFetchInstance.readItem).toHaveBeenCalledWith('shift_schedules', 'shift-1')
    })

    it('應該在找不到時返回 null', async () => {
      mockFetchInstance.readItem.mockResolvedValueOnce(null)

      const { getShiftSchedule } = useShiftSchedules()

      const result = await getShiftSchedule('non-existent')

      expect(result).toBeNull()
    })
  })

  // Writes go through apiFetch: it throws with the backend's error text on a non-2xx
  // answer (the old createItem/updateItem helpers returned null and the page then
  // toasted success). Shapes follow backend routes/shift-schedules.ts.
  const apiSchedule = (overrides: Partial<ShiftSchedule> = {}): ShiftSchedule => ({
    id: 'shift-new',
    status: 'published',
    date_created: '2025-01-15T10:00:00.000Z',
    date_updated: null,
    branch_id: 'branch-1',
    name: '早班',
    start_time: '09:00:00',
    end_time: '18:00:00',
    break_start: null,
    break_end: null,
    grace_period_minutes: 15,
    early_leave_minutes: 15,
    overtime_start_after: null,
    is_default: false,
    applicable_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    ...overrides
  })

  describe('班表 CRUD - createShiftSchedule', () => {
    it('POSTs the schedule with status published and returns the created row', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiSchedule() })

      const { createShiftSchedule } = useShiftSchedules()
      const result = await createShiftSchedule({
        name: '早班',
        branch_id: 'branch-1',
        start_time: '09:00',
        end_time: '18:00',
        applicable_days: ['MONDAY', 'FRIDAY']
      })

      expect(result).toMatchObject({ id: 'shift-new', name: '早班' })
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/shift_schedules', {
        method: 'POST',
        body: {
          name: '早班',
          branch_id: 'branch-1',
          start_time: '09:00',
          end_time: '18:00',
          applicable_days: ['MONDAY', 'FRIDAY'],
          status: 'published'
        }
      })
    })

    it('throws the backend error instead of returning null', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('無效的分店'))

      const { createShiftSchedule } = useShiftSchedules()

      await expect(createShiftSchedule({ name: 'Test' })).rejects.toThrow('無效的分店')
    })
  })

  describe('班表 CRUD - updateShiftSchedule', () => {
    it('PATCHes the schedule and returns the updated row', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiSchedule({ id: 'shift-1', name: '新早班' }) })

      const { updateShiftSchedule } = useShiftSchedules()
      const result = await updateShiftSchedule('shift-1', { name: '新早班' })

      expect(result).toMatchObject({ id: 'shift-1', name: '新早班' })
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/shift_schedules/shift-1', {
        method: 'PATCH',
        body: { name: '新早班' }
      })
    })

    it('throws on a 404 / 400 answer', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到班表'))

      const { updateShiftSchedule } = useShiftSchedules()

      await expect(updateShiftSchedule('shift-1', { name: 'x' })).rejects.toThrow('找不到班表')
    })
  })

  describe('班表 CRUD - deleteShiftSchedule', () => {
    it('DELETEs the schedule (the backend archives it)', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '班表已刪除' })

      const { deleteShiftSchedule } = useShiftSchedules()
      await deleteShiftSchedule('shift-1')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/shift_schedules/shift-1', { method: 'DELETE' })
    })

    it('throws when the backend refuses', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { deleteShiftSchedule } = useShiftSchedules()

      await expect(deleteShiftSchedule('shift-1')).rejects.toThrow('權限不足')
    })
  })

  describe('員工排班 - fetchEmployeeShifts', () => {
    it('應該取得員工班表指派', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        {
          id: 'es-1',
          employee_id: 'emp-1',
          shift_schedule_id: 'shift-1',
          effective_date: '2025-01-01',
          end_date: null
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 1
      })

      const { fetchEmployeeShifts, employeeShifts, isEmployeeShiftLoading } = useShiftSchedules()

      await fetchEmployeeShifts()

      expect(employeeShifts.value).toEqual(mockEmployeeShifts)
      expect(isEmployeeShiftLoading.value).toBe(false)
      // activeOnly defaults to true: only assignments already in effect today are requested
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employee_shifts', expect.objectContaining({
        filter: { effective_date_lte: '2025-01-15' },
        limit: 1000
      }))
    })

    it('應該支援員工 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchEmployeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts({ employeeId: 'emp-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'employee_shifts',
        expect.objectContaining({
          filter: expect.objectContaining({
            employee_id: 'emp-1'
          })
        })
      )
    })

    it('應該支援班表 ID 過濾', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { fetchEmployeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts({ shiftScheduleId: 'shift-1' })

      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'employee_shifts',
        expect.objectContaining({
          filter: expect.objectContaining({
            shift_schedule_id: 'shift-1'
          })
        })
      )
    })

    it('應該預設只取得有效的班表（activeOnly: true）', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        {
          id: 'es-1',
          effective_date: '2025-01-01',
          end_date: null // 無結束日期 = 有效
        },
        {
          id: 'es-2',
          effective_date: '2024-01-01',
          end_date: '2024-12-31' // 已結束 = 無效
        },
        {
          id: 'es-3',
          effective_date: '2025-01-01',
          end_date: '2025-12-31' // 結束日期在今天之後 = 有效
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 3
      })

      const { fetchEmployeeShifts, employeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts({ activeOnly: true })

      // 應該過濾掉已結束的 es-2
      expect(employeeShifts.value).toHaveLength(2)
      expect(employeeShifts.value.map(es => es.id)).toContain('es-1')
      expect(employeeShifts.value.map(es => es.id)).toContain('es-3')
    })

    it('應該在 activeOnly: false 時取得所有班表', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        { id: 'es-1', effective_date: '2025-01-01', end_date: null },
        { id: 'es-2', effective_date: '2024-01-01', end_date: '2024-06-30' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 2
      })

      const { fetchEmployeeShifts, employeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts({ activeOnly: false })

      expect(employeeShifts.value).toHaveLength(2)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employee_shifts', expect.objectContaining({
        filter: {}
      }))
    })

    it('結束日期為今天仍視為有效，昨天結束則無效', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [
          { id: 'ends-today', effective_date: '2025-01-01', end_date: '2025-01-15' },
          { id: 'ended-yesterday', effective_date: '2025-01-01', end_date: '2025-01-14' }
        ],
        total: 2
      })

      const { fetchEmployeeShifts, employeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts()

      expect(employeeShifts.value.map(es => es.id)).toEqual(['ends-today'])
    })

    it('應該支援分店過濾', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        {
          id: 'es-1',
          employee: { branch_id: 'branch-1' } as Employee,
          effective_date: '2025-01-01',
          end_date: null
        },
        {
          id: 'es-2',
          employee: { branch_id: 'branch-2' } as Employee,
          effective_date: '2025-01-01',
          end_date: null
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 2
      })

      const { fetchEmployeeShifts, employeeShifts } = useShiftSchedules()

      await fetchEmployeeShifts({ branchId: 'branch-1' })

      expect(employeeShifts.value).toHaveLength(1)
      expect(employeeShifts.value[0]!.id).toBe('es-1')
    })

    it('應該處理取得失敗的情況', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchInstance.readItems.mockRejectedValueOnce(new Error('Fetch failed'))

      const { fetchEmployeeShifts, isEmployeeShiftLoading, employeeShifts } = useShiftSchedules()
      employeeShifts.value = [{ id: 'keep' } as EmployeeShift]

      await fetchEmployeeShifts()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch employee shifts:', expect.any(Error))
      expect(isEmployeeShiftLoading.value).toBe(false)
      expect(employeeShifts.value).toEqual([{ id: 'keep' }]) // previous list is kept on failure

      consoleErrorSpy.mockRestore()
    })
  })

  describe('員工排班 - fetchShiftEmployees', () => {
    it('應該取得班表的指派員工', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        {
          id: 'es-1',
          employee_id: 'emp-1',
          shift_schedule_id: 'shift-1',
          effective_date: '2025-01-01',
          end_date: null
        }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 1
      })

      const { fetchShiftEmployees } = useShiftSchedules()

      const result = await fetchShiftEmployees('shift-1')

      expect(result).toHaveLength(1)
      expect(result[0]!.shift_schedule_id).toBe('shift-1')
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employee_shifts', {
        filter: { shift_schedule_id: 'shift-1', effective_date_lte: '2025-01-15' },
        limit: 1000
      })
    })

    it('應該過濾掉已結束的指派', async () => {
      const mockEmployeeShifts: Partial<EmployeeShift>[] = [
        { id: 'es-1', effective_date: '2025-01-01', end_date: null },
        { id: 'es-2', effective_date: '2024-01-01', end_date: '2024-06-30' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployeeShifts,
        total: 2
      })

      const { fetchShiftEmployees } = useShiftSchedules()

      const result = await fetchShiftEmployees('shift-1')

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('es-1')
    })
  })

  describe('員工排班 - getEmployeeCurrentShift', () => {
    it('應該返回員工的當前班表', async () => {
      const mockEmployeeShift: Partial<EmployeeShift> = {
        id: 'es-1',
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-1',
        effective_date: '2025-01-01',
        end_date: null
      }

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [mockEmployeeShift],
        total: 1
      })

      const { getEmployeeCurrentShift } = useShiftSchedules()

      const result = await getEmployeeCurrentShift('emp-1')

      expect(result).toEqual(mockEmployeeShift)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith('employee_shifts', {
        filter: { employee_id: 'emp-1', effective_date_lte: '2025-01-15' },
        limit: 100
      })
    })

    it('應該略過已結束的班表，返回仍有效的那一筆', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [
          { id: 'es-ended', effective_date: '2024-01-01', end_date: '2025-01-10' },
          { id: 'es-open', effective_date: '2025-01-11', end_date: null }
        ],
        total: 2
      })

      const { getEmployeeCurrentShift } = useShiftSchedules()

      expect((await getEmployeeCurrentShift('emp-1'))?.id).toBe('es-open')
    })

    it('應該在沒有有效班表時返回 null', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [
          { id: 'es-1', effective_date: '2024-01-01', end_date: '2024-06-30' }
        ],
        total: 1
      })

      const { getEmployeeCurrentShift } = useShiftSchedules()

      const result = await getEmployeeCurrentShift('emp-1')

      expect(result).toBeNull()
    })

    it('應該在沒有任何班表時返回 null', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const { getEmployeeCurrentShift } = useShiftSchedules()

      const result = await getEmployeeCurrentShift('emp-1')

      expect(result).toBeNull()
    })
  })

  // Backend-shaped assignment row (routes/shift-schedules.ts formatEmployeeShift)
  const apiAssignment = (overrides: Partial<EmployeeShift> = {}): Partial<EmployeeShift> => ({
    id: 'es-new',
    date_created: '2025-01-15T10:00:00.000Z',
    employee_id: 'emp-1',
    shift_schedule_id: 'shift-1',
    effective_date: '2025-01-15',
    end_date: null,
    ...overrides
  })

  describe('員工排班 - assignShiftToEmployee', () => {
    it('POSTs to /employee_shifts for an employee without a current shift', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment() })

      const { assignShiftToEmployee } = useShiftSchedules()
      const result = await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      expect(result).toMatchObject({ id: 'es-new', employee_id: 'emp-1' })
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts', {
        method: 'POST',
        body: {
          employee_id: 'emp-1',
          shift_schedule_id: 'shift-1',
          effective_date: '2025-01-15',
          end_date: null
        }
      })
    })

    it('passes the end date to the new assignment', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment({ end_date: '2025-06-30' }) })

      const { assignShiftToEmployee } = useShiftSchedules()
      await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15',
        endDate: '2025-06-30'
      })

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts', expect.objectContaining({
        body: expect.objectContaining({ end_date: '2025-06-30' })
      }))
    })

    it('ends the current assignment the day before when switching schedules', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [apiAssignment({ id: 'es-old', shift_schedule_id: 'shift-old', effective_date: '2024-01-01' })],
        total: 1
      })
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-old', end_date: '2025-01-14' }) })
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ shift_schedule_id: 'shift-new' }) })

      const { assignShiftToEmployee } = useShiftSchedules()
      await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-new',
        effectiveDate: '2025-01-15'
      })

      expect(mockFetchInstance.apiFetch).toHaveBeenNthCalledWith(1, '/employee_shifts/es-old', {
        method: 'PATCH',
        body: { end_date: '2025-01-14' }
      })
      expect(mockFetchInstance.apiFetch).toHaveBeenNthCalledWith(2, '/employee_shifts', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ shift_schedule_id: 'shift-new', effective_date: '2025-01-15' })
      }))
    })

    it('does not touch the current assignment of the same schedule', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [apiAssignment({ id: 'es-old', shift_schedule_id: 'shift-1' })],
        total: 1
      })
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment() })

      const { assignShiftToEmployee } = useShiftSchedules()
      await assignShiftToEmployee({ employeeId: 'emp-1', shiftScheduleId: 'shift-1', effectiveDate: '2025-01-15' })

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts', expect.objectContaining({ method: 'POST' }))
    })

    it('throws the backend error (e.g. 403 for staff) instead of returning null', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))

      const { assignShiftToEmployee } = useShiftSchedules()

      await expect(assignShiftToEmployee({
        employeeId: 'emp-1', shiftScheduleId: 'shift-1', effectiveDate: '2025-01-15'
      })).rejects.toThrow('權限不足')
    })
  })

  describe('員工排班 - batchAssignShift', () => {
    it('assigns every employee', async () => {
      mockFetchInstance.readItems.mockResolvedValue({ data: [], total: 0 })
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-1', employee_id: 'emp-1' }) })
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-2', employee_id: 'emp-2' }) })
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-3', employee_id: 'emp-3' }) })

      const { batchAssignShift } = useShiftSchedules()
      const results = await batchAssignShift({
        employeeIds: ['emp-1', 'emp-2', 'emp-3'],
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      expect(results.map(r => r.id)).toEqual(['es-1', 'es-2', 'es-3'])
      const posted = mockFetchInstance.apiFetch.mock.calls.map(call => call[1].body.employee_id)
      expect(posted).toEqual(['emp-1', 'emp-2', 'emp-3'])
    })

    it('rejects when one assignment fails, so the page does not report success', async () => {
      mockFetchInstance.readItems.mockResolvedValue({ data: [], total: 0 })
      mockFetchInstance.apiFetch
        .mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-1' }) })
        .mockRejectedValueOnce(new Error('員工不存在'))

      const { batchAssignShift } = useShiftSchedules()

      await expect(batchAssignShift({
        employeeIds: ['emp-1', 'emp-2'],
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })).rejects.toThrow('員工不存在')
    })
  })

  describe('員工排班 - updateEmployeeShift', () => {
    it('PATCHes /employee_shifts/:id', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-1', end_date: '2025-12-31' }) })

      const { updateEmployeeShift } = useShiftSchedules()
      const result = await updateEmployeeShift('es-1', { endDate: '2025-12-31' })

      expect(result).toMatchObject({ id: 'es-1', end_date: '2025-12-31' })
      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts/es-1', {
        method: 'PATCH',
        body: { effective_date: undefined, end_date: '2025-12-31' }
      })
    })

    it('allows clearing the end date (open-ended)', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-1', end_date: null }) })

      const { updateEmployeeShift } = useShiftSchedules()
      await updateEmployeeShift('es-1', { endDate: null })

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts/es-1', {
        method: 'PATCH',
        body: { effective_date: undefined, end_date: null }
      })
    })
  })

  describe('員工排班 - removeEmployeeShift', () => {
    it('ends the assignment yesterday', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: apiAssignment({ id: 'es-1', end_date: '2025-01-14' }) })

      const { removeEmployeeShift } = useShiftSchedules()
      await removeEmployeeShift('es-1')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employee_shifts/es-1', {
        method: 'PATCH',
        body: { end_date: '2025-01-14' }
      })
    })

    it('throws when the backend refuses (no false 「已移除」)', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('找不到班表指派'))

      const { removeEmployeeShift } = useShiftSchedules()

      await expect(removeEmployeeShift('es-1')).rejects.toThrow('找不到班表指派')
    })
  })

  describe('fetchBranchEmployees', () => {
    it('reads GET /employees?branchId= (camelCase rows) and keeps ACTIVE employees', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'emp-1', fullName: '王小明', employeeCode: 'E00001', branchId: 'branch-1', status: 'ACTIVE' },
          { id: 'emp-2', fullName: '李離職', employeeCode: 'E00002', branchId: 'branch-1', status: 'RESIGNED' }
        ]
      })

      const { fetchBranchEmployees } = useShiftSchedules()
      const result = await fetchBranchEmployees('branch-1')

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledWith('/employees', { params: { branchId: 'branch-1' } })
      expect(result).toEqual([
        { id: 'emp-1', full_name: '王小明', employee_code: 'E00001', branch_id: 'branch-1' }
      ])
    })
  })

  describe('local date handling (Asia/Taipei, UTC+8)', () => {
    const originalTZ = process.env.TZ
    beforeEach(() => {
      process.env.TZ = 'Asia/Taipei'
      // 07:30 local on Jan 15 = 23:30 UTC on Jan 14
      vi.setSystemTime(new Date('2026-01-15T07:30:00+08:00'))
    })
    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('filters active assignments by the local date, not the UTC date', async () => {
      mockFetchInstance.readItems.mockResolvedValue({ data: [], total: 0 })
      await useShiftSchedules().fetchShiftEmployees('shift-1')
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'employee_shifts',
        expect.objectContaining({
          filter: expect.objectContaining({ effective_date_lte: '2026-01-15' })
        })
      )
    })
  })
})
