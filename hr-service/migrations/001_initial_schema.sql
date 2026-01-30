-- HR Service Initial Schema
-- Creates all necessary tables for independent HR service

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Employee References (synced from main system)
-- ============================================
CREATE TABLE IF NOT EXISTS employee_refs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id UUID NOT NULL UNIQUE,  -- Main system's employee ID
  full_name VARCHAR(255) NOT NULL,
  employee_code VARCHAR(50),
  branch_id UUID,
  supervisor_id UUID REFERENCES employee_refs(id),
  employment_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  employment_type VARCHAR(20) NOT NULL DEFAULT 'FULL_TIME',
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_employment_status CHECK (
    employment_status IN ('ACTIVE', 'INACTIVE', 'TERMINATED')
  ),
  CONSTRAINT valid_employment_type CHECK (
    employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT')
  )
);

CREATE INDEX idx_employee_refs_external_id ON employee_refs(external_id);
CREATE INDEX idx_employee_refs_branch_id ON employee_refs(branch_id);
CREATE INDEX idx_employee_refs_supervisor_id ON employee_refs(supervisor_id);

-- ============================================
-- Shift Schedules
-- ============================================
CREATE TABLE IF NOT EXISTS shift_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  grace_period_minutes INTEGER DEFAULT 10,
  early_leave_minutes INTEGER DEFAULT 10,
  overtime_start_after TIME,
  is_default BOOLEAN DEFAULT false,
  applicable_days TEXT[] DEFAULT ARRAY['1','2','3','4','5'],
  status VARCHAR(20) DEFAULT 'published',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('published', 'draft', 'archived'))
);

CREATE INDEX idx_shift_schedules_branch_id ON shift_schedules(branch_id);
CREATE INDEX idx_shift_schedules_is_default ON shift_schedules(branch_id, is_default) WHERE is_default = true;

-- ============================================
-- Employee Shift Assignments
-- ============================================
CREATE TABLE IF NOT EXISTS employee_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employee_refs(id),
  shift_schedule_id UUID NOT NULL REFERENCES shift_schedules(id),
  effective_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= effective_date)
);

CREATE INDEX idx_employee_shifts_employee_id ON employee_shifts(employee_id);
CREATE INDEX idx_employee_shifts_schedule_id ON employee_shifts(shift_schedule_id);
CREATE INDEX idx_employee_shifts_effective ON employee_shifts(employee_id, effective_date, end_date);

-- ============================================
-- Attendance Records
-- ============================================
CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employee_refs(id),
  branch_id UUID,
  attendance_date DATE NOT NULL,
  check_in TIMESTAMP WITH TIME ZONE,
  check_out TIMESTAMP WITH TIME ZONE,
  check_type VARCHAR(20) DEFAULT 'NORMAL',
  attendance_status VARCHAR(20) DEFAULT 'PRESENT',
  late_minutes INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  work_hours DECIMAL(4,2),
  overtime_hours DECIMAL(4,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_check_type CHECK (
    check_type IN ('NORMAL', 'OVERTIME', 'MAKEUP', 'MANUAL')
  ),
  CONSTRAINT valid_attendance_status CHECK (
    attendance_status IN ('PRESENT', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'ON_LEAVE')
  ),
  CONSTRAINT unique_employee_date UNIQUE (employee_id, attendance_date, check_type)
);

CREATE INDEX idx_attendances_employee_id ON attendances(employee_id);
CREATE INDEX idx_attendances_branch_id ON attendances(branch_id);
CREATE INDEX idx_attendances_date ON attendances(attendance_date);
CREATE INDEX idx_attendances_employee_date ON attendances(employee_id, attendance_date);

-- ============================================
-- Leave Balances
-- ============================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employee_refs(id),
  leave_type VARCHAR(30) NOT NULL,
  year INTEGER NOT NULL,
  total_days DECIMAL(5,2) DEFAULT 0,
  used_days DECIMAL(5,2) DEFAULT 0,
  pending_days DECIMAL(5,2) DEFAULT 0,
  carry_over_days DECIMAL(5,2) DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_employee_type_year UNIQUE (employee_id, leave_type, year),
  CONSTRAINT valid_leave_type CHECK (
    leave_type IN ('ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY',
                   'BEREAVEMENT', 'MARRIAGE', 'COMPENSATORY', 'UNPAID', 'OTHER')
  )
);

