/**
 * useShiftSchedules - 班表管理 composable
 * 包含：班表 CRUD、員工排班、班表指派
 */

import { readItems, readItem, createItem, updateItem } from '@directus/sdk'
import type { ShiftSchedule, EmployeeShift, Employee } from '~/types/directus'

export const useShiftSchedules = () => {
  const directus = useDirectus()

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
    isShiftLoading.value = true
    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = { _eq: branchId }

      const data = await directus.request(
        readItems('shift_schedules', {
          filter,
          fields: ['*', 'branch.name'] as any,
          sort: ['start_time']
        })
      )
      shiftSchedules.value = data as ShiftSchedule[]
    } catch (error) {
      console.error('Failed to fetch shift schedules:', error)
    } finally {
      isShiftLoading.value = false
    }
  }

  /**
   * 取得單一班表
   */
  const getShiftSchedule = async (id: string) => {
    const data = await directus.request(
      readItem('shift_schedules', id, {
        fields: ['*', 'branch.*']
      })
    )
    return data as ShiftSchedule
  }

  /**
   * 建立班表
   */
  const createShiftSchedule = async (shift: Partial<ShiftSchedule>) => {
    const data = await directus.request(
      createItem('shift_schedules', {
        ...shift,
        status: 'published'
      })
    )
    return data as ShiftSchedule
  }

  /**
   * 更新班表
   */
  const updateShiftSchedule = async (id: string, shift: Partial<ShiftSchedule>) => {
    const data = await directus.request(
      updateItem('shift_schedules', id, shift)
    )
    return data as ShiftSchedule
  }

  /**
   * 刪除班表（軟刪除）
   */
  const deleteShiftSchedule = async (id: string) => {
    await directus.request(
      updateItem('shift_schedules', id, { status: 'archived' })
    )
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
    isEmployeeShiftLoading.value = true
    const { employeeId, shiftScheduleId, branchId, activeOnly = true } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (employeeId) filter.employee_id = { _eq: employeeId }
      if (shiftScheduleId) filter.shift_schedule_id = { _eq: shiftScheduleId }

      if (activeOnly) {
        const today = new Date().toISOString().split('T')[0]
        filter._and = [
          { effective_date: { _lte: today } },
          {
            _or: [
              { end_date: { _null: true } },
              { end_date: { _gte: today } }
            ]
          }
        ]
      }

      const data = await directus.request(
        readItems('employee_shifts', {
          filter,
          fields: [
            '*',
            'employee.id', 'employee.full_name', 'employee.employee_code', 'employee.branch_id',
            'shift_schedule.id', 'shift_schedule.name', 'shift_schedule.start_time', 'shift_schedule.end_time', 'shift_schedule.branch_id'
          ],
          sort: ['-date_created']
        })
      )

      let filtered = data as EmployeeShift[]
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
    }
  }

  /**
   * 取得班表的指派員工
   */
  const fetchShiftEmployees = async (shiftScheduleId: string) => {
    const today = new Date().toISOString().split('T')[0]

    const data = await directus.request(
      readItems('employee_shifts', {
        filter: {
          shift_schedule_id: { _eq: shiftScheduleId },
          effective_date: { _lte: today },
          _or: [
            { end_date: { _null: true } },
            { end_date: { _gte: today } }
          ]
        },
        fields: [
          '*',
          'employee.id', 'employee.full_name', 'employee.employee_code', 'employee.branch_id'
        ]
      })
    )

    return data as EmployeeShift[]
  }

  /**
   * 取得員工的當前班表
   */
  const getEmployeeCurrentShift = async (employeeId: string) => {
    const today = new Date().toISOString().split('T')[0]

    const data = await directus.request(
      readItems('employee_shifts', {
        filter: {
          employee_id: { _eq: employeeId },
          effective_date: { _lte: today },
          _or: [
            { end_date: { _null: true } },
            { end_date: { _gte: today } }
          ]
        },
        fields: [
          '*',
          'shift_schedule.id', 'shift_schedule.name', 'shift_schedule.start_time',
          'shift_schedule.end_time', 'shift_schedule.grace_period_minutes',
          'shift_schedule.early_leave_minutes', 'shift_schedule.applicable_days'
        ],
        limit: 1
      })
    )

    return (data[0] as EmployeeShift) || null
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
    const today = new Date().toISOString().split('T')[0]
    const currentShift = await getEmployeeCurrentShift(data.employeeId)

    if (currentShift && currentShift.shift_schedule_id !== data.shiftScheduleId) {
      await directus.request(
        updateItem('employee_shifts', currentShift.id, {
          end_date: new Date(new Date(data.effectiveDate).getTime() - 86400000).toISOString().split('T')[0]
        })
      )
    }

    const result = await directus.request(
      createItem('employee_shifts', {
        employee_id: data.employeeId,
        shift_schedule_id: data.shiftScheduleId,
        effective_date: data.effectiveDate,
        end_date: data.endDate || null
      })
    )

    return result as EmployeeShift
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
    const results: EmployeeShift[] = []

    for (const employeeId of data.employeeIds) {
      const result = await assignShiftToEmployee({
        employeeId,
        shiftScheduleId: data.shiftScheduleId,
        effectiveDate: data.effectiveDate,
        endDate: data.endDate
      })
      results.push(result)
    }

    return results
  }

  /**
   * 更新員工班表指派
   */
  const updateEmployeeShift = async (shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }) => {
    const result = await directus.request(
      updateItem('employee_shifts', shiftId, {
        effective_date: data.effectiveDate,
        end_date: data.endDate
      })
    )
    return result as EmployeeShift
  }

  /**
   * 移除員工班表指派（結束日期設為昨天）
   */
  const removeEmployeeShift = async (shiftId: string) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const result = await directus.request(
      updateItem('employee_shifts', shiftId, {
        end_date: yesterday.toISOString().split('T')[0]
      })
    )
    return result as EmployeeShift
  }

  /**
   * 取得分店員工列表（用於排班選擇）
   */
  const fetchBranchEmployees = async (branchId: string) => {
    const data = await directus.request(
      readItems('employees', {
        filter: {
          branch_id: { _eq: branchId },
          employment_status: { _eq: 'ACTIVE' },
          status: { _eq: 'active' }
        },
        fields: ['id', 'full_name', 'employee_code', 'job_title.name'] as any,
        sort: ['full_name']
      })
    )
    return data as Employee[]
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
