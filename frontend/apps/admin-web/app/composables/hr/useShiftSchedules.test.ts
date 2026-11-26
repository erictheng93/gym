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

  describe('班表 CRUD - createShiftSchedule', () => {
    it('應該成功建立班表', async () => {
      const newShift: Partial<ShiftSchedule> = {
        name: '新班表',
        start_time: '10:00',
        end_time: '19:00'
      }

      const createdShift: Partial<ShiftSchedule> = {
        id: 'shift-new',
        ...newShift,
        status: 'published'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(createdShift)

      const { createShiftSchedule } = useShiftSchedules()

      const result = await createShiftSchedule(newShift)

      expect(result).toEqual(createdShift)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'shift_schedules',
        expect.objectContaining({
          name: '新班表',
          status: 'published'
        })
      )
    })

    it('應該在建立失敗時返回 null', async () => {
      mockFetchInstance.createItem.mockResolvedValueOnce(null)

      const { createShiftSchedule } = useShiftSchedules()

      const result = await createShiftSchedule({ name: 'Test' })

      expect(result).toBeNull()
    })

    it('建立時一律強制 status 為 published', async () => {
      mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'shift-new' })

      const { createShiftSchedule } = useShiftSchedules()

      await createShiftSchedule({ name: 'Test', status: 'archived' })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('shift_schedules', { name: 'Test', status: 'published' })
    })
  })

  describe('班表 CRUD - updateShiftSchedule', () => {
    it('應該成功更新班表', async () => {
      const updateData = { name: '更新後的班表' }
      const updatedShift: Partial<ShiftSchedule> = {
        id: 'shift-1',
        name: '更新後的班表'
      }

      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedShift)

      const { updateShiftSchedule } = useShiftSchedules()

      const result = await updateShiftSchedule('shift-1', updateData)

      expect(result).toEqual(updatedShift)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'shift_schedules',
        'shift-1',
        updateData
      )
    })
  })

  describe('班表 CRUD - deleteShiftSchedule', () => {
    it('應該軟刪除班表（設為 archived）', async () => {
      mockFetchInstance.updateItem.mockResolvedValueOnce({})

      const { deleteShiftSchedule } = useShiftSchedules()

      await deleteShiftSchedule('shift-1')

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'shift_schedules',
        'shift-1',
        { status: 'archived' }
      )
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

  describe('員工排班 - assignShiftToEmployee', () => {
    it('應該指派班表給沒有當前班表的員工', async () => {
      // Mock getEmployeeCurrentShift - 沒有當前班表
      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [],
        total: 0
      })

      const newEmployeeShift: Partial<EmployeeShift> = {
        id: 'es-new',
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-1'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(newEmployeeShift)

      const { assignShiftToEmployee } = useShiftSchedules()

      const result = await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      expect(result).toEqual(newEmployeeShift)
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('employee_shifts', {
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-1',
        effective_date: '2025-01-15',
        end_date: null
      })
      expect(mockFetchInstance.updateItem).not.toHaveBeenCalled()
    })

    it('應該把結束日期帶入新的指派', async () => {
      mockFetchInstance.readItems.mockResolvedValueOnce({ data: [], total: 0 })
      mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'es-new' })

      const { assignShiftToEmployee } = useShiftSchedules()

      await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-02-01',
        endDate: '2025-06-30'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('employee_shifts', expect.objectContaining({
        effective_date: '2025-02-01',
        end_date: '2025-06-30'
      }))
    })

    it('應該在更換班表時結束舊班表', async () => {
      // Mock getEmployeeCurrentShift - 有當前班表
      const currentShift: Partial<EmployeeShift> = {
        id: 'es-old',
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-old',
        effective_date: '2024-01-01',
        end_date: null
      }

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [currentShift],
        total: 1
      })

      mockFetchInstance.updateItem.mockResolvedValueOnce({})

      const newEmployeeShift: Partial<EmployeeShift> = {
        id: 'es-new',
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-new'
      }

      mockFetchInstance.createItem.mockResolvedValueOnce(newEmployeeShift)

      const { assignShiftToEmployee } = useShiftSchedules()

      await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-new',
        effectiveDate: '2025-01-15'
      })

      // 應該更新舊班表的結束日期
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'employee_shifts',
        'es-old',
        { end_date: '2025-01-14' } // 前一天
      )
      expect(mockFetchInstance.createItem).toHaveBeenCalledWith('employee_shifts', expect.objectContaining({
        shift_schedule_id: 'shift-new',
        effective_date: '2025-01-15'
      }))
    })

    it('應該在相同班表時不更新舊班表', async () => {
      const currentShift: Partial<EmployeeShift> = {
        id: 'es-current',
        employee_id: 'emp-1',
        shift_schedule_id: 'shift-1', // 相同班表
        effective_date: '2024-01-01',
        end_date: null
      }

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: [currentShift],
        total: 1
      })

      mockFetchInstance.createItem.mockResolvedValueOnce({ id: 'es-new' })

      const { assignShiftToEmployee } = useShiftSchedules()

      await assignShiftToEmployee({
        employeeId: 'emp-1',
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      // 不應該呼叫 updateItem
      expect(mockFetchInstance.updateItem).not.toHaveBeenCalled()
    })
  })

  describe('員工排班 - batchAssignShift', () => {
    it('應該批量指派班表給多個員工', async () => {
      // Mock for each employee
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      mockFetchInstance.createItem
        .mockResolvedValueOnce({ id: 'es-1', employee_id: 'emp-1' })
        .mockResolvedValueOnce({ id: 'es-2', employee_id: 'emp-2' })
        .mockResolvedValueOnce({ id: 'es-3', employee_id: 'emp-3' })

      const { batchAssignShift } = useShiftSchedules()

      const result = await batchAssignShift({
        employeeIds: ['emp-1', 'emp-2', 'emp-3'],
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      expect(result).toHaveLength(3)
      expect(mockFetchInstance.createItem).toHaveBeenCalledTimes(3)
      const assignedEmployees = mockFetchInstance.createItem.mock.calls.map(call => call[1].employee_id)
      expect(assignedEmployees).toEqual(['emp-1', 'emp-2', 'emp-3'])
    })

    it('應該過濾掉失敗的指派', async () => {
      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [], total: 0 })

      mockFetchInstance.createItem
        .mockResolvedValueOnce({ id: 'es-1', employee_id: 'emp-1' })
        .mockResolvedValueOnce(null) // 失敗

      const { batchAssignShift } = useShiftSchedules()

      const result = await batchAssignShift({
        employeeIds: ['emp-1', 'emp-2'],
        shiftScheduleId: 'shift-1',
        effectiveDate: '2025-01-15'
      })

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('es-1')
    })
  })

  describe('員工排班 - updateEmployeeShift', () => {
    it('應該更新員工班表指派', async () => {
      const updatedShift: Partial<EmployeeShift> = {
        id: 'es-1',
        effective_date: '2025-02-01',
        end_date: '2025-06-30'
      }

      mockFetchInstance.updateItem.mockResolvedValueOnce(updatedShift)

      const { updateEmployeeShift } = useShiftSchedules()

      const result = await updateEmployeeShift('es-1', {
        effectiveDate: '2025-02-01',
        endDate: '2025-06-30'
      })

      expect(result).toEqual(updatedShift)
      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'employee_shifts',
        'es-1',
        {
          effective_date: '2025-02-01',
          end_date: '2025-06-30'
        }
      )
    })

    it('應該允許把結束日期清空（無限期）', async () => {
      mockFetchInstance.updateItem.mockResolvedValueOnce({ id: 'es-1', end_date: null })

      const { updateEmployeeShift } = useShiftSchedules()

      await updateEmployeeShift('es-1', { endDate: null })

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith('employee_shifts', 'es-1', {
        effective_date: undefined,
        end_date: null
      })
    })
  })

  describe('員工排班 - removeEmployeeShift', () => {
    it('應該將結束日期設為昨天', async () => {
      mockFetchInstance.updateItem.mockResolvedValueOnce({})

      const { removeEmployeeShift } = useShiftSchedules()

      await removeEmployeeShift('es-1')

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'employee_shifts',
        'es-1',
        { end_date: '2025-01-14' } // 昨天
      )
    })
  })

  describe('fetchBranchEmployees', () => {
    it('應該取得分店員工列表', async () => {
      const mockEmployees: Partial<Employee>[] = [
        { id: 'emp-1', full_name: 'John' },
        { id: 'emp-2', full_name: 'Jane' }
      ]

      mockFetchInstance.readItems.mockResolvedValueOnce({
        data: mockEmployees,
        total: 2
      })

      const { fetchBranchEmployees } = useShiftSchedules()

      const result = await fetchBranchEmployees('branch-1')

      expect(result).toEqual(mockEmployees)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'employees',
        {
          filter: {
            branch_id: 'branch-1',
            employment_status: 'ACTIVE',
            status: 'active'
          },
          sort: 'full_name'
        }
      )
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
