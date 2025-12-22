/**
 * 狀態標籤配置
 *
 * 集中管理各種狀態的顯示文字和樣式
 */

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'

export interface StatusConfig {
  label: string
  variant: BadgeVariant
}

// ============================================
// 會員狀態
// ============================================
export const MEMBER_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: '有效', variant: 'success' },
  EXPIRED: { label: '過期', variant: 'error' },
  SUSPENDED: { label: '暫停', variant: 'warning' },
  BANNED: { label: '停權', variant: 'error' }
}

export function getMemberStatusBadge(status: string): StatusConfig {
  return MEMBER_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 合約狀態
// ============================================
export const CONTRACT_STATUS: Record<string, StatusConfig> = {
  DRAFT: { label: '草稿', variant: 'default' },
  ACTIVE: { label: '有效', variant: 'success' },
  PAUSED: { label: '暫停', variant: 'warning' },
  EXPIRED: { label: '已過期', variant: 'error' },
  TERMINATED: { label: '已終止', variant: 'error' }
}

export function getContractStatusBadge(status: string): StatusConfig {
  return CONTRACT_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 付款狀態
// ============================================
export const PAYMENT_STATUS: Record<string, StatusConfig> = {
  UNPAID: { label: '未付款', variant: 'error' },
  PARTIAL: { label: '部分付款', variant: 'warning' },
  PAID: { label: '已付清', variant: 'success' }
}

export function getPaymentStatusBadge(status: string): StatusConfig {
  return PAYMENT_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 員工狀態
// ============================================
export const EMPLOYEE_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: '在職', variant: 'success' },
  RESIGNED: { label: '離職', variant: 'error' },
  LEAVE: { label: '留停', variant: 'warning' }
}

export function getEmployeeStatusBadge(status: string): StatusConfig {
  return EMPLOYEE_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 聘用類型
// ============================================
export const EMPLOYMENT_TYPE: Record<string, StatusConfig> = {
  FULL_TIME: { label: '正職', variant: 'info' },
  PART_TIME: { label: '兼職', variant: 'default' },
  FREELANCE: { label: '外包', variant: 'default' }
}

export function getEmploymentTypeBadge(type: string): StatusConfig {
  return EMPLOYMENT_TYPE[type] || { label: type, variant: 'default' }
}

// ============================================
// 休假狀態
// ============================================
export const LEAVE_STATUS: Record<string, StatusConfig> = {
  PENDING: { label: '待審核', variant: 'warning' },
  APPROVED: { label: '已核准', variant: 'success' },
  REJECTED: { label: '已拒絕', variant: 'error' },
  CANCELLED: { label: '已取消', variant: 'default' }
}

export function getLeaveStatusBadge(status: string): StatusConfig {
  return LEAVE_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 通用狀態取得函數
// ============================================
export type StatusType = 'member' | 'contract' | 'payment' | 'employee' | 'employment' | 'leave'

const STATUS_GETTERS: Record<StatusType, (status: string) => StatusConfig> = {
  member: getMemberStatusBadge,
  contract: getContractStatusBadge,
  payment: getPaymentStatusBadge,
  employee: getEmployeeStatusBadge,
  employment: getEmploymentTypeBadge,
  leave: getLeaveStatusBadge
}

/**
 * 取得狀態標籤配置
 *
 * @example
 * const { label, variant } = getStatusBadge('member', 'ACTIVE')
 * // { label: '有效', variant: 'success' }
 */
export function getStatusBadge(type: StatusType, status: string): StatusConfig {
  const getter = STATUS_GETTERS[type]
  return getter ? getter(status) : { label: status, variant: 'default' }
}
