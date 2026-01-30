/**
 * 休假餘額計算函數
 */

import type { ILeaveBalance, LeaveType, HalfDayType } from '../types'

/**
 * 假別中文名稱對照表
 */
export const LEAVE_TYPE_NAMES: Record<LeaveType, string> = {
  ANNUAL: '年假',
  SICK: '病假',
  PERSONAL: '事假',
  MATERNITY: '產假',
  PATERNITY: '陪產假',
  BEREAVEMENT: '喪假',
  MARRIAGE: '婚假',
  COMPENSATORY: '補休',
  UNPAID: '無薪假',
  OTHER: '其他'
}

/**
 * 獲取假別名稱
 */
export function getLeaveTypeName(leaveType: LeaveType): string {
  return LEAVE_TYPE_NAMES[leaveType] || leaveType
}

/**
 * 計算請假天數
 *
 * @param startDate 開始日期
 * @param endDate 結束日期
 * @param isHalfDay 是否為半天假
 * @returns 請假天數
 */
export function calculateLeaveDays(
  startDate: string | Date,
  endDate: string | Date,
  isHalfDay: boolean = false
): number {
  if (isHalfDay) return 0.5

  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate

  // 重設時間為 00:00:00 以正確計算天數
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

  return diffDays
}

/**
 * 計算可用餘額
 *
 * @param balance 休假餘額記錄
 * @returns 可用天數
 */
export function calculateAvailableDays(balance: ILeaveBalance): number {
  const available = balance.totalDays + balance.carryOverDays - balance.usedDays - balance.pendingDays
  return Math.max(0, available)
}

/**
 * 檢查是否有足夠餘額
 *
 * @param balance 休假餘額記錄
 * @param daysRequested 申請天數
 * @returns 是否有足夠餘額
 */
export function hasEnoughBalance(
  balance: ILeaveBalance | null,
  daysRequested: number
): boolean {
  if (!balance) return false
  return calculateAvailableDays(balance) >= daysRequested
}

/**
 * 計算餘額更新後的值
 *
 * @param balance 當前餘額
 * @param pendingDelta pending_days 變化量
 * @param usedDelta used_days 變化量
 * @returns 更新後的餘額值
 */
export function calculateBalanceUpdate(
  balance: ILeaveBalance,
  pendingDelta: number,
  usedDelta: number
): { newPendingDays: number; newUsedDays: number } {
  const newPendingDays = Math.max(0, balance.pendingDays + pendingDelta)
  const newUsedDays = Math.max(0, balance.usedDays + usedDelta)

  return {
    newPendingDays,
    newUsedDays
  }
}

/**
 * 計算年假天數 (根據年資)
 *
 * @param yearsOfService 服務年資
 * @returns 年假天數
 */
export function calculateAnnualLeaveDays(yearsOfService: number): number {
  // 台灣勞基法特休規定
  if (yearsOfService < 0.5) return 0
  if (yearsOfService < 1) return 3
  if (yearsOfService < 2) return 7
  if (yearsOfService < 3) return 10
  if (yearsOfService < 5) return 14
  if (yearsOfService < 10) return 15
  // 10年以上，每年加1天，最多30天
  return Math.min(30, 15 + Math.floor(yearsOfService - 10) + 1)
}

/**
 * 計算結轉天數
 *
 * @param remainingDays 剩餘天數
 * @param maxCarryOver 最大結轉天數
 * @returns 可結轉天數
 */
export function calculateCarryOverDays(
  remainingDays: number,
  maxCarryOver: number = 7
): number {
  return Math.min(remainingDays, maxCarryOver)
}

/**
 * 檢查餘額是否過期
 *
 * @param balance 休假餘額記錄
 * @param checkDate 檢查日期
 * @returns 是否已過期
 */
export function isBalanceExpired(
  balance: ILeaveBalance,
  checkDate: Date = new Date()
): boolean {
  if (!balance.expiryDate) return false
  const expiry = new Date(balance.expiryDate)
  return checkDate > expiry
}

/**
 * 獲取休假類型的年度限制天數
 */
export function getLeaveTypeLimit(leaveType: LeaveType): number | null {
  const limits: Partial<Record<LeaveType, number>> = {
    SICK: 30,        // 病假 30 天
    PERSONAL: 14,    // 事假 14 天
    MATERNITY: 56,   // 產假 56 天
    PATERNITY: 7,    // 陪產假 7 天
    BEREAVEMENT: 8,  // 喪假 8 天
    MARRIAGE: 8      // 婚假 8 天
  }
  return limits[leaveType] ?? null
}
