import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { Attendance, LeaveRequest, LeaveBalance, LeaveApprovalLog, ShiftSchedule, MakeupRequest, MakeupApprovalLog, EmployeeShift, Employee } from '~/types/directus'

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
        fields: ['*', 'action_by.full_name'],
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
  // 今日考勤統計（Dashboard 用）
  // ============================================

  interface TodayAttendanceSummary {
    totalEmployees: number
    checkedIn: number
    notCheckedIn: number
    checkedOut: number
    late: number
    onLeave: number
  }

  const todayAttendanceSummary = useState<TodayAttendanceSummary | null>('hr_today_summary', () => null)

  // 取得今日全員考勤概況
  const fetchTodayAttendanceSummary = async (branchId?: string): Promise<TodayAttendanceSummary> => {
    const today = new Date().toISOString().split('T')[0]

    try {
      // 取得員工總數
      const employeeFilter: Record<string, unknown> = { employment_status: { _eq: 'ACTIVE' } }
      if (branchId) employeeFilter.branch_id = { _eq: branchId }

      const employeesResult = await directus.request(
        aggregate('employees', {
          aggregate: { count: '*' },
          query: { filter: employeeFilter }
        })
      )
      const totalEmployees = Number(employeesResult[0]?.count) || 0

      // 取得今日考勤紀錄
      const attendanceFilter: Record<string, unknown> = { attendance_date: { _eq: today } }
      if (branchId) attendanceFilter.branch_id = { _eq: branchId }

      const attendances = await directus.request(
        readItems('attendances', {
          filter: attendanceFilter,
          fields: ['id', 'check_in', 'check_out', 'attendance_status']
        })
      ) as { id: string; check_in: string | null; check_out: string | null; attendance_status: string }[]

      // 取得今日請假人數
      const leaveFilter: Record<string, unknown> = {
        leave_status: { _eq: 'APPROVED' },
        start_date: { _lte: today },
        end_date: { _gte: today }
      }
      const leaveResult = await directus.request(
        aggregate('leave_requests', {
          aggregate: { count: '*' },
          query: { filter: leaveFilter }
        })
      )
      const onLeave = Number(leaveResult[0]?.count) || 0

      const checkedIn = attendances.filter(a => a.check_in).length
      const checkedOut = attendances.filter(a => a.check_out).length
      const late = attendances.filter(a => a.attendance_status === 'LATE').length
      const notCheckedIn = totalEmployees - checkedIn - onLeave

      const summary: TodayAttendanceSummary = {
        totalEmployees,
        checkedIn,
        notCheckedIn: Math.max(0, notCheckedIn),
        checkedOut,
        late,
        onLeave
      }

      todayAttendanceSummary.value = summary
      return summary
    } catch (error) {
      console.error('Failed to fetch today attendance summary:', error)
      return {
        totalEmployees: 0,
        checkedIn: 0,
        notCheckedIn: 0,
        checkedOut: 0,
        late: 0,
        onLeave: 0
      }
    }
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

  // ============================================
  // 補打卡申請
  // ============================================

  const makeupRequests = useState<MakeupRequest[]>('hr_makeup_requests', () => [])
  const pendingMakeupApprovals = useState<MakeupRequest[]>('hr_pending_makeup_approvals', () => [])
  const isMakeupLoading = useState('hr_makeup_loading', () => false)
  const makeupTotalCount = useState('hr_makeup_total', () => 0)

  // 取得員工補打卡申請
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
            fields: ['*', 'employee.full_name', 'employee.employee_code', 'approver.full_name', 'branch.name'],
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

  // 取得待審核的補打卡申請（主管用）
  const fetchPendingMakeupApprovals = async (supervisorId: string) => {
    try {
      // 先取得此主管下屬的員工
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
          fields: ['*', 'employee.full_name', 'employee.employee_code', 'employee.branch.name', 'branch.name'],
          sort: ['-submitted_at']
        })
      )

      pendingMakeupApprovals.value = data as MakeupRequest[]
    } catch (error) {
      console.error('Failed to fetch pending makeup approvals:', error)
    }
  }

  // 申請補打卡
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

    // 記錄審核歷程
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

  // 審核補打卡
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

    // 更新補打卡申請狀態
    const data = await directus.request(
      updateItem('makeup_requests', makeupRequestId, {
        request_status: newStatus,
        approver_id: approverId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null
      })
    )

    // 記錄審核歷程
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

  // 將補打卡應用到考勤紀錄
  const applyMakeupToAttendance = async (makeupRequest: MakeupRequest) => {
    // 查找該日是否已有考勤紀錄
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
      // 更新現有紀錄
      await directus.request(
        updateItem('attendances', existingAttendances[0].id, updateData)
      )
    } else {
      // 創建新紀錄
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

  // 取消補打卡申請
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

  // 取得補打卡審核歷程
  const fetchMakeupApprovalHistory = async (makeupRequestId: string) => {
    const data = await directus.request(
      readItems('makeup_approval_logs', {
        filter: { makeup_request_id: { _eq: makeupRequestId } },
        fields: ['*', 'actor.full_name'],
        sort: ['date_created']
      })
    )
    return data as MakeupApprovalLog[]
  }

  // ============================================
  // 員工排班
  // ============================================

  const employeeShifts = useState<EmployeeShift[]>('hr_employee_shifts', () => [])
  const isEmployeeShiftLoading = useState('hr_employee_shift_loading', () => false)

  // 取得員工班表指派
  const fetchEmployeeShifts = async (options?: {
    employeeId?: string
    shiftScheduleId?: string
    branchId?: string
    activeOnly?: boolean
  }) => {
    isEmployeeShiftLoading.value = true
    const { employeeId, shiftScheduleId, branchId, activeOnly = true } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (employeeId) filter.employee_id = { _eq: employeeId }
      if (shiftScheduleId) filter.shift_schedule_id = { _eq: shiftScheduleId }

      // 如果只要有效的排班（未過期）
      if (activeOnly) {
        const today = new Date().toISOString().split('T')[0]
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

      const data = await directus.request(
        readItems('employee_shifts', {
          filter,
          fields: [
            '*',
            'employee.id', 'employee.full_name', 'employee.employee_code', 'employee.branch_id',
            'shift_schedule.id', 'shift_schedule.name', 'shift_schedule.start_time', 'shift_schedule.end_time', 'shift_schedule.branch_id'
          ],
          sort: ['-date_created']
        })
      )

      // 如果指定了 branchId，進一步過濾
      let filtered = data as EmployeeShift[]
      if (branchId) {
        filtered = filtered.filter(es => {
          const employee = es.employee as Employee | undefined
          return employee?.branch_id === branchId
        })
      }

      employeeShifts.value = filtered
    } catch (error) {
      console.error('Failed to fetch employee shifts:', error)
    } finally {
      isEmployeeShiftLoading.value = false
    }
  }

  // 取得班表的指派員工
  const fetchShiftEmployees = async (shiftScheduleId: string) => {
    const today = new Date().toISOString().split('T')[0]

    const data = await directus.request(
      readItems('employee_shifts', {
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
          'employee.id', 'employee.full_name', 'employee.employee_code', 'employee.branch_id'
        ]
      })
    )

    return data as EmployeeShift[]
  }

  // 取得員工的當前班表
  const getEmployeeCurrentShift = async (employeeId: string) => {
    const today = new Date().toISOString().split('T')[0]

    const data = await directus.request(
      readItems('employee_shifts', {
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
          'shift_schedule.id', 'shift_schedule.name', 'shift_schedule.start_time',
          'shift_schedule.end_time', 'shift_schedule.grace_period_minutes',
          'shift_schedule.early_leave_minutes', 'shift_schedule.applicable_days'
        ],
        limit: 1
      })
    )

    return (data[0] as EmployeeShift) || null
  }

  // 指派班表給員工
  const assignShiftToEmployee = async (data: {
    employeeId: string
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => {
    // 先結束該員工目前的班表
    const today = new Date().toISOString().split('T')[0]
    const currentShift = await getEmployeeCurrentShift(data.employeeId)

    if (currentShift && currentShift.shift_schedule_id !== data.shiftScheduleId) {
      // 結束當前班表
      await directus.request(
        updateItem('employee_shifts', currentShift.id, {
          end_date: new Date(new Date(data.effectiveDate).getTime() - 86400000).toISOString().split('T')[0]
        })
      )
    }

    // 創建新的班表指派
    const result = await directus.request(
      createItem('employee_shifts', {
        employee_id: data.employeeId,
        shift_schedule_id: data.shiftScheduleId,
        effective_date: data.effectiveDate,
        end_date: data.endDate || null
      })
    )

    return result as EmployeeShift
  }

  // 批量指派班表給多個員工
  const batchAssignShift = async (data: {
    employeeIds: string[]
    shiftScheduleId: string
    effectiveDate: string
    endDate?: string
  }) => {
    const results: EmployeeShift[] = []

    for (const employeeId of data.employeeIds) {
      const result = await assignShiftToEmployee({
        employeeId,
        shiftScheduleId: data.shiftScheduleId,
        effectiveDate: data.effectiveDate,
        endDate: data.endDate
      })
      results.push(result)
    }

    return results
  }

  // 更新員工班表指派
  const updateEmployeeShift = async (shiftId: string, data: {
    effectiveDate?: string
    endDate?: string | null
  }) => {
    const result = await directus.request(
      updateItem('employee_shifts', shiftId, {
        effective_date: data.effectiveDate,
        end_date: data.endDate
      })
    )
    return result as EmployeeShift
  }

  // 移除員工班表指派（結束日期設為昨天）
  const removeEmployeeShift = async (shiftId: string) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const result = await directus.request(
      updateItem('employee_shifts', shiftId, {
        end_date: yesterday.toISOString().split('T')[0]
      })
    )
    return result as EmployeeShift
  }

  // 取得分店員工列表（用於排班選擇）
  const fetchBranchEmployees = async (branchId: string) => {
    const data = await directus.request(
      readItems('employees', {
        filter: {
          branch_id: { _eq: branchId },
          employment_status: { _eq: 'ACTIVE' },
          status: { _eq: 'active' }
        },
        fields: ['id', 'full_name', 'employee_code', 'job_title.name'],
        sort: ['full_name']
      })
    )
    return data as Employee[]
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
    // Today Summary (Dashboard)
    todayAttendanceSummary,
    fetchTodayAttendanceSummary,
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
    fetchEmployeeMonthlyAttendance,
    // Makeup Requests
    makeupRequests,
    pendingMakeupApprovals,
    isMakeupLoading,
    makeupTotalCount,
    fetchMakeupRequests,
    fetchPendingMakeupApprovals,
    applyMakeup,
    reviewMakeup,
    cancelMakeup,
    fetchMakeupApprovalHistory,
    // Employee Shifts
    employeeShifts,
    isEmployeeShiftLoading,
    fetchEmployeeShifts,
    fetchShiftEmployees,
    getEmployeeCurrentShift,
    assignShiftToEmployee,
    batchAssignShift,
    updateEmployeeShift,
    removeEmployeeShift,
    fetchBranchEmployees
  }
}
