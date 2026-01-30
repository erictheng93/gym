/**
 * 補打卡實體映射器
 * Directus MakeupRequest ↔ HR Types
 */

import type {
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  IMakeupApprovalLogWithRelations,
  MakeupType,
  MakeupStatus,
  MakeupApprovalAction
} from '@gym-nexus/hr-core'
import { mapDirectusEmployeeToIEmployee, type DirectusEmployee } from './employeeMapper'

/**
 * Directus 補打卡申請類型
 */
export interface DirectusMakeupRequest {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  employee_id: string
  branch_id: string
  target_date: string
  makeup_type: string
  requested_check_in: string | null
  requested_check_out: string | null
  reason: string
  document_url: string | null
  request_status: string
  approver_id: string | null
  approved_at: string | null
  approval_notes: string | null
  submitted_at: string | null
  // 關聯
  employee?: DirectusEmployee | null
  branch?: { id: string; name: string } | null
  approver?: DirectusEmployee | null
}

/**
 * Directus 補打卡審核歷程類型
 */
export interface DirectusMakeupApprovalLog {
  id: string
  date_created: string
  makeup_request_id: string
  action_by: string
  action: string
  previous_status: string | null
  new_status: string | null
  notes: string | null
  // 關聯
  actor?: DirectusEmployee | null
}

/**
 * 將 Directus 補打卡申請轉換為 HR IMakeupRequest
 */
export function mapDirectusMakeupRequestToIMakeupRequest(
  directus: DirectusMakeupRequest
): IMakeupRequest {
  return {
    id: directus.id,
    employeeId: directus.employee_id,
    branchId: directus.branch_id,
    targetDate: directus.target_date,
    makeupType: directus.makeup_type as MakeupType,
    requestedCheckIn: directus.requested_check_in,
    requestedCheckOut: directus.requested_check_out,
    reason: directus.reason,
    documentUrl: directus.document_url,
    requestStatus: directus.request_status as MakeupStatus,
    approverId: directus.approver_id,
    approvedAt: directus.approved_at,
    approvalNotes: directus.approval_notes,
    submittedAt: directus.submitted_at,
    dateCreated: directus.date_created,
    dateUpdated: directus.date_updated
  }
}

/**
 * 將 Directus 補打卡申請轉換為 HR IMakeupRequestWithRelations
 */
export function mapDirectusMakeupRequestToIMakeupRequestWithRelations(
  directus: DirectusMakeupRequest
): IMakeupRequestWithRelations {
  const base = mapDirectusMakeupRequestToIMakeupRequest(directus)

  return {
    ...base,
    employee: directus.employee
      ? mapDirectusEmployeeToIEmployee(directus.employee)
      : undefined,
    approver: directus.approver
      ? mapDirectusEmployeeToIEmployee(directus.approver)
      : undefined,
    branchName: directus.branch?.name
  }
}

/**
 * 將 HR IMakeupRequest 轉換為 Directus 格式
 */
export function mapIMakeupRequestToDirectus(
  request: Partial<IMakeupRequest>
): Partial<DirectusMakeupRequest> {
  const result: Partial<DirectusMakeupRequest> = {}

  if (request.employeeId !== undefined) result.employee_id = request.employeeId
  if (request.branchId !== undefined) result.branch_id = request.branchId
  if (request.targetDate !== undefined) result.target_date = request.targetDate
  if (request.makeupType !== undefined) result.makeup_type = request.makeupType
  if (request.requestedCheckIn !== undefined) result.requested_check_in = request.requestedCheckIn
  if (request.requestedCheckOut !== undefined) result.requested_check_out = request.requestedCheckOut
  if (request.reason !== undefined) result.reason = request.reason
  if (request.documentUrl !== undefined) result.document_url = request.documentUrl
  if (request.requestStatus !== undefined) result.request_status = request.requestStatus
  if (request.approverId !== undefined) result.approver_id = request.approverId
  if (request.approvedAt !== undefined) result.approved_at = request.approvedAt
  if (request.approvalNotes !== undefined) result.approval_notes = request.approvalNotes
  if (request.submittedAt !== undefined) result.submitted_at = request.submittedAt

  return result
}

/**
 * 將 Directus 補打卡審核歷程轉換為 HR IMakeupApprovalLog
 */
export function mapDirectusMakeupApprovalLogToIMakeupApprovalLog(
  directus: DirectusMakeupApprovalLog
): IMakeupApprovalLog {
  return {
    id: directus.id,
    makeupRequestId: directus.makeup_request_id,
    actionBy: directus.action_by,
    action: directus.action as MakeupApprovalAction,
    previousStatus: directus.previous_status,
    newStatus: directus.new_status,
    notes: directus.notes,
    dateCreated: directus.date_created
  }
}

/**
 * 將 Directus 補打卡審核歷程轉換為 HR IMakeupApprovalLogWithRelations
 */
export function mapDirectusMakeupApprovalLogToIMakeupApprovalLogWithRelations(
  directus: DirectusMakeupApprovalLog
): IMakeupApprovalLogWithRelations {
  const base = mapDirectusMakeupApprovalLogToIMakeupApprovalLog(directus)

  return {
    ...base,
    actor: directus.actor ? mapDirectusEmployeeToIEmployee(directus.actor) : undefined
  }
}
