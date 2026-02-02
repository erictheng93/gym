/**
 * useMakeupRequests - 補打卡管理 composable
 * 包含：補打卡申請、審核、考勤更新
 */

import { useFetch } from '~/composables/core/useFetch'
import type { MakeupRequest, MakeupApprovalLog, Attendance, Employee } from '~/types/schema'

export const useMakeupRequests = () => {
  const { readItems, readItem, createItem, updateItem } = useFetch()

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
      if (employeeId) filter.employee_id = employeeId
      if (status) filter.request_status = status

      const result = await readItems<MakeupRequest>('makeup_requests', {
        filter,
        sort: 'date_created',
        sortOrder: 'desc',
        limit,
        page
      })

      makeupRequests.value = result.data
      makeupTotalCount.value = result.total
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
      const subordinatesResult = await readItems<Employee>('employees', {
        filter: { supervisor_id: supervisorId }
      })

      if (subordinatesResult.data.length === 0) {
        pendingMakeupApprovals.value = []
        return
      }

      const subordinateIds = subordinatesResult.data.map(e => e.id)

      // Fetch pending makeup requests and filter client-side
      const result = await readItems<MakeupRequest>('makeup_requests', {
        filter: {
          request_status: 'PENDING'
        },
        sort: 'submitted_at',
        sortOrder: 'desc',
        limit: 100
      })

      pendingMakeupApprovals.value = result.data.filter(mr =>
        subordinateIds.includes(mr.employee_id)
      )
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
    const data = await createItem<MakeupRequest>('makeup_requests', {
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

    if (!data) {
      throw new Error('Failed to create makeup request')
    }

    await createItem<MakeupApprovalLog>('makeup_approval_logs', {
      makeup_request_id: data.id,
      action_by: makeupData.employeeId,
      action: 'SUBMIT',
      previous_status: null,
      new_status: 'PENDING',
      notes: '提交補打卡申請'
    })

    return data
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
    const makeupRequest = await readItem<MakeupRequest>('makeup_requests', makeupRequestId)

    if (!makeupRequest) {
      throw new Error('Makeup request not found')
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const data = await updateItem<MakeupRequest>('makeup_requests', makeupRequestId, {
      request_status: newStatus,
      approver_id: approverId,
      approved_at: new Date().toISOString(),
      approval_notes: notes || null
    })

    await createItem<MakeupApprovalLog>('makeup_approval_logs', {
      makeup_request_id: makeupRequestId,
      action_by: approverId,
      action,
      previous_status: makeupRequest.request_status,
      new_status: newStatus,
      notes
    })

    // 如果核准，更新考勤紀錄
    if (action === 'APPROVE') {
      await applyMakeupToAttendance(makeupRequest)
    }

    return data
  }

  /**
   * 將補打卡應用到考勤紀錄
   */
  const applyMakeupToAttendance = async (makeupRequest: MakeupRequest) => {
    const existingResult = await readItems<Attendance>('attendances', {
      filter: {
        employee_id: makeupRequest.employee_id,
        attendance_date: makeupRequest.target_date
      },
      limit: 1
    })

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

    const existingAttendance = existingResult.data[0]
    if (existingAttendance) {
      await updateItem<Attendance>('attendances', existingAttendance.id, updateData)
    } else {
      await createItem<Attendance>('attendances', {
        employee_id: makeupRequest.employee_id,
        branch_id: makeupRequest.branch_id,
        attendance_date: makeupRequest.target_date,
        attendance_status: 'PRESENT',
        ...updateData
      })
    }
  }

  /**
   * 取消補打卡申請
   */
  const cancelMakeup = async (makeupRequestId: string, employeeId: string) => {
    const makeupRequest = await readItem<MakeupRequest>('makeup_requests', makeupRequestId)

    if (!makeupRequest) {
      throw new Error('Makeup request not found')
    }

    if (makeupRequest.request_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await updateItem<MakeupRequest>('makeup_requests', makeupRequestId, {
      request_status: 'CANCELLED'
    })

    await createItem<MakeupApprovalLog>('makeup_approval_logs', {
      makeup_request_id: makeupRequestId,
      action_by: employeeId,
      action: 'CANCEL',
      previous_status: 'PENDING',
      new_status: 'CANCELLED',
      notes: '取消申請'
    })

    return data
  }

  /**
   * 取得補打卡審核歷程
   */
  const fetchMakeupApprovalHistory = async (makeupRequestId: string) => {
    const result = await readItems<MakeupApprovalLog>('makeup_approval_logs', {
      filter: { makeup_request_id: makeupRequestId },
      sort: 'date_created'
    })
    return result.data
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
