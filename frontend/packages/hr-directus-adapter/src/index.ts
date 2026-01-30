/**
 * @gym-nexus/hr-directus-adapter
 *
 * HR 模組 Directus 適配器
 * 實現 @gym-nexus/hr-core 定義的接口
 *
 * @example
 * ```ts
 * import { createHRAdapters } from '@gym-nexus/hr-directus-adapter'
 * import type { AuthData } from '@gym-nexus/hr-directus-adapter'
 *
 * const directus = useDirectus()
 * const authData: AuthData = {
 *   userId: 'xxx',
 *   employeeId: 'yyy',
 *   branchId: 'zzz',
 *   branchType: 'BRANCH',
 *   accessibleBranchIds: ['zzz']
 * }
 *
 * const adapters = createHRAdapters(directus, authData)
 *
 * // 考勤操作
 * const todayAttendance = await adapters.attendance.getTodayAttendance(employeeId)
 * const checkInResult = await adapters.attendance.checkIn({ employeeId, branchId })
 *
 * // 休假操作
 * const leaveBalances = await adapters.leave.getBalances(employeeId)
 * const pendingLeaves = await adapters.leave.getPendingApprovals(supervisorId)
 *
 * // 班表操作
 * const currentShift = await adapters.shift.getEmployeeCurrentShift(employeeId)
 *
 * // 補打卡操作
 * const makeupRequests = await adapters.makeup.query({ employeeId })
 * ```
 */

// ============================================
// Factory
// ============================================

export { createHRAdapters, createLazyHRAdapters } from './factory'
export type { HRAdapters } from './factory'

// ============================================
// Adapters
// ============================================

export {
  DirectusTenantContext,
  createEmptyTenantContext,
  DirectusAttendanceAdapter,
  DirectusLeaveAdapter,
  DirectusShiftAdapter,
  DirectusMakeupAdapter
} from './adapters'

export type { AuthData } from './adapters'

// ============================================
// Mappers
// ============================================

// Employee Mapper
export {
  mapDirectusEmployeeToIEmployee,
  mapDirectusJobTitleToIJobTitle,
  mapDirectusEmployeeToIEmployeeWithRelations,
  mapIEmployeeToDirectus
} from './mappers/employeeMapper'

export type { DirectusEmployee, DirectusJobTitle } from './mappers/employeeMapper'

// Attendance Mapper
export {
  mapDirectusAttendanceToIAttendanceRecord,
  mapDirectusAttendanceToIAttendanceRecordWithEmployee,
  mapIAttendanceRecordToDirectus
} from './mappers/attendanceMapper'

export type { DirectusAttendance } from './mappers/attendanceMapper'

// Leave Mapper
export {
  mapDirectusLeaveRequestToILeaveRequest,
  mapDirectusLeaveRequestToILeaveRequestWithRelations,
  mapILeaveRequestToDirectus,
  mapDirectusLeaveBalanceToILeaveBalance,
  mapDirectusLeaveApprovalLogToILeaveApprovalLog,
  mapDirectusLeaveApprovalLogToILeaveApprovalLogWithRelations
} from './mappers/leaveMapper'

export type {
  DirectusLeaveRequest,
  DirectusLeaveBalance,
  DirectusLeaveApprovalLog
} from './mappers/leaveMapper'

// Shift Mapper
export {
  mapDirectusShiftScheduleToIShiftSchedule,
  mapDirectusShiftScheduleToIShiftScheduleWithBranch,
  mapIShiftScheduleToDirectus,
  mapDirectusEmployeeShiftToIEmployeeShift,
  mapDirectusEmployeeShiftToIEmployeeShiftWithRelations,
  mapIEmployeeShiftToDirectus
} from './mappers/shiftMapper'

export type { DirectusShiftSchedule, DirectusEmployeeShift } from './mappers/shiftMapper'

// Makeup Mapper
export {
  mapDirectusMakeupRequestToIMakeupRequest,
  mapDirectusMakeupRequestToIMakeupRequestWithRelations,
  mapIMakeupRequestToDirectus,
  mapDirectusMakeupApprovalLogToIMakeupApprovalLog,
  mapDirectusMakeupApprovalLogToIMakeupApprovalLogWithRelations
} from './mappers/makeupMapper'

export type { DirectusMakeupRequest, DirectusMakeupApprovalLog } from './mappers/makeupMapper'
