/**
 * 考勤驗證器
 */

import type { IAttendanceRecord, CheckType } from '../types'

/**
 * 驗證打卡結果
 */
export interface ICheckValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 驗證上班打卡
 */
export function validateCheckIn(
  employeeId: string,
  existingAttendance: IAttendanceRecord | null,
  checkType: CheckType = 'NORMAL'
): ICheckValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 檢查是否已打卡
  if (existingAttendance?.checkIn && checkType === 'NORMAL') {
    errors.push('今日已有上班打卡記錄')
  }

  // 加班打卡驗證
  if (checkType === 'OVERTIME') {
    if (!existingAttendance?.checkOut) {
      warnings.push('尚未完成正常下班打卡')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 驗證下班打卡
 */
export function validateCheckOut(
  attendance: IAttendanceRecord | null
): ICheckValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!attendance) {
    errors.push('找不到今日上班打卡記錄')
    return { isValid: false, errors, warnings }
  }

  if (!attendance.checkIn) {
    errors.push('尚未上班打卡，無法簽退')
    return { isValid: false, errors, warnings }
  }

  if (attendance.checkOut) {
    errors.push('今日已有下班打卡記錄')
  }

  // 工時警告
  const checkIn = new Date(attendance.checkIn)
  const now = new Date()
  const workHours = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60)

  if (workHours < 4) {
    warnings.push('工作時間少於 4 小時')
  }

  if (workHours > 12) {
    warnings.push('工作時間超過 12 小時')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 驗證補打卡申請
 */
export function validateMakeupRequest(
  targetDate: string,
  maxDaysBack: number = 7
): ICheckValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const target = new Date(targetDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 不能補打未來的日期
  if (target > today) {
    errors.push('不能補打卡未來的日期')
  }

  // 檢查是否超過可補打卡期限
  const daysDiff = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff > maxDaysBack) {
    errors.push(`補打卡日期不能超過 ${maxDaysBack} 天`)
  }

  if (daysDiff >= 5) {
    warnings.push('補打卡日期較久，可能需要更多審核')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 判斷是否為工作日
 */
export function isWorkDay(
  date: Date,
  applicableDays: number[] = [1, 2, 3, 4, 5] // 預設週一到週五
): boolean {
  const dayOfWeek = date.getDay()
  return applicableDays.includes(dayOfWeek)
}