CREATE INDEX idx_leave_balances_employee_id ON leave_balances(employee_id);
CREATE INDEX idx_leave_balances_employee_year ON leave_balances(employee_id, year);

-- ============================================
-- Leave Requests
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employee_refs(id),
  leave_type VARCHAR(30) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested DECIMAL(5,2) NOT NULL,
  reason TEXT,
  leave_status VARCHAR(20) DEFAULT 'PENDING',
  is_half_day BOOLEAN DEFAULT false,
  half_day_type VARCHAR(20),
  approver_id UUID REFERENCES employee_refs(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_leave_status CHECK (
    leave_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
  ),
  CONSTRAINT valid_half_day_type CHECK (
    half_day_type IS NULL OR half_day_type IN ('MORNING', 'AFTERNOON')
  ),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(leave_status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- ============================================
-- Leave Approval Logs
-- ============================================
CREATE TABLE IF NOT EXISTS leave_approval_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id),
  action_by UUID NOT NULL REFERENCES employee_refs(id),
  action VARCHAR(20) NOT NULL,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_action CHECK (
    action IN ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'REVOKE')
  )
);

CREATE INDEX idx_leave_approval_logs_request ON leave_approval_logs(leave_request_id);

-- ============================================
-- Makeup Requests
-- ============================================
CREATE TABLE IF NOT EXISTS makeup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employee_refs(id),
  branch_id UUID NOT NULL,
  target_date DATE NOT NULL,
  makeup_type VARCHAR(20) NOT NULL,
  requested_check_in TIME,
  requested_check_out TIME,
  reason TEXT NOT NULL,
  document_url TEXT,
  request_status VARCHAR(20) DEFAULT 'PENDING',
  approver_id UUID REFERENCES employee_refs(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_makeup_type CHECK (
    makeup_type IN ('CHECK_IN', 'CHECK_OUT', 'BOTH')
  ),
  CONSTRAINT valid_request_status CHECK (
    request_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
  )
);

CREATE INDEX idx_makeup_requests_employee_id ON makeup_requests(employee_id);
CREATE INDEX idx_makeup_requests_status ON makeup_requests(request_status);

-- ============================================
-- Atomic Leave Balance Update Function
-- ============================================
CREATE OR REPLACE FUNCTION update_leave_balance(
  p_employee_id UUID,
  p_leave_type VARCHAR,
  p_year INTEGER,
  p_pending_delta NUMERIC,
  p_used_delta NUMERIC
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_pending NUMERIC,
  new_used NUMERIC
) AS $$
DECLARE
  v_balance leave_balances%ROWTYPE;
BEGIN
  -- Lock the row for update
  SELECT * INTO v_balance
  FROM leave_balances
  WHERE employee_id = p_employee_id
    AND leave_type = p_leave_type
    AND year = p_year
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Balance record not found'::TEXT,
      0::NUMERIC,
      0::NUMERIC;
    RETURN;
  END IF;

  -- Update balance
  UPDATE leave_balances
  SET
    pending_days = GREATEST(0, pending_days + p_pending_delta),
    used_days = GREATEST(0, used_days + p_used_delta),
    updated_at = NOW()
  WHERE id = v_balance.id
  RETURNING pending_days, used_days INTO v_balance.pending_days, v_balance.used_days;

  RETURN QUERY SELECT
    true::BOOLEAN,
    'Balance updated successfully'::TEXT,
    v_balance.pending_days,
    v_balance.used_days;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Updated At Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_employee_refs_updated_at
  BEFORE UPDATE ON employee_refs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_schedules_updated_at
  BEFORE UPDATE ON shift_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendances_updated_at
  BEFORE UPDATE ON attendances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_makeup_requests_updated_at
  BEFORE UPDATE ON makeup_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
