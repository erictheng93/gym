/**
 * HR 模組補打卡類型定義
 */

import type { IEmployee } from './employee'

/**
 * 補打卡類型
 */
export type MakeupType = 'CHECK_IN' | 'CHECK_OUT' | 'BOTH'

/**
 * 補打卡申請狀態
 */
export type MakeupStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/**
 * 補打卡審核動作
 */
export type MakeupApprovalAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL'

/**
 * 補打卡申請接口
 */
export interface IMakeupRequest {
  /** 申請 ID */
  id: string
  /** 員工 ID */
  employeeId: string
  /** 分店 ID */
  branchId: string
  /** 目標日期 (YYYY-MM-DD) */
  targetDate: string
  /** 補打卡類型 */
  makeupType: MakeupType
  /** 申請的上班打卡時間 (HH:mm:ss) */
  requestedCheckIn: string | null
  /** 申請的下班打卡時間 (HH:mm:ss) */
  requestedCheckOut: string | null
  /** 原因 */
  reason: string
  /** 證明文件 URL */
  documentUrl: string | null
  /** 申請狀態 */
  requestStatus: MakeupStatus
  /** 審核人 ID */
  approverId: string | null
  /** 審核時間 */
  approvedAt: string | null
  /** 審核備註 */
  approvalNotes: string | null
  /** 提交時間 */
  submittedAt: string | null
  /** 建立時間 */
  dateCreated: string
  /** 更新時間 */
  dateUpdated: string | null
}

/**
 * 包含關聯的補打卡申請
 */
export interface IMakeupRequestWithRelations extends IMakeupRequest {
  /** 員工資訊 */
  employee?: IEmployee
  /** 審核人資訊 */
  approver?: IEmployee
  /** 分店名稱 */
  branchName?: string
}

/**
 * 補打卡審核歷程
 */
export interface IMakeupApprovalLog {
  /** 記錄 ID */
  id: string
  /** 補打卡申請 ID */
  makeupRequestId: string
  /** 執行人 ID */
  actionBy: string
  /** 執行動作 */
  action: MakeupApprovalAction
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
export interface IMakeupApprovalLogWithRelations extends IMakeupApprovalLog {
  /** 執行人資訊 */
  actor?: IEmployee
}

/**
 * 補打卡申請參數
 */
export interface IApplyMakeupParams {
  /** 員工 ID */
  employeeId: string
  /** 分店 ID */
  branchId: string
  /** 目標日期 */
  targetDate: string
  /** 補打卡類型 */
  makeupType: MakeupType
  /** 申請的上班時間 */
  requestedCheckIn?: string
  /** 申請的下班時間 */
  requestedCheckOut?: string
  /** 原因 */
  reason: string
}

/**
 * 補打卡審核參數
 */
export interface IReviewMakeupParams {
  /** 補打卡申請 ID */
  makeupRequestId: string
  /** 審核人 ID */
  approverId: string
  /** 審核動作 */
  action: 'APPROVE' | 'REJECT'
  /** 備註 */
  notes?: string
}
