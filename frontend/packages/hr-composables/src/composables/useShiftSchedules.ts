/**
 * useShiftSchedules - 班表管理 composable
 * 使用適配器模式，與具體後端實現解耦
 */

import { ref, type Ref } from 'vue'
import type {
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  IEmployee
} from '@gym-nexus/hr-core'
import { useHRContext } from '../context/useHRContext'

/**
 * useShiftSchedules 返回值類型
 */
export interface UseShiftSchedulesReturn {
  // State
  shiftSchedules: Ref<IShiftScheduleWithBranch[]>
  isShiftLoading: Ref<boolean>
  employeeShifts: Ref<IEmployeeShiftWithRelations[]>
  isEmployeeShiftLoading: Ref<boolean>

  // Shift Schedules CRUD
  fetchShiftSchedules: (branchId?: string) => Promise<void>
  getShiftSchedule: (id: string) => Promise<IShiftScheduleWithBranch | null>
  createShiftSchedule: (shift: {
    branchId: string
    name: string
    startTime: string
    endTime: string
    breakStart?: string
    breakEnd?: string
    gracePeriodMinutes?: number
    earlyLeaveMinutes?: number
    overtimeStartAfter?: string
    isDefault?: boolean
    applicableDays?: string[]
  }) => Promise<IShiftSchedule>
  updateShiftSchedule: (id: string, shift: Partial<IShiftSchedule>) => Promise<IShiftSchedule>
  deleteShiftSchedule: (id: string) => Promise<void>

  // Employee Shifts
  fetchEmployeeShifts: (options?: {
    employeeId?: string
    shiftScheduleId?: string
    branchId?: string
    activeOnly?: boolean
  }) => Promise<void>
  fetchShiftEmployees: (shiftScheduleId: string) => Promise<IEmployeeShiftWithRelations[]>
  getEmployeeCurrentShift: (employeeId: string) => Promise<IEmployeeShiftWithRelations | null>
  assignShiftToEmployee: (data: {
    employeeId: string
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => Promise<IEmployeeShift>
  batchAssignShift: (data: {
    employeeIds: string[]
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => Promise<IEmployeeShift[]>
  updateEmployeeShift: (shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }) => Promise<IEmployeeShift>
  removeEmployeeShift: (shiftId: string) => Promise<IEmployeeShift>

  // Helper
  fetchBranchEmployees: (branchId: string) => Promise<IEmployee[]>
}

/**
 * 班表管理 composable
 */
export function useShiftSchedules(): UseShiftSchedulesReturn {
  const { shiftAdapter } = useHRContext()

  // ============================================
  // 狀態
  // ============================================

  const shiftSchedules = ref<IShiftScheduleWithBranch[]>([])
  const isShiftLoading = ref(false)
  const employeeShifts = ref<IEmployeeShiftWithRelations[]>([])
  const isEmployeeShiftLoading = ref(false)

  // ============================================
  // 班表 CRUD
  // ============================================

  /**
   * 取得班表列表
   */
  async function fetchShiftSchedules(branchId?: string): Promise<void> {
    isShiftLoading.value = true
    try {
      const data = await shiftAdapter.getAll({ branchId })
      shiftSchedules.value = data
    } catch (error) {
      console.error('Failed to fetch shift schedules:', error)
    } finally {
      isShiftLoading.value = false
    }
  }

  /**
   * 取得單一班表
   */
  async function getShiftSchedule(id: string): Promise<IShiftScheduleWithBranch | null> {
    try {
      return await shiftAdapter.getByIdWithBranch(id)
    } catch (error) {
      console.error('Failed to get shift schedule:', error)
      return null
    }
  }

  /**
   * 建立班表
   */
  async function createShiftSchedule(shift: {
    branchId: string
    name: string
    startTime: string
    endTime: string
    breakStart?: string
    breakEnd?: string
    gracePeriodMinutes?: number
    earlyLeaveMinutes?: number
    overtimeStartAfter?: string
    isDefault?: boolean
    applicableDays?: string[]
  }): Promise<IShiftSchedule> {
    const result = await shiftAdapter.create(shift)
    return result
  }

  /**
   * 更新班表
   */
  async function updateShiftSchedule(id: string, shift: Partial<IShiftSchedule>): Promise<IShiftSchedule> {
    const result = await shiftAdapter.update(id, shift)
    return result
  }

  /**
   * 刪除班表（軟刪除）
   */
  async function deleteShiftSchedule(id: string): Promise<void> {
    await shiftAdapter.delete(id)
  }

  // ============================================
  // 員工排班
  // ============================================

  /**
   * 取得員工班表指派
   */
  async function fetchEmployeeShifts(options?: {
    employeeId?: string
    shiftScheduleId?: string
    branchId?: string
    activeOnly?: boolean
  }): Promise<void> {
    isEmployeeShiftLoading.value = true
    try {
      const data = await shiftAdapter.getEmployeeShifts({
        employeeId: options?.employeeId,
        shiftScheduleId: options?.shiftScheduleId,
        branchId: options?.branchId,
        activeOnly: options?.activeOnly ?? true
      })
      employeeShifts.value = data
    } catch (error) {
      console.error('Failed to fetch employee shifts:', error)
    } finally {
      isEmployeeShiftLoading.value = false
    }
  }

  /**
   * 取得班表的指派員工
   */
  async function fetchShiftEmployees(shiftScheduleId: string): Promise<IEmployeeShiftWithRelations[]> {
    try {
      return await shiftAdapter.getShiftEmployees(shiftScheduleId)
    } catch (error) {
      console.error('Failed to fetch shift employees:', error)
      return []
    }
  }

  /**
   * 取得員工的當前班表
   */
  async function getEmployeeCurrentShift(employeeId: string): Promise<IEmployeeShiftWithRelations | null> {
    try {
      return await shiftAdapter.getEmployeeCurrentShift(employeeId)
    } catch (error) {
      console.error('Failed to get employee current shift:', error)
      return null
    }
  }

  /**
   * 指派班表給員工
   */
  async function assignShiftToEmployee(data: {
    employeeId: string
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }): Promise<IEmployeeShift> {
    const result = await shiftAdapter.assignToEmployee(data)
    return result
  }

  /**
   * 批量指派班表給多個員工
   */
  async function batchAssignShift(data: {
    employeeIds: string[]
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }): Promise<IEmployeeShift[]> {
    const results = await shiftAdapter.batchAssign(data)
    return results
  }

  /**
   * 更新員工班表指派
   */
  async function updateEmployeeShift(shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }): Promise<IEmployeeShift> {
    const result = await shiftAdapter.updateEmployeeShift(shiftId, data)
    return result
  }

  /**
   * 移除員工班表指派（結束日期設為昨天）
   */
  async function removeEmployeeShift(shiftId: string): Promise<IEmployeeShift> {
    const result = await shiftAdapter.removeEmployeeShift(shiftId)
    return result
  }

  /**
   * 取得分店員工列表（用於排班選擇）
   */
  async function fetchBranchEmployees(branchId: string): Promise<IEmployee[]> {
    try {
      return await shiftAdapter.getBranchEmployees(branchId)
    } catch (error) {
      console.error('Failed to fetch branch employees:', error)
      return []
    }
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
