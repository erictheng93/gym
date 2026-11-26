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
export { usePerformance } from './usePerformance'
export { usePayroll } from './usePayroll'
export { useHrAccess, HR_READ_ROLES, HR_ADMIN_ROLES } from './useHrAccess'

// Types - Attendance
export type {
  TodayAttendanceSummary,
  MonthlyAttendanceStats,
  AttendanceRecord
} from './useAttendance'

// Types - Performance
export type {
  PerformanceReview,
  KPIItem,
  KPITemplate,
  ReviewRecord,
  KpiTemplateRecord,
  UpdateReviewInput,
  TeamDashboard
} from './usePerformance'

// Types - Payroll
export type {
  SalaryRecord,
  PromotionRecord,
  PromotionCreated,
  CreatePromotionInput,
  UpdateSalaryInput
} from './usePayroll'
