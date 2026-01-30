/**
 * 休假實體映射器
 * Directus LeaveRequest/LeaveBalance ↔ HR Types
 */

import type {
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  ILeaveApprovalLogWithRelations,
  LeaveType,
  LeaveStatus,
  HalfDayType,
  LeaveApprovalAction
} from '@gym-nexus/hr-core'
import { mapDirectusEmployeeToIEmployee, type DirectusEmployee } from './employeeMapper'

/**
 * Directus 休假申請類型
 */
export interface DirectusLeaveRequest {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  employee_id: string
  leave_type: string
  start_date: string
  end_date: string
  leave_status: string
  approver_id: string | null
  reason: string | null
  hours_requested: number | null
  days_requested: number | null
  submitted_at: string | null
  approved_at: string | null
  approval_notes: string | null
  document_url: string | null
  is_half_day: boolean
  half_day_type: string | null
  // 關聯
  employee?: DirectusEmployee | null
  approver?: DirectusEmployee | null
}

/**
 * Directus 休假餘額類型
 */
export interface DirectusLeaveBalance {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  employee_id: string
  leave_type: string
  year: number
  total_days: number
  used_days: number
  pending_days: number
  carried_over_days: number
  expires_at: string | null
}

/**
 * Directus 休假審核歷程類型
 */
export interface DirectusLeaveApprovalLog {
  id: string
  date_created: string
  leave_request_id: string
  action_by: string
  action: string
  previous_status: string | null
  new_status: string | null
  notes: string | null
  // 關聯
  actor?: DirectusEmployee | null
}

/**
 * 將 Directus 休假申請轉換為 HR ILeaveRequest
 */
export function mapDirectusLeaveRequestToILeaveRequest(
  directus: DirectusLeaveRequest
): ILeaveRequest {
  return {
    id: directus.id,
    employeeId: directus.employee_id,
    leaveType: directus.leave_type as LeaveType,
    startDate: directus.start_date,
    endDate: directus.end_date,
    leaveStatus: directus.leave_status as LeaveStatus,
    approverId: directus.approver_id,
    reason: directus.reason,
    hoursRequested: directus.hours_requested,
    daysRequested: directus.days_requested,
    submittedAt: directus.submitted_at,
    approvedAt: directus.approved_at,
    approvalNotes: directus.approval_notes,
    documentUrl: directus.document_url,
    isHalfDay: directus.is_half_day,
    halfDayType: directus.half_day_type as HalfDayType | null,
    dateCreated: directus.date_created,
    dateUpdated: directus.date_updated
  }
}

/**
 * 將 Directus 休假申請轉換為 HR ILeaveRequestWithRelations
 */
export function mapDirectusLeaveRequestToILeaveRequestWithRelations(
  directus: DirectusLeaveRequest
): ILeaveRequestWithRelations {
  const base = mapDirectusLeaveRequestToILeaveRequest(directus)

  return {
    ...base,
    employee: directus.employee
      ? mapDirectusEmployeeToIEmployee(directus.employee)
      : undefined,
    approver: directus.approver
      ? mapDirectusEmployeeToIEmployee(directus.approver)
      : undefined
  }
}

/**
 * 將 HR ILeaveRequest 轉換為 Directus 格式
 */
export function mapILeaveRequestToDirectus(
  request: Partial<ILeaveRequest>
): Partial<DirectusLeaveRequest> {
  const result: Partial<DirectusLeaveRequest> = {}

  if (request.employeeId !== undefined) result.employee_id = request.employeeId
  if (request.leaveType !== undefined) result.leave_type = request.leaveType
  if (request.startDate !== undefined) result.start_date = request.startDate
  if (request.endDate !== undefined) result.end_date = request.endDate
  if (request.leaveStatus !== undefined) result.leave_status = request.leaveStatus
  if (request.approverId !== undefined) result.approver_id = request.approverId
  if (request.reason !== undefined) result.reason = request.reason
  if (request.hoursRequested !== undefined) result.hours_requested = request.hoursRequested
  if (request.daysRequested !== undefined) result.days_requested = request.daysRequested
  if (request.submittedAt !== undefined) result.submitted_at = request.submittedAt
  if (request.approvedAt !== undefined) result.approved_at = request.approvedAt
  if (request.approvalNotes !== undefined) result.approval_notes = request.approvalNotes
  if (request.documentUrl !== undefined) result.document_url = request.documentUrl
  if (request.isHalfDay !== undefined) result.is_half_day = request.isHalfDay
  if (request.halfDayType !== undefined) result.half_day_type = request.halfDayType

  return result
}

/**
 * 將 Directus 休假餘額轉換為 HR ILeaveBalance
 */
export function mapDirectusLeaveBalanceToILeaveBalance(
  directus: DirectusLeaveBalance
): ILeaveBalance {
  return {
    id: directus.id,
    employeeId: directus.employee_id,
    leaveType: directus.leave_type as LeaveType,
    year: directus.year,
    totalDays: directus.total_days,
    usedDays: directus.used_days,
    pendingDays: directus.pending_days,
    carriedOverDays: directus.carried_over_days,
    expiresAt: directus.expires_at
  }
}

/**
 * 將 Directus 休假審核歷程轉換為 HR ILeaveApprovalLog
 */
export function mapDirectusLeaveApprovalLogToILeaveApprovalLog(
  directus: DirectusLeaveApprovalLog
): ILeaveApprovalLog {
  return {
    id: directus.id,
    leaveRequestId: directus.leave_request_id,
    actionBy: directus.action_by,
    action: directus.action as LeaveApprovalAction,
    previousStatus: directus.previous_status,
    newStatus: directus.new_status,
    notes: directus.notes,
    dateCreated: directus.date_created
  }
}

/**
 * 將 Directus 休假審核歷程轉換為 HR ILeaveApprovalLogWithRelations
 */
export function mapDirectusLeaveApprovalLogToILeaveApprovalLogWithRelations(
  directus: DirectusLeaveApprovalLog
): ILeaveApprovalLogWithRelations {
  const base = mapDirectusLeaveApprovalLogToILeaveApprovalLog(directus)

  return {
    ...base,
    actor: directus.actor ? mapDirectusEmployeeToIEmployee(directus.actor) : undefined
  }
}
