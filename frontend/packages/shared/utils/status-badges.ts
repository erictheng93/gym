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

export function getMemberStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
  // Support both uppercase and lowercase status values from API
  const normalizedStatus = status.toUpperCase()
  return MEMBER_STATUS[normalizedStatus] || { label: status, variant: 'default' }
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

export function getContractStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
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

export function getPaymentStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
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

export function getEmployeeStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
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

export function getEmploymentTypeBadge(type: string | undefined | null): StatusConfig {
  if (!type) return { label: '未設定', variant: 'default' }
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

export function getLeaveStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
  return LEAVE_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 課程場次狀態
// ============================================
export const SESSION_STATUS: Record<string, StatusConfig> = {
  SCHEDULED: { label: '已排定', variant: 'info' },
  COMPLETED: { label: '已完成', variant: 'success' },
  CANCELLED: { label: '已取消', variant: 'error' }
}

export function getSessionStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
  return SESSION_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 課程預約狀態
// ============================================
export const BOOKING_STATUS: Record<string, StatusConfig> = {
  CONFIRMED: { label: '已確認', variant: 'success' },
  WAITLIST: { label: '候補中', variant: 'warning' },
  CANCELLED: { label: '已取消', variant: 'default' },
  ATTENDED: { label: '已出席', variant: 'info' },
  NO_SHOW: { label: '未出席', variant: 'error' }
}

export function getBookingStatusBadge(status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
  return BOOKING_STATUS[status] || { label: status, variant: 'default' }
}

// ============================================
// 課程難度
// ============================================
export const DIFFICULTY_LEVEL: Record<string, StatusConfig> = {
  BEGINNER: { label: '初級', variant: 'success' },
  INTERMEDIATE: { label: '中級', variant: 'warning' },
  ADVANCED: { label: '進階', variant: 'error' }
}

export function getDifficultyBadge(level: string | undefined | null): StatusConfig {
  if (!level) return { label: '未設定', variant: 'default' }
  return DIFFICULTY_LEVEL[level] || { label: level, variant: 'default' }
}

// ============================================
// 通用狀態取得函數
// ============================================
export type StatusType = 'member' | 'contract' | 'payment' | 'employee' | 'employment' | 'leave' | 'session' | 'booking' | 'difficulty'

const STATUS_GETTERS: Record<StatusType, (status: string) => StatusConfig> = {
  member: getMemberStatusBadge,
  contract: getContractStatusBadge,
  payment: getPaymentStatusBadge,
  employee: getEmployeeStatusBadge,
  employment: getEmploymentTypeBadge,
  leave: getLeaveStatusBadge,
  session: getSessionStatusBadge,
  booking: getBookingStatusBadge,
  difficulty: getDifficultyBadge
}

/**
 * 取得狀態標籤配置
 *
 * @example
 * const { label, variant } = getStatusBadge('member', 'ACTIVE')
 * // { label: '有效', variant: 'success' }
 */
export function getStatusBadge(type: StatusType, status: string | undefined | null): StatusConfig {
  if (!status) return { label: '未設定', variant: 'default' }
  const getter = STATUS_GETTERS[type]
  return getter ? getter(status) : { label: status, variant: 'default' }
}
