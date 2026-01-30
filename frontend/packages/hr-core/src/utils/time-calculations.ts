/**
 * 時間計算工具函數
 * 純函數，無外部依賴
 */

import type { IWorkTimePolicy } from '../interfaces/IHRPolicyProvider'
import type { AttendanceStatus } from '../types/attendance'

/**
 * 時間解析結果
 */
export interface ParsedTime {
  hour: number
  minute: number
  second: number
  totalMinutes: number
}

/**
 * 解析時間字串為小時和分鐘
 * @param timeStr 時間字串 (HH:mm:ss 或 HH:mm 或 ISO 8601)
 */
export function parseTime(timeStr: string): ParsedTime {
  let hour = 0
  let minute = 0
  let second = 0

  if (timeStr.includes('T')) {
    // ISO 8601 format
    const date = new Date(timeStr)
    hour = date.getHours()
    minute = date.getMinutes()
    second = date.getSeconds()
  } else {
    // HH:mm:ss or HH:mm format
    const parts = timeStr.split(':').map(Number)
    hour = parts[0] || 0
    minute = parts[1] || 0
    second = parts[2] || 0
  }

  return {
    hour,
    minute,
    second,
    totalMinutes: hour * 60 + minute
  }
}

/**
 * 格式化分鐘數為 HH:mm 格式
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * 計算遲到分鐘數
 * @param checkInTime 實際打卡時間
 * @param standardStartHour 標準上班小時
 * @param standardStartMinute 標準上班分鐘
 * @param gracePeriodMinutes 寬限分鐘數
 */
export function calculateLateMinutes(
  checkInTime: Date | string,
  standardStartHour: number = 9,
  standardStartMinute: number = 0,
  gracePeriodMinutes: number = 0
): number {
  const checkIn = typeof checkInTime === 'string' ? new Date(checkInTime) : checkInTime

  const checkInHour = checkIn.getHours()
  const checkInMinute = checkIn.getMinutes()

  const standardMinutes = standardStartHour * 60 + standardStartMinute + gracePeriodMinutes
  const actualMinutes = checkInHour * 60 + checkInMinute

  const lateMinutes = actualMinutes - standardMinutes
  return lateMinutes > 0 ? lateMinutes : 0
}

/**
 * 使用政策配置計算遲到分鐘數
 */
export function calculateLateMinutesWithPolicy(
  checkInTime: Date | string,
  policy: IWorkTimePolicy
): number {
  return calculateLateMinutes(
    checkInTime,
    policy.standardStartHour,
    policy.standardStartMinute,
    policy.gracePeriodMinutes
  )
}

/**
 * 計算早退分鐘數
 * @param checkOutTime 實際下班打卡時間
 * @param standardEndHour 標準下班小時
 * @param standardEndMinute 標準下班分鐘
 * @param graceMinutes 寬限分鐘數
 */
export function calculateEarlyLeaveMinutes(
  checkOutTime: Date | string,
  standardEndHour: number = 18,
  standardEndMinute: number = 0,
  graceMinutes: number = 0
): number {
  const checkOut = typeof checkOutTime === 'string' ? new Date(checkOutTime) : checkOutTime

  const checkOutHour = checkOut.getHours()
  const checkOutMinute = checkOut.getMinutes()

  const standardMinutes = standardEndHour * 60 + standardEndMinute - graceMinutes
  const actualMinutes = checkOutHour * 60 + checkOutMinute

  const earlyMinutes = standardMinutes - actualMinutes
  return earlyMinutes > 0 ? earlyMinutes : 0
}

/**
 * 使用政策配置計算早退分鐘數
 */
export function calculateEarlyLeaveMinutesWithPolicy(
  checkOutTime: Date | string,
  policy: IWorkTimePolicy
): number {
  return calculateEarlyLeaveMinutes(
    checkOutTime,
    policy.standardEndHour,
    policy.standardEndMinute,
    policy.earlyLeaveGraceMinutes
  )
}

/**
 * 計算工作時數
 * @param checkIn 上班時間
 * @param checkOut 下班時間
 * @param breakMinutes 休息時間（分鐘）
 */
export function calculateWorkHours(
  checkIn: Date | string,
  checkOut: Date | string,
  breakMinutes: number = 0
): number {
  const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn
  const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut

  const diffMs = end.getTime() - start.getTime()
  const diffMinutes = diffMs / (1000 * 60) - breakMinutes
  const hours = diffMinutes / 60

  return Math.round(hours * 100) / 100 // Round to 2 decimal places
}

/**
 * 計算加班時數
 * @param checkOutTime 下班時間
 * @param overtimeStartAfter 加班起算時間 (HH:mm:ss)
 */
export function calculateOvertimeHours(
  checkOutTime: Date | string,
  overtimeStartAfter: string | null
): number {
  if (!overtimeStartAfter) return 0

  const checkOut = typeof checkOutTime === 'string' ? new Date(checkOutTime) : checkOutTime
  const checkOutStr = checkOut.toTimeString().slice(0, 8)

  const { totalMinutes: checkOutMinutes } = parseTime(checkOutStr)
  const { totalMinutes: overtimeMinutes } = parseTime(overtimeStartAfter)

  if (checkOutMinutes <= overtimeMinutes) return 0

  const diffMinutes = checkOutMinutes - overtimeMinutes
  return Math.round((diffMinutes / 60) * 100) / 100
}

/**
 * 計算加班時數（基於標準工時）
 * @param workHours 實際工作時數
 * @param standardWorkHours 標準工時
 */
export function calculateOvertimeFromWorkHours(
  workHours: number,
  standardWorkHours: number = 8
): number {
  const overtime = workHours - standardWorkHours
  return overtime > 0 ? Math.round(overtime * 100) / 100 : 0
}

/**
 * 判斷出勤狀態
 */
export function determineAttendanceStatus(
  lateMinutes: number,
  earlyLeaveMinutes: number,
  hasCheckOut: boolean
): AttendanceStatus {
  if (lateMinutes > 0) return 'LATE'
  if (hasCheckOut && earlyLeaveMinutes > 0) return 'EARLY_LEAVE'
  return 'PRESENT'
}

/**
 * 取得今日日期 (YYYY-MM-DD)
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0] as string
}

/**
 * 取得日期範圍
 * @param year 年份
 * @param month 月份 (1-12)
 */
export function getMonthDateRange(
  year: number,
  month: number
): { startDate: string; endDate: string } {
  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0] as string
  const endDate = new Date(year, month, 0).toISOString().split('T')[0] as string
  return { startDate, endDate }
}

/**
 * 計算兩個日期之間的天數
 */
export function daysBetween(startDate: string | Date, endDate: string | Date): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // Include both start and end dates
}

/**
 * 判斷日期是否為工作日
 * @param date 日期
 * @param applicableDays 適用的星期幾 (0-6)
 */
export function isWorkDay(date: Date | string, applicableDays: string[]): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const dayOfWeek = d.getDay().toString()
  return applicableDays.includes(dayOfWeek)
}
