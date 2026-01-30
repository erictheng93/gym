/**
 * Directus 班表適配器實現
 */

import { readItems, readItem, createItem, updateItem } from '@directus/sdk'
import type {
  IShiftAdapter,
  IShiftQueryOptions,
  IEmployeeShiftQueryOptions,
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ICreateShiftScheduleParams,
  IAssignShiftParams,
  IBatchAssignShiftParams,
  IEmployee
} from '@gym-nexus/hr-core'
import {
  mapDirectusShiftScheduleToIShiftSchedule,
  mapDirectusShiftScheduleToIShiftScheduleWithBranch,
  mapIShiftScheduleToDirectus,
  mapDirectusEmployeeShiftToIEmployeeShift,
  mapDirectusEmployeeShiftToIEmployeeShiftWithRelations,
  type DirectusShiftSchedule,
  type DirectusEmployeeShift
} from '../mappers/shiftMapper'
import { mapDirectusEmployeeToIEmployee, type DirectusEmployee } from '../mappers/employeeMapper'
import type { DirectusTenantContext } from './DirectusTenantContext'
import { getTodayDate } from '@gym-nexus/hr-core'

// Directus SDK 操作需要使用 as any 來繞過 schema 類型限制
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readItemsAny = readItems as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readItemAny = readItem as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createItemAny = createItem as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateItemAny = updateItem as any

/**
 * Directus 客戶端接口
 */
interface DirectusClient {
  request: <T = unknown>(query: unknown) => Promise<T>
}

/**
 * Directus 班表適配器
 */
export class DirectusShiftAdapter implements IShiftAdapter {
  constructor(
    private directus: DirectusClient,
    private tenantContext: DirectusTenantContext
  ) {}

  /**
   * 根據 ID 取得班表
   */
  async getById(id: string): Promise<IShiftSchedule | null> {
    try {
      const data = await this.directus.request<DirectusShiftSchedule>(
        readItemAny('shift_schedules', id)
      )

      return mapDirectusShiftScheduleToIShiftSchedule(data)
    } catch {
      return null
    }
  }

  /**
   * 根據 ID 取得班表（包含分店名稱）
   */
  async getByIdWithBranch(id: string): Promise<IShiftScheduleWithBranch | null> {
    try {
      const data = await this.directus.request<DirectusShiftSchedule>(
        readItemAny('shift_schedules', id, {
          fields: ['*', 'branch.id', 'branch.name']
        })
      )

      return mapDirectusShiftScheduleToIShiftScheduleWithBranch(data)
    } catch {
      return null
    }
  }

  /**
   * 取得班表列表
   */
  async getAll(options?: IShiftQueryOptions): Promise<IShiftScheduleWithBranch[]> {
    const { branchId, activeOnly = true } = options || {}
    const filter: Record<string, unknown> = {}

    if (branchId) {
      filter.branch_id = { _eq: branchId }
    } else {
      const branchFilter = this.tenantContext.buildBranchFilter()
      if (branchFilter) {
        Object.assign(filter, branchFilter)
      }
    }

    if (activeOnly) {
      filter.status = { _eq: 'published' }
    }

    const data = await this.directus.request<DirectusShiftSchedule[]>(
      readItemsAny('shift_schedules', {
        filter,
        fields: ['*', 'branch.id', 'branch.name'],
        sort: ['start_time']
      })
    )

    return data.map(mapDirectusShiftScheduleToIShiftScheduleWithBranch)
  }

  /**
   * 創建班表
   */
  async create(params: ICreateShiftScheduleParams): Promise<IShiftSchedule> {
    const data = await this.directus.request<DirectusShiftSchedule>(
      createItemAny('shift_schedules', {
        branch_id: params.branchId,
        name: params.name,
        start_time: params.startTime,
        end_time: params.endTime,
        break_start: params.breakStart || null,
        break_end: params.breakEnd || null,
        grace_period_minutes: params.gracePeriodMinutes || 10,
        early_leave_minutes: params.earlyLeaveMinutes || 10,
        overtime_start_after: params.overtimeStartAfter || null,
        is_default: params.isDefault || false,
        applicable_days: params.applicableDays || ['1', '2', '3', '4', '5'],
        status: 'published'
      })
    )

    return mapDirectusShiftScheduleToIShiftSchedule(data)
  }

