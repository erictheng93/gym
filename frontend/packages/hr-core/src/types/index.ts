/**
 * HR Core Types
 * 統一導出所有 HR 類型定義
 */

// Employee Types
export type {
  EmploymentStatus,
  EmploymentType,
  IEmployee,
  IJobTitle,
  IEmployeeWithRelations
} from './employee'

// Attendance Types
export type {
  CheckType,
  AttendanceStatus,
  IAttendanceRecord,
  IAttendanceRecordWithEmployee,
  ITodayAttendanceSummary,
  IMonthlyAttendanceStats,
  ICheckInOptions,
  ICheckOutOptions
} from './attendance'

// Leave Types
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
} from './leave'

// Shift Types
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
} from './shift'

// Makeup Types
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
} from './makeup'
