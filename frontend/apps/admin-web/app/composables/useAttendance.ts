import { readItems, createItem, updateItem, aggregate } from '@directus/sdk'
import type { Attendance, Employee } from '~/types/directus'

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

export const useAttendance = () => {
  const directus = useDirectus()
  const todayAttendances = useState<AttendanceRecord[]>('today_attendances', () => [])
  const isLoading = useState('attendance_loading', () => false)
  const todayCount = useState('attendance_today_count', () => 0)

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
        attendance_date: { _eq: today }
      }

      if (branchId) {
        filter.branch_id = { _eq: branchId }
      }

      const [data, countResult] = await Promise.all([
        directus.request(
          readItems('attendances', {
            filter,
            fields: [
              '*',
              'employee.id',
              'employee.full_name',
              'employee.employee_code',
              'employee.job_title.name',
              'branch.id',
              'branch.name'
            ],
            sort: ['-check_in'],
            limit: 50
          })
        ),
        directus.request(
          aggregate('attendances', {
            aggregate: { count: '*' },
            query: { filter }
          })
        )
      ])

      todayAttendances.value = (data as Attendance[]).map(att => ({
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: att.attendance_date || today,
        check_type: (att.check_type as any) || 'REGULAR',
        attendance_status: (att.attendance_status as any) || 'PRESENT',
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: att.early_leave_minutes || 0,
        work_hours: att.work_hours || null,
        notes: att.notes
      }))
      todayCount.value = Number(countResult[0]?.count) || 0
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
      const data = await directus.request(
        readItems('attendances', {
          filter: {
            employee_id: { _eq: employeeId },
            attendance_date: { _eq: today }
          },
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.job_title.name'
          ],
          limit: 1
        })
      )

      if (data.length === 0) return null

      const att = data[0] as Attendance
      return {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: att.attendance_date || today,
        check_type: (att.check_type as any) || 'REGULAR',
        attendance_status: (att.attendance_status as any) || 'PRESENT',
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: att.early_leave_minutes || 0,
        work_hours: att.work_hours || null,
        notes: att.notes
      }
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

  // Determine attendance status
  const determineAttendanceStatus = (
    lateMinutes: number,
    earlyLeaveMinutes: number,
    hasCheckOut: boolean
  ): 'PRESENT' | 'LATE' | 'EARLY_LEAVE' => {
    if (lateMinutes > 0) return 'LATE'
    if (hasCheckOut && earlyLeaveMinutes > 0) return 'EARLY_LEAVE'
    return 'PRESENT'
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

      const result = await directus.request(
        createItem('attendances', attendanceData)
      )

      // Fetch the created record with relations
      const [created] = await directus.request(
        readItems('attendances', {
          filter: { id: { _eq: (result as Attendance).id } },
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.job_title.name'
          ],
          limit: 1
        })
      )

      const att = created as Attendance
      const record: AttendanceRecord = {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: null,
        attendance_date: today,
        check_type: checkType,
        attendance_status: attendanceStatus,
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
      const [attendance] = await directus.request(
        readItems('attendances', {
          filter: { id: { _eq: attendanceId } },
          fields: ['*', 'employee.id', 'employee.full_name', 'employee.employee_code'],
          limit: 1
        })
      )

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

      await directus.request(
        updateItem('attendances', attendanceId, updateData)
      )

      // Fetch the updated record
      const [updated] = await directus.request(
        readItems('attendances', {
          filter: { id: { _eq: attendanceId } },
          fields: [
            '*',
            'employee.id',
            'employee.full_name',
            'employee.employee_code',
            'employee.job_title.name'
          ],
          limit: 1
        })
      )

      const att = updated as Attendance
      const record: AttendanceRecord = {
        id: att.id,
        employee: att.employee as Employee,
        check_in: att.check_in || null,
        check_out: att.check_out || null,
        attendance_date: att.attendance_date || getTodayDate(),
        check_type: (att.check_type as any) || 'REGULAR',
        attendance_status: attendanceStatus as any,
        late_minutes: att.late_minutes || 0,
        early_leave_minutes: earlyLeaveMinutes,
        work_hours: workHours,
        notes: att.notes
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

  return {
    todayAttendances,
    isLoading,
    todayCount,
    fetchTodayAttendances,
    getTodayAttendance,
    performCheckIn,
    performCheckOut
  }
}
