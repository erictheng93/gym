/**
 * Directus Schema Types
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
  member_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED'
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
  log_type: 'PAUSE' | 'EXTENSION' | 'TRANSFER'
  start_date: string | null
  end_date: string | null
  days_affected: number | null
  reason: string | null
  created_by_employee: string | null
  // Relations
  contract?: Contract
  created_by?: Employee
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
  // Relations
  employee?: Employee
  branch?: Branch
}

// 休假申請
export interface LeaveRequest extends BaseFields {
  employee_id: string
  leave_type: 'SICK' | 'ANNUAL' | 'PERSONAL' | 'COMPENSATORY'
  start_date: string
  end_date: string
  leave_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approver_id: string | null
  reason: string | null
  // Relations
  employee?: Employee
  approver?: Employee
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
  membership_plans: MembershipPlan[]
  contracts: Contract[]
  contract_logs: ContractLog[]
  attendances: Attendance[]
  leave_requests: LeaveRequest[]
  payments: Payment[]
}