  /**
   * 更新班表
   */
  async update(id: string, data: Partial<IShiftSchedule>): Promise<IShiftSchedule> {
    const directusData = mapIShiftScheduleToDirectus(data)

    const result = await this.directus.request<DirectusShiftSchedule>(
      updateItemAny('shift_schedules', id, directusData)
    )

    return mapDirectusShiftScheduleToIShiftSchedule(result)
  }

  /**
   * 刪除班表（軟刪除）
   */
  async delete(id: string): Promise<void> {
    await this.directus.request<DirectusShiftSchedule>(
      updateItemAny('shift_schedules', id, { status: 'archived' })
    )
  }

  /**
   * 取得員工班表指派列表
   */
  async getEmployeeShifts(options?: IEmployeeShiftQueryOptions): Promise<IEmployeeShiftWithRelations[]> {
    const { employeeId, shiftScheduleId, branchId, activeOnly = true } = options || {}
    const filter: Record<string, unknown> = {}

    if (employeeId) filter.employee_id = { _eq: employeeId }
    if (shiftScheduleId) filter.shift_schedule_id = { _eq: shiftScheduleId }

    if (activeOnly) {
      const today = getTodayDate()
      filter._and = [
        { effective_date: { _lte: today } },
        {
          _or: [
            { end_date: { _null: true } },
            { end_date: { _gte: today } }
          ]
        }
      ]
    }

    const data = await this.directus.request<DirectusEmployeeShift[]>(
      readItemsAny('employee_shifts', {
        filter,
        fields: [
          '*',
          'employee.id',
          'employee.full_name',
          'employee.employee_code',
          'employee.branch_id',
          'employee.job_title_id',
          'employee.employment_status',
          'employee.employment_type',
          'shift_schedule.id',
          'shift_schedule.name',
          'shift_schedule.start_time',
          'shift_schedule.end_time',
          'shift_schedule.branch_id',
          'shift_schedule.grace_period_minutes',
          'shift_schedule.early_leave_minutes',
          'shift_schedule.applicable_days'
        ],
        sort: ['-date_created']
      })
    )

    let filtered = data.map(mapDirectusEmployeeShiftToIEmployeeShiftWithRelations)

    // 按分店過濾
    if (branchId) {
      filtered = filtered.filter(es => es.employee?.branchId === branchId)
    }

    return filtered
  }

  /**
   * 取得班表下的所有員工
   */
  async getShiftEmployees(shiftScheduleId: string): Promise<IEmployeeShiftWithRelations[]> {
    const today = getTodayDate()

    const data = await this.directus.request<DirectusEmployeeShift[]>(
      readItemsAny('employee_shifts', {
        filter: {
          shift_schedule_id: { _eq: shiftScheduleId },
          effective_date: { _lte: today },
          _or: [
            { end_date: { _null: true } },
            { end_date: { _gte: today } }
          ]
        },
        fields: [
          '*',
          'employee.id',
          'employee.full_name',
          'employee.employee_code',
          'employee.branch_id',
          'employee.job_title_id',
          'employee.employment_status',
          'employee.employment_type'
        ]
      })
    )

    return data.map(mapDirectusEmployeeShiftToIEmployeeShiftWithRelations)
  }

