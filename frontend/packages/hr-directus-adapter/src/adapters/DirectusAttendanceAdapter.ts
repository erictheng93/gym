/**
 * Directus 考勤適配器實現
 */

import { readItems, createItem, updateItem, aggregate } from '@directus/sdk'
import type {
  IAttendanceAdapter,
  IAttendanceQueryOptions,
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  ICheckOutOptions
} from '@gym-nexus/hr-core'
import {
  mapDirectusAttendanceToIAttendanceRecord,
  mapDirectusAttendanceToIAttendanceRecordWithEmployee,
  mapIAttendanceRecordToDirectus,
  type DirectusAttendance
} from '../mappers/attendanceMapper'
import type { DirectusTenantContext } from './DirectusTenantContext'

// Import utility functions
import {
  getTodayDate,
  getMonthDateRange,
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateWorkHours
} from '@gym-nexus/hr-core'

// Directus SDK 操作需要使用 as any 來繞過 schema 類型限制
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readItemsAny = readItems as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createItemAny = createItem as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateItemAny = updateItem as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aggregateAny = aggregate as any

/**
 * Directus 客戶端接口
 */
interface DirectusClient {
  request: <T = unknown>(query: unknown) => Promise<T>
}

/**
 * Directus 考勤適配器
 */
export class DirectusAttendanceAdapter implements IAttendanceAdapter {
  constructor(
    private directus: DirectusClient,
    private tenantContext: DirectusTenantContext
  ) {}

  /**
   * 根據 ID 取得考勤記錄
   */
  async getById(id: string): Promise<IAttendanceRecord | null> {
    const data = await this.directus.request<DirectusAttendance[]>(
      readItemsAny('attendances', {
        filter: { id: { _eq: id } },
        fields: ['*'],
        limit: 1
      })
    )

    const record = data[0]
    if (!record) return null
    return mapDirectusAttendanceToIAttendanceRecord(record)
  }

  /**
   * 取得員工今日考勤
   */
  async getTodayAttendance(employeeId: string): Promise<IAttendanceRecord | null> {
    const today = getTodayDate()

    const data = await this.directus.request<DirectusAttendance[]>(
      readItemsAny('attendances', {
        filter: {
          employee_id: { _eq: employeeId },
          attendance_date: { _eq: today }
        },
        fields: ['*'],
        limit: 1
      })
    )

    const record = data[0]
    if (!record) return null
    return mapDirectusAttendanceToIAttendanceRecord(record)
  }

  /**
   * 取得今日所有考勤
   */
  async getTodayAttendances(branchId?: string): Promise<IAttendanceRecordWithEmployee[]> {
    const today = getTodayDate()
    const filter: Record<string, unknown> = {
      attendance_date: { _eq: today }
    }

    // 應用分店過濾
    if (branchId) {
      filter.branch_id = { _eq: branchId }
    } else {
      const branchFilter = this.tenantContext.buildBranchFilter()
      if (branchFilter) {
        Object.assign(filter, branchFilter)
      }
    }

    const data = await this.directus.request<DirectusAttendance[]>(
      readItemsAny('attendances', {
        filter,
        fields: [
          '*',
          'employee.id',
          'employee.full_name',
          'employee.employee_code',
          'employee.branch_id',
          'employee.job_title_id',
          'employee.employment_status',
          'employee.employment_type'
        ],
        sort: ['-check_in'],
        limit: 100
      })
    )

    return data.map(mapDirectusAttendanceToIAttendanceRecordWithEmployee)
  }

  /**
   * 查詢考勤記錄
   */
  async query(options: IAttendanceQueryOptions): Promise<{
    data: IAttendanceRecordWithEmployee[]
    total: number
  }> {
    const { employeeId, branchId, startDate, endDate, attendanceStatus, page = 1, limit = 20 } = options
    const filter: Record<string, unknown> = {}

    if (employeeId) filter.employee_id = { _eq: employeeId }
    if (branchId) filter.branch_id = { _eq: branchId }
    if (startDate) filter.attendance_date = { ...filter.attendance_date as object, _gte: startDate }
    if (endDate) filter.attendance_date = { ...filter.attendance_date as object, _lte: endDate }
    if (attendanceStatus && attendanceStatus.length > 0) {
      filter.attendance_status = { _in: attendanceStatus }
    }

    // 應用分店過濾
    const branchFilter = this.tenantContext.buildBranchFilter()
    if (branchFilter && !branchId) {
      Object.assign(filter, branchFilter)
    }

    const [data, countResult] = await Promise.all([
      this.directus.request<DirectusAttendance[]>(
        readItemsAny('attendances', {
          filter,
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.branch_id',
            'employee.job_title_id',
            'employee.employment_status',
            'employee.employment_type'
          ],
          sort: ['-attendance_date', '-check_in'],
          limit,
          offset: (page - 1) * limit
        })
      ),
      this.directus.request<{ count: string }[]>(
        aggregateAny('attendances', {
          aggregate: { count: '*' },
          query: { filter }
        })
      )
    ])

