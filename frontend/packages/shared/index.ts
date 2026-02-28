// Types - 具名導出以支持 tree-shaking
export type {
  Branch,
  JobTitle,
  Employee,
  Member,
  MemberSocialAccount,
  MembershipPlan,
  Contract,
  ContractLog,
  Attendance,
  LeaveRequest,
  LeaveBalance,
  LeaveApprovalLog,
  ShiftSchedule,
  MakeupRequest,
  MakeupApprovalLog,
  EmployeeShift,
  MemberCheckin,
  ClassCategory,
  ClassCategoryBranch,
  Payment,
  DatabaseSchema
} from './types'

// Composables
export { useTenant } from './composables'
export type { TenantInfo, TenantQuota } from './composables'
export { createOfflineSync } from './composables'

// Offline sync types
export type { QueuedRequest, CacheEntry, SyncResult, OfflineSyncConfig } from './types'

// Utils - Formatters
export {
  formatDate,
  formatRelativeTime,
  formatCurrency,
  formatNumber,
  formatPhone,
  DAY_OF_WEEK_NAMES,
  DAY_OF_WEEK_NAMES_MONDAY_FIRST,
  getDayName,
  formatDateWithDay
} from './utils'
export type { DateFormatOptions } from './utils'

// Utils - Status Badges
export {
  MEMBER_STATUS,
  CONTRACT_STATUS,
  PAYMENT_STATUS,
  EMPLOYEE_STATUS,
  EMPLOYMENT_TYPE,
  SESSION_STATUS,
  BOOKING_STATUS,
  DIFFICULTY_LEVEL,
  LEAVE_STATUS,
  getMemberStatusBadge,
  getContractStatusBadge,
  getPaymentStatusBadge,
  getEmployeeStatusBadge,
  getSessionStatusBadge,
  getBookingStatusBadge,
  getDifficultyBadge,
  getEmploymentTypeBadge,
  getLeaveStatusBadge,
  getStatusBadge
} from './utils'
export type { BadgeVariant, StatusConfig, StatusType } from './utils'
