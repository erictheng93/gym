/**
 * 補打卡數據適配器接口
 */

import type {
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  IApplyMakeupParams,
  IReviewMakeupParams
} from '../types/makeup'

/**
 * 補打卡查詢選項
 */
export interface IMakeupQueryOptions {
  /** 員工 ID */
  employeeId?: string
  /** 申請狀態 */
  status?: string
  /** 目標日期範圍起始 */
  targetDateFrom?: string
  /** 目標日期範圍結束 */
  targetDateTo?: string
  /** 頁碼 */
  page?: number
  /** 每頁數量 */
  limit?: number
}

/**
 * 補打卡適配器接口
 */
export interface IMakeupAdapter {
  // ====== 補打卡申請 ======

  /**
   * 根據 ID 取得補打卡申請
   */
  getById(id: string): Promise<IMakeupRequest | null>

  /**
   * 根據 ID 取得補打卡申請（包含關聯）
   */
  getByIdWithRelations(id: string): Promise<IMakeupRequestWithRelations | null>

  /**
   * 查詢補打卡申請
   */
  query(options: IMakeupQueryOptions): Promise<{
    data: IMakeupRequestWithRelations[]
    total: number
  }>

  /**
   * 取得待審核的補打卡申請
   * @param supervisorId 主管 ID
   */
  getPendingApprovals(supervisorId: string): Promise<IMakeupRequestWithRelations[]>

  /**
   * 申請補打卡
   */
  apply(params: IApplyMakeupParams): Promise<IMakeupRequest>

  /**
   * 審核補打卡
   */
  review(params: IReviewMakeupParams): Promise<IMakeupRequest>

  /**
   * 取消補打卡申請
   */
  cancel(makeupRequestId: string, employeeId: string): Promise<IMakeupRequest>

  // ====== 審核歷程 ======

  /**
   * 取得補打卡審核歷程
   */
  getApprovalHistory(makeupRequestId: string): Promise<IMakeupApprovalLog[]>
}
