/**
 * useMakeupRequests - 補打卡管理 composable
 * 包含：補打卡申請、審核、考勤更新
 */

import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { MakeupRequest, MakeupApprovalLog, Attendance } from '~/types/directus'

export const useMakeupRequests = () => {
  const directus = useDirectus()

  // ============================================
  // 狀態
  // ============================================

  const makeupRequests = useState<MakeupRequest[]>('hr_makeup_requests', () => [])
  const pendingMakeupApprovals = useState<MakeupRequest[]>('hr_pending_makeup_approvals', () => [])
  const isMakeupLoading = useState('hr_makeup_loading', () => false)
  const makeupTotalCount = useState('hr_makeup_total', () => 0)

  // ============================================
  // 補打卡申請查詢
  // ============================================

  /**
   * 取得員工補打卡申請
   */
  const fetchMakeupRequests = async (options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }) => {
    isMakeupLoading.value = true
    const { employeeId, status, page = 1, limit = 20 } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (employeeId) filter.employee_id = { _eq: employeeId }
      if (status) filter.request_status = { _eq: status }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('makeup_requests', {
            filter,
            fields: ['*', 'employee.full_name', 'employee.employee_code', 'approver.full_name', 'branch.name'] as any,
            sort: ['-date_created'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('makeup_requests', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      makeupRequests.value = data as MakeupRequest[]
      makeupTotalCount.value = Number(countResult[0]?.count) || 0
    } catch (error) {
      console.error('Failed to fetch makeup requests:', error)
    } finally {
      isMakeupLoading.value = false
    }
  }

  /**
   * 取得待審核的補打卡申請（主管用）
   */
  const fetchPendingMakeupApprovals = async (supervisorId: string) => {
    try {
      const subordinates = await directus.request(
        readItems('employees', {
          filter: { supervisor_id: { _eq: supervisorId } },
          fields: ['id']
        })
      )

      if (subordinates.length === 0) {
        pendingMakeupApprovals.value = []
        return
      }

      const subordinateIds = subordinates.map((e: { id: string }) => e.id)

      const data = await directus.request(
        readItems('makeup_requests', {
          filter: {
            employee_id: { _in: subordinateIds },
            request_status: { _eq: 'PENDING' }
          },
          fields: ['*', 'employee.full_name', 'employee.employee_code', 'employee.branch.name', 'branch.name'] as any,
          sort: ['-submitted_at']
        })
      )

      pendingMakeupApprovals.value = data as MakeupRequest[]
    } catch (error) {
      console.error('Failed to fetch pending makeup approvals:', error)
    }
  }

  // ============================================
  // 補打卡申請操作
  // ============================================

  /**
   * 申請補打卡
   */
  const applyMakeup = async (makeupData: {
    employeeId: string
    branchId: string
    targetDate: string
    makeupType: 'CHECK_IN' | 'CHECK_OUT' | 'BOTH'
    requestedCheckIn?: string
    requestedCheckOut?: string
    reason: string
  }) => {
    const data = await directus.request(
      createItem('makeup_requests', {
        employee_id: makeupData.employeeId,
        branch_id: makeupData.branchId,
        target_date: makeupData.targetDate,
        makeup_type: makeupData.makeupType,
        requested_check_in: makeupData.requestedCheckIn || null,
        requested_check_out: makeupData.requestedCheckOut || null,
        reason: makeupData.reason,
        request_status: 'PENDING',
        submitted_at: new Date().toISOString()
      })
    )

    await directus.request(
      createItem('makeup_approval_logs', {
        makeup_request_id: (data as MakeupRequest).id,
        action_by: makeupData.employeeId,
        action: 'SUBMIT',
        previous_status: null,
        new_status: 'PENDING',
        notes: '提交補打卡申請'
      })
    )

    return data as MakeupRequest
  }

  /**
   * 審核補打卡
   */
  const reviewMakeup = async (
    makeupRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ) => {
    const makeupRequest = await directus.request(
      readItem('makeup_requests', makeupRequestId)
    ) as MakeupRequest

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const data = await directus.request(
      updateItem('makeup_requests', makeupRequestId, {
        request_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    await directus.request(
      createItem('makeup_approval_logs', {
        makeup_request_id: makeupRequestId,
        action_by: approverId,
        action,
        previous_status: makeupRequest.request_status,
        new_status: newStatus,
        notes
      })
    )

    // 如果核准，更新考勤紀錄
    if (action === 'APPROVE') {
      await applyMakeupToAttendance(makeupRequest)
    }

    return data as MakeupRequest
  }

  /**
   * 將補打卡應用到考勤紀錄
   */
  const applyMakeupToAttendance = async (makeupRequest: MakeupRequest) => {
    const existingAttendances = await directus.request(
      readItems('attendances', {
        filter: {
          employee_id: { _eq: makeupRequest.employee_id },
          attendance_date: { _eq: makeupRequest.target_date }
        },
        limit: 1
      })
    ) as Attendance[]

    const updateData: Partial<Attendance> = {
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
      await directus.request(
        updateItem('attendances', existingAttendances[0].id, updateData)
      )
    } else {
      await directus.request(
        createItem('attendances', {
          employee_id: makeupRequest.employee_id,
          branch_id: makeupRequest.branch_id,
          attendance_date: makeupRequest.target_date,
          attendance_status: 'PRESENT',
          ...updateData
        })
      )
    }
  }

  /**
   * 取消補打卡申請
   */
  const cancelMakeup = async (makeupRequestId: string, employeeId: string) => {
    const makeupRequest = await directus.request(
      readItem('makeup_requests', makeupRequestId)
    ) as MakeupRequest

    if (makeupRequest.request_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await directus.request(
      updateItem('makeup_requests', makeupRequestId, {
        request_status: 'CANCELLED'
      })
    )

    await directus.request(
      createItem('makeup_approval_logs', {
        makeup_request_id: makeupRequestId,
        action_by: employeeId,
        action: 'CANCEL',
        previous_status: 'PENDING',
        new_status: 'CANCELLED',
        notes: '取消申請'
      })
    )

    return data as MakeupRequest
  }

  /**
   * 取得補打卡審核歷程
   */
  const fetchMakeupApprovalHistory = async (makeupRequestId: string) => {
    const data = await directus.request(
      readItems('makeup_approval_logs', {
        filter: { makeup_request_id: { _eq: makeupRequestId } },
        fields: ['*', 'actor.full_name'] as any,
        sort: ['date_created']
      })
    )
    return data as MakeupApprovalLog[]
  }

  return {
    // State
    makeupRequests,
    pendingMakeupApprovals,
    isMakeupLoading,
    makeupTotalCount,
    // Query
    fetchMakeupRequests,
    fetchPendingMakeupApprovals,
    fetchMakeupApprovalHistory,
    // Actions
    applyMakeup,
    reviewMakeup,
    cancelMakeup
  }
}

export default useMakeupRequests
