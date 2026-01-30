/**
 * @gym-nexus/hr-core
 *
 * HR 模組核心包
 * 包含類型定義、接口抽象和工具函數
 *
 * @example
 * ```ts
 * // 導入類型
 * import type { IAttendanceRecord, ILeaveRequest } from '@gym-nexus/hr-core'
 *
 * // 導入接口
 * import type { IAttendanceAdapter, ITenantContext } from '@gym-nexus/hr-core/interfaces'
 *
 * // 導入工具函數
 * import { calculateLateMinutes, calculateWorkHours } from '@gym-nexus/hr-core/utils'
 * ```
 */

// ============================================
// Types
// ============================================

// Employee
export type {
  EmploymentStatus,
  EmploymentType,
  IEmployee,
  IJobTitle,
  IEmployeeWithRelations
} from './types/employee'

// Attendance
export type {
  CheckType,
  AttendanceStatus,
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  ICheckOutOptions
} from './types/attendance'

// Leave
export type {
  LeaveType,
  LeaveStatus,
  HalfDayType,
  LeaveApprovalAction,
  ILeaveRequest,
  ILeaveRequestWithRelations,
  ILeaveBalance,
  ILeaveBalanceSummary,
  ILeaveApprovalLog,
  ILeaveApprovalLogWithRelations,
  IApplyLeaveParams,
  IReviewLeaveParams
} from './types/leave'

// Shift
export type {
  DayOfWeek,
  ShiftStatus,
  IShiftSchedule,
  IShiftScheduleWithBranch,
  IEmployeeShift,
  IEmployeeShiftWithRelations,
  ICreateShiftScheduleParams,
  IAssignShiftParams,
  IBatchAssignShiftParams,
  IShiftTimeRange
} from './types/shift'

// Makeup
export type {
  MakeupType,
  MakeupStatus,
  MakeupApprovalAction,
  IMakeupRequest,
  IMakeupRequestWithRelations,
  IMakeupApprovalLog,
  IMakeupApprovalLogWithRelations,
  IApplyMakeupParams,
  IReviewMakeupParams
} from './types/makeup'

// ============================================
// Interfaces
// ============================================

export type {
  ITenantContext,
  IReactiveTenantContext
} from './interfaces/ITenantContext'

export type {
  IQueryFilter,
  IQueryOptions,
  IPaginatedResult,
  IAggregateOptions,
  IDataAdapter,
  IBatchDataAdapter
} from './interfaces/IDataAdapter'

export type {
  IEmployeeQueryOptions,
  IEmployeeAdapter
} from './interfaces/IEmployeeAdapter'

export type {
  IAttendanceQueryOptions,
  IAttendanceAdapter
} from './interfaces/IAttendanceAdapter'

export type {
  ILeaveQueryOptions,
  ILeaveAdapter
} from './interfaces/ILeaveAdapter'

export type {
  IShiftQueryOptions,
  IEmployeeShiftQueryOptions,
  IShiftAdapter
} from './interfaces/IShiftAdapter'

export type {
  IMakeupQueryOptions,
  IMakeupAdapter
} from './interfaces/IMakeupAdapter'

export type {
  IWorkTimePolicy,
  IOvertimePolicy,
  ILeavePolicy,
  IAttendancePolicy,
  IHRPolicyProvider
} from './interfaces/IHRPolicyProvider'

export { DEFAULT_HR_POLICY } from './interfaces/IHRPolicyProvider'

// ============================================
// Utilities
// ============================================

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
} from './utils/time-calculations'

export type { ParsedTime } from './utils/time-calculations'

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
} from './utils/leave-calculations'

export type { ILeaveValidationResult } from './utils/leave-calculations'
