/**
 * 休假數據適配器接口
 */

import type {
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  IApplyLeaveParams,
  IReviewLeaveParams,
  LeaveType
} from '../types/leave'

/**
 * 休假查詢選項
 */
export interface ILeaveQueryOptions {
  /** 員工 ID */
  employeeId?: string
  /** 申請狀態 */
  status?: string
  /** 休假類型 */
  leaveType?: LeaveType
  /** 開始日期範圍起始 */
  startDateFrom?: string
  /** 開始日期範圍結束 */
  startDateTo?: string
  /** 頁碼 */
  page?: number
  /** 每頁數量 */
  limit?: number
}

/**
 * 休假適配器接口
 */
export interface ILeaveAdapter {
  // ====== 休假申請 ======

  /**
   * 根據 ID 取得休假申請
   */
  getById(id: string): Promise<ILeaveRequest | null>

  /**
   * 根據 ID 取得休假申請（包含關聯）
   */
  getByIdWithRelations(id: string): Promise<ILeaveRequestWithRelations | null>

  /**
   * 查詢休假申請
   */
  query(options: ILeaveQueryOptions): Promise<{
    data: ILeaveRequestWithRelations[]
    total: number
  }>

  /**
   * 取得待審核的休假申請
   * @param supervisorId 主管 ID
   */
  getPendingApprovals(supervisorId: string): Promise<ILeaveRequestWithRelations[]>

  /**
   * 申請休假
   */
  apply(params: IApplyLeaveParams): Promise<ILeaveRequest>

  /**
   * 審核休假
   */
  review(params: IReviewLeaveParams): Promise<ILeaveRequest>

  /**
   * 取消休假申請
   */
  cancel(leaveRequestId: string, employeeId: string): Promise<ILeaveRequest>

  // ====== 休假餘額 ======

  /**
   * 取得員工休假餘額
   */
  getBalances(employeeId: string, year?: number): Promise<ILeaveBalance[]>

  /**
   * 取得特定類型的休假餘額
   */
  getBalance(
    employeeId: string,
    leaveType: LeaveType,
    year?: number
  ): Promise<ILeaveBalance | null>

  /**
   * 更新休假餘額
   */
  updateBalance(
    balanceId: string,
    data: Partial<Pick<ILeaveBalance, 'usedDays' | 'pendingDays'>>
  ): Promise<ILeaveBalance>

  // ====== 審核歷程 ======

  /**
   * 取得休假審核歷程
   */
  getApprovalHistory(leaveRequestId: string): Promise<ILeaveApprovalLog[]>
}
