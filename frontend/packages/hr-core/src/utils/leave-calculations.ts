/**
 * 休假計算工具函數
 * 純函數，無外部依賴
 */

import type { ILeaveBalance, ILeaveBalanceSummary, LeaveType } from '../types/leave'

/**
 * 休假類型中文名稱映射
 */
export const LEAVE_TYPE_NAMES: Record<LeaveType, string> = {
  ANNUAL: '年假',
  SICK: '病假',
  PERSONAL: '事假',
  MATERNITY: '產假',
  BEREAVEMENT: '喪假',
  OTHER: '其他'
}

/**
 * 取得休假類型名稱
 */
export function getLeaveTypeName(leaveType: LeaveType): string {
  return LEAVE_TYPE_NAMES[leaveType] || leaveType
}

/**
 * 計算可用休假天數
 * @param balance 休假餘額
 */
export function calculateAvailableDays(balance: ILeaveBalance): number {
  const available = balance.totalDays + balance.carriedOverDays - balance.usedDays - balance.pendingDays
  return Math.max(0, available)
}

/**
 * 轉換休假餘額為摘要格式
 */
export function toLeaveBalanceSummary(balance: ILeaveBalance): ILeaveBalanceSummary {
  return {
    leaveType: balance.leaveType,
    leaveTypeName: getLeaveTypeName(balance.leaveType),
    totalDays: balance.totalDays + balance.carriedOverDays,
    availableDays: calculateAvailableDays(balance),
    usedDays: balance.usedDays,
    pendingDays: balance.pendingDays
  }
}

/**
 * 計算請假天數（考慮半天假）
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @param isHalfDay 是否半天假
 */
export function calculateLeaveDays(
  startDate: string,
  endDate: string,
  isHalfDay: boolean = false
): number {
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Reset time to midnight for accurate day calculation
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const diffTime = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1

  if (isHalfDay) {
    return 0.5
  }

  return diffDays
}

/**
 * 計算工作日天數（排除週末）
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @param isHalfDay 是否半天假
 */
export function calculateWorkingDays(
  startDate: string,
  endDate: string,
  isHalfDay: boolean = false
): number {
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Reset time to midnight
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  if (isHalfDay) {
    return 0.5
  }

  let workingDays = 0
  const current = new Date(start)

  while (current <= end) {
    const dayOfWeek = current.getDay()
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++
    }
    current.setDate(current.getDate() + 1)
  }

  return workingDays
}

/**
 * 檢查休假餘額是否足夠
 * @param balance 休假餘額
 * @param requestedDays 申請天數
 */
export function hasEnoughBalance(balance: ILeaveBalance, requestedDays: number): boolean {
  const available = calculateAvailableDays(balance)
  return available >= requestedDays
}

/**
 * 檢查日期是否在有效期限內
 * @param date 檢查日期
 * @param expiresAt 過期日期
 */
export function isBalanceValid(date: string | Date, expiresAt: string | null): boolean {
  if (!expiresAt) return true

  const checkDate = typeof date === 'string' ? new Date(date) : date
  const expireDate = new Date(expiresAt)

  return checkDate <= expireDate
}

/**
 * 計算年假應得天數（基於年資）
 * @param yearsOfService 年資（年）
 * @param baseAnnualDays 基礎年假天數
 */
export function calculateAnnualLeaveDays(
  yearsOfService: number,
  baseAnnualDays: number = 15
): number {
  // 基本規則：
  // - 滿 1 年: 基礎天數
  // - 滿 2 年: 基礎 + 1
  // - 滿 3-5 年: 基礎 + 2
  // - 滿 6-10 年: 基礎 + 5
  // - 滿 10 年以上: 基礎 + 7

  if (yearsOfService < 1) return 0
  if (yearsOfService < 2) return baseAnnualDays
  if (yearsOfService < 3) return baseAnnualDays + 1
  if (yearsOfService < 6) return baseAnnualDays + 2
  if (yearsOfService < 11) return baseAnnualDays + 5
  return baseAnnualDays + 7
}

/**
 * 計算結轉天數
 * @param remainingDays 剩餘天數
 * @param maxCarryOver 最大結轉天數
 */
export function calculateCarryOverDays(
  remainingDays: number,
  maxCarryOver: number = 5
): number {
  return Math.min(Math.max(0, remainingDays), maxCarryOver)
}

/**
 * 驗證休假日期範圍
 */
export interface ILeaveValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * 驗證休假申請
 */
export function validateLeaveRequest(options: {
  startDate: string
  endDate: string
  daysRequested: number
  balance?: ILeaveBalance
  minAdvanceDays?: number
  maxDaysPerRequest?: number
}): ILeaveValidationResult {
  const errors: string[] = []
  const { startDate, endDate, daysRequested, balance, minAdvanceDays = 0, maxDaysPerRequest = 30 } = options

  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 開始日期必須在結束日期之前或相同
  if (start > end) {
    errors.push('開始日期不能晚於結束日期')
  }

  // 檢查提前申請天數
  if (minAdvanceDays > 0) {
    const minStart = new Date(today)
    minStart.setDate(minStart.getDate() + minAdvanceDays)
    if (start < minStart) {
      errors.push(`需提前 ${minAdvanceDays} 天申請`)
    }
  }

  // 不能申請過去的日期
  if (start < today) {
    errors.push('不能申請過去的日期')
  }

  // 檢查單次申請上限
  if (daysRequested > maxDaysPerRequest) {
    errors.push(`單次申請不能超過 ${maxDaysPerRequest} 天`)
  }

  // 檢查餘額
  if (balance && !hasEnoughBalance(balance, daysRequested)) {
    errors.push(`休假餘額不足，可用天數：${calculateAvailableDays(balance)} 天`)
  }

  // 檢查餘額有效期
  if (balance && !isBalanceValid(endDate, balance.expiresAt)) {
    errors.push('休假餘額已過期')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}
