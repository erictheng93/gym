/**
 * useAttendance - 考勤管理 composable
 * 包含：打卡、考勤記錄、統計報表、工時計算
 */

import { useFetch } from '~/composables/core/useFetch'
import type { Attendance, Employee } from '~/types/schema'

// ============================================
// 類型定義
// ============================================

export interface AttendanceRecord {
  id: string
  employee: Employee
  check_in: string | null
  check_out: string | null
  attendance_date: string
  check_type: 'REGULAR' | 'OVERTIME' | 'MAKEUP' | 'EARLY'
  attendance_status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_LEAVE' | 'LEAVE' | 'HOLIDAY'
  late_minutes: number
  early_leave_minutes: number
  work_hours: number | null
  notes?: string
}

export interface TodayAttendanceSummary {
  totalEmployees: number
  checkedIn: number
  notCheckedIn: number
  checkedOut: number
  late: number
  onLeave: number
}

export interface MonthlyAttendanceStats {
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

export const useAttendance = () => {
  const { readItems, readItem, createItem, updateItem } = useFetch()

  // ============================================
  // 狀態
  // ============================================

  const todayAttendances = useState<AttendanceRecord[]>('today_attendances', () => [])
  const isLoading = useState('attendance_loading', () => false)
  const todayCount = useState('attendance_today_count', () => 0)
  const todayAttendanceSummary = useState<TodayAttendanceSummary | null>('hr_today_summary', () => null)
  const recentAttendances = useState<Attendance[]>('hr_recent_attendances', () => [])

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }

  // Fetch today's attendance records
  const fetchTodayAttendances = async (branchId?: string) => {
    isLoading.value = true
    const today = getTodayDate()

    try {
      const filter: Record<string, unknown> = {
        attendance_date: today
      }

      if (branchId) {
        filter.branch_id = branchId
      }

      const result = await readItems<Attendance>('attendances', {
        filter,
        sort: 'check_in',
        sortOrder: 'desc',
        limit: 50
      })

      todayAttendances.value = result.data.map((att): AttendanceRecord => ({
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: (att.attendance_date || today) as string,
        check_type: (att.check_type as AttendanceRecord['check_type']) || 'REGULAR',
        attendance_status: (att.attendance_status as AttendanceRecord['attendance_status']) || 'PRESENT',
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: att.early_leave_minutes || 0,
        work_hours: att.work_hours || null,
        notes: att.notes || undefined
      }))
      todayCount.value = result.total
    } catch (error) {
      console.error('Failed to fetch today attendances:', error)
    } finally {
      isLoading.value = false
    }
  }

  // Check if employee has checked in today
  const getTodayAttendance = async (employeeId: string): Promise<AttendanceRecord | null> => {
    const today = getTodayDate()

    try {
      const result = await readItems<Attendance>('attendances', {
        filter: {
          employee_id: employeeId,
          attendance_date: today
        },
        limit: 1
      })

      const att = result.data[0]
      if (!att) return null

      const record: AttendanceRecord = {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: (att.attendance_date || today) as string,
        check_type: (att.check_type as AttendanceRecord['check_type']) || 'REGULAR',
        attendance_status: (att.attendance_status as AttendanceRecord['attendance_status']) || 'PRESENT',
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: att.early_leave_minutes || 0,
        work_hours: att.work_hours || null,
        notes: att.notes || undefined
      }
      return record
    } catch (error) {
      console.error('Failed to get today attendance:', error)
      return null
    }
  }

  // Calculate late minutes based on standard work time (9:00 AM)
  const calculateLateMinutes = (checkInTime: Date): number => {
    const standardStartHour = 9
    const standardStartMinute = 0

    const checkInHour = checkInTime.getHours()
    const checkInMinute = checkInTime.getMinutes()

    const standardMinutes = standardStartHour * 60 + standardStartMinute
    const actualMinutes = checkInHour * 60 + checkInMinute

    const lateMinutes = actualMinutes - standardMinutes
    return lateMinutes > 0 ? lateMinutes : 0
  }

