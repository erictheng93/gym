/**
 * 休假類型定義
 */

/**
 * 休假類型
 */
export type LeaveType =
  | 'ANNUAL'           // 年假
  | 'SICK'             // 病假
  | 'PERSONAL'         // 事假
  | 'MATERNITY'        // 產假
  | 'PATERNITY'        // 陪產假
  | 'BEREAVEMENT'      // 喪假
  | 'MARRIAGE'         // 婚假
  | 'COMPENSATORY'     // 補休
  | 'UNPAID'           // 無薪假
  | 'OTHER'            // 其他

/**
 * 休假申請狀態
 */
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/**
 * 半天類型
 */
export type HalfDayType = 'MORNING' | 'AFTERNOON'

/**
 * 審核動作
 */
export type ApprovalAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REVOKE'

/**
 * 休假申請
 */
export interface ILeaveRequest {
  id: string
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  daysRequested: number
  reason: string | null
  leaveStatus: LeaveStatus
  isHalfDay: boolean
  halfDayType: HalfDayType | null
  approverId: string | null
  approvedAt: string | null
  approvalNotes: string | null
  submittedAt: string | null
}

/**
 * 休假餘額
 */
export interface ILeaveBalance {
  id: string
  employeeId: string
  leaveType: LeaveType
  year: number
  totalDays: number
  usedDays: number
  pendingDays: number
  carryOverDays: number
  expiryDate: string | null
}

/**
 * 審核歷史
 */
export interface ILeaveApprovalLog {
  id: string
  leaveRequestId: string
  actionBy: string
  action: ApprovalAction
  previousStatus: string | null
  newStatus: string | null
  notes: string | null
  createdAt: string
}

/**
 * 休假申請參數
 */
export interface IApplyLeaveParams {
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason?: string
  isHalfDay?: boolean
  halfDayType?: HalfDayType
}

/**
 * 審核休假參數
 */
export interface IReviewLeaveParams {
  leaveRequestId: string
  approverId: string
  action: 'APPROVE' | 'REJECT'
  notes?: string
}

/**
 * 休假驗證結果
 */
export interface ILeaveValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  daysRequested: number
}

/**
 * 餘額更新參數
 */
export interface IBalanceUpdateParams {
  employeeId: string
  leaveType: LeaveType
  year: number
  pendingDelta: number
  usedDelta: number
}
