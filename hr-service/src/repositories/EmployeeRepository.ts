/**
 * Employee Repository
 */

import { v4 as uuidv4 } from 'uuid'
import { query } from '../config/database.js'
import type { DbEmployeeRef } from '../types/database.js'
import type { IEmployeeRepository } from '@gym-nexus/hr-business-logic'

interface EmployeeInfo {
  id: string
  supervisorId: string | null
  jobTitleId: string | null
  branchId: string | null
}

export class EmployeeRepository implements IEmployeeRepository {
  async findById(id: string): Promise<EmployeeInfo | null> {
    const result = await query<DbEmployeeRef>(
      'SELECT * FROM employee_refs WHERE id = $1',
      [id]
    )
    const row = result.rows[0]
    if (!row) return null

    return {
      id: row.id,
      supervisorId: row.supervisor_id,
      jobTitleId: null, // Not stored in employee_refs
      branchId: row.branch_id
    }
  }

  async findByUserId(userId: string): Promise<EmployeeInfo | null> {
    // In standalone mode, userId is the same as employeeId
    return this.findById(userId)
  }

  async findByExternalId(externalId: string): Promise<EmployeeInfo | null> {
    const result = await query<DbEmployeeRef>(
      'SELECT * FROM employee_refs WHERE external_id = $1',
      [externalId]
    )
    const row = result.rows[0]
    if (!row) return null

    return {
      id: row.id,
      supervisorId: row.supervisor_id,
      jobTitleId: null,
      branchId: row.branch_id
    }
  }

  async isAdmin(employeeId: string): Promise<boolean> {
    // In standalone HR service, admin check would be done via the main system
    // For now, return false - this can be enhanced with roles table
    return false
  }

  // Employee sync methods

  async upsertFromMainSystem(data: {
    externalId: string
    fullName: string
    employeeCode?: string
    branchId?: string
    supervisorId?: string
    employmentStatus: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
    employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
  }): Promise<DbEmployeeRef> {
    // First, try to find existing employee by external_id
    const existing = await query<DbEmployeeRef>(
      'SELECT * FROM employee_refs WHERE external_id = $1',
      [data.externalId]
    )

    if (existing.rows[0]) {
      // Update existing
      const result = await query<DbEmployeeRef>(
        `UPDATE employee_refs SET
          full_name = $2,
          employee_code = $3,
          branch_id = $4,
          supervisor_id = (
            SELECT id FROM employee_refs WHERE external_id = $5
          ),
          employment_status = $6,
          employment_type = $7,
          synced_at = NOW()
        WHERE external_id = $1
        RETURNING *`,
        [
          data.externalId,
          data.fullName,
          data.employeeCode,
          data.branchId,
          data.supervisorId,
          data.employmentStatus,
          data.employmentType
        ]
      )
      return result.rows[0]!
    }

    // Create new
    const id = uuidv4()
    const result = await query<DbEmployeeRef>(
      `INSERT INTO employee_refs (
        id, external_id, full_name, employee_code, branch_id,
        supervisor_id, employment_status, employment_type
      ) VALUES (
        $1, $2, $3, $4, $5,
        (SELECT id FROM employee_refs WHERE external_id = $6),
        $7, $8
      )
      RETURNING *`,
      [
        id,
        data.externalId,
        data.fullName,
        data.employeeCode,
        data.branchId,
        data.supervisorId,
        data.employmentStatus,
        data.employmentType
      ]
    )
    return result.rows[0]!
  }

  async findAll(options?: {
    branchId?: string
    status?: string
  }): Promise<DbEmployeeRef[]> {
    let sql = 'SELECT * FROM employee_refs WHERE 1=1'
    const params: unknown[] = []
    let paramIndex = 1

    if (options?.branchId) {
      sql += ` AND branch_id = $${paramIndex++}`
      params.push(options.branchId)
    }

    if (options?.status) {
      sql += ` AND employment_status = $${paramIndex++}`
      params.push(options.status)
    }

    sql += ' ORDER BY full_name'

    const result = await query<DbEmployeeRef>(sql, params)
    return result.rows
  }
}
