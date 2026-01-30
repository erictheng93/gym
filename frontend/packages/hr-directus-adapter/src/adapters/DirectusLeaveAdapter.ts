/**
 * Directus 休假適配器實現
 */

import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type {
  ILeaveAdapter,
  ILeaveQueryOptions,
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  IApplyLeaveParams,
  IReviewLeaveParams,
  LeaveType
} from '@gym-nexus/hr-core'
import {
  mapDirectusLeaveRequestToILeaveRequest,
  mapDirectusLeaveRequestToILeaveRequestWithRelations,
  mapDirectusLeaveBalanceToILeaveBalance,
  mapDirectusLeaveApprovalLogToILeaveApprovalLog,
  type DirectusLeaveRequest,
  type DirectusLeaveBalance,
  type DirectusLeaveApprovalLog
} from '../mappers/leaveMapper'
import type { DirectusTenantContext } from './DirectusTenantContext'

// Directus SDK 操作需要使用 as any 來繞過 schema 類型限制
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readItemsAny = readItems as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readItemAny = readItem as any
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
 * Directus 休假適配器
 */
export class DirectusLeaveAdapter implements ILeaveAdapter {
  constructor(
    private directus: DirectusClient,
    private tenantContext: DirectusTenantContext
  ) {}

  /**
   * 根據 ID 取得休假申請
   */
  async getById(id: string): Promise<ILeaveRequest | null> {
    try {
      const data = await this.directus.request<DirectusLeaveRequest>(
        readItemAny('leave_requests', id)
      )

      return mapDirectusLeaveRequestToILeaveRequest(data)
    } catch {
      return null
    }
  }

