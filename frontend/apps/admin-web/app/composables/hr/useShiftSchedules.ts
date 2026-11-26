/**
 * useShiftSchedules - 班表管理 composable
 * 包含：班表 CRUD、員工排班、班表指派
 */

import { toLocalDateString } from '~/utils/date'
import { useFetch } from '~/composables/core/useFetch'
import type { ShiftSchedule, EmployeeShift, Employee } from '~/types/schema'

const inFlightShiftSchedulesMap = new Map<string, Promise<void>>()
const inFlightEmployeeShiftsMap = new Map<string, Promise<void>>()
const inFlightSingleShiftMap = new Map<string, Promise<ShiftSchedule | null>>()

export const useShiftSchedules = () => {
  const { readItems, readItem, createItem, updateItem } = useFetch()

  // ============================================
  // 狀態
  // ============================================

  const shiftSchedules = useState<ShiftSchedule[]>('hr_shift_schedules', () => [])
  const isShiftLoading = useState('hr_shift_loading', () => false)
  const employeeShifts = useState<EmployeeShift[]>('hr_employee_shifts', () => [])
  const isEmployeeShiftLoading = useState('hr_employee_shift_loading', () => false)

  // ============================================
  // 班表 CRUD
  // ============================================

  /**
   * 取得班表列表
   */
  const fetchShiftSchedules = async (branchId?: string) => {
    const key = branchId || 'all'
    const existing = inFlightShiftSchedulesMap.get(key)
    if (existing) return existing

    const promise = (async () => {
      isShiftLoading.value = true
      try {
        const filter: Record<string, unknown> = {}
        if (branchId) filter.branch_id = branchId

        const result = await readItems<ShiftSchedule>('shift_schedules', {
          filter,
          sort: 'start_time'
        })
        shiftSchedules.value = result.data
      } catch (error) {
        console.error('Failed to fetch shift schedules:', error)
      } finally {
        isShiftLoading.value = false
        inFlightShiftSchedulesMap.delete(key)
      }
    })()

    inFlightShiftSchedulesMap.set(key, promise)
    return promise
  }

  /**
   * 取得單一班表
   */
  const getShiftSchedule = async (id: string, force = false): Promise<ShiftSchedule | null> => {
    if (!force && inFlightSingleShiftMap.has(id)) {
      return inFlightSingleShiftMap.get(id)!
    }

    const promise = (async () => {
      try {
        const data = await readItem<ShiftSchedule>('shift_schedules', id)
        return data
      } finally {
        inFlightSingleShiftMap.delete(id)
      }
    })()

    inFlightSingleShiftMap.set(id, promise)
    return promise
  }

  /**
   * 建立班表
   */
  const createShiftSchedule = async (shift: Partial<ShiftSchedule>) => {
    const data = await createItem<ShiftSchedule>('shift_schedules', {
      ...shift,
      status: 'published'
    })
    return data
  }

  /**
   * 更新班表
   */
  const updateShiftSchedule = async (id: string, shift: Partial<ShiftSchedule>) => {
    const data = await updateItem<ShiftSchedule>('shift_schedules', id, shift)
    return data
  }

  /**
   * 刪除班表（軟刪除）
   */
  const deleteShiftSchedule = async (id: string) => {
    await updateItem<ShiftSchedule>('shift_schedules', id, { status: 'archived' })
  }

  // ============================================
  // 員工排班
  // ============================================

  /**
   * 取得員工班表指派
   */
  const fetchEmployeeShifts = async (options?: {
    employeeId?: string
    shiftScheduleId?: string
    branchId?: string
    activeOnly?: boolean
  }) => {
    const key = JSON.stringify(options || {})
    const existing = inFlightEmployeeShiftsMap.get(key)
    if (existing) return existing

    const promise = (async () => {
      isEmployeeShiftLoading.value = true
      const { employeeId, shiftScheduleId, branchId, activeOnly = true } = options || {}

      try {
        const filter: Record<string, unknown> = {}
        if (employeeId) filter.employee_id = employeeId
        if (shiftScheduleId) filter.shift_schedule_id = shiftScheduleId

        if (activeOnly) {
          const today = toLocalDateString()
          filter.effective_date_lte = today
          // For end_date null or >= today, we'll filter client-side
        }

        const result = await readItems<EmployeeShift>('employee_shifts', {
          filter,
          sort: 'date_created',
          sortOrder: 'desc',
          limit: 1000
        })

        let filtered = result.data

        // Filter for active shifts (end_date is null or >= today)
        if (activeOnly) {
          const today = toLocalDateString()
          filtered = filtered.filter(es =>
            !es.end_date || es.end_date >= today
          )
        }

        // Filter by branch if needed
        if (branchId) {
          filtered = filtered.filter(es => {
            const employee = es.employee as Employee | undefined
            return employee?.branch_id === branchId
          })
        }

        employeeShifts.value = filtered
      } catch (error) {
        console.error('Failed to fetch employee shifts:', error)
      } finally {
        isEmployeeShiftLoading.value = false
        inFlightEmployeeShiftsMap.delete(key)
      }
    })()

    inFlightEmployeeShiftsMap.set(key, promise)
    return promise
  }

  /**
   * 取得班表的指派員工
   */
  const fetchShiftEmployees = async (shiftScheduleId: string) => {
    const today = toLocalDateString()

    const result = await readItems<EmployeeShift>('employee_shifts', {
      filter: {
        shift_schedule_id: shiftScheduleId,
        effective_date_lte: today
      },
      limit: 1000
    })

    // Filter for active shifts (end_date is null or >= today)
    const filtered = result.data.filter(es =>
      !es.end_date || es.end_date >= today
    )

    return filtered
  }

  /**
   * 取得員工的當前班表
   */
  const getEmployeeCurrentShift = async (employeeId: string) => {
    const today = toLocalDateString()

    const result = await readItems<EmployeeShift>('employee_shifts', {
      filter: {
        employee_id: employeeId,
        effective_date_lte: today
      },
      limit: 100
    })

    // Filter for active shifts (end_date is null or >= today)
    const activeShifts = result.data.filter(es =>
      !es.end_date || es.end_date >= today
    )

    return activeShifts[0] || null
  }

  /**
   * 指派班表給員工
   */
  const assignShiftToEmployee = async (data: {
    employeeId: string
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => {
    const currentShift = await getEmployeeCurrentShift(data.employeeId)

    if (currentShift && currentShift.shift_schedule_id !== data.shiftScheduleId) {
      await updateItem<EmployeeShift>('employee_shifts', currentShift.id, {
        end_date: new Date(new Date(data.effectiveDate).getTime() - 86400000).toISOString().slice(0, 10)
      })
    }

    const result = await createItem<EmployeeShift>('employee_shifts', {
      employee_id: data.employeeId,
      shift_schedule_id: data.shiftScheduleId,
      effective_date: data.effectiveDate,
      end_date: data.endDate || null
    })

    return result
  }

  /**
   * 批量指派班表給多個員工
   */
  const batchAssignShift = async (data: {
    employeeIds: string[]
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => {
    const results = await Promise.all(
      data.employeeIds.map(employeeId =>
        assignShiftToEmployee({
          employeeId,
          shiftScheduleId: data.shiftScheduleId,
          effectiveDate: data.effectiveDate,
          endDate: data.endDate
        })
      )
    )

    return results.filter((r): r is EmployeeShift => r !== null)
  }

  /**
   * 更新員工班表指派
   */
  const updateEmployeeShift = async (shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }) => {
    const result = await updateItem<EmployeeShift>('employee_shifts', shiftId, {
      effective_date: data.effectiveDate,
      end_date: data.endDate
    })
    return result
  }

  /**
   * 移除員工班表指派（結束日期設為昨天）
   */
  const removeEmployeeShift = async (shiftId: string) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const result = await updateItem<EmployeeShift>('employee_shifts', shiftId, {
      end_date: toLocalDateString(yesterday)
    })
    return result
  }

  /**
   * 取得分店員工列表（用於排班選擇）
   */
  const fetchBranchEmployees = async (branchId: string) => {
    const result = await readItems<Employee>('employees', {
      filter: {
        branch_id: branchId,
        employment_status: 'ACTIVE',
        status: 'active'
      },
      sort: 'full_name'
    })
    return result.data
  }

  return {
    // Shift Schedules State
    shiftSchedules,
    isShiftLoading,
    // Shift Schedules CRUD
    fetchShiftSchedules,
    getShiftSchedule,
    createShiftSchedule,
    updateShiftSchedule,
    deleteShiftSchedule,
    // Employee Shifts State
    employeeShifts,
    isEmployeeShiftLoading,
    // Employee Shifts
    fetchEmployeeShifts,
    fetchShiftEmployees,
    getEmployeeCurrentShift,
    assignShiftToEmployee,
    batchAssignShift,
    updateEmployeeShift,
    removeEmployeeShift,
    fetchBranchEmployees
  }
}

export default useShiftSchedules
