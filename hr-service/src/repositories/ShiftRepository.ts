/**
 * Shift Repository
 */

import { query } from '../config/database.js'
import type { DbShiftSchedule, DbEmployeeShift } from '../types/database.js'
import type { IShiftRepository, IShiftSchedule } from '@gym-nexus/hr-business-logic'

function mapDbToEntity(db: DbShiftSchedule): IShiftSchedule {
  return {
    id: db.id,
    branchId: db.branch_id,
    name: db.name,
    startTime: db.start_time,
    endTime: db.end_time,
    breakStart: db.break_start,
    breakEnd: db.break_end,
    gracePeriodMinutes: db.grace_period_minutes,
    earlyLeaveMinutes: db.early_leave_minutes,
    isDefault: db.is_default
  }
}

export class ShiftRepository implements IShiftRepository {
  async findDefaultByBranchId(branchId: string): Promise<IShiftSchedule | null> {
    const result = await query<DbShiftSchedule>(
      `SELECT * FROM shift_schedules
       WHERE branch_id = $1
       AND is_default = true
       AND status = 'published'
       LIMIT 1`,
      [branchId]
    )
    return result.rows[0] ? mapDbToEntity(result.rows[0]) : null
  }

  async findCurrentByEmployeeId(employeeId: string): Promise<IShiftSchedule | null> {
    const today = new Date().toISOString().split('T')[0]

    const result = await query<DbShiftSchedule>(
      `SELECT s.* FROM shift_schedules s
       INNER JOIN employee_shifts es ON es.shift_schedule_id = s.id
       WHERE es.employee_id = $1
       AND es.effective_date <= $2
       AND (es.end_date IS NULL OR es.end_date >= $2)
       AND s.status = 'published'
       ORDER BY es.effective_date DESC
       LIMIT 1`,
      [employeeId, today]
    )
    return result.rows[0] ? mapDbToEntity(result.rows[0]) : null
  }

  async findById(id: string): Promise<IShiftSchedule | null> {
    const result = await query<DbShiftSchedule>(
      'SELECT * FROM shift_schedules WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapDbToEntity(result.rows[0]) : null
  }

  async findByBranchId(branchId: string): Promise<IShiftSchedule[]> {
    const result = await query<DbShiftSchedule>(
      `SELECT * FROM shift_schedules
       WHERE branch_id = $1
       AND status = 'published'
       ORDER BY start_time`,
      [branchId]
    )
    return result.rows.map(mapDbToEntity)
  }
}
