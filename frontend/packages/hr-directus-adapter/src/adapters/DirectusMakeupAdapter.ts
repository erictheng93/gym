/**
 * Directus 補打卡適配器實現
 */

import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type {
  IMakeupAdapter,
  IMakeupQueryOptions,
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  IApplyMakeupParams,
  IReviewMakeupParams
} from '@gym-nexus/hr-core'
import {
  mapDirectusMakeupRequestToIMakeupRequest,
  mapDirectusMakeupRequestToIMakeupRequestWithRelations,
  mapDirectusMakeupApprovalLogToIMakeupApprovalLog,
  type DirectusMakeupRequest,
  type DirectusMakeupApprovalLog
} from '../mappers/makeupMapper'
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
 * Directus 補打卡適配器
 */
export class DirectusMakeupAdapter implements IMakeupAdapter {
  constructor(
    private directus: DirectusClient,
    private tenantContext: DirectusTenantContext
  ) {}

  /**
   * 根據 ID 取得補打卡申請
   */
  async getById(id: string): Promise<IMakeupRequest | null> {
    try {
      const data = await this.directus.request<DirectusMakeupRequest>(
        readItemAny('makeup_requests', id)
      )

      return mapDirectusMakeupRequestToIMakeupRequest(data)
    } catch {
      return null
    }
  }

