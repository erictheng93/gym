/**
 * useLeaveRequests - 休假管理 composable
 * 包含：休假申請、審核、餘額查詢
 */

import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { LeaveRequest, LeaveBalance, LeaveApprovalLog } from '~/types/directus'

export const useLeaveRequests = () => {
  const directus = useDirectus()

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
      const data = await directus.request(
        readItems('leave_balances', {
          filter: {
            employee_id: { _eq: employeeId },
            year: { _eq: currentYear }
          },
          fields: ['*']
        })
      )
      leaveBalances.value = data as LeaveBalance[]
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
      if (employeeId) filter.employee_id = { _eq: employeeId }
      if (status) filter.leave_status = { _eq: status }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('leave_requests', {
            filter,
            fields: ['*', 'employee.full_name', 'employee.employee_code', 'approver.full_name'] as any,
            sort: ['-date_created'],
            limit,
            offset: (page - 1) * limit
          })
        ),
        directus.request(
          aggregate('leave_requests', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      leaveRequests.value = data as LeaveRequest[]
      leavesTotalCount.value = Number(countResult[0]?.count) || 0
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
      const subordinates = await directus.request(
        readItems('employees', {
          filter: { supervisor_id: { _eq: supervisorId } },
          fields: ['id']
        })
      )

      if (subordinates.length === 0) {
        pendingApprovals.value = []
        return
      }

      const subordinateIds = subordinates.map((e: { id: string }) => e.id)

      const data = await directus.request(
        readItems('leave_requests', {
          filter: {
            employee_id: { _in: subordinateIds },
            leave_status: { _eq: 'PENDING' }
          },
          fields: ['*', 'employee.full_name', 'employee.employee_code', 'employee.branch.name'] as any,
          sort: ['-submitted_at']
        })
      )

      pendingApprovals.value = data as LeaveRequest[]
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
    leaveType: string
    startDate: string
    endDate: string
    reason?: string
    daysRequested: number
    isHalfDay?: boolean
    halfDayType?: 'AM' | 'PM'
  }) => {
    const data = await directus.request(
      createItem('leave_requests', {
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
    )

    await directus.request(
      createItem('leave_approval_logs', {
        leave_request_id: (data as LeaveRequest).id,
        action_by: leaveData.employeeId,
        action: 'SUBMIT',
        previous_status: null,
        new_status: 'PENDING',
        notes: '提交休假申請'
      })
    )

    return data as LeaveRequest
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
    const leaveRequest = await directus.request(
      readItem('leave_requests', leaveRequestId)
    ) as LeaveRequest

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const data = await directus.request(
      updateItem('leave_requests', leaveRequestId, {
        leave_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    await directus.request(
      createItem('leave_approval_logs', {
        leave_request_id: leaveRequestId,
        action_by: approverId,
        action,
        previous_status: leaveRequest.leave_status,
        new_status: newStatus,
        notes
      })
    )

    // 如果核准，更新休假餘額
    if (action === 'APPROVE' && leaveRequest.days_requested) {
      const year = new Date(leaveRequest.start_date).getFullYear()
      const balances = await directus.request(
        readItems('leave_balances', {
          filter: {
            employee_id: { _eq: leaveRequest.employee_id },
            leave_type: { _eq: leaveRequest.leave_type },
            year: { _eq: year }
          },
          limit: 1
        })
      )

      if (balances.length > 0) {
        const balance = balances[0] as LeaveBalance
        await directus.request(
          updateItem('leave_balances', balance.id, {
            used_days: balance.used_days + leaveRequest.days_requested,
            pending_days: Math.max(0, balance.pending_days - leaveRequest.days_requested)
          })
        )
      }
    }

    return data as LeaveRequest
  }

  /**
   * 取消休假申請
   */
  const cancelLeave = async (leaveRequestId: string, employeeId: string) => {
    const leaveRequest = await directus.request(
      readItem('leave_requests', leaveRequestId)
    ) as LeaveRequest

    if (leaveRequest.leave_status !== 'PENDING') {
      throw new Error('只能取消待審核的申請')
    }

    const data = await directus.request(
      updateItem('leave_requests', leaveRequestId, {
        leave_status: 'CANCELLED'
      })
    )

    await directus.request(
      createItem('leave_approval_logs', {
        leave_request_id: leaveRequestId,
        action_by: employeeId,
        action: 'CANCEL',
        previous_status: 'PENDING',
        new_status: 'CANCELLED',
        notes: '取消申請'
      })
    )

    return data as LeaveRequest
  }

  /**
   * 取得休假審核歷程
   */
  const fetchApprovalHistory = async (leaveRequestId: string) => {
    const data = await directus.request(
      readItems('leave_approval_logs', {
        filter: { leave_request_id: { _eq: leaveRequestId } },
        fields: ['*', 'action_by.full_name'] as any,
        sort: ['date_created']
      })
    )
    return data as LeaveApprovalLog[]
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
