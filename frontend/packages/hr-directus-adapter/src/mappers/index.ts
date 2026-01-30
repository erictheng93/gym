/**
 * Entity Mappers
 * 統一導出所有實體映射器
 */

// Employee Mapper
export {
  mapDirectusEmployeeToIEmployee,
  mapDirectusJobTitleToIJobTitle,
  mapDirectusEmployeeToIEmployeeWithRelations,
  mapIEmployeeToDirectus
} from './employeeMapper'

export type { DirectusEmployee, DirectusJobTitle } from './employeeMapper'

// Attendance Mapper
export {
  mapDirectusAttendanceToIAttendanceRecord,
  mapDirectusAttendanceToIAttendanceRecordWithEmployee,
  mapIAttendanceRecordToDirectus
} from './attendanceMapper'

export type { DirectusAttendance } from './attendanceMapper'

// Leave Mapper
export {
  mapDirectusLeaveRequestToILeaveRequest,
  mapDirectusLeaveRequestToILeaveRequestWithRelations,
  mapILeaveRequestToDirectus,
  mapDirectusLeaveBalanceToILeaveBalance,
  mapDirectusLeaveApprovalLogToILeaveApprovalLog,
  mapDirectusLeaveApprovalLogToILeaveApprovalLogWithRelations
} from './leaveMapper'

export type {
  DirectusLeaveRequest,
  DirectusLeaveBalance,
  DirectusLeaveApprovalLog
} from './leaveMapper'

// Shift Mapper
export {
  mapDirectusShiftScheduleToIShiftSchedule,
  mapDirectusShiftScheduleToIShiftScheduleWithBranch,
  mapIShiftScheduleToDirectus,
  mapDirectusEmployeeShiftToIEmployeeShift,
  mapDirectusEmployeeShiftToIEmployeeShiftWithRelations,
  mapIEmployeeShiftToDirectus
} from './shiftMapper'

export type { DirectusShiftSchedule, DirectusEmployeeShift } from './shiftMapper'

// Makeup Mapper
export {
  mapDirectusMakeupRequestToIMakeupRequest,
  mapDirectusMakeupRequestToIMakeupRequestWithRelations,
  mapIMakeupRequestToDirectus,
  mapDirectusMakeupApprovalLogToIMakeupApprovalLog,
  mapDirectusMakeupApprovalLogToIMakeupApprovalLogWithRelations
} from './makeupMapper'

export type { DirectusMakeupRequest, DirectusMakeupApprovalLog } from './makeupMapper'