  // Calculate early leave minutes based on standard work time (6:00 PM)
  const calculateEarlyLeaveMinutes = (checkOutTime: Date): number => {
    const standardEndHour = 18
    const standardEndMinute = 0

    const checkOutHour = checkOutTime.getHours()
    const checkOutMinute = checkOutTime.getMinutes()

    const standardMinutes = standardEndHour * 60 + standardEndMinute
    const actualMinutes = checkOutHour * 60 + checkOutMinute

    const earlyMinutes = standardMinutes - actualMinutes
    return earlyMinutes > 0 ? earlyMinutes : 0
  }

  // Calculate work hours
  const calculateWorkHours = (checkIn: Date, checkOut: Date): number => {
    const diffMs = checkOut.getTime() - checkIn.getTime()
    const hours = diffMs / (1000 * 60 * 60)
    return Math.round(hours * 100) / 100 // Round to 2 decimal places
  }

  // Perform check-in
  const performCheckIn = async (options: {
    employeeId: string
    branchId?: string
    checkType?: 'REGULAR' | 'OVERTIME' | 'MAKEUP' | 'EARLY'
    notes?: string
  }): Promise<AttendanceRecord> => {
    const { employeeId, branchId, checkType = 'REGULAR', notes } = options
    const today = getTodayDate()
    const now = new Date()

    const lateMinutes = calculateLateMinutes(now)
    const attendanceStatus = lateMinutes > 0 ? 'LATE' : 'PRESENT'

    try {
      const attendanceData: Partial<Attendance> = {
        employee_id: employeeId,
        branch_id: branchId,
        attendance_date: today,
        check_in: now.toISOString(),
        check_type: checkType,
        late_minutes: lateMinutes,
        attendance_status: attendanceStatus,
        notes
      }

      const result = await createItem<Attendance>('attendances', attendanceData)

      if (!result) {
        throw new Error('Failed to create attendance record')
      }

      // Fetch the created record with relations
      const createdResult = await readItems<Attendance>('attendances', {
        filter: { id: result.id },
        limit: 1
      })

      const att = createdResult.data[0] || result
      const record: AttendanceRecord = {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: null,
        attendance_date: today as string,
        check_type: checkType,
        attendance_status: attendanceStatus as AttendanceRecord['attendance_status'],
        late_minutes: lateMinutes,
        early_leave_minutes: 0,
        work_hours: null,
        notes
      }

      // Add to today's list
      todayAttendances.value.unshift(record)
      todayCount.value++

      return record
    } catch (error) {
      console.error('Failed to perform check-in:', error)
      throw error
    }
  }

  // Perform check-out
  const performCheckOut = async (
    attendanceId: string,
    notes?: string
  ): Promise<AttendanceRecord> => {
    const now = new Date()

    try {
      // Get the attendance record first
      const attendance = await readItem<Attendance>('attendances', attendanceId)

      if (!attendance || !attendance.check_in) {
        throw new Error('找不到上班打卡記錄')
      }

      const checkInTime = new Date(attendance.check_in)
      const earlyLeaveMinutes = calculateEarlyLeaveMinutes(now)
      const workHours = calculateWorkHours(checkInTime, now)

      // Update attendance status if there was early leave
      let attendanceStatus = attendance.attendance_status || 'PRESENT'
      if (earlyLeaveMinutes > 0 && attendanceStatus === 'PRESENT') {
        attendanceStatus = 'EARLY_LEAVE'
      }

      const updateData: Partial<Attendance> = {
        check_out: now.toISOString(),
        work_hours: workHours,
        early_leave_minutes: earlyLeaveMinutes,
        attendance_status: attendanceStatus,
        notes: notes || attendance.notes
      }

      await updateItem<Attendance>('attendances', attendanceId, updateData)

      // Fetch the updated record
      const updatedResult = await readItems<Attendance>('attendances', {
        filter: { id: attendanceId },
        limit: 1
      })

      const att = updatedResult.data[0] || { ...attendance, ...updateData }
      const record: AttendanceRecord = {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: (att.attendance_date || getTodayDate()) as string,
        check_type: (att.check_type as AttendanceRecord['check_type']) || 'REGULAR',
        attendance_status: attendanceStatus as AttendanceRecord['attendance_status'],
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: earlyLeaveMinutes,
        work_hours: workHours,
        notes: att.notes || undefined
      }

      // Update in today's list
      const index = todayAttendances.value.findIndex(a => a.id === attendanceId)
      if (index !== -1) {
        todayAttendances.value[index] = record
      }

      return record
    } catch (error) {
      console.error('Failed to perform check-out:', error)
      throw error
    }
  }

