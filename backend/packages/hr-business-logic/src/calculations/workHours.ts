/**
 * 工時計算函數
 */

import type { AttendanceStatus, IWorkHoursResult, IShiftSchedule } from '../types'

/**
 * 預設配置
 */
export const DEFAULT_BREAK_MINUTES = 60
export const DEFAULT_STANDARD_HOURS = 8

/**
 * 計算工時 (小時)
 *
 * @param checkIn 上班打卡時間
 * @param checkOut 下班打卡時間
 * @param breakMinutes 休息時間 (分鐘)
 * @returns 工作時數
 */
export function calculateWorkHours(
  checkIn: string | Date,
  checkOut: string | Date,
  breakMinutes: number = DEFAULT_BREAK_MINUTES
): number {
  if (!checkIn || !checkOut) return 0

  const inTime = typeof checkIn === 'string' ? new Date(checkIn) : checkIn
  const outTime = typeof checkOut === 'string' ? new Date(checkOut) : checkOut

  const diffMs = outTime.getTime() - inTime.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // 扣除休息時間
  const workHours = diffHours - (breakMinutes / 60)
  return Math.max(0, Math.round(workHours * 100) / 100)
}

/**
 * 計算加班時數
 *
 * @param workHours 實際工作時數
 * @param standardHours 標準工時
 * @returns 加班時數
 */
export function calculateOvertimeHours(
  workHours: number,
  standardHours: number = DEFAULT_STANDARD_HOURS
): number {
  return Math.max(0, Math.round((workHours - standardHours) * 100) / 100)
}

/**
 * 根據班表計算工時
 *
 * @param checkIn 上班打卡時間
 * @param checkOut 下班打卡時間
 * @param shift 班表設定
 * @param lateMinutes 遲到分鐘數
 * @returns 工時計算結果
 */
export function calculateWorkHoursWithShift(
  checkIn: string | Date,
  checkOut: string | Date,
  shift: IShiftSchedule | null,
  lateMinutes: number = 0
): IWorkHoursResult {
  // 計算休息時間
  let breakMinutes = DEFAULT_BREAK_MINUTES
  if (shift?.breakStart && shift?.breakEnd) {
    const [bsHours, bsMinutes] = shift.breakStart.split(':').map(Number)
    const [beHours, beMinutes] = shift.breakEnd.split(':').map(Number)
    breakMinutes = (beHours * 60 + beMinutes) - (bsHours * 60 + bsMinutes)
  }

  const workHours = calculateWorkHours(checkIn, checkOut, breakMinutes)
  const overtimeHours = calculateOvertimeHours(workHours)

  // 決定出勤狀態
  let attendanceStatus: AttendanceStatus = 'PRESENT'
  if (lateMinutes > 0) {
    attendanceStatus = 'LATE'
  }

  return {
    workHours,
    overtimeHours,
    attendanceStatus
  }
}

/**
 * 從時間字符串解析小時和分鐘
 *
 * @param timeStr 時間字符串 (HH:mm:ss 或 HH:mm)
 * @returns { hours, minutes }
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':')
  return {
    hours: parseInt(parts[0] || '0', 10),
    minutes: parseInt(parts[1] || '0', 10)
  }
}

/**
 * 格式化分鐘數為時間字符串
 *
 * @param totalMinutes 總分鐘數
 * @returns HH:mm 格式字符串
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}
