/**
 * Database Schema Types
 * 根據健身房系統架構設計生成
 */

// 基礎欄位
interface BaseFields {
  id: string
  status: 'active' | 'archived'
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
}

// 分店
export interface Branch extends BaseFields {
  name: string
  type: 'HEADQUARTER' | 'BRANCH'
  address: string | null
  phone: string | null
  tax_id: string | null
  settings: Record<string, unknown> | null
}

// 職位
export interface JobTitle extends BaseFields {
  name: string
  permissions_config: Record<string, boolean> | null
}

// 員工
export interface Employee extends BaseFields {
  employee_code: string | null
  full_name: string
  user_id: string | null
  branch_id: string | null
  job_title_id: string | null
  employment_status: 'ACTIVE' | 'RESIGNED' | 'LEAVE'
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'FREELANCE'
  basic_salary: number | null
  custom_permissions: Record<string, boolean> | null
  // Relations
  branch?: Branch
  job_title?: JobTitle
}

// 會員
export interface Member extends BaseFields {
  member_code: string
  full_name: string
  phone: string | null
  email: string | null
  branch_id: string | null
  user_id: string | null // 連結到 directus_users (for OAuth)
  member_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED' | 'INACTIVE'
  join_date: string | null
  sales_person_id: string | null
  tags: string[] | null
  gender: 'M' | 'F' | 'O' | null
  birthday: string | null
  height: number | null
  emergency_contact: string | null
  emergency_phone: string | null
  // Relations
  branch?: Branch
  sales_person?: Employee
  contracts?: Contract[]
  social_accounts?: MemberSocialAccount[]
}

// 會員社群帳號連結
export interface MemberSocialAccount {
  id: string
  member_id: string
  provider: 'google' | 'apple' | 'facebook' | 'line' | 'phone'
  provider_user_id: string
  provider_email: string | null
  provider_name: string | null
  provider_avatar_url: string | null
  is_primary: boolean
  status: 'active' | 'inactive' | 'revoked'
  linked_at: string
  last_login_at: string | null
  date_created: string
  date_updated: string | null
  // Relations
  member?: Member
}

// 會籍方案
export interface MembershipPlan extends BaseFields {
  name: string
  plan_type: 'TIME_BASED' | 'COUNT_BASED'
  duration_months: number | null
  class_counts: number | null
  price: number
  allow_transfer: boolean
  allow_pause: boolean
  description: string | null
}

// 合約
export interface Contract extends BaseFields {
  contract_no: string
  member_id: string
  plan_id: string
  sign_date: string | null
  start_date: string
  end_date: string | null
  original_end_date: string | null
  contract_status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'TERMINATED'
  remaining_counts: number | null
  total_amount: number
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID'
  digital_signature: string | null
  contract_pdf: string | null
  sales_person_id: string | null
  branch_id: string | null
  notes: string | null
  // Relations
  member?: Member
  plan?: MembershipPlan
  branch?: Branch
  sales_person?: Employee
  logs?: ContractLog[]
  payments?: Payment[]
}

// 合約異動
export interface ContractLog extends BaseFields {
  contract_id: string
  log_type: 'PAUSE' | 'RESUME' | 'EXTEND' | 'TRANSFER' | 'CANCEL' | 'CLASS_USED' | 'RENEWAL'
  start_date: string | null
  end_date: string | null
  days_affected: number | null
  reason: string | null
  created_by_employee: string | null
  original_member_id: string | null
  target_member_id: string | null
  branch_id: string | null
  // Relations
  contract?: Contract
  created_by?: Employee
  original_member?: Member
  target_member?: Member
  branch?: Branch
}

// 打卡紀錄
export interface Attendance {
  id: string
  date_created: string
  employee_id: string
  check_in: string | null
  check_out: string | null
  work_hours: number | null
  location_ip: string | null
  location_gps: string | null
  branch_id: string | null
  attendance_date: string | null
  check_type: 'REGULAR' | 'OVERTIME' | 'MAKEUP' | 'EARLY'
  late_minutes: number
  early_leave_minutes: number
  overtime_hours: number
  attendance_status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_LEAVE' | 'LEAVE' | 'HOLIDAY'
  notes: string | null
  // Relations
  employee?: Employee
  branch?: Branch
}

