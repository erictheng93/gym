/**
 * 考勤類型定義
 */

/**
 * 考勤狀態
 */
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'ON_LEAVE'

/**
 * 打卡類型
 */
export type CheckType = 'NORMAL' | 'OVERTIME' | 'MAKEUP' | 'MANUAL'

/**
 * 考勤記錄
 */
export interface IAttendanceRecord {
  id: string
  employeeId: string
  branchId: string | null
  attendanceDate: string
  checkIn: string | null
  checkOut: string | null
  checkType: CheckType
  attendanceStatus: AttendanceStatus
  lateMinutes: number
  earlyLeaveMinutes: number
  workHours: number | null
  overtimeHours: number | null
  notes: string | null
}

/**
 * 班表設定
 */
export interface IShiftSchedule {
  id: string
  branchId: string
  name: string
  startTime: string // HH:mm:ss
  endTime: string   // HH:mm:ss
  breakStart: string | null
  breakEnd: string | null
  gracePeriodMinutes: number
  earlyLeaveMinutes: number
  isDefault: boolean
}

/**
 * 打卡選項
 */
export interface ICheckInOptions {
  employeeId: string
  branchId?: string
  checkType?: CheckType
  checkInTime?: Date
  notes?: string
}

/**
 * 簽退選項
 */
export interface ICheckOutOptions {
  attendanceId: string
  checkOutTime?: Date
  notes?: string
}

/**
 * 工時計算結果
 */
export interface IWorkHoursResult {
  workHours: number
  overtimeHours: number
  attendanceStatus: AttendanceStatus
}

/**
 * 遲到計算結果
 */
export interface ILateCheckResult {
  isLate: boolean
  lateMinutes: number
  attendanceStatus: AttendanceStatus
}
