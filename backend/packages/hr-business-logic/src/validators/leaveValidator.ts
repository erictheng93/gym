/**
 * 休假申請驗證器
 */

import type {
  ILeaveRequest,
  ILeaveBalance,
  LeaveType,
  ILeaveValidationResult,
  IApplyLeaveParams
} from '../types'
import {
  calculateLeaveDays,
  calculateAvailableDays,
  getLeaveTypeLimit,
  getLeaveTypeName
} from '../calculations'

/**
 * 驗證休假申請參數
 */
export function validateLeaveRequest(
  params: IApplyLeaveParams,
  balance: ILeaveBalance | null,
  existingRequests: ILeaveRequest[] = []
): ILeaveValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. 驗證日期
  const startDate = new Date(params.startDate)
  const endDate = new Date(params.endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (startDate > endDate) {
    errors.push('開始日期不能晚於結束日期')
  }

  if (startDate < today) {
    errors.push('不能申請過去的日期')
  }

  // 2. 計算請假天數
  const daysRequested = calculateLeaveDays(
    params.startDate,
    params.endDate,
    params.isHalfDay
  )

  // 3. 驗證餘額
  if (balance) {
    const available = calculateAvailableDays(balance)
    if (daysRequested > available) {
      errors.push(`${getLeaveTypeName(params.leaveType)}餘額不足，可用天數: ${available}，申請天數: ${daysRequested}`)
    }
  } else {
    // 某些假別不需要餘額（如無薪假）
    const requiresBalance = ['ANNUAL', 'COMPENSATORY'].includes(params.leaveType)
    if (requiresBalance) {
      errors.push(`尚未設定${getLeaveTypeName(params.leaveType)}餘額`)
    }
  }

  // 4. 驗證年度上限
  const yearlyLimit = getLeaveTypeLimit(params.leaveType)
  if (yearlyLimit !== null && balance) {
    const totalUsed = balance.usedDays + balance.pendingDays + daysRequested
    if (totalUsed > yearlyLimit) {
      errors.push(`${getLeaveTypeName(params.leaveType)}已超過年度上限 ${yearlyLimit} 天`)
    }
  }

  // 5. 檢查日期重疊
  const hasOverlap = existingRequests.some(req => {
    if (req.leaveStatus === 'CANCELLED' || req.leaveStatus === 'REJECTED') {
      return false
    }
    const reqStart = new Date(req.startDate)
    const reqEnd = new Date(req.endDate)
    return !(endDate < reqStart || startDate > reqEnd)
  })

  if (hasOverlap) {
    errors.push('申請日期與現有休假申請重疊')
  }

  // 6. 提醒
  if (daysRequested >= 5) {
    warnings.push('申請超過 5 天，可能需要更長的審核時間')
  }

  const advanceDays = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (advanceDays <= 1 && params.leaveType === 'ANNUAL') {
    warnings.push('年假建議提前至少 3 天申請')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    daysRequested
  }
}

/**
 * 驗證審核權限
 */
export function validateApprovalPermission(
  approverId: string,
  applicantId: string,
  supervisorChain: string[],
  isAdmin: boolean
): { canApprove: boolean; reason?: string } {
  // 不能審核自己的申請
  if (approverId === applicantId) {
    return { canApprove: false, reason: '不能審核自己的休假申請' }
  }

  // 管理員可以審核所有人
  if (isAdmin) {
    return { canApprove: true }
  }

  // 檢查是否為上級
  if (supervisorChain.includes(approverId)) {
    return { canApprove: true }
  }

  return { canApprove: false, reason: '您不是該員工的上級，無法審核此休假申請' }
}

/**
 * 驗證休假申請狀態是否可以進行審核
 */
export function canReviewLeaveRequest(
  currentStatus: string,
  targetAction: 'APPROVE' | 'REJECT'
): { canReview: boolean; reason?: string } {
  if (currentStatus !== 'PENDING') {
    return {
      canReview: false,
      reason: `休假申請不是待審核狀態 (當前狀態: ${currentStatus})，無法審核`
    }
  }
  return { canReview: true }
}

/**
 * 驗證休假申請狀態是否可以取消
 */
export function canCancelLeaveRequest(
  currentStatus: string,
  requesterId: string,
  applicantId: string
): { canCancel: boolean; reason?: string } {
  // 只有申請者本人可以取消
  if (requesterId !== applicantId) {
    return { canCancel: false, reason: '只有申請者本人可以取消休假申請' }
  }

  // 只有待審核或已核准的申請可以取消
  if (!['PENDING', 'APPROVED'].includes(currentStatus)) {
    return {
      canCancel: false,
      reason: `無法取消狀態為 ${currentStatus} 的休假申請`
    }
  }

  return { canCancel: true }
}
