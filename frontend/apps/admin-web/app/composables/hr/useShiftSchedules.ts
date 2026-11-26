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

/** An ACTIVE employee of a branch, as the assignment picker shows it. */
export interface BranchEmployee {
  id: string
  full_name: string
  employee_code: string
  branch_id: string
}

/** A row of GET /api/employees (camelCase, see backend routes/employees.ts). */
interface ApiEmployee {
  id: string
  fullName: string
  employeeCode: string
  branchId: string
  status: string
}

/**
 * Write calls go through apiFetch, which throws with the backend's error text on a
 * non-2xx response, so callers never report success for a rejected write.
 */
export const useShiftSchedules = () => {
  const { apiFetch, readItems, readItem } = useFetch()

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
  const createShiftSchedule = async (shift: Partial<ShiftSchedule>): Promise<ShiftSchedule> => {
    const { data } = await apiFetch<ShiftSchedule>('/shift_schedules', {
      method: 'POST',
      body: { ...shift, status: 'published' }
    })
    if (!data) throw new Error('建立班表失敗')
    return data
  }

  /**
   * 更新班表
   */
  const updateShiftSchedule = async (id: string, shift: Partial<ShiftSchedule>): Promise<ShiftSchedule> => {
    const { data } = await apiFetch<ShiftSchedule>(`/shift_schedules/${id}`, { method: 'PATCH', body: shift })
    if (!data) throw new Error('更新班表失敗')
    return data
  }

  /**
   * 刪除班表（軟刪除）
   */
  const deleteShiftSchedule = async (id: string): Promise<void> => {
    // DELETE archives the schedule (soft delete) on the backend
    await apiFetch(`/shift_schedules/${id}`, { method: 'DELETE' })
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
      await apiFetch<EmployeeShift>(`/employee_shifts/${currentShift.id}`, {
        method: 'PATCH',
        body: {
          end_date: new Date(new Date(data.effectiveDate).getTime() - 86400000).toISOString().slice(0, 10)
        }
      })
    }

    const { data: created } = await apiFetch<EmployeeShift>('/employee_shifts', {
      method: 'POST',
      body: {
        employee_id: data.employeeId,
        shift_schedule_id: data.shiftScheduleId,
        effective_date: data.effectiveDate,
        end_date: data.endDate || null
      }
    })
    if (!created) throw new Error('指派班表失敗')
    return created
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

    return results
  }

  /**
   * 更新員工班表指派
   */
  const updateEmployeeShift = async (shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }) => {
    const { data: updated } = await apiFetch<EmployeeShift>(`/employee_shifts/${shiftId}`, {
      method: 'PATCH',
      body: { effective_date: data.effectiveDate, end_date: data.endDate }
    })
    if (!updated) throw new Error('更新班表指派失敗')
    return updated
  }

  /**
   * 移除員工班表指派（結束日期設為昨天）
   */
  const removeEmployeeShift = async (shiftId: string) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { data: updated } = await apiFetch<EmployeeShift>(`/employee_shifts/${shiftId}`, {
      method: 'PATCH',
      body: { end_date: toLocalDateString(yesterday) }
    })
    if (!updated) throw new Error('移除班表指派失敗')
    return updated
  }

  /**
   * 取得分店員工列表（用於排班選擇）
   */
  const fetchBranchEmployees = async (branchId: string): Promise<BranchEmployee[]> => {
    // GET /employees reads only `branchId` and returns every status, sorted by name
    const { data } = await apiFetch<ApiEmployee[]>('/employees', { params: { branchId } })
    return (data || [])
      .filter(e => e.status === 'ACTIVE')
      .map(e => ({ id: e.id, full_name: e.fullName, employee_code: e.employeeCode, branch_id: e.branchId }))
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
