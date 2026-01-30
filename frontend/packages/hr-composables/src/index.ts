/**
 * @gym-nexus/hr-composables
 * HR 模組 Vue Composables
 *
 * 提供與後端解耦的 HR 功能 composables，
 * 通過適配器模式支持不同的後端實現。
 *
 * @example
 * ```ts
 * // 1. 在應用根組件中提供 HR 上下文
 * import { provideHRContext } from '@gym-nexus/hr-composables'
 * import { createHRAdapters } from '@gym-nexus/hr-directus-adapter'
 *
 * const adapters = createHRAdapters(directus, authData)
 * provideHRContext({
 *   attendanceAdapter: adapters.attendance,
 *   leaveAdapter: adapters.leave,
 *   shiftAdapter: adapters.shift,
 *   makeupAdapter: adapters.makeup,
 *   tenantContext: adapters.tenant
 * })
 *
 * // 2. 在子組件中使用 composables
 * import { useAttendance, useLeaveRequests } from '@gym-nexus/hr-composables'
 *
 * const { todayAttendances, fetchTodayAttendances, performCheckIn } = useAttendance()
 * const { leaveBalances, applyLeave } = useLeaveRequests()
 * ```
 */

// Context
export {
  HR_CONTEXT_KEY,
  provideHRContext,
  injectHRContext,
  tryInjectHRContext,
  createDefaultPolicyProvider
} from './context/HRContext'

export type { IHRContext } from './context/HRContext'

export {
  useHRContext,
  useTryHRContext,
  useAttendanceAdapter,
  useLeaveAdapter,
  useShiftAdapter,
  useMakeupAdapter,
  useTenantContext,
  useHRPolicyProvider
} from './context/useHRContext'

export type { UseHRContextReturn } from './context/useHRContext'

// Composables
export {
  useAttendance,
  useLeaveRequests,
  useShiftSchedules,
  useMakeupRequests
} from './composables'

export type {
  UseAttendanceReturn,
  AttendanceRecord,
  TodayAttendanceSummary,
  MonthlyAttendanceStats,
  UseLeaveRequestsReturn,
  UseShiftSchedulesReturn,
  UseMakeupRequestsReturn
} from './composables'

// Re-export commonly used types from hr-core for convenience
export type {
  // Attendance
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  AttendanceStatus,
  CheckType,
  // Leave
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveApprovalLog,
  LeaveType,
  LeaveStatus,
  HalfDayType,
  // Shift
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ShiftStatus,
  // Makeup
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  MakeupType,
  MakeupStatus,
  // Employee
  IEmployee,
  EmploymentStatus,
  EmploymentType
} from '@gym-nexus/hr-core'

// Re-export utility functions from hr-core
export {
  // Time calculations
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateWorkHours,
  calculateOvertimeHours,
  parseTime,
  formatMinutesToTime,
  getTodayDate,
  // Leave calculations
  calculateLeaveDays,
  calculateWorkingDays,
  hasEnoughBalance,
  validateLeaveRequest,
  getLeaveTypeName,
  LEAVE_TYPE_NAMES
} from '@gym-nexus/hr-core'
