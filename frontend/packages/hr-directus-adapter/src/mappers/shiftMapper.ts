/**
 * 班表實體映射器
 * Directus ShiftSchedule/EmployeeShift ↔ HR Types
 */

import type {
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ShiftStatus
} from '@gym-nexus/hr-core'
import { mapDirectusEmployeeToIEmployee, type DirectusEmployee } from './employeeMapper'

/**
 * Directus 班表設定類型
 */
export interface DirectusShiftSchedule {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  branch_id: string
  name: string
  start_time: string
  end_time: string
  break_start: string | null
  break_end: string | null
  grace_period_minutes: number
  early_leave_minutes: number
  overtime_start_after: string | null
  is_default: boolean
  applicable_days: string[]
  // 關聯
  branch?: { id: string; name: string } | null
}

/**
 * Directus 員工班表指派類型
 */
export interface DirectusEmployeeShift {
  id: string
  date_created: string
  employee_id: string
  shift_schedule_id: string
  effective_date: string
  end_date: string | null
  // 關聯
  employee?: DirectusEmployee | null
  shift_schedule?: DirectusShiftSchedule | null
}

/**
 * 將 Directus 班表設定轉換為 HR IShiftSchedule
 */
export function mapDirectusShiftScheduleToIShiftSchedule(
  directus: DirectusShiftSchedule
): IShiftSchedule {
  return {
    id: directus.id,
    branchId: directus.branch_id,
    name: directus.name,
    startTime: directus.start_time,
    endTime: directus.end_time,
    breakStart: directus.break_start,
    breakEnd: directus.break_end,
    gracePeriodMinutes: directus.grace_period_minutes,
    earlyLeaveMinutes: directus.early_leave_minutes,
    overtimeStartAfter: directus.overtime_start_after,
    isDefault: directus.is_default,
    applicableDays: directus.applicable_days,
    status: directus.status as ShiftStatus,
    dateCreated: directus.date_created,
    dateUpdated: directus.date_updated
  }
}

/**
 * 將 Directus 班表設定轉換為 HR IShiftScheduleWithBranch
 */
export function mapDirectusShiftScheduleToIShiftScheduleWithBranch(
  directus: DirectusShiftSchedule
): IShiftScheduleWithBranch {
  const base = mapDirectusShiftScheduleToIShiftSchedule(directus)

  return {
    ...base,
    branchName: directus.branch?.name
  }
}

/**
 * 將 HR IShiftSchedule 轉換為 Directus 格式
 */
export function mapIShiftScheduleToDirectus(
  schedule: Partial<IShiftSchedule>
): Partial<DirectusShiftSchedule> {
  const result: Partial<DirectusShiftSchedule> = {}

  if (schedule.branchId !== undefined) result.branch_id = schedule.branchId
  if (schedule.name !== undefined) result.name = schedule.name
  if (schedule.startTime !== undefined) result.start_time = schedule.startTime
  if (schedule.endTime !== undefined) result.end_time = schedule.endTime
  if (schedule.breakStart !== undefined) result.break_start = schedule.breakStart
  if (schedule.breakEnd !== undefined) result.break_end = schedule.breakEnd
  if (schedule.gracePeriodMinutes !== undefined) result.grace_period_minutes = schedule.gracePeriodMinutes
  if (schedule.earlyLeaveMinutes !== undefined) result.early_leave_minutes = schedule.earlyLeaveMinutes
  if (schedule.overtimeStartAfter !== undefined) result.overtime_start_after = schedule.overtimeStartAfter
  if (schedule.isDefault !== undefined) result.is_default = schedule.isDefault
  if (schedule.applicableDays !== undefined) result.applicable_days = schedule.applicableDays
  if (schedule.status !== undefined) result.status = schedule.status

  return result
}

/**
 * 將 Directus 員工班表指派轉換為 HR IEmployeeShift
 */
export function mapDirectusEmployeeShiftToIEmployeeShift(
  directus: DirectusEmployeeShift
): IEmployeeShift {
  return {
    id: directus.id,
    employeeId: directus.employee_id,
    shiftScheduleId: directus.shift_schedule_id,
    effectiveDate: directus.effective_date,
    endDate: directus.end_date,
    dateCreated: directus.date_created
  }
}

/**
 * 將 Directus 員工班表指派轉換為 HR IEmployeeShiftWithRelations
 */
export function mapDirectusEmployeeShiftToIEmployeeShiftWithRelations(
  directus: DirectusEmployeeShift
): IEmployeeShiftWithRelations {
  const base = mapDirectusEmployeeShiftToIEmployeeShift(directus)

  return {
    ...base,
    employee: directus.employee
      ? mapDirectusEmployeeToIEmployee(directus.employee)
      : undefined,
    shiftSchedule: directus.shift_schedule
      ? mapDirectusShiftScheduleToIShiftSchedule(directus.shift_schedule)
      : undefined
  }
}

/**
 * 將 HR IEmployeeShift 轉換為 Directus 格式
 */
export function mapIEmployeeShiftToDirectus(
  shift: Partial<IEmployeeShift>
): Partial<DirectusEmployeeShift> {
  const result: Partial<DirectusEmployeeShift> = {}

  if (shift.employeeId !== undefined) result.employee_id = shift.employeeId
  if (shift.shiftScheduleId !== undefined) result.shift_schedule_id = shift.shiftScheduleId
  if (shift.effectiveDate !== undefined) result.effective_date = shift.effectiveDate
  if (shift.endDate !== undefined) result.end_date = shift.endDate

  return result
}
