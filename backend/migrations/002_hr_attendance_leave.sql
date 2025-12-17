-- ============================================
-- HR 考勤/休假系統 Migration
-- 版本: 002
-- 日期: 2025-12-17
-- 說明:
--   1. 區分員工打卡 vs 會員入場 (checkin)
--   2. 實現休假審核流程 (上級審核下級)
--   3. 新增上下級關係、休假餘額、審核歷史
-- 相依: schema.sql (attendances, leave_requests, employees 表)
-- ============================================

BEGIN;

-- ============================================
-- 1. 修改 employees 表 - 新增上下級關係
-- ============================================
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES employees(id);

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_employees_supervisor ON employees(supervisor_id);

COMMENT ON COLUMN employees.supervisor_id IS '直屬上級員工 ID，用於休假審核流程';

-- ============================================
-- 2. 會員入場紀錄表 (member_checkins) - 區別於員工打卡
-- ============================================
CREATE TABLE IF NOT EXISTS member_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 核心欄位
    member_id UUID REFERENCES members(id) NOT NULL,
    contract_id UUID REFERENCES contracts(id),
    check_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    check_type VARCHAR(20) DEFAULT 'ENTRY' CHECK (check_type IN ('ENTRY', 'EXIT')),

    -- 入場地點
    branch_id UUID REFERENCES branches(id) NOT NULL,
    is_cross_branch BOOLEAN DEFAULT false,

    -- 驗證資訊
    verified_by UUID REFERENCES employees(id),
    verification_method VARCHAR(20) CHECK (verification_method IN ('BARCODE', 'QR_CODE', 'MANUAL', 'FACE_ID', 'FINGERPRINT')),

    -- 設備資訊
    device_id VARCHAR(50),
    location_ip VARCHAR(50),

    -- 備註
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_member_checkins_member ON member_checkins(member_id);
CREATE INDEX IF NOT EXISTS idx_member_checkins_branch ON member_checkins(branch_id);
CREATE INDEX IF NOT EXISTS idx_member_checkins_time ON member_checkins(check_time);

COMMENT ON TABLE member_checkins IS '會員入場/離場紀錄 (區別於員工打卡 attendances)';

-- ============================================
-- 3. 增強 attendances 表 - 員工打卡
-- ============================================
ALTER TABLE attendances
ADD COLUMN IF NOT EXISTS attendance_date DATE,
ADD COLUMN IF NOT EXISTS check_type VARCHAR(20) DEFAULT 'REGULAR',
ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT 'PRESENT',
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 添加約束 (使用 DO 塊避免重複添加錯誤)
DO $$
BEGIN
    -- check_type 約束
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendances_check_type_check'
    ) THEN
        ALTER TABLE attendances
        ADD CONSTRAINT attendances_check_type_check
        CHECK (check_type IN ('REGULAR', 'OVERTIME', 'MAKEUP', 'EARLY'));
    END IF;

    -- attendance_status 約束
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendances_attendance_status_check'
    ) THEN
        ALTER TABLE attendances
        ADD CONSTRAINT attendances_attendance_status_check
        CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'LEAVE', 'HOLIDAY'));
    END IF;
END $$;

-- 更新現有資料的 attendance_date
UPDATE attendances
SET attendance_date = (check_in AT TIME ZONE 'Asia/Taipei')::DATE
WHERE attendance_date IS NULL AND check_in IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendances_status ON attendances(attendance_status);

-- ============================================
-- 4. 增強 leave_requests 表 - 休假申請
-- ============================================
ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS hours_requested DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS days_requested DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS document_url TEXT,
ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS half_day_type VARCHAR(10);

-- 添加 half_day_type 約束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_half_day_type_check'
    ) THEN
        ALTER TABLE leave_requests
        ADD CONSTRAINT leave_requests_half_day_type_check
        CHECK (half_day_type IN ('AM', 'PM'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(leave_status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_approver ON leave_requests(approver_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- ============================================
-- 5. 休假餘額表 (leave_balances)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    employee_id UUID REFERENCES employees(id) NOT NULL,
    leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'BEREAVEMENT', 'OTHER')),
    year INTEGER NOT NULL,

    total_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
    used_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
    pending_days DECIMAL(5, 2) NOT NULL DEFAULT 0,

    carried_over_days DECIMAL(5, 2) DEFAULT 0,
    expires_at DATE,

    UNIQUE(employee_id, leave_type, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances(year);

COMMENT ON TABLE leave_balances IS '員工休假餘額表';

-- ============================================
-- 6. 休假審核歷史表 (leave_approval_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_approval_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    leave_request_id UUID REFERENCES leave_requests(id) NOT NULL,
    action_by UUID REFERENCES employees(id) NOT NULL,

    action VARCHAR(20) NOT NULL CHECK (action IN ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'REVOKE')),
    previous_status VARCHAR(20),
    new_status VARCHAR(20),

    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_request ON leave_approval_logs(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_action_by ON leave_approval_logs(action_by);

COMMENT ON TABLE leave_approval_logs IS '休假審核歷史紀錄';

-- ============================================
-- 7. 班表設定表 (shift_schedules)
-- ============================================
CREATE TABLE IF NOT EXISTS shift_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    branch_id UUID REFERENCES branches(id) NOT NULL,
    name VARCHAR(50) NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start TIME,
    break_end TIME,

    grace_period_minutes INTEGER DEFAULT 10,
    early_leave_minutes INTEGER DEFAULT 0,
    overtime_start_after TIME,

    is_default BOOLEAN DEFAULT false,
    applicable_days JSONB DEFAULT '["MON","TUE","WED","THU","FRI"]'
);

CREATE INDEX IF NOT EXISTS idx_shift_schedules_branch ON shift_schedules(branch_id);

COMMENT ON TABLE shift_schedules IS '班表設定';

-- ============================================
-- 8. 員工班表關聯表 (employee_shifts)
-- ============================================
CREATE TABLE IF NOT EXISTS employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    employee_id UUID REFERENCES employees(id) NOT NULL,
    shift_schedule_id UUID REFERENCES shift_schedules(id) NOT NULL,
    effective_date DATE NOT NULL,
    end_date DATE,

    UNIQUE(employee_id, shift_schedule_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_employee ON employee_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_date ON employee_shifts(effective_date);

COMMENT ON TABLE employee_shifts IS '員工班表指派';

COMMIT;