// 休假申請
export interface LeaveRequest extends BaseFields {
  employee_id: string
  leave_type: 'SICK' | 'ANNUAL' | 'PERSONAL' | 'MATERNITY' | 'BEREAVEMENT' | 'OTHER'
  start_date: string
  end_date: string
  leave_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  approver_id: string | null
  reason: string | null
  hours_requested: number | null
  days_requested: number | null
  submitted_at: string | null
  approved_at: string | null
  approval_notes: string | null
  document_url: string | null
  is_half_day: boolean
  half_day_type: 'AM' | 'PM' | null
  // Relations
  employee?: Employee
  approver?: Employee
}

// 休假餘額
export interface LeaveBalance {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  employee_id: string
  leave_type: 'ANNUAL' | 'SICK' | 'PERSONAL' | 'MATERNITY' | 'BEREAVEMENT' | 'OTHER'
  year: number
  total_days: number
  used_days: number
  pending_days: number
  carried_over_days: number
  expires_at: string | null
  // Relations
  employee?: Employee
}

// 休假審核歷程
export interface LeaveApprovalLog {
  id: string
  date_created: string
  leave_request_id: string
  action_by: string
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REVOKE'
  previous_status: string | null
  new_status: string | null
  notes: string | null
  // Relations
  leave_request?: LeaveRequest
  actor?: Employee
}

// 班表設定
export interface ShiftSchedule {
  id: string
  status: string
  date_created: string
  date_updated: string | null
  branch_id: string
  name: string
  start_time: string
  end_time: string
  break_start: string | null
  break_end: string | null
  grace_period_minutes: number
  early_leave_minutes: number
  overtime_start_after: string | null
  is_default: boolean
  applicable_days: string[]
  // Relations
  branch?: Branch
}

// 補打卡申請
export interface MakeupRequest extends BaseFields {
  employee_id: string
  branch_id: string
  target_date: string
  makeup_type: 'CHECK_IN' | 'CHECK_OUT' | 'BOTH'
  requested_check_in: string | null
  requested_check_out: string | null
  reason: string
  document_url: string | null
  request_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  approver_id: string | null
  approved_at: string | null
  approval_notes: string | null
  submitted_at: string | null
  // Relations
  employee?: Employee
  branch?: Branch
  approver?: Employee
}

// 補打卡審核歷程
export interface MakeupApprovalLog {
  id: string
  date_created: string
  makeup_request_id: string
  action_by: string
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL'
  previous_status: string | null
  new_status: string | null
  notes: string | null
  // Relations
  makeup_request?: MakeupRequest
  actor?: Employee
}

// 員工班表指派
export interface EmployeeShift {
  id: string
  date_created: string
  employee_id: string
  shift_schedule_id: string
  effective_date: string
  end_date: string | null
  // Relations
  employee?: Employee
  shift_schedule?: ShiftSchedule
}

// 會員入場紀錄
export interface MemberCheckin {
  id: string
  date_created: string
  member_id: string
  branch_id: string | null
  contract_id: string | null
  check_time: string
  verified_by: string | null
  // Relations
  member?: Member
  branch?: Branch
  contract?: Contract
  verifier?: Employee
}

// 課程類別
export interface ClassCategory {
  id: string
  status: 'published' | 'draft' | 'archived'
  sort: number | null
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
  code: string
  name: string
  name_en: string | null
  parent_id: string | null
  icon: string | null
  color: string
  image_url: string | null
  description: string | null
  is_active: boolean
  requires_equipment: boolean
  equipment_list: string[]
  metadata: Record<string, unknown>
  owner_branch_id: string | null
  visibility: 'owner_only' | 'shared'
  // Relations
  parent?: ClassCategory
  children?: ClassCategory[]
  owner_branch?: Branch
}

