/**
 * Database Entity Types
 */

// Employee Reference (synced from main system)
export interface DbEmployeeRef {
  id: string
  external_id: string
  full_name: string
  employee_code: string | null
  branch_id: string | null
  supervisor_id: string | null
  employment_status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
  synced_at: Date
  created_at: Date
  updated_at: Date
}

// Attendance Record
export interface DbAttendance {
  id: string
  employee_id: string
  branch_id: string | null
  attendance_date: string
  check_in: string | null
  check_out: string | null
  check_type: 'NORMAL' | 'OVERTIME' | 'MAKEUP' | 'MANUAL'
  attendance_status: 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'ON_LEAVE'
  late_minutes: number
  early_leave_minutes: number
  work_hours: number | null
  overtime_hours: number | null
  notes: string | null
  created_at: Date
  updated_at: Date
}

// Leave Request
export interface DbLeaveRequest {
  id: string
  employee_id: string
  leave_type: string
  start_date: string
  end_date: string
  days_requested: number
  reason: string | null
  leave_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  is_half_day: boolean
  half_day_type: 'MORNING' | 'AFTERNOON' | null
  approver_id: string | null
  approved_at: Date | null
  approval_notes: string | null
  submitted_at: Date | null
  created_at: Date
  updated_at: Date
}

// Leave Balance
export interface DbLeaveBalance {
  id: string
  employee_id: string
  leave_type: string
  year: number
  total_days: number
  used_days: number
  pending_days: number
  carry_over_days: number
  expiry_date: string | null
  created_at: Date
  updated_at: Date
}

// Leave Approval Log
export interface DbLeaveApprovalLog {
  id: string
  leave_request_id: string
  action_by: string
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REVOKE'
  previous_status: string | null
  new_status: string | null
  notes: string | null
  created_at: Date
}

// Shift Schedule
export interface DbShiftSchedule {
  id: string
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
  status: 'published' | 'draft' | 'archived'
  created_at: Date
  updated_at: Date
}

// Employee Shift Assignment
export interface DbEmployeeShift {
  id: string
  employee_id: string
  shift_schedule_id: string
  effective_date: string
  end_date: string | null
  created_at: Date
}

// Makeup Request
export interface DbMakeupRequest {
  id: string
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
  approved_at: Date | null
  approval_notes: string | null
  submitted_at: Date | null
  created_at: Date
  updated_at: Date
}
