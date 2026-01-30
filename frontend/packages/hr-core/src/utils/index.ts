/**
 * HR Core Utilities
 * 統一導出所有工具函數
 */

// Time Calculations
export {
  parseTime,
  formatMinutesToTime,
  calculateLateMinutes,
  calculateLateMinutesWithPolicy,
  calculateEarlyLeaveMinutes,
  calculateEarlyLeaveMinutesWithPolicy,
  calculateWorkHours,
  calculateOvertimeHours,
  calculateOvertimeFromWorkHours,
  determineAttendanceStatus,
  getTodayDate,
  getMonthDateRange,
  daysBetween,
  isWorkDay
} from './time-calculations'

export type { ParsedTime } from './time-calculations'

// Leave Calculations
export {
  LEAVE_TYPE_NAMES,
  getLeaveTypeName,
  calculateAvailableDays,
  toLeaveBalanceSummary,
  calculateLeaveDays,
  calculateWorkingDays,
  hasEnoughBalance,
  isBalanceValid,
  calculateAnnualLeaveDays,
  calculateCarryOverDays,
  validateLeaveRequest
} from './leave-calculations'

export type { ILeaveValidationResult } from './leave-calculations'
