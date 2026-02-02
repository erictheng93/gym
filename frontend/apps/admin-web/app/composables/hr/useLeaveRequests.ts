/**
 * useLeaveRequests - 休假管理 composable
 * 包含：休假申請、審核、餘額查詢
 */

import { useFetch } from '~/composables/core/useFetch'
import type { LeaveRequest, LeaveBalance, LeaveApprovalLog, Employee } from '~/types/schema'

export const useLeaveRequests = () => {
  const { readItems, readItem, createItem, updateItem } = useFetch()

  // ============================================
  // 狀態
  // ============================================

  const leaveRequests = useState<LeaveRequest[]>('hr_leave_requests', () => [])
  const leaveBalances = useState<LeaveBalance[]>('hr_leave_balances', () => [])
  const pendingApprovals = useState<LeaveRequest[]>('hr_pending_approvals', () => [])
  const isLeavesLoading = useState('hr_leaves_loading', () => false)
  const leavesTotalCount = useState('hr_leaves_total', () => 0)

  // ============================================
  // 休假餘額
  // ============================================

  /**
   * 取得員工休假餘額
   */
  const fetchLeaveBalances = async (employeeId: string, year?: number) => {
    const currentYear = year || new Date().getFullYear()
    try {
      const result = await readItems<LeaveBalance>('leave_balances', {
        filter: {
          employee_id: employeeId,
          year: currentYear
        }
      })
      leaveBalances.value = result.data
    } catch (error) {
      console.error('Failed to fetch leave balances:', error)
    }
  }

  // ============================================
  // 休假申請查詢
  // ============================================

  /**
   * 取得員工休假申請
   */
  const fetchLeaveRequests = async (options?: {
    employeeId?: string
    status?: string
    page?: number
    limit?: number
  }) => {
    isLeavesLoading.value = true
    const { employeeId, status, page = 1, limit = 20 } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (employeeId) filter.employee_id = employeeId
      if (status) filter.leave_status = status

      const result = await readItems<LeaveRequest>('leave_requests', {
        filter,
        sort: 'date_created',
        sortOrder: 'desc',
        limit,
        page
      })

      leaveRequests.value = result.data
      leavesTotalCount.value = result.total
    } catch (error) {
      console.error('Failed to fetch leave requests:', error)
    } finally {
      isLeavesLoading.value = false
    }
  }

  /**
   * 取得待審核的休假申請（主管用）
   */
  const fetchPendingApprovals = async (supervisorId: string) => {
    try {
      const subordinatesResult = await readItems<Employee>('employees', {
        filter: { supervisor_id: supervisorId }
      })

      if (subordinatesResult.data.length === 0) {
        pendingApprovals.value = []
        return
      }

      const subordinateIds = subordinatesResult.data.map(e => e.id)

      // Fetch pending leave requests for all subordinates
      // Since the API might not support _in filter, we fetch all pending and filter client-side
      const result = await readItems<LeaveRequest>('leave_requests', {
        filter: {
          leave_status: 'PENDING'
        },
        sort: 'submitted_at',
        sortOrder: 'desc',
        limit: 100
      })

      pendingApprovals.value = result.data.filter(lr =>
        subordinateIds.includes(lr.employee_id)
      )
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error)
    }
  }

  // ============================================
  // 休假申請操作
  // ============================================

  /**
   * 申請休假
   */
  const applyLeave = async (leaveData: {
    employeeId: string
    leaveType: LeaveRequest['leave_type']
    startDate: string
    endDate: string
    reason?: string
    daysRequested: number
    isHalfDay?: boolean
    halfDayType?: 'AM' | 'PM'
  }) => {
    const data = await createItem<LeaveRequest>('leave_requests', {
      employee_id: leaveData.employeeId,
      leave_type: leaveData.leaveType,
      start_date: leaveData.startDate,
      end_date: leaveData.endDate,
      reason: leaveData.reason || null,
      days_requested: leaveData.daysRequested,
      is_half_day: leaveData.isHalfDay || false,
      half_day_type: leaveData.halfDayType || null,
      leave_status: 'PENDING',
      submitted_at: new Date().toISOString()
    })

    if (!data) {
      throw new Error('Failed to create leave request')
    }

    await createItem<LeaveApprovalLog>('leave_approval_logs', {
      leave_request_id: data.id,
      action_by: leaveData.employeeId,
      action: 'SUBMIT',
      previous_status: null,
      new_status: 'PENDING',
      notes: '提交休假申請'
    })

    return data
  }

  /**
   * 審核休假
   */
  const reviewLeave = async (
    leaveRequestId: string,
    approverId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string
  ) => {
    const leaveRequest = await readItem<LeaveRequest>('leave_requests', leaveRequestId)

    if (!leaveRequest) {
      throw new Error('Leave request not found')
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const data = await updateItem<LeaveRequest>('leave_requests', leaveRequestId, {
      leave_status: newStatus,
      approver_id: approverId,
      approved_at: new Date().toISOString(),
      approval_notes: notes || null
    })

    await createItem<LeaveApprovalLog>('leave_approval_logs', {
      leave_request_id: leaveRequestId,
      action_by: approverId,
      action,
      previous_status: leaveRequest.leave_status,
      new_status: newStatus,
      notes
    })

    // 如果核准，更新休假餘額
    if (action === 'APPROVE' && leaveRequest.days_requested) {
      const year = new Date(leaveRequest.start_date).getFullYear()
      const balancesResult = await readItems<LeaveBalance>('leave_balances', {
        filter: {
          employee_id: leaveRequest.employee_id,
          leave_type: leaveRequest.leave_type,
          year: year
        },
        limit: 1
      })

      const balance = balancesResult.data[0]
      if (balance) {
        await updateItem<LeaveBalance>('leave_balances', balance.id, {
          used_days: balance.used_days + leaveRequest.days_requested,
          pending_days: Math.max(0, balance.pending_days - leaveRequest.days_requested)
        })
      }
    }

    return data
  }

  /**
   * 取消休假申請
   */
  const cancelLeave = async (leaveRequestId: string, employeeId: string) => {
    const leaveRequest = await readItem<LeaveRequest>('leave_requests', leaveRequestId)

    if (!leaveRequest) {
      throw new Error('Leave request not found')
    }

    if (leaveRequest.leave_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await updateItem<LeaveRequest>('leave_requests', leaveRequestId, {
      leave_status: 'CANCELLED'
    })

    await createItem<LeaveApprovalLog>('leave_approval_logs', {
      leave_request_id: leaveRequestId,
      action_by: employeeId,
      action: 'CANCEL',
      previous_status: 'PENDING',
      new_status: 'CANCELLED',
      notes: '取消申請'
    })

    return data
  }

  /**
   * 取得休假審核歷程
   */
  const fetchApprovalHistory = async (leaveRequestId: string) => {
    const result = await readItems<LeaveApprovalLog>('leave_approval_logs', {
      filter: { leave_request_id: leaveRequestId },
      sort: 'date_created'
    })
    return result.data
  }

  return {
    // State
    leaveRequests,
    leaveBalances,
    pendingApprovals,
    isLeavesLoading,
    leavesTotalCount,
    // Query
    fetchLeaveBalances,
    fetchLeaveRequests,
    fetchPendingApprovals,
    fetchApprovalHistory,
    // Actions
    applyLeave,
    reviewLeave,
    cancelLeave
  }
}

export default useLeaveRequests
