/**
 * HR Calculations
 * 導出所有計算函數
 */

// Work Hours
export {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_STANDARD_HOURS,
  calculateWorkHours,
  calculateOvertimeHours,
  calculateWorkHoursWithShift,
  parseTimeString,
  formatMinutesToTime
} from './workHours'

// Late Minutes
export {
  DEFAULT_GRACE_MINUTES,
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  checkLateWithShift,
  buildScheduledStartTime,
  buildScheduledEndTime
} from './lateMinutes'

// Leave Balance
export {
  LEAVE_TYPE_NAMES,
  getLeaveTypeName,
  calculateLeaveDays,
  calculateAvailableDays,
  hasEnoughBalance,
  calculateBalanceUpdate,
  calculateAnnualLeaveDays,
  calculateCarryOverDays,
  isBalanceExpired,
  getLeaveTypeLimit
} from './leaveBalance'