  /**
   * 根據 ID 取得休假申請（包含關聯）
   */
  async getByIdWithRelations(id: string): Promise<ILeaveRequestWithRelations | null> {
    try {
      const data = await this.directus.request<DirectusLeaveRequest>(
        readItemAny('leave_requests', id, {
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.branch_id',
            'employee.job_title_id',
            'employee.employment_status',
            'employee.employment_type',
            'approver.id',
            'approver.full_name',
            'approver.employee_code'
          ]
        })
      )

      return mapDirectusLeaveRequestToILeaveRequestWithRelations(data)
    } catch {
      return null
    }
  }

  /**
   * 查詢休假申請
   */
  async query(options: ILeaveQueryOptions): Promise<{
    data: ILeaveRequestWithRelations[]
    total: number
  }> {
    const { employeeId, status, leaveType, startDateFrom, startDateTo, page = 1, limit = 20 } = options
    const filter: Record<string, unknown> = {}

    if (employeeId) filter.employee_id = { _eq: employeeId }
    if (status) filter.leave_status = { _eq: status }
    if (leaveType) filter.leave_type = { _eq: leaveType }
    if (startDateFrom) filter.start_date = { ...filter.start_date as object, _gte: startDateFrom }
    if (startDateTo) filter.start_date = { ...filter.start_date as object, _lte: startDateTo }

    const [data, countResult] = await Promise.all([
      this.directus.request<DirectusLeaveRequest[]>(
        readItemsAny('leave_requests', {
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
            'approver.id',
            'approver.full_name'
          ],
          sort: ['-date_created'],
          limit,
          offset: (page - 1) * limit
        })
      ),
      this.directus.request<{ count: string }[]>(
        aggregateAny('leave_requests', {
          aggregate: { count: '*' },
          query: { filter }
        })
      )
    ])

    return {
      data: data.map(mapDirectusLeaveRequestToILeaveRequestWithRelations),
      total: Number(countResult[0]?.count) || 0
    }
  }

  /**
   * 取得待審核的休假申請
   */
  async getPendingApprovals(supervisorId: string): Promise<ILeaveRequestWithRelations[]> {
    // 先取得下屬員工
    const subordinates = await this.directus.request<{ id: string }[]>(
      readItemsAny('employees', {
        filter: { supervisor_id: { _eq: supervisorId } },
        fields: ['id']
      })
    )

    if (subordinates.length === 0) {
      return []
    }

    const subordinateIds = subordinates.map(e => e.id)

    const data = await this.directus.request<DirectusLeaveRequest[]>(
      readItemsAny('leave_requests', {
        filter: {
          employee_id: { _in: subordinateIds },
          leave_status: { _eq: 'PENDING' }
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
        ],
        sort: ['-submitted_at']
      })
    )

    return data.map(mapDirectusLeaveRequestToILeaveRequestWithRelations)
  }

  /**
   * 申請休假
   */
  async apply(params: IApplyLeaveParams): Promise<ILeaveRequest> {
    const data = await this.directus.request<DirectusLeaveRequest>(
      createItemAny('leave_requests', {
        employee_id: params.employeeId,
        leave_type: params.leaveType,
        start_date: params.startDate,
        end_date: params.endDate,
        reason: params.reason || null,
        days_requested: params.daysRequested,
        is_half_day: params.isHalfDay || false,
        half_day_type: params.halfDayType || null,
        leave_status: 'PENDING',
        submitted_at: new Date().toISOString()
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusLeaveApprovalLog>(
      createItemAny('leave_approval_logs', {
        leave_request_id: data.id,
        action_by: params.employeeId,
        action: 'SUBMIT',
        previous_status: null,
        new_status: 'PENDING',
        notes: '提交休假申請'
      })
    )

    return mapDirectusLeaveRequestToILeaveRequest(data)
  }

  /**
   * 審核休假
   */
  async review(params: IReviewLeaveParams): Promise<ILeaveRequest> {
    const { leaveRequestId, approverId, action, notes } = params

    // 取得原申請
    const original = await this.directus.request<DirectusLeaveRequest>(
      readItemAny('leave_requests', leaveRequestId)
    )

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    // 更新申請狀態
    const data = await this.directus.request<DirectusLeaveRequest>(
      updateItemAny('leave_requests', leaveRequestId, {
        leave_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusLeaveApprovalLog>(
      createItemAny('leave_approval_logs', {
        leave_request_id: leaveRequestId,
        action_by: approverId,
        action,
        previous_status: original.leave_status,
        new_status: newStatus,
        notes
      })
    )

    // 如果核准，更新休假餘額
    if (action === 'APPROVE' && original.days_requested) {
      const year = new Date(original.start_date).getFullYear()
      await this.updateBalanceOnApproval(
        original.employee_id,
        original.leave_type as LeaveType,
        year,
        original.days_requested
      )
    }

    return mapDirectusLeaveRequestToILeaveRequest(data)
  }

  /**
   * 取消休假申請
   */
  async cancel(leaveRequestId: string, employeeId: string): Promise<ILeaveRequest> {
    const original = await this.directus.request<DirectusLeaveRequest>(
      readItemAny('leave_requests', leaveRequestId)
    )

    if (original.leave_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await this.directus.request<DirectusLeaveRequest>(
      updateItemAny('leave_requests', leaveRequestId, {
        leave_status: 'CANCELLED'
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusLeaveApprovalLog>(
      createItemAny('leave_approval_logs', {
        leave_request_id: leaveRequestId,
        action_by: employeeId,
        action: 'CANCEL',
        previous_status: 'PENDING',
        new_status: 'CANCELLED',
        notes: '取消申請'
      })
    )

    return mapDirectusLeaveRequestToILeaveRequest(data)
  }

  /**
   * 取得員工休假餘額
   */
  async getBalances(employeeId: string, year?: number): Promise<ILeaveBalance[]> {
    const currentYear = year || new Date().getFullYear()

    const data = await this.directus.request<DirectusLeaveBalance[]>(
      readItemsAny('leave_balances', {
        filter: {
          employee_id: { _eq: employeeId },
          year: { _eq: currentYear }
        },
        fields: ['*']
      })
    )

    return data.map(mapDirectusLeaveBalanceToILeaveBalance)
  }

  /**
   * 取得特定類型的休假餘額
   */
  async getBalance(
    employeeId: string,
    leaveType: LeaveType,
    year?: number
  ): Promise<ILeaveBalance | null> {
    const currentYear = year || new Date().getFullYear()

    const data = await this.directus.request<DirectusLeaveBalance[]>(
      readItemsAny('leave_balances', {
        filter: {
          employee_id: { _eq: employeeId },
          leave_type: { _eq: leaveType },
          year: { _eq: currentYear }
        },
        limit: 1
      })
    )

    const record = data[0]
    if (!record) return null
    return mapDirectusLeaveBalanceToILeaveBalance(record)
  }

  /**
   * 更新休假餘額
   */
  async updateBalance(
    balanceId: string,
    data: Partial<Pick<ILeaveBalance, 'usedDays' | 'pendingDays'>>
  ): Promise<ILeaveBalance> {
    const updateData: Record<string, unknown> = {}
    if (data.usedDays !== undefined) updateData.used_days = data.usedDays
    if (data.pendingDays !== undefined) updateData.pending_days = data.pendingDays

    const result = await this.directus.request<DirectusLeaveBalance>(
      updateItemAny('leave_balances', balanceId, updateData)
    )

    return mapDirectusLeaveBalanceToILeaveBalance(result)
  }

  /**
   * 取得休假審核歷程
   */
  async getApprovalHistory(leaveRequestId: string): Promise<ILeaveApprovalLog[]> {
    const data = await this.directus.request<DirectusLeaveApprovalLog[]>(
      readItemsAny('leave_approval_logs', {
        filter: { leave_request_id: { _eq: leaveRequestId } },
        fields: ['*'],
        sort: ['date_created']
      })
    )

    return data.map(mapDirectusLeaveApprovalLogToILeaveApprovalLog)
  }

  /**
   * 核准時更新餘額（私有方法）
   */
  private async updateBalanceOnApproval(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    daysUsed: number
  ): Promise<void> {
    const balances = await this.directus.request<DirectusLeaveBalance[]>(
      readItemsAny('leave_balances', {
        filter: {
          employee_id: { _eq: employeeId },
          leave_type: { _eq: leaveType },
          year: { _eq: year }
        },
        limit: 1
      })
    )

    const balance = balances[0]
    if (balance) {
      await this.directus.request<DirectusLeaveBalance>(
        updateItemAny('leave_balances', balance.id, {
          used_days: balance.used_days + daysUsed,
          pending_days: Math.max(0, balance.pending_days - daysUsed)
        })
      )
    }
  }
}
