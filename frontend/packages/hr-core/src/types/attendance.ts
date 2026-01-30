/**
 * HR 模組考勤類型定義
 */

import type { IEmployee } from './employee'

/**
 * 打卡類型
 */
export type CheckType = 'REGULAR' | 'OVERTIME' | 'MAKEUP' | 'EARLY'

/**
 * 出勤狀態
 */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_LEAVE' | 'LEAVE' | 'HOLIDAY'

/**
 * 考勤記錄基礎接口
 */
export interface IAttendanceRecord {
  /** 記錄 ID */
  id: string
  /** 員工 ID */
  employeeId: string
  /** 分店 ID */
  branchId: string | null
  /** 出勤日期 (YYYY-MM-DD) */
  attendanceDate: string
  /** 上班打卡時間 (ISO 8601) */
  checkIn: string | null
  /** 下班打卡時間 (ISO 8601) */
  checkOut: string | null
  /** 打卡類型 */
  checkType: CheckType
  /** 出勤狀態 */
  attendanceStatus: AttendanceStatus
  /** 遲到分鐘數 */
  lateMinutes: number
  /** 早退分鐘數 */
  earlyLeaveMinutes: number
  /** 工作時數 */
  workHours: number | null
  /** 加班時數 */
  overtimeHours: number
  /** 備註 */
  notes: string | null
  /** 建立時間 */
  dateCreated: string
}

/**
 * 包含員工關聯的考勤記錄
 */
export interface IAttendanceRecordWithEmployee extends IAttendanceRecord {
  /** 員工資訊 */
  employee: IEmployee
}

/**
 * 今日考勤概況
 */
export interface ITodayAttendanceSummary {
  /** 總員工數 */
  totalEmployees: number
  /** 已上班打卡人數 */
  checkedIn: number
  /** 未打卡人數 */
  notCheckedIn: number
  /** 已下班打卡人數 */
  checkedOut: number
  /** 遲到人數 */
  late: number
  /** 請假人數 */
  onLeave: number
}

/**
 * 月度考勤統計
 */
export interface IMonthlyAttendanceStats {
  /** 員工 ID */
  employeeId: string
  /** 員工姓名 */
  employeeName: string
  /** 員工編號 */
  employeeCode: string
  /** 總出勤天數 */
  totalDays: number
  /** 正常出勤天數 */
  presentDays: number
  /** 缺勤天數 */
  absentDays: number
  /** 遲到天數 */
  lateDays: number
  /** 早退天數 */
  earlyLeaveDays: number
  /** 請假天數 */
  leaveDays: number
  /** 總工作時數 */
  totalWorkHours: number
  /** 總加班時數 */
  totalOvertimeHours: number
  /** 總遲到分鐘數 */
  totalLateMinutes: number
}

/**
 * 打卡選項
 */
export interface ICheckInOptions {
  /** 員工 ID */
  employeeId: string
  /** 分店 ID */
  branchId?: string
  /** 打卡類型 */
  checkType?: CheckType
  /** 備註 */
  notes?: string
}

/**
 * 下班打卡選項
 */
export interface ICheckOutOptions {
  /** 考勤記錄 ID */
  attendanceId: string
  /** 備註 */
  notes?: string
}