  // ============================================
  // 統計報表
  // ============================================

  /**
   * 取得近期考勤紀錄
   */
  const fetchRecentAttendances = async (employeeId: string, days: number = 7) => {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const result = await readItems<Attendance>('attendances', {
        filter: {
          employee_id: employeeId,
          attendance_date_gte: startDate.toISOString().split('T')[0]
        },
        sort: 'attendance_date',
        sortOrder: 'desc',
        limit: days
      })
      recentAttendances.value = result.data
    } catch (error) {
      console.error('Failed to fetch recent attendances:', error)
    }
  }

  /**
   * 取得今日全員考勤概況（Dashboard 用）
   */
  const fetchTodayAttendanceSummary = async (branchId?: string): Promise<TodayAttendanceSummary> => {
    const today = getTodayDate()

    try {
      // Get total active employees
      const employeeFilter: Record<string, unknown> = { employment_status: 'ACTIVE' }
      if (branchId) employeeFilter.branch_id = branchId

      const employeesResult = await readItems<Employee>('employees', {
        filter: employeeFilter,
        limit: 1000
      })
      const totalEmployees = employeesResult.total

      // Get today's attendances
      const attendanceFilter: Record<string, unknown> = { attendance_date: today }
      if (branchId) attendanceFilter.branch_id = branchId

      const attendanceResult = await readItems<Attendance>('attendances', {
        filter: attendanceFilter,
        limit: 1000
      })
      const attendances = attendanceResult.data

      // Get approved leaves for today
      const leaveResult = await readItems<{ id: string }>('leave_requests', {
        filter: {
          leave_status: 'APPROVED',
          start_date_lte: today,
          end_date_gte: today
        },
        limit: 1000
      })
      const onLeave = leaveResult.total

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

  /**
   * 取得月度考勤統計
   */
  const fetchMonthlyAttendanceStats = async (options: {
    branchId?: string
    year: number
    month: number
  }): Promise<MonthlyAttendanceStats[]> => {
    const { branchId, year, month } = options

    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    try {
      const filter: Record<string, unknown> = {
        attendance_date_gte: startDate,
        attendance_date_lte: endDate
      }
      if (branchId) filter.branch_id = branchId

      const result = await readItems<Attendance>('attendances', {
        filter,
        sort: 'employee_id',
        limit: 10000
      })
      const attendances = result.data

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

  /**
   * 取得單一員工月度考勤詳情
   */
  const fetchEmployeeMonthlyAttendance = async (employeeId: string, year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    try {
      const result = await readItems<Attendance>('attendances', {
        filter: {
          employee_id: employeeId,
          attendance_date_gte: startDate,
          attendance_date_lte: endDate
        },
        sort: 'attendance_date',
        limit: 31
      })
      return result.data
    } catch (error) {
      console.error('Failed to fetch employee monthly attendance:', error)
      return []
    }
  }

  /**
   * 計算加班時數
   */
  const calculateOvertimeHours = (checkOutTime: string, shiftEndTime: string, overtimeStartAfter: string | null): number => {
    if (!overtimeStartAfter) return 0

    const checkOut = new Date(`1970-01-01T${checkOutTime.split('T')[1] || checkOutTime}`)
    const overtimeStart = new Date(`1970-01-01T${overtimeStartAfter}`)

    if (checkOut <= overtimeStart) return 0
    return Math.round((checkOut.getTime() - overtimeStart.getTime()) / (1000 * 60 * 60) * 100) / 100
  }

  return {
    // State
    todayAttendances,
    isLoading,
    todayCount,
    todayAttendanceSummary,
    recentAttendances,
    // Check-in/out
    fetchTodayAttendances,
    getTodayAttendance,
    performCheckIn,
    performCheckOut,
    fetchRecentAttendances,
    // Calculations
    calculateLateMinutes,
    calculateEarlyLeaveMinutes,
    calculateOvertimeHours,
    // Reports
    fetchTodayAttendanceSummary,
    fetchMonthlyAttendanceStats,
    fetchEmployeeMonthlyAttendance
  }
}

export default useAttendance
