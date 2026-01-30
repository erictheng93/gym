/**
 * 遲到計算函數
 */

import type { AttendanceStatus, ILateCheckResult, IShiftSchedule } from '../types'
import { parseTimeString } from './workHours'

/**
 * 預設寬限時間 (分鐘)
 */
export const DEFAULT_GRACE_MINUTES = 10

/**
 * 計算遲到分鐘數
 *
 * @param checkIn 實際打卡時間
 * @param scheduledStart 預定上班時間
 * @param graceMinutes 寬限時間 (分鐘)
 * @returns 遲到分鐘數 (寬限時間內返回 0)
 */
export function calculateLateMinutes(
  checkIn: string | Date,
  scheduledStart: string | Date,
  graceMinutes: number = DEFAULT_GRACE_MINUTES
): number {
  if (!checkIn || !scheduledStart) return 0

  const inTime = typeof checkIn === 'string' ? new Date(checkIn) : checkIn
  const scheduled = typeof scheduledStart === 'string' ? new Date(scheduledStart) : scheduledStart

  const diffMs = inTime.getTime() - scheduled.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  // 寬限時間內不算遲到
  if (diffMinutes <= graceMinutes) return 0
  return diffMinutes - graceMinutes
}

/**
 * 計算早退分鐘數
 *
 * @param checkOut 實際打卡時間
 * @param scheduledEnd 預定下班時間
 * @param graceMinutes 寬限時間 (分鐘)
 * @returns 早退分鐘數 (寬限時間內返回 0)
 */
export function calculateEarlyLeaveMinutes(
  checkOut: string | Date,
  scheduledEnd: string | Date,
  graceMinutes: number = DEFAULT_GRACE_MINUTES
): number {
  if (!checkOut || !scheduledEnd) return 0

  const outTime = typeof checkOut === 'string' ? new Date(checkOut) : checkOut
  const scheduled = typeof scheduledEnd === 'string' ? new Date(scheduledEnd) : scheduledEnd

  const diffMs = scheduled.getTime() - outTime.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  // 寬限時間內不算早退
  if (diffMinutes <= graceMinutes) return 0
  return diffMinutes - graceMinutes
}

/**
 * 根據班表檢查打卡是否遲到
 *
 * @param checkInTime 打卡時間
 * @param shift 班表設定
 * @returns 遲到檢查結果
 */
export function checkLateWithShift(
  checkInTime: string | Date,
  shift: IShiftSchedule | null
): ILateCheckResult {
  if (!shift) {
    return {
      isLate: false,
      lateMinutes: 0,
      attendanceStatus: 'PRESENT'
    }
  }

  const checkIn = typeof checkInTime === 'string' ? new Date(checkInTime) : checkInTime

  // 建立預定上班時間
  const { hours, minutes } = parseTimeString(shift.startTime)
  const scheduledStart = new Date(checkIn)
  scheduledStart.setHours(hours, minutes, 0, 0)

  const lateMinutes = calculateLateMinutes(
    checkIn,
    scheduledStart,
    shift.gracePeriodMinutes
  )

  const isLate = lateMinutes > 0
  const attendanceStatus: AttendanceStatus = isLate ? 'LATE' : 'PRESENT'

  return {
    isLate,
    lateMinutes,
    attendanceStatus
  }
}

/**
 * 建立指定日期的預定上班時間
 *
 * @param date 日期
 * @param startTime 上班時間字符串 (HH:mm:ss)
 * @returns Date 對象
 */
export function buildScheduledStartTime(date: Date, startTime: string): Date {
  const { hours, minutes } = parseTimeString(startTime)
  const scheduled = new Date(date)
  scheduled.setHours(hours, minutes, 0, 0)
  return scheduled
}

/**
 * 建立指定日期的預定下班時間
 *
 * @param date 日期
 * @param endTime 下班時間字符串 (HH:mm:ss)
 * @returns Date 對象
 */
export function buildScheduledEndTime(date: Date, endTime: string): Date {
  const { hours, minutes } = parseTimeString(endTime)
  const scheduled = new Date(date)
  scheduled.setHours(hours, minutes, 0, 0)
  return scheduled
}
