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
  DirectusSchema
} from './types'

// Composables
export { useDirectus } from './composables'
export type { DirectusInstance } from './composables'

// Utils - Formatters
export {
  formatDate,
  formatRelativeTime,
  formatCurrency,
  formatNumber,
  formatPhone
} from './utils'
export type { DateFormatOptions } from './utils'

// Utils - Status Badges
export {
  MEMBER_STATUS,
  CONTRACT_STATUS,
  PAYMENT_STATUS,
  EMPLOYEE_STATUS,
  EMPLOYMENT_TYPE,
  LEAVE_STATUS,
  getMemberStatusBadge,
  getContractStatusBadge,
  getPaymentStatusBadge,
  getEmployeeStatusBadge,
  getEmploymentTypeBadge,
  getLeaveStatusBadge,
  getStatusBadge
} from './utils'
export type { BadgeVariant, StatusConfig, StatusType } from './utils'