    return {
      data: data.map(mapDirectusAttendanceToIAttendanceRecordWithEmployee),
      total: Number(countResult[0]?.count) || 0
    }
  }

  /**
   * 取得員工近期考勤
   */
  async getRecentAttendances(employeeId: string, days: number): Promise<IAttendanceRecord[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const data = await this.directus.request<DirectusAttendance[]>(
      readItemsAny('attendances', {
        filter: {
          employee_id: { _eq: employeeId },
          attendance_date: { _gte: startDate.toISOString().split('T')[0] }
        },
        fields: ['*'],
        sort: ['-attendance_date'],
        limit: days
      })
    )

    return data.map(mapDirectusAttendanceToIAttendanceRecord)
  }

  /**
   * 取得月度考勤記錄
   */
  async getMonthlyAttendances(
    employeeId: string,
    year: number,
    month: number
  ): Promise<IAttendanceRecord[]> {
    const { startDate, endDate } = getMonthDateRange(year, month)

    const data = await this.directus.request<DirectusAttendance[]>(
      readItemsAny('attendances', {
        filter: {
          employee_id: { _eq: employeeId },
          attendance_date: {
            _gte: startDate,
            _lte: endDate
          }
        },
        fields: ['*'],
        sort: ['attendance_date']
      })
    )

    return data.map(mapDirectusAttendanceToIAttendanceRecord)
  }

  /**
   * 上班打卡
   */
  async checkIn(options: ICheckInOptions): Promise<IAttendanceRecord> {
    const { employeeId, branchId, checkType = 'REGULAR', notes } = options
    const today = getTodayDate()
    const now = new Date()

    const lateMinutes = calculateLateMinutes(now)
    const attendanceStatus = lateMinutes > 0 ? 'LATE' : 'PRESENT'

    const result = await this.directus.request<DirectusAttendance>(
      createItemAny('attendances', {
        employee_id: employeeId,
        branch_id: branchId || this.tenantContext.getBranchId(),
        attendance_date: today,
        check_in: now.toISOString(),
        check_type: checkType,
        late_minutes: lateMinutes,
        attendance_status: attendanceStatus,
        notes
      })
    )

    return mapDirectusAttendanceToIAttendanceRecord(result)
  }

  /**
   * 下班打卡
   */
  async checkOut(options: ICheckOutOptions): Promise<IAttendanceRecord> {
    const { attendanceId, notes } = options
    const now = new Date()

    // 先取得現有記錄
    const existing = await this.getById(attendanceId)
    if (!existing || !existing.checkIn) {
      throw new Error('找不到上班打卡記錄')
    }

    const earlyLeaveMinutes = calculateEarlyLeaveMinutes(now)
    const workHours = calculateWorkHours(existing.checkIn, now.toISOString())

    let attendanceStatus = existing.attendanceStatus
    if (earlyLeaveMinutes > 0 && attendanceStatus === 'PRESENT') {
      attendanceStatus = 'EARLY_LEAVE'
    }

    const result = await this.directus.request<DirectusAttendance>(
      updateItemAny('attendances', attendanceId, {
        check_out: now.toISOString(),
        work_hours: workHours,
        early_leave_minutes: earlyLeaveMinutes,
        attendance_status: attendanceStatus,
        notes: notes || existing.notes
      })
    )

    return mapDirectusAttendanceToIAttendanceRecord(result)
  }

  /**
   * 更新考勤記錄
   */
  async update(id: string, data: Partial<IAttendanceRecord>): Promise<IAttendanceRecord> {
    const directusData = mapIAttendanceRecordToDirectus(data)

    const result = await this.directus.request<DirectusAttendance>(
      updateItemAny('attendances', id, directusData)
    )

    return mapDirectusAttendanceToIAttendanceRecord(result)
  }

  /**
   * 取得今日考勤概況
   */
  async getTodaySummary(branchId?: string): Promise<ITodayAttendanceSummary> {
    const today = getTodayDate()

    // 構建員工過濾條件
    const employeeFilter: Record<string, unknown> = { employment_status: { _eq: 'ACTIVE' } }
    const targetBranchId = branchId || this.tenantContext.getBranchId()
    if (targetBranchId && !this.tenantContext.isHeadquarter()) {
      employeeFilter.branch_id = { _eq: targetBranchId }
    }

    // 取得總員工數
    const employeesResult = await this.directus.request<{ count: string }[]>(
      aggregateAny('employees', {
        aggregate: { count: '*' },
        query: { filter: employeeFilter }
      })
    )
    const totalEmployees = Number(employeesResult[0]?.count) || 0

    // 構建考勤過濾條件
    const attendanceFilter: Record<string, unknown> = { attendance_date: { _eq: today } }
    if (targetBranchId && !this.tenantContext.isHeadquarter()) {
      attendanceFilter.branch_id = { _eq: targetBranchId }
    }

    // 取得今日考勤
    const attendances = await this.directus.request<{ id: string; check_in: string | null; check_out: string | null; attendance_status: string }[]>(
      readItemsAny('attendances', {
        filter: attendanceFilter,
        fields: ['id', 'check_in', 'check_out', 'attendance_status']
      })
    )

    // 取得今日請假人數
    const leaveFilter: Record<string, unknown> = {
      leave_status: { _eq: 'APPROVED' },
      start_date: { _lte: today },
      end_date: { _gte: today }
    }
    const leaveResult = await this.directus.request<{ count: string }[]>(
      aggregateAny('leave_requests', {
        aggregate: { count: '*' },
        query: { filter: leaveFilter }
      })
    )
    const onLeave = Number(leaveResult[0]?.count) || 0

    // 計算統計
    const checkedIn = attendances.filter(a => a.check_in).length
    const checkedOut = attendances.filter(a => a.check_out).length
    const late = attendances.filter(a => a.attendance_status === 'LATE').length
    const notCheckedIn = Math.max(0, totalEmployees - checkedIn - onLeave)

    return {
      totalEmployees,
      checkedIn,
      notCheckedIn,
      checkedOut,
      late,
      onLeave
    }
  }

  /**
   * 取得月度考勤統計
   */
  async getMonthlyStats(options: {
    branchId?: string
    year: number
    month: number
  }): Promise<IMonthlyAttendanceStats[]> {
    const { branchId, year, month } = options
    const { startDate, endDate } = getMonthDateRange(year, month)

    const filter: Record<string, unknown> = {
      attendance_date: {
        _gte: startDate,
        _lte: endDate
      }
    }

    const targetBranchId = branchId || this.tenantContext.getBranchId()
    if (targetBranchId && !this.tenantContext.isHeadquarter()) {
      filter.branch_id = { _eq: targetBranchId }
    }

    const attendances = await this.directus.request<(DirectusAttendance & {
      employee?: { id: string; full_name: string; employee_code: string }
    })[]>(
      readItemsAny('attendances', {
        filter,
        fields: [
          '*',
          'employee.id',
          'employee.full_name',
          'employee.employee_code'
        ],
        sort: ['employee_id', 'attendance_date']
      })
    )

    // 按員工分組統計
    const statsMap = new Map<string, IMonthlyAttendanceStats>()

    for (const att of attendances) {
      const empId = att.employee_id
      if (!statsMap.has(empId)) {
        statsMap.set(empId, {
          employeeId: empId,
          employeeName: att.employee?.full_name || '',
          employeeCode: att.employee?.employee_code || '',
          totalDays: 0,
          presentDays: 0,
          absentDays: 0,
          lateDays: 0,
          earlyLeaveDays: 0,
          leaveDays: 0,
          totalWorkHours: 0,
          totalOvertimeHours: 0,
          totalLateMinutes: 0
        })
      }

      const stats = statsMap.get(empId)!
      stats.totalDays++

      switch (att.attendance_status) {
        case 'PRESENT':
          stats.presentDays++
          break
        case 'ABSENT':
          stats.absentDays++
          break
        case 'LATE':
          stats.lateDays++
          stats.presentDays++
          break
        case 'EARLY_LEAVE':
          stats.earlyLeaveDays++
          stats.presentDays++
          break
        case 'LEAVE':
          stats.leaveDays++
          break
      }

      stats.totalWorkHours += att.work_hours || 0
      stats.totalOvertimeHours += att.overtime_hours || 0
      stats.totalLateMinutes += att.late_minutes || 0
    }

    return Array.from(statsMap.values())
  }
}
