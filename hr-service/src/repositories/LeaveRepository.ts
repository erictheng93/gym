/**
 * Leave Repository
 */

import { v4 as uuidv4 } from 'uuid'
import { query } from '../config/database.js'
import type { DbLeaveRequest, DbLeaveBalance, DbLeaveApprovalLog } from '../types/database.js'
import type {
  ILeaveRequestRepository,
  ILeaveBalanceRepository,
  ILeaveApprovalLogRepository,
  ILeaveRequest,
  ILeaveBalance,
  ILeaveApprovalLog,
  LeaveType
} from '@gym-nexus/hr-business-logic'

// Mappers
function mapRequestToEntity(db: DbLeaveRequest): ILeaveRequest {
  return {
    id: db.id,
    employeeId: db.employee_id,
    leaveType: db.leave_type as LeaveType,
    startDate: db.start_date,
    endDate: db.end_date,
    daysRequested: db.days_requested,
    reason: db.reason,
    leaveStatus: db.leave_status,
    isHalfDay: db.is_half_day,
    halfDayType: db.half_day_type,
    approverId: db.approver_id,
    approvedAt: db.approved_at?.toISOString() || null,
    approvalNotes: db.approval_notes,
    submittedAt: db.submitted_at?.toISOString() || null
  }
}

function mapBalanceToEntity(db: DbLeaveBalance): ILeaveBalance {
  return {
    id: db.id,
    employeeId: db.employee_id,
    leaveType: db.leave_type as LeaveType,
    year: db.year,
    totalDays: db.total_days,
    usedDays: db.used_days,
    pendingDays: db.pending_days,
    carryOverDays: db.carry_over_days,
    expiryDate: db.expiry_date
  }
}

function mapLogToEntity(db: DbLeaveApprovalLog): ILeaveApprovalLog {
  return {
    id: db.id,
    leaveRequestId: db.leave_request_id,
    actionBy: db.action_by,
    action: db.action,
    previousStatus: db.previous_status,
    newStatus: db.new_status,
    notes: db.notes,
    createdAt: db.created_at.toISOString()
  }
}

// Leave Request Repository
export class LeaveRequestRepository implements ILeaveRequestRepository {
  async findById(id: string): Promise<ILeaveRequest | null> {
    const result = await query<DbLeaveRequest>(
      'SELECT * FROM leave_requests WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapRequestToEntity(result.rows[0]) : null
  }

  async create(data: Partial<ILeaveRequest>): Promise<ILeaveRequest> {
    const id = uuidv4()
    const result = await query<DbLeaveRequest>(
      `INSERT INTO leave_requests (
        id, employee_id, leave_type, start_date, end_date,
        days_requested, reason, leave_status, is_half_day,
        half_day_type, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        data.employeeId,
        data.leaveType,
        data.startDate,
        data.endDate,
        data.daysRequested,
        data.reason,
        data.leaveStatus || 'PENDING',
        data.isHalfDay || false,
        data.halfDayType,
        data.submittedAt || new Date().toISOString()
      ]
    )
    return mapRequestToEntity(result.rows[0]!)
  }

  async update(id: string, data: Partial<ILeaveRequest>): Promise<ILeaveRequest> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (data.leaveStatus !== undefined) {
      fields.push(`leave_status = $${paramIndex++}`)
      values.push(data.leaveStatus)
    }
    if (data.approverId !== undefined) {
      fields.push(`approver_id = $${paramIndex++}`)
      values.push(data.approverId)
    }
    if (data.approvedAt !== undefined) {
      fields.push(`approved_at = $${paramIndex++}`)
      values.push(data.approvedAt)
    }
    if (data.approvalNotes !== undefined) {
      fields.push(`approval_notes = $${paramIndex++}`)
      values.push(data.approvalNotes)
    }

    values.push(id)

    const result = await query<DbLeaveRequest>(
      `UPDATE leave_requests SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )
    return mapRequestToEntity(result.rows[0]!)
  }

  async findByEmployeeId(employeeId: string, status?: string): Promise<ILeaveRequest[]> {
    let sql = 'SELECT * FROM leave_requests WHERE employee_id = $1'
    const params: unknown[] = [employeeId]

    if (status) {
      sql += ' AND leave_status = $2'
      params.push(status)
    }

    sql += ' ORDER BY created_at DESC'

    const result = await query<DbLeaveRequest>(sql, params)
    return result.rows.map(mapRequestToEntity)
  }

  async findPendingByApprover(approverId: string): Promise<ILeaveRequest[]> {
    const result = await query<DbLeaveRequest>(
      `SELECT lr.* FROM leave_requests lr
       INNER JOIN employee_refs e ON lr.employee_id = e.id
       WHERE e.supervisor_id = $1
       AND lr.leave_status = 'PENDING'
       ORDER BY lr.submitted_at ASC`,
      [approverId]
    )
    return result.rows.map(mapRequestToEntity)
  }
}

// Leave Balance Repository
export class LeaveBalanceRepository implements ILeaveBalanceRepository {
  async findByEmployeeAndType(
    employeeId: string,
    leaveType: LeaveType,
    year: number
  ): Promise<ILeaveBalance | null> {
    const result = await query<DbLeaveBalance>(
      `SELECT * FROM leave_balances
       WHERE employee_id = $1 AND leave_type = $2 AND year = $3`,
      [employeeId, leaveType, year]
    )
    return result.rows[0] ? mapBalanceToEntity(result.rows[0]) : null
  }