// 課程類別-分店關聯
export interface ClassCategoryBranch {
  id: string
  status: 'published' | 'draft' | 'archived'
  sort: number | null
  date_created: string
  date_updated: string | null
  category_id: string
  branch_id: string
  is_featured: boolean
  is_active: boolean
  custom_name: string | null
  custom_description: string | null
  sort_order: number
  // Relations
  category?: ClassCategory
  branch?: Branch
}

// 課程定義
export interface Class {
  id: string
  status: 'active' | 'archived'
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
  name: string
  description: string | null
  duration_minutes: number
  max_capacity: number
  instructor_id: string | null
  branch_id: string
  category: string | null
  category_id: string | null
  difficulty_level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  image_url: string | null
  is_active: boolean
  requires_count: boolean
  count_deduction: number
  // Relations
  instructor?: Employee
  branch?: Branch
  class_category?: ClassCategory
}

// 課程排程（週循環）
export interface ClassSchedule {
  id: string
  status: 'active' | 'archived'
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
  class_id: string
  branch_id: string
  instructor_id: string | null
  day_of_week: number // 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time: string
  end_time: string
  room: string | null
  max_capacity: number | null
  is_recurring: boolean
  valid_from: string | null
  valid_until: string | null
  // Relations
  class?: Class
  branch?: Branch
  instructor?: Employee
}

// 課程場次（實際課程實例）
export interface ClassSession {
  id: string
  status: 'active' | 'archived'
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
  schedule_id: string | null
  class_id: string
  branch_id: string
  instructor_id: string | null
  session_date: string
  start_time: string
  end_time: string
  room: string | null
  max_capacity: number
  current_count: number
  waitlist_count: number
  session_status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'
  cancelled_reason: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  // Relations
  schedule?: ClassSchedule
  class?: Class
  branch?: Branch
  instructor?: Employee
  bookings?: Booking[]
}

// 課程預約
export interface Booking {
  id: string
  status: 'active' | 'archived'
  date_created: string
  date_updated: string | null
  user_created: string | null
  user_updated: string | null
  session_id: string
  member_id: string
  contract_id: string | null
  booking_status: 'CONFIRMED' | 'WAITLIST' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW'
  waitlist_position: number | null
  booked_at: string
  cancelled_at: string | null
  cancel_reason: string | null
  attended_at: string | null
  count_deducted: boolean
  // Relations
  session?: ClassSession
  member?: Member
  contract?: Contract
}

// 收付款
export interface Payment extends BaseFields {
  contract_id: string | null
  member_id: string | null
  amount: number
  payment_method: 'CASH' | 'CREDIT_CARD' | 'LINE_PAY' | 'TRANSFER' | null
  payment_date: string | null
  payment_type: 'INCOME' | 'REFUND'
  branch_id: string | null
  received_by: string | null
  notes: string | null
  // Relations
  contract?: Contract
  member?: Member
  branch?: Branch
  receiver?: Employee
}

// Directus Schema
export interface DirectusSchema {
  branches: Branch[]
  job_titles: JobTitle[]
  employees: Employee[]
  members: Member[]
  member_social_accounts: MemberSocialAccount[]
  membership_plans: MembershipPlan[]
  contracts: Contract[]
  contract_logs: ContractLog[]
  attendances: Attendance[]
  leave_requests: LeaveRequest[]
  leave_balances: LeaveBalance[]
  leave_approval_logs: LeaveApprovalLog[]
  shift_schedules: ShiftSchedule[]
  payments: Payment[]
  member_checkins: MemberCheckin[]
  makeup_requests: MakeupRequest[]
  makeup_approval_logs: MakeupApprovalLog[]
  employee_shifts: EmployeeShift[]
  class_categories: ClassCategory[]
  class_category_branches: ClassCategoryBranch[]
  classes: Class[]
  class_schedules: ClassSchedule[]
  class_sessions: ClassSession[]
  bookings: Booking[]
}
