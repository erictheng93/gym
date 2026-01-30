/**
 * HR 模組休假類型定義
 */

import type { IEmployee } from './employee'

/**
 * 休假類型
 */
export type LeaveType = 'SICK' | 'ANNUAL' | 'PERSONAL' | 'MATERNITY' | 'BEREAVEMENT' | 'OTHER'

/**
 * 休假申請狀態
 */
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/**
 * 半天類型
 */
export type HalfDayType = 'AM' | 'PM'

/**
 * 審核動作
 */
export type LeaveApprovalAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REVOKE'

/**
 * 休假申請接口
 */
export interface ILeaveRequest {
  /** 申請 ID */
  id: string
  /** 員工 ID */
  employeeId: string
  /** 休假類型 */
  leaveType: LeaveType
  /** 開始日期 (YYYY-MM-DD) */
  startDate: string
  /** 結束日期 (YYYY-MM-DD) */
  endDate: string
  /** 申請狀態 */
  leaveStatus: LeaveStatus
  /** 審核人 ID */
  approverId: string | null
  /** 請假原因 */
  reason: string | null
  /** 請假時數 */
  hoursRequested: number | null
  /** 請假天數 */
  daysRequested: number | null
  /** 提交時間 */
  submittedAt: string | null
  /** 審核時間 */
  approvedAt: string | null
  /** 審核備註 */
  approvalNotes: string | null
  /** 證明文件 URL */
  documentUrl: string | null
  /** 是否半天假 */
  isHalfDay: boolean
  /** 半天類型 */
  halfDayType: HalfDayType | null
  /** 建立時間 */
  dateCreated: string
  /** 更新時間 */
  dateUpdated: string | null
}

/**
 * 包含關聯的休假申請
 */
export interface ILeaveRequestWithRelations extends ILeaveRequest {
  /** 員工資訊 */
  employee?: IEmployee
  /** 審核人資訊 */
  approver?: IEmployee
}

/**
 * 休假餘額接口
 */
export interface ILeaveBalance {
  /** 記錄 ID */
  id: string
  /** 員工 ID */
  employeeId: string
  /** 休假類型 */
  leaveType: LeaveType
  /** 年度 */
  year: number
  /** 總天數 */
  totalDays: number
  /** 已使用天數 */
  usedDays: number
  /** 待審核天數 */
  pendingDays: number
  /** 上年結轉天數 */
  carriedOverDays: number
  /** 過期日期 */
  expiresAt: string | null
}

/**
 * 休假餘額摘要
 */
export interface ILeaveBalanceSummary {
  /** 休假類型 */
  leaveType: LeaveType
  /** 休假類型名稱 */
  leaveTypeName: string
  /** 總天數 */
  totalDays: number
  /** 可用天數 */
  availableDays: number
  /** 已使用天數 */
  usedDays: number
  /** 待審核天數 */
  pendingDays: number
}

/**
 * 休假審核歷程
 */
export interface ILeaveApprovalLog {
  /** 記錄 ID */
  id: string
  /** 休假申請 ID */
  leaveRequestId: string
  /** 執行人 ID */
  actionBy: string
  /** 執行動作 */
  action: LeaveApprovalAction
  /** 前一狀態 */
  previousStatus: string | null
  /** 新狀態 */
  newStatus: string | null
  /** 備註 */
  notes: string | null
  /** 建立時間 */
  dateCreated: string
}

/**
 * 包含關聯的審核歷程
 */
export interface ILeaveApprovalLogWithRelations extends ILeaveApprovalLog {
  /** 執行人資訊 */
  actor?: IEmployee
}

/**
 * 休假申請參數
 */
export interface IApplyLeaveParams {
  /** 員工 ID */
  employeeId: string
  /** 休假類型 */
  leaveType: LeaveType
  /** 開始日期 */
  startDate: string
  /** 結束日期 */
  endDate: string
  /** 原因 */
  reason?: string
  /** 請假天數 */
  daysRequested: number
  /** 是否半天假 */
  isHalfDay?: boolean
  /** 半天類型 */
  halfDayType?: HalfDayType
}

/**
 * 休假審核參數
 */
export interface IReviewLeaveParams {
  /** 休假申請 ID */
  leaveRequestId: string
  /** 審核人 ID */
  approverId: string
  /** 審核動作 */
  action: 'APPROVE' | 'REJECT'
  /** 備註 */
  notes?: string
}
