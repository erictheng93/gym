import { readItems, readItem, createItem, updateItem, aggregate } from '@directus/sdk'
import type { Attendance, LeaveRequest, LeaveBalance, LeaveApprovalLog, ShiftSchedule } from '~/types/directus'

export const useHR = () => {
  const directus = useDirectus()
  const { user } = useAuth()

  // ============================================
  // 考勤相關
  // ============================================

  const todayAttendance = useState<Attendance | null>('hr_today_attendance', () => null)
  const recentAttendances = useState<Attendance[]>('hr_recent_attendances', () => [])
  const isAttendanceLoading = useState('hr_attendance_loading', () => false)

  // 取得今日考勤狀態
  const fetchTodayAttendance = async (employeeId: string) => {
    isAttendanceLoading.value = true
    try {
      const today = new Date().toISOString().split('T')[0]
      const data = await directus.request(
        readItems('attendances', {
          filter: {
            employee_id: { _eq: employeeId },
            attendance_date: { _eq: today }
          },
          fields: ['*', 'employee.full_name', 'branch.name'],
          limit: 1
        })
      )
      todayAttendance.value = (data[0] as Attendance) || null
    } catch (error) {
      console.error('Failed to fetch today attendance:', error)
      todayAttendance.value = null
    } finally {
      isAttendanceLoading.value = false
    }
  }

  // 取得近期考勤紀錄
  const fetchRecentAttendances = async (employeeId: string, days: number = 7) => {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const data = await directus.request(
        readItems('attendances', {
          filter: {
            employee_id: { _eq: employeeId },
            attendance_date: { _gte: startDate.toISOString().split('T')[0] }
          },
          fields: ['*', 'branch.name'],
          sort: ['-attendance_date'],
          limit: days
        })
      )
      recentAttendances.value = data as Attendance[]
    } catch (error) {
      console.error('Failed to fetch recent attendances:', error)
    }
  }

  // 上班打卡
  const checkIn = async (employeeId: string, branchId: string, locationInfo?: { ip?: string; gps?: string }) => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // 檢查是否已有今日打卡紀錄
    if (todayAttendance.value?.check_in) {
      throw new Error('今日已打卡上班')
    }

    const attendanceData: Partial<Attendance> = {
      employee_id: employeeId,
      branch_id: branchId,
      check_in: now.toISOString(),
      attendance_date: today,
      check_type: 'REGULAR',
      attendance_status: 'PRESENT',
      location_ip: locationInfo?.ip || null,
      location_gps: locationInfo?.gps || null
    }

    if (todayAttendance.value) {
      // 更新現有記錄
      const data = await directus.request(
        updateItem('attendances', todayAttendance.value.id, attendanceData)
      )
      todayAttendance.value = data as Attendance
    } else {
      // 創建新記錄
      const data = await directus.request(
        createItem('attendances', attendanceData)
      )
      todayAttendance.value = data as Attendance
    }

    return todayAttendance.value
  }

  // 下班打卡
  const checkOut = async () => {
    if (!todayAttendance.value?.id) {
      throw new Error('尚未打卡上班')
    }

    if (todayAttendance.value.check_out) {
      throw new Error('今日已打卡下班')
    }

    const now = new Date()
    const checkInTime = new Date(todayAttendance.value.check_in!)
    const workHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

    const data = await directus.request(
      updateItem('attendances', todayAttendance.value.id, {
        check_out: now.toISOString(),
        work_hours: Math.round(workHours * 100) / 100
      })
    )

    todayAttendance.value = data as Attendance
    return todayAttendance.value
  }

  // ============================================
  // 休假相關
  // ============================================

  const leaveRequests = useState<LeaveRequest[]>('hr_leave_requests', () => [])
  const leaveBalances = useState<LeaveBalance[]>('hr_leave_balances', () => [])
  const pendingApprovals = useState<LeaveRequest[]>('hr_pending_approvals', () => [])
  const isLeavesLoading = useState('hr_leaves_loading', () => false)
  const leavesTotalCount = useState('hr_leaves_total', () => 0)

  // 取得員工休假餘額
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

  // 取得員工休假申請
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
            fields: ['*', 'employee.full_name', 'employee.employee_code', 'approver.full_name'],
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

  // 取得待審核的休假申請（主管用）
  const fetchPendingApprovals = async (supervisorId: string) => {
    try {
      // 先取得此主管下屬的員工
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
          fields: ['*', 'employee.full_name', 'employee.employee_code', 'employee.branch.name'],
          sort: ['-submitted_at']
        })
      )

      pendingApprovals.value = data as LeaveRequest[]
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error)
    }
  }

  // 申請休假
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

    // 記錄審核歷程
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

  // 審核休假
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

    // 更新休假申請狀態
    const data = await directus.request(
      updateItem('leave_requests', leaveRequestId, {
        leave_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    // 記錄審核歷程
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

  // 取消休假申請
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

  // 取得休假審核歷程
  const fetchApprovalHistory = async (leaveRequestId: string) => {
    const data = await directus.request(
      readItems('leave_approval_logs', {
        filter: { leave_request_id: { _eq: leaveRequestId } },
        fields: ['*', 'actor.full_name'],
        sort: ['date_created']
      })
    )
    return data as LeaveApprovalLog[]
  }

  return {
    // Attendance
    todayAttendance,
    recentAttendances,
    isAttendanceLoading,
    fetchTodayAttendance,
    fetchRecentAttendances,
    checkIn,
    checkOut,
    // Leaves
    leaveRequests,
    leaveBalances,
    pendingApprovals,
    isLeavesLoading,
    leavesTotalCount,
    fetchLeaveBalances,
    fetchLeaveRequests,
    fetchPendingApprovals,
    applyLeave,
    reviewLeave,
    cancelLeave,
    fetchApprovalHistory
  }
}
