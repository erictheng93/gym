/**
 * 考勤實體映射器
 * Directus Attendance ↔ HR IAttendanceRecord
 */

import type {
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  CheckType,
  AttendanceStatus
} from '@gym-nexus/hr-core'
import { mapDirectusEmployeeToIEmployee, type DirectusEmployee } from './employeeMapper'

/**
 * Directus 考勤類型（來自數據庫）
 */
export interface DirectusAttendance {
  id: string
  date_created: string
  employee_id: string
  branch_id: string | null
  attendance_date: string | null
  check_in: string | null
  check_out: string | null
  check_type: 'REGULAR' | 'OVERTIME' | 'MAKEUP' | 'EARLY'
  attendance_status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_LEAVE' | 'LEAVE' | 'HOLIDAY'
  late_minutes: number
  early_leave_minutes: number
  work_hours: number | null
  overtime_hours: number
  notes: string | null
  // 關聯
  employee?: DirectusEmployee | null
  branch?: { id: string; name: string } | null
}

/**
 * 將 Directus 考勤轉換為 HR IAttendanceRecord
 */
export function mapDirectusAttendanceToIAttendanceRecord(
  directus: DirectusAttendance
): IAttendanceRecord {
  return {
    id: directus.id,
    employeeId: directus.employee_id,
    branchId: directus.branch_id,
    attendanceDate: directus.attendance_date || '',
    checkIn: directus.check_in,
    checkOut: directus.check_out,
    checkType: directus.check_type as CheckType,
    attendanceStatus: directus.attendance_status as AttendanceStatus,
    lateMinutes: directus.late_minutes || 0,
    earlyLeaveMinutes: directus.early_leave_minutes || 0,
    workHours: directus.work_hours,
    overtimeHours: directus.overtime_hours || 0,
    notes: directus.notes,
    dateCreated: directus.date_created
  }
}

/**
 * 將 Directus 考勤轉換為 HR IAttendanceRecordWithEmployee
 */
export function mapDirectusAttendanceToIAttendanceRecordWithEmployee(
  directus: DirectusAttendance
): IAttendanceRecordWithEmployee {
  const base = mapDirectusAttendanceToIAttendanceRecord(directus)

  if (!directus.employee) {
    throw new Error('Employee relation is required for IAttendanceRecordWithEmployee')
  }

  return {
    ...base,
    employee: mapDirectusEmployeeToIEmployee(directus.employee)
  }
}

/**
 * 將 HR IAttendanceRecord 轉換為 Directus 格式
 */
export function mapIAttendanceRecordToDirectus(
  record: Partial<IAttendanceRecord>
): Partial<DirectusAttendance> {
  const result: Partial<DirectusAttendance> = {}

  if (record.employeeId !== undefined) result.employee_id = record.employeeId
  if (record.branchId !== undefined) result.branch_id = record.branchId
  if (record.attendanceDate !== undefined) result.attendance_date = record.attendanceDate
  if (record.checkIn !== undefined) result.check_in = record.checkIn
  if (record.checkOut !== undefined) result.check_out = record.checkOut
  if (record.checkType !== undefined) result.check_type = record.checkType
  if (record.attendanceStatus !== undefined) result.attendance_status = record.attendanceStatus
  if (record.lateMinutes !== undefined) result.late_minutes = record.lateMinutes
  if (record.earlyLeaveMinutes !== undefined) result.early_leave_minutes = record.earlyLeaveMinutes
  if (record.workHours !== undefined) result.work_hours = record.workHours
  if (record.overtimeHours !== undefined) result.overtime_hours = record.overtimeHours
  if (record.notes !== undefined) result.notes = record.notes

  return result
}