  /**
   * 取得員工當前班表
   */
  async getEmployeeCurrentShift(employeeId: string): Promise<IEmployeeShiftWithRelations | null> {
    const today = getTodayDate()

    const data = await this.directus.request<DirectusEmployeeShift[]>(
      readItemsAny('employee_shifts', {
        filter: {
          employee_id: { _eq: employeeId },
          effective_date: { _lte: today },
          _or: [
            { end_date: { _null: true } },
            { end_date: { _gte: today } }
          ]
        },
        fields: [
          '*',
          'shift_schedule.id',
          'shift_schedule.name',
          'shift_schedule.start_time',
          'shift_schedule.end_time',
          'shift_schedule.branch_id',
          'shift_schedule.grace_period_minutes',
          'shift_schedule.early_leave_minutes',
          'shift_schedule.overtime_start_after',
          'shift_schedule.applicable_days'
        ],
        limit: 1
      })
    )

    if (data.length === 0) return null
    return mapDirectusEmployeeShiftToIEmployeeShiftWithRelations(data[0])
  }

  /**
   * 指派班表給員工
   */
  async assignToEmployee(params: IAssignShiftParams): Promise<IEmployeeShift> {
    // 檢查是否有現有班表，如有則結束
    const currentShift = await this.getEmployeeCurrentShift(params.employeeId)

    if (currentShift && currentShift.shiftScheduleId !== params.shiftScheduleId) {
      // 結束現有班表（設定結束日期為生效日前一天）
      const endDate = new Date(params.effectiveDate)
      endDate.setDate(endDate.getDate() - 1)

      await this.directus.request<DirectusEmployeeShift>(
        updateItemAny('employee_shifts', currentShift.id, {
          end_date: endDate.toISOString().split('T')[0]
        })
      )
    }

    // 創建新班表指派
    const data = await this.directus.request<DirectusEmployeeShift>(
      createItemAny('employee_shifts', {
        employee_id: params.employeeId,
        shift_schedule_id: params.shiftScheduleId,
        effective_date: params.effectiveDate,
        end_date: params.endDate || null
      })
    )

    return mapDirectusEmployeeShiftToIEmployeeShift(data)
  }

  /**
   * 批量指派班表
   */
  async batchAssign(params: IBatchAssignShiftParams): Promise<IEmployeeShift[]> {
    const results: IEmployeeShift[] = []

    for (const employeeId of params.employeeIds) {
      const result = await this.assignToEmployee({
        employeeId,
        shiftScheduleId: params.shiftScheduleId,
        effectiveDate: params.effectiveDate,
        endDate: params.endDate
      })
      results.push(result)
    }

    return results
  }

  /**
   * 更新員工班表指派
   */
  async updateEmployeeShift(
    shiftId: string,
    data: { effectiveDate?: string; endDate?: string | null }
  ): Promise<IEmployeeShift> {
    const updateData: Record<string, unknown> = {}
    if (data.effectiveDate !== undefined) updateData.effective_date = data.effectiveDate
    if (data.endDate !== undefined) updateData.end_date = data.endDate

    const result = await this.directus.request<DirectusEmployeeShift>(
      updateItemAny('employee_shifts', shiftId, updateData)
    )

    return mapDirectusEmployeeShiftToIEmployeeShift(result)
  }

  /**
   * 移除員工班表指派
   */
  async removeEmployeeShift(shiftId: string): Promise<IEmployeeShift> {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const result = await this.directus.request<DirectusEmployeeShift>(
      updateItemAny('employee_shifts', shiftId, {
        end_date: yesterday.toISOString().split('T')[0]
      })
    )

    return mapDirectusEmployeeShiftToIEmployeeShift(result)
  }

  /**
   * 取得分店員工列表
   */
  async getBranchEmployees(branchId: string): Promise<IEmployee[]> {
    const data = await this.directus.request<DirectusEmployee[]>(
      readItemsAny('employees', {
        filter: {
          branch_id: { _eq: branchId },
          employment_status: { _eq: 'ACTIVE' },
          status: { _eq: 'active' }
        },
        fields: [
          'id',
          'full_name',
          'employee_code',
          'branch_id',
          'job_title_id',
          'employment_status',
          'employment_type'
        ],
        sort: ['full_name']
      })
    )

    return data.map(mapDirectusEmployeeToIEmployee)
  }
}
