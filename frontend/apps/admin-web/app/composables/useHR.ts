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

  // ============================================
  // 班表管理
  // ============================================

  const shiftSchedules = useState<ShiftSchedule[]>('hr_shift_schedules', () => [])
  const isShiftLoading = useState('hr_shift_loading', () => false)

  // 取得班表列表
  const fetchShiftSchedules = async (branchId?: string) => {
    isShiftLoading.value = true
    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = { _eq: branchId }

      const data = await directus.request(
        readItems('shift_schedules', {
          filter,
          fields: ['*', 'branch.name'],
          sort: ['start_time']
        })
      )
      shiftSchedules.value = data as ShiftSchedule[]
    } catch (error) {
      console.error('Failed to fetch shift schedules:', error)
    } finally {
      isShiftLoading.value = false
    }
  }

  // 取得單一班表
  const getShiftSchedule = async (id: string) => {
    const data = await directus.request(
      readItem('shift_schedules', id, {
        fields: ['*', 'branch.*']
      })
    )
    return data as ShiftSchedule
  }

  // 建立班表
  const createShiftSchedule = async (shift: Partial<ShiftSchedule>) => {
    const data = await directus.request(
      createItem('shift_schedules', {
        ...shift,
        status: 'published'
      })
    )
    return data as ShiftSchedule
  }

  // 更新班表
  const updateShiftSchedule = async (id: string, shift: Partial<ShiftSchedule>) => {
    const data = await directus.request(
      updateItem('shift_schedules', id, shift)
    )
    return data as ShiftSchedule
  }

  // 刪除班表
  const deleteShiftSchedule = async (id: string) => {
    await directus.request(
      updateItem('shift_schedules', id, { status: 'archived' })
    )
  }

  // ============================================
  // 加班與遲到計算
  // ============================================

  // 計算遲到分鐘數
  const calculateLateMinutes = (checkInTime: string, shiftStartTime: string, gracePeriod: number = 0): number => {
    const checkIn = new Date(`1970-01-01T${checkInTime.split('T')[1] || checkInTime}`)
    const shiftStart = new Date(`1970-01-01T${shiftStartTime}`)
    const graceEnd = new Date(shiftStart.getTime() + gracePeriod * 60000)

    if (checkIn <= graceEnd) return 0
    return Math.floor((checkIn.getTime() - shiftStart.getTime()) / 60000)
  }

  // 計算早退分鐘數
  const calculateEarlyLeaveMinutes = (checkOutTime: string, shiftEndTime: string, allowedEarlyMinutes: number = 0): number => {
    const checkOut = new Date(`1970-01-01T${checkOutTime.split('T')[1] || checkOutTime}`)
    const shiftEnd = new Date(`1970-01-01T${shiftEndTime}`)
    const allowedEnd = new Date(shiftEnd.getTime() - allowedEarlyMinutes * 60000)

    if (checkOut >= allowedEnd) return 0
    return Math.floor((shiftEnd.getTime() - checkOut.getTime()) / 60000)
  }

  // 計算加班時數
  const calculateOvertimeHours = (checkOutTime: string, shiftEndTime: string, overtimeStartAfter: string | null): number => {
    if (!overtimeStartAfter) return 0

    const checkOut = new Date(`1970-01-01T${checkOutTime.split('T')[1] || checkOutTime}`)
    const overtimeStart = new Date(`1970-01-01T${overtimeStartAfter}`)

    if (checkOut <= overtimeStart) return 0
    return Math.round((checkOut.getTime() - overtimeStart.getTime()) / (1000 * 60 * 60) * 100) / 100
  }

  // ============================================
  // 月度考勤報表
  // ============================================

  interface MonthlyAttendanceStats {
    employeeId: string
    employeeName: string
    employeeCode: string
    totalDays: number
    presentDays: number
    absentDays: number
    lateDays: number
    earlyLeaveDays: number
    leaveDays: number
    totalWorkHours: number
    totalOvertimeHours: number
    totalLateMinutes: number
  }

  // 取得月度考勤統計
  const fetchMonthlyAttendanceStats = async (options: {
    branchId?: string
    year: number
    month: number
  }): Promise<MonthlyAttendanceStats[]> => {
    const { branchId, year, month } = options

    // 計算月份的開始和結束日期
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    try {
      const filter: Record<string, unknown> = {
        attendance_date: {
          _gte: startDate,
          _lte: endDate
        }
      }
      if (branchId) filter.branch_id = { _eq: branchId }

      const attendances = await directus.request(
        readItems('attendances', {
          filter,
          fields: ['*', 'employee.id', 'employee.full_name', 'employee.employee_code'],
          sort: ['employee_id', 'attendance_date']
        })
      ) as Attendance[]

      // 按員工分組統計
      const statsMap = new Map<string, MonthlyAttendanceStats>()

      for (const att of attendances) {
        const empId = att.employee_id
        if (!statsMap.has(empId)) {
          statsMap.set(empId, {
            employeeId: empId,
            employeeName: (att as unknown as { employee?: { full_name?: string } }).employee?.full_name || '',
            employeeCode: (att as unknown as { employee?: { employee_code?: string } }).employee?.employee_code || '',
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
    } catch (error) {
      console.error('Failed to fetch monthly attendance stats:', error)
      return []
    }
  }

  // 取得單一員工月度考勤詳情
  const fetchEmployeeMonthlyAttendance = async (employeeId: string, year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    try {
      const data = await directus.request(
        readItems('attendances', {
          filter: {
            employee_id: { _eq: employeeId },
            attendance_date: {
              _gte: startDate,
              _lte: endDate
            }
          },
          fields: ['*', 'branch.name'],
          sort: ['attendance_date']
        })
      )
      return data as Attendance[]
    } catch (error) {
      console.error('Failed to fetch employee monthly attendance:', error)
      return []
    }
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
    fetchApprovalHistory,
    // Shift Schedules
    shiftSchedules,
    isShiftLoading,
    fetchShiftSchedules,
    getShiftSchedule,
    createShiftSchedule,
    updateShiftSchedule,
    deleteShiftSchedule,
    // Overtime & Attendance Calculation
    calculateLateMinutes,
    calculateEarlyLeaveMinutes,
    calculateOvertimeHours,
    // Monthly Reports
    fetchMonthlyAttendanceStats,
    fetchEmployeeMonthlyAttendance
  }
}
