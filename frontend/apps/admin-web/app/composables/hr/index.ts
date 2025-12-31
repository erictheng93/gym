/**
 * HR 模組統一導出
 *
 * 使用方式：
 * ```ts
 * // 按需引入單一模組
 * import { useAttendance } from '~/composables/hr'
 *
 * // 或直接引入特定模組
 * import { useAttendance } from '~/composables/hr/useAttendance'
 * ```
 */

// Composables
export { useAttendance } from './useAttendance'
export { useLeaveRequests } from './useLeaveRequests'
export { useShiftSchedules } from './useShiftSchedules'
export { useMakeupRequests } from './useMakeupRequests'

// Types
export type {
  TodayAttendanceSummary,
  MonthlyAttendanceStats,
  AttendanceRecord
} from './useAttendance'