  async findAllByEmployeeAndYear(
    employeeId: string,
    year: number
  ): Promise<ILeaveBalance[]> {
    const result = await query<DbLeaveBalance>(
      `SELECT * FROM leave_balances
       WHERE employee_id = $1 AND year = $2
       ORDER BY leave_type`,
      [employeeId, year]
    )
    return result.rows.map(mapBalanceToEntity)
  }

  async update(id: string, data: Partial<ILeaveBalance>): Promise<ILeaveBalance> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (data.usedDays !== undefined) {
      fields.push(`used_days = $${paramIndex++}`)
      values.push(data.usedDays)
    }
    if (data.pendingDays !== undefined) {
      fields.push(`pending_days = $${paramIndex++}`)
      values.push(data.pendingDays)
    }
    if (data.totalDays !== undefined) {
      fields.push(`total_days = $${paramIndex++}`)
      values.push(data.totalDays)
    }

    values.push(id)

    const result = await query<DbLeaveBalance>(
      `UPDATE leave_balances SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )
    return mapBalanceToEntity(result.rows[0]!)
  }

  async atomicUpdate(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    pendingDelta: number,
    usedDelta: number
  ): Promise<{ success: boolean; newPending: number; newUsed: number }> {
    const result = await query<{
      success: boolean
      message: string
      new_pending: number
      new_used: number
    }>(
      'SELECT * FROM update_leave_balance($1, $2, $3, $4, $5)',
      [employeeId, leaveType, year, pendingDelta, usedDelta]
    )

    const row = result.rows[0]
    if (!row) {
      return { success: false, newPending: 0, newUsed: 0 }
    }

    return {
      success: row.success,
      newPending: row.new_pending,
      newUsed: row.new_used
    }
  }
}

// Leave Approval Log Repository
export class LeaveApprovalLogRepository implements ILeaveApprovalLogRepository {
  async create(data: Partial<ILeaveApprovalLog>): Promise<ILeaveApprovalLog> {
    const id = uuidv4()
    const result = await query<DbLeaveApprovalLog>(
      `INSERT INTO leave_approval_logs (
        id, leave_request_id, action_by, action,
        previous_status, new_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        data.leaveRequestId,
        data.actionBy,
        data.action,
        data.previousStatus,
        data.newStatus,
        data.notes
      ]
    )
    return mapLogToEntity(result.rows[0]!)
  }

  async findByLeaveRequestId(leaveRequestId: string): Promise<ILeaveApprovalLog[]> {
    const result = await query<DbLeaveApprovalLog>(
      `SELECT * FROM leave_approval_logs
       WHERE leave_request_id = $1
       ORDER BY created_at ASC`,
      [leaveRequestId]
    )
    return result.rows.map(mapLogToEntity)
  }
}
