/**
 * HR Composables
 * 統一導出所有 HR 相關的 composables
 */

export { useAttendance } from './useAttendance'
export type { UseAttendanceReturn, AttendanceRecord, TodayAttendanceSummary, MonthlyAttendanceStats } from './useAttendance'

export { useLeaveRequests } from './useLeaveRequests'
export type { UseLeaveRequestsReturn } from './useLeaveRequests'

export { useShiftSchedules } from './useShiftSchedules'
export type { UseShiftSchedulesReturn } from './useShiftSchedules'

export { useMakeupRequests } from './useMakeupRequests'
export type { UseMakeupRequestsReturn } from './useMakeupRequests'