  /**
   * 根據 ID 取得補打卡申請（包含關聯）
   */
  async getByIdWithRelations(id: string): Promise<IMakeupRequestWithRelations | null> {
    try {
      const data = await this.directus.request<DirectusMakeupRequest>(
        readItemAny('makeup_requests', id, {
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.branch_id',
            'employee.job_title_id',
            'employee.employment_status',
            'employee.employment_type',
            'branch.id',
            'branch.name',
            'approver.id',
            'approver.full_name',
            'approver.employee_code'
          ]
        })
      )

      return mapDirectusMakeupRequestToIMakeupRequestWithRelations(data)
    } catch {
      return null
    }
  }

  /**
   * 查詢補打卡申請
   */
  async query(options: IMakeupQueryOptions): Promise<{
    data: IMakeupRequestWithRelations[]
    total: number
  }> {
    const { employeeId, status, targetDateFrom, targetDateTo, page = 1, limit = 20 } = options
    const filter: Record<string, unknown> = {}

    if (employeeId) filter.employee_id = { _eq: employeeId }
    if (status) filter.request_status = { _eq: status }
    if (targetDateFrom) filter.target_date = { ...filter.target_date as object, _gte: targetDateFrom }
    if (targetDateTo) filter.target_date = { ...filter.target_date as object, _lte: targetDateTo }

    const [data, countResult] = await Promise.all([
      this.directus.request<DirectusMakeupRequest[]>(
        readItemsAny('makeup_requests', {
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
            'branch.id',
            'branch.name',
            'approver.id',
            'approver.full_name'
          ],
          sort: ['-date_created'],
          limit,
          offset: (page - 1) * limit
        })
      ),
      this.directus.request<{ count: string }[]>(
        aggregateAny('makeup_requests', {
          aggregate: { count: '*' },
          query: { filter }
        })
      )
    ])

    return {
      data: data.map(mapDirectusMakeupRequestToIMakeupRequestWithRelations),
      total: Number(countResult[0]?.count) || 0
    }
  }

  /**
   * 取得待審核的補打卡申請
   */
  async getPendingApprovals(supervisorId: string): Promise<IMakeupRequestWithRelations[]> {
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

    const data = await this.directus.request<DirectusMakeupRequest[]>(
      readItemsAny('makeup_requests', {
        filter: {
          employee_id: { _in: subordinateIds },
          request_status: { _eq: 'PENDING' }
        },
        fields: [
          '*',
          'employee.id',
          'employee.full_name',
          'employee.employee_code',
          'employee.branch_id',
          'employee.job_title_id',
          'employee.employment_status',
          'employee.employment_type',
          'branch.id',
          'branch.name'
        ],
        sort: ['-submitted_at']
      })
    )

    return data.map(mapDirectusMakeupRequestToIMakeupRequestWithRelations)
  }

  /**
   * 申請補打卡
   */
  async apply(params: IApplyMakeupParams): Promise<IMakeupRequest> {
    const data = await this.directus.request<DirectusMakeupRequest>(
      createItemAny('makeup_requests', {
        employee_id: params.employeeId,
        branch_id: params.branchId,
        target_date: params.targetDate,
        makeup_type: params.makeupType,
        requested_check_in: params.requestedCheckIn || null,
        requested_check_out: params.requestedCheckOut || null,
        reason: params.reason,
        request_status: 'PENDING',
        submitted_at: new Date().toISOString()
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusMakeupApprovalLog>(
      createItemAny('makeup_approval_logs', {
        makeup_request_id: data.id,
        action_by: params.employeeId,
        action: 'SUBMIT',
        previous_status: null,
        new_status: 'PENDING',
        notes: '提交補打卡申請'
      })
    )

    return mapDirectusMakeupRequestToIMakeupRequest(data)
  }

  /**
   * 審核補打卡
   */
  async review(params: IReviewMakeupParams): Promise<IMakeupRequest> {
    const { makeupRequestId, approverId, action, notes } = params

    // 取得原申請
    const original = await this.directus.request<DirectusMakeupRequest>(
      readItemAny('makeup_requests', makeupRequestId)
    )

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    // 更新申請狀態
    const data = await this.directus.request<DirectusMakeupRequest>(
      updateItemAny('makeup_requests', makeupRequestId, {
        request_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusMakeupApprovalLog>(
      createItemAny('makeup_approval_logs', {
        makeup_request_id: makeupRequestId,
        action_by: approverId,
        action,
        previous_status: original.request_status,
        new_status: newStatus,
        notes
      })
    )

    // 如果核准，更新考勤紀錄
    if (action === 'APPROVE') {
      await this.applyMakeupToAttendance(original)
    }

    return mapDirectusMakeupRequestToIMakeupRequest(data)
  }

  /**
   * 取消補打卡申請
   */
  async cancel(makeupRequestId: string, employeeId: string): Promise<IMakeupRequest> {
    const original = await this.directus.request<DirectusMakeupRequest>(
      readItemAny('makeup_requests', makeupRequestId)
    )

    if (original.request_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await this.directus.request<DirectusMakeupRequest>(
      updateItemAny('makeup_requests', makeupRequestId, {
        request_status: 'CANCELLED'
      })
    )

    // 記錄審核歷程
    await this.directus.request<DirectusMakeupApprovalLog>(
      createItemAny('makeup_approval_logs', {
        makeup_request_id: makeupRequestId,
        action_by: employeeId,
        action: 'CANCEL',
        previous_status: 'PENDING',
        new_status: 'CANCELLED',
        notes: '取消申請'
      })
    )

    return mapDirectusMakeupRequestToIMakeupRequest(data)
  }

  /**
   * 取得補打卡審核歷程
   */
  async getApprovalHistory(makeupRequestId: string): Promise<IMakeupApprovalLog[]> {
    const data = await this.directus.request<DirectusMakeupApprovalLog[]>(
      readItemsAny('makeup_approval_logs', {
        filter: { makeup_request_id: { _eq: makeupRequestId } },
        fields: ['*'],
        sort: ['date_created']
      })
    )

    return data.map(mapDirectusMakeupApprovalLogToIMakeupApprovalLog)
  }

  /**
   * 將補打卡應用到考勤紀錄（私有方法）
   */
  private async applyMakeupToAttendance(makeupRequest: DirectusMakeupRequest): Promise<void> {
    // 查找現有考勤記錄
    const existingAttendances = await this.directus.request<{ id: string }[]>(
      readItemsAny('attendances', {
        filter: {
          employee_id: { _eq: makeupRequest.employee_id },
          attendance_date: { _eq: makeupRequest.target_date }
        },
        limit: 1
      })
    )

    const updateData: Record<string, unknown> = {
      check_type: 'MAKEUP',
      notes: `補打卡申請核准 - ${makeupRequest.reason}`
    }

    if (makeupRequest.makeup_type === 'CHECK_IN' || makeupRequest.makeup_type === 'BOTH') {
      if (makeupRequest.requested_check_in) {
        updateData.check_in = `${makeupRequest.target_date}T${makeupRequest.requested_check_in}`
      }
    }

    if (makeupRequest.makeup_type === 'CHECK_OUT' || makeupRequest.makeup_type === 'BOTH') {
      if (makeupRequest.requested_check_out) {
        updateData.check_out = `${makeupRequest.target_date}T${makeupRequest.requested_check_out}`
      }
    }

    if (existingAttendances.length > 0) {
      // 更新現有記錄
      await this.directus.request<unknown>(
        updateItemAny('attendances', existingAttendances[0].id, updateData)
      )
    } else {
      // 創建新記錄
      await this.directus.request<unknown>(
        createItemAny('attendances', {
          employee_id: makeupRequest.employee_id,
          branch_id: makeupRequest.branch_id,
          attendance_date: makeupRequest.target_date,
          attendance_status: 'PRESENT',
          late_minutes: 0,
          early_leave_minutes: 0,
          overtime_hours: 0,
          ...updateData
        })
      )
    }
  }
}
