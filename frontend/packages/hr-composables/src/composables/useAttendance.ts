/**
 * useAttendance - 考勤管理 composable
 * 使用適配器模式，與具體後端實現解耦
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type {
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  CheckType
} from '@gym-nexus/hr-core'
import {
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateWorkHours,
  calculateOvertimeHours,
  getTodayDate
} from '@gym-nexus/hr-core'
import { useHRContext } from '../context/useHRContext'

/**
 * useAttendance 返回值類型
 */
export interface UseAttendanceReturn {
  // State
  todayAttendances: Ref<IAttendanceRecordWithEmployee[]>
  isLoading: Ref<boolean>
  todayCount: Ref<number>
  todayAttendanceSummary: Ref<ITodayAttendanceSummary | null>
  recentAttendances: Ref<IAttendanceRecord[]>

  // Check-in/out
  fetchTodayAttendances: (branchId?: string) => Promise<void>
  getTodayAttendance: (employeeId: string) => Promise<IAttendanceRecord | null>
  performCheckIn: (options: {
    employeeId: string
    branchId?: string
    checkType?: CheckType
    notes?: string
  }) => Promise<IAttendanceRecord>
  performCheckOut: (attendanceId: string, notes?: string) => Promise<IAttendanceRecord>
  fetchRecentAttendances: (employeeId: string, days?: number) => Promise<void>

  // Calculations
  calculateLateMinutes: typeof calculateLateMinutes
  calculateEarlyLeaveMinutes: typeof calculateEarlyLeaveMinutes
  calculateOvertimeHours: typeof calculateOvertimeHours

  // Reports
  fetchTodayAttendanceSummary: (branchId?: string) => Promise<ITodayAttendanceSummary>
  fetchMonthlyAttendanceStats: (options: {
    branchId?: string
    year: number
    month: number
  }) => Promise<IMonthlyAttendanceStats[]>
  fetchEmployeeMonthlyAttendance: (
    employeeId: string,
    year: number,
    month: number
  ) => Promise<IAttendanceRecord[]>
}

// 為了向後兼容，導出原有類型別名
export interface AttendanceRecord extends IAttendanceRecordWithEmployee {
  employee: IAttendanceRecordWithEmployee['employee']
  check_in: string | null
  check_out: string | null
  attendance_date: string
  check_type: CheckType
  attendance_status: IAttendanceRecord['attendanceStatus']
  late_minutes: number
  early_leave_minutes: number
  work_hours: number | null
}

export type TodayAttendanceSummary = ITodayAttendanceSummary
export type MonthlyAttendanceStats = IMonthlyAttendanceStats

/**
 * 考勤管理 composable
 */
export function useAttendance(): UseAttendanceReturn {
  const { attendanceAdapter, policyProvider, currentBranchId } = useHRContext()

  // ============================================
  // 狀態
  // ============================================

  const todayAttendances = ref<IAttendanceRecordWithEmployee[]>([])
  const isLoading = ref(false)
  const todayCount = ref(0)
  const todayAttendanceSummary = ref<ITodayAttendanceSummary | null>(null)
  const recentAttendances = ref<IAttendanceRecord[]>([])

  // ============================================
  // 今日考勤
  // ============================================

  /**
   * 取得今日考勤列表
   */
  async function fetchTodayAttendances(branchId?: string): Promise<void> {
    isLoading.value = true
    try {
      const data = await attendanceAdapter.getTodayAttendances(branchId)
      todayAttendances.value = data
      todayCount.value = data.length
    } catch (error) {
      console.error('Failed to fetch today attendances:', error)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 取得員工今日考勤
   */
  async function getTodayAttendance(employeeId: string): Promise<IAttendanceRecord | null> {
    try {
      return await attendanceAdapter.getTodayAttendance(employeeId)
    } catch (error) {
      console.error('Failed to get today attendance:', error)
      return null
    }
  }

  // ============================================
  // 打卡操作
  // ============================================

  /**
   * 執行上班打卡
   */
  async function performCheckIn(options: {
    employeeId: string
    branchId?: string
    checkType?: CheckType
    notes?: string
  }): Promise<IAttendanceRecord> {
    const result = await attendanceAdapter.checkIn({
      employeeId: options.employeeId,
      branchId: options.branchId,
      checkType: options.checkType,
      notes: options.notes
    })

    // 更新本地狀態
    const recordWithEmployee: IAttendanceRecordWithEmployee = {
      ...result,
      employee: {
        id: options.employeeId,
        employeeCode: null,
        fullName: '',
        branchId: options.branchId || null,
        jobTitleId: null,
        supervisorId: null,
        employmentStatus: 'ACTIVE',
        employmentType: 'FULL_TIME'
      }
    }
    todayAttendances.value.unshift(recordWithEmployee)
    todayCount.value++

    return result
  }

  /**
   * 執行下班打卡
   */
  async function performCheckOut(attendanceId: string, notes?: string): Promise<IAttendanceRecord> {
    const result = await attendanceAdapter.checkOut({
      attendanceId,
      notes
    })

    // 更新本地狀態
    const index = todayAttendances.value.findIndex(a => a.id === attendanceId)
    if (index !== -1) {
      const existing = todayAttendances.value[index]
      if (existing) {
        todayAttendances.value[index] = {
          ...result,
          employee: existing.employee
        }
      }
    }

    return result
  }

  /**
   * 取得員工近期考勤
   */
  async function fetchRecentAttendances(employeeId: string, days: number = 7): Promise<void> {
    try {
      const data = await attendanceAdapter.getRecentAttendances(employeeId, days)
      recentAttendances.value = data
    } catch (error) {
      console.error('Failed to fetch recent attendances:', error)
    }
  }

  // ============================================
  // 統計報表
  // ============================================

  /**
   * 取得今日考勤概況
   */
  async function fetchTodayAttendanceSummary(branchId?: string): Promise<ITodayAttendanceSummary> {
    try {
      const summary = await attendanceAdapter.getTodaySummary(branchId)
      todayAttendanceSummary.value = summary
      return summary
    } catch (error) {
      console.error('Failed to fetch today attendance summary:', error)
      const emptySummary: ITodayAttendanceSummary = {
        totalEmployees: 0,
        checkedIn: 0,
        notCheckedIn: 0,
        checkedOut: 0,
        late: 0,
        onLeave: 0
      }
      return emptySummary
    }
  }

  /**
   * 取得月度考勤統計
   */
  async function fetchMonthlyAttendanceStats(options: {
    branchId?: string
    year: number
    month: number
  }): Promise<IMonthlyAttendanceStats[]> {
    try {
      return await attendanceAdapter.getMonthlyStats(options)
    } catch (error) {
      console.error('Failed to fetch monthly attendance stats:', error)
      return []
    }
  }

  /**
   * 取得單一員工月度考勤
   */
  async function fetchEmployeeMonthlyAttendance(
    employeeId: string,
    year: number,
    month: number
  ): Promise<IAttendanceRecord[]> {
    try {
      return await attendanceAdapter.getMonthlyAttendances(employeeId, year, month)
    } catch (error) {
      console.error('Failed to fetch employee monthly attendance:', error)
      return []
    }
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

    // Calculations (re-export from hr-core)
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
