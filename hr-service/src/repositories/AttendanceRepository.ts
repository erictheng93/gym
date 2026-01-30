/**
 * Attendance Repository
 */

import { v4 as uuidv4 } from 'uuid'
import { query } from '../config/database.js'
import type { DbAttendance } from '../types/database.js'
import type {
  IAttendanceRepository,
  IAttendanceRecord
} from '@gym-nexus/hr-business-logic'

function mapDbToEntity(db: DbAttendance): IAttendanceRecord {
  return {
    id: db.id,
    employeeId: db.employee_id,
    branchId: db.branch_id,
    attendanceDate: db.attendance_date,
    checkIn: db.check_in,
    checkOut: db.check_out,
    checkType: db.check_type,
    attendanceStatus: db.attendance_status,
    lateMinutes: db.late_minutes,
    earlyLeaveMinutes: db.early_leave_minutes,
    workHours: db.work_hours,
    overtimeHours: db.overtime_hours,
    notes: db.notes
  }
}

export class AttendanceRepository implements IAttendanceRepository {
  async findById(id: string): Promise<IAttendanceRecord | null> {
    const result = await query<DbAttendance>(
      'SELECT * FROM attendances WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapDbToEntity(result.rows[0]) : null
  }

  async findTodayByEmployeeId(employeeId: string): Promise<IAttendanceRecord | null> {
    const today = new Date().toISOString().split('T')[0]
    const result = await query<DbAttendance>(
      `SELECT * FROM attendances
       WHERE employee_id = $1
       AND attendance_date = $2
       AND check_type = 'NORMAL'
       LIMIT 1`,
      [employeeId, today]
    )
    return result.rows[0] ? mapDbToEntity(result.rows[0]) : null
  }

  async create(data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord> {
    const id = uuidv4()
    const result = await query<DbAttendance>(
      `INSERT INTO attendances (
        id, employee_id, branch_id, attendance_date,
        check_in, check_out, check_type, attendance_status,
        late_minutes, early_leave_minutes, work_hours, overtime_hours, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        id,
        data.employeeId,
        data.branchId,
        data.attendanceDate,
        data.checkIn,
        data.checkOut,
        data.checkType || 'NORMAL',
        data.attendanceStatus || 'PRESENT',
        data.lateMinutes || 0,
        data.earlyLeaveMinutes || 0,
        data.workHours,
        data.overtimeHours,
        data.notes
      ]
    )
    return mapDbToEntity(result.rows[0]!)
  }

  async update(id: string, data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (data.checkIn !== undefined) {
      fields.push(`check_in = $${paramIndex++}`)
      values.push(data.checkIn)
    }
    if (data.checkOut !== undefined) {
      fields.push(`check_out = $${paramIndex++}`)
      values.push(data.checkOut)
    }
    if (data.attendanceStatus !== undefined) {
      fields.push(`attendance_status = $${paramIndex++}`)
      values.push(data.attendanceStatus)
    }
    if (data.lateMinutes !== undefined) {
      fields.push(`late_minutes = $${paramIndex++}`)
      values.push(data.lateMinutes)
    }
    if (data.earlyLeaveMinutes !== undefined) {
      fields.push(`early_leave_minutes = $${paramIndex++}`)
      values.push(data.earlyLeaveMinutes)
    }
    if (data.workHours !== undefined) {
      fields.push(`work_hours = $${paramIndex++}`)
      values.push(data.workHours)
    }
    if (data.overtimeHours !== undefined) {
      fields.push(`overtime_hours = $${paramIndex++}`)
      values.push(data.overtimeHours)
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`)
      values.push(data.notes)
    }

    values.push(id)

    const result = await query<DbAttendance>(
      `UPDATE attendances SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )
    return mapDbToEntity(result.rows[0]!)
  }

  // Additional methods for the service

  async findByDateRange(
    employeeId: string,
    startDate: string,
    endDate: string
  ): Promise<IAttendanceRecord[]> {
    const result = await query<DbAttendance>(
      `SELECT * FROM attendances
       WHERE employee_id = $1
       AND attendance_date BETWEEN $2 AND $3
       ORDER BY attendance_date DESC`,
      [employeeId, startDate, endDate]
    )
    return result.rows.map(mapDbToEntity)
  }

  async findTodayByBranch(branchId?: string): Promise<IAttendanceRecord[]> {
    const today = new Date().toISOString().split('T')[0]

    let sql = `SELECT * FROM attendances WHERE attendance_date = $1`
    const params: unknown[] = [today]

    if (branchId) {
      sql += ` AND branch_id = $2`
      params.push(branchId)
    }

    sql += ` ORDER BY check_in DESC`

    const result = await query<DbAttendance>(sql, params)
    return result.rows.map(mapDbToEntity)
  }
}
