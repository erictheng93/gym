/**
 * useHR - HR 模組聚合 composable
 *
 * 此 composable 聚合所有 HR 相關功能，方便統一使用。
 * 各模組可單獨引入使用，或透過此聚合 composable 一次引入。
 *
 * 模組架構：
 * - useAttendance: 考勤打卡、統計報表、工時計算
 * - useLeaveRequests: 休假申請、審核、餘額查詢
 * - useShiftSchedules: 班表管理、員工排班
 * - useMakeupRequests: 補打卡申請、審核
 */

import { useAttendance } from './hr/useAttendance'
import { useLeaveRequests } from './hr/useLeaveRequests'
import { useShiftSchedules } from './hr/useShiftSchedules'
import { useMakeupRequests } from './hr/useMakeupRequests'

// Re-export types for convenience
export type { TodayAttendanceSummary, MonthlyAttendanceStats, AttendanceRecord } from './hr/useAttendance'

export const useHR = () => {
  // 初始化所有子模組
  const attendance = useAttendance()
  const leaves = useLeaveRequests()
  const shifts = useShiftSchedules()
  const makeup = useMakeupRequests()

  return {
    // ============================================
    // Attendance (考勤)
    // ============================================

    // State
    todayAttendance: attendance.todayAttendances,
    recentAttendances: attendance.recentAttendances,
    isAttendanceLoading: attendance.isLoading,
    todayAttendanceSummary: attendance.todayAttendanceSummary,

    // Check-in/out
    fetchTodayAttendance: attendance.getTodayAttendance,
    fetchRecentAttendances: attendance.fetchRecentAttendances,
    checkIn: attendance.performCheckIn,
    checkOut: attendance.performCheckOut,

    // Calculations
    calculateLateMinutes: attendance.calculateLateMinutes,
    calculateEarlyLeaveMinutes: attendance.calculateEarlyLeaveMinutes,
    calculateOvertimeHours: attendance.calculateOvertimeHours,

    // Reports
    fetchTodayAttendanceSummary: attendance.fetchTodayAttendanceSummary,
    fetchMonthlyAttendanceStats: attendance.fetchMonthlyAttendanceStats,
    fetchEmployeeMonthlyAttendance: attendance.fetchEmployeeMonthlyAttendance,

    // ============================================
    // Leaves (休假)
    // ============================================

    // State
    leaveRequests: leaves.leaveRequests,
    leaveBalances: leaves.leaveBalances,
    pendingApprovals: leaves.pendingApprovals,
    isLeavesLoading: leaves.isLeavesLoading,
    leavesTotalCount: leaves.leavesTotalCount,

    // Query
    fetchLeaveBalances: leaves.fetchLeaveBalances,
    fetchLeaveRequests: leaves.fetchLeaveRequests,
    fetchPendingApprovals: leaves.fetchPendingApprovals,
    fetchApprovalHistory: leaves.fetchApprovalHistory,

    // Actions
    applyLeave: leaves.applyLeave,
    reviewLeave: leaves.reviewLeave,
    cancelLeave: leaves.cancelLeave,

    // ============================================
    // Shift Schedules (班表)
    // ============================================

    // State
    shiftSchedules: shifts.shiftSchedules,
    isShiftLoading: shifts.isShiftLoading,

    // CRUD
    fetchShiftSchedules: shifts.fetchShiftSchedules,
    getShiftSchedule: shifts.getShiftSchedule,
    createShiftSchedule: shifts.createShiftSchedule,
    updateShiftSchedule: shifts.updateShiftSchedule,
    deleteShiftSchedule: shifts.deleteShiftSchedule,

    // Employee Shifts State
    employeeShifts: shifts.employeeShifts,
    isEmployeeShiftLoading: shifts.isEmployeeShiftLoading,

    // Employee Shifts
    fetchEmployeeShifts: shifts.fetchEmployeeShifts,
    fetchShiftEmployees: shifts.fetchShiftEmployees,
    getEmployeeCurrentShift: shifts.getEmployeeCurrentShift,
    assignShiftToEmployee: shifts.assignShiftToEmployee,
    batchAssignShift: shifts.batchAssignShift,
    updateEmployeeShift: shifts.updateEmployeeShift,
    removeEmployeeShift: shifts.removeEmployeeShift,
    fetchBranchEmployees: shifts.fetchBranchEmployees,

    // ============================================
    // Makeup Requests (補打卡)
    // ============================================

    // State
    makeupRequests: makeup.makeupRequests,
    pendingMakeupApprovals: makeup.pendingMakeupApprovals,
    isMakeupLoading: makeup.isMakeupLoading,
    makeupTotalCount: makeup.makeupTotalCount,

    // Query
    fetchMakeupRequests: makeup.fetchMakeupRequests,
    fetchPendingMakeupApprovals: makeup.fetchPendingMakeupApprovals,
    fetchMakeupApprovalHistory: makeup.fetchMakeupApprovalHistory,

    // Actions
    applyMakeup: makeup.applyMakeup,
    reviewMakeup: makeup.reviewMakeup,
    cancelMakeup: makeup.cancelMakeup
  }
}

export default useHR
