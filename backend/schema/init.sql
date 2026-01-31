-- ============================================
-- Gym Nexus 初始化 Schema
-- 版本: v1.1
-- 日期: 2026-01-20
-- 說明: 創建所有核心業務表格（使用 UUID v7）
-- ============================================

-- 啟用 UUID 擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- UUID v7 生成函數 (RFC 9562)
-- 時間有序 UUID，優化 B-tree 索引效率
-- ============================================

CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    unix_ts_ms BIGINT;
    uuid_bytes BYTEA;
BEGIN
    -- 取得當前 Unix 毫秒時間戳
    unix_ts_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

    -- 先生成 16 bytes 隨機數
    uuid_bytes := gen_random_bytes(16);

    -- 覆寫前 6 bytes 為時間戳 (big-endian)
    uuid_bytes := set_byte(uuid_bytes, 0, ((unix_ts_ms >> 40) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 1, ((unix_ts_ms >> 32) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 2, ((unix_ts_ms >> 24) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 3, ((unix_ts_ms >> 16) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 4, ((unix_ts_ms >> 8) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 5, (unix_ts_ms & 255)::INT);

    -- 設定版本 (byte 6 高 4 位 = 0111 = 7)
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);

    -- 設定變體 (byte 8 高 2 位 = 10)
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);

    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

COMMENT ON FUNCTION gen_uuid_v7() IS
'生成 UUID v7 (RFC 9562)
- 時間有序：前 48 位為 Unix 毫秒時間戳
- 優化索引：比 UUID v4 的 B-tree 索引效率高 30-50%
- 全球唯一：支援分布式生成
- 用法：SELECT gen_uuid_v7();';

-- 從 UUID v7 提取時間戳的輔助函數
CREATE OR REPLACE FUNCTION uuid_v7_to_timestamp(uuid_val uuid)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    uuid_hex TEXT;
    unix_ts_ms BIGINT;
BEGIN
    uuid_hex := replace(uuid_val::text, '-', '');

    -- 驗證是否為 UUID v7
    IF substring(uuid_hex from 13 for 1) != '7' THEN
        RETURN NULL;
    END IF;

    -- 提取前 48 位（12 個十六進位字元）
    unix_ts_ms := ('x' || substring(uuid_hex from 1 for 12))::bit(48)::bigint;

    RETURN to_timestamp(unix_ts_ms / 1000.0);
END;
$$;

COMMENT ON FUNCTION uuid_v7_to_timestamp(uuid) IS
'從 UUID v7 提取創建時間
- 返回 TIMESTAMPTZ
- 若非 UUID v7 則返回 NULL
- 用法：SELECT uuid_v7_to_timestamp(id) FROM members;';

-- ============================================
-- A. 組織與權限模組 (Organization & Access)
-- ============================================

-- 3.1 branches (分店/場館)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'BRANCH' CHECK (type IN ('HEADQUARTER', 'BRANCH')),
    code VARCHAR(20) NOT NULL UNIQUE,
    address VARCHAR(255),
    phone VARCHAR(20),
    tax_id VARCHAR(20),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_type ON branches(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_code ON branches(code);

COMMENT ON TABLE branches IS '分店/場館資料表';
COMMENT ON COLUMN branches.type IS 'HEADQUARTER=總部, BRANCH=分店';

-- 3.2 job_titles (職位/角色定義)
CREATE TABLE IF NOT EXISTS job_titles (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(50) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    description TEXT,
    permissions_config JSONB NOT NULL DEFAULT '{}',
    sort INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE job_titles IS '職位/角色定義表';

-- 3.3 employees (員工資料)
-- Note: user_id references directus_users but FK constraint is added after Directus creates the table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    user_id UUID,  -- FK to directus_users will be added by Directus migration
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    job_title_id UUID NOT NULL REFERENCES job_titles(id) ON DELETE RESTRICT,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESIGNED', 'LEAVE')),
    employment_type VARCHAR(20) NOT NULL DEFAULT 'FULL_TIME' CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'FREELANCE')),
    hire_date DATE NOT NULL,
    resign_date DATE,
    basic_salary DECIMAL(10, 2) DEFAULT 0,
    custom_permissions JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

COMMENT ON TABLE employees IS '員工資料表';

-- ============================================
-- B. 會員與合約模組 (Members & Contracts)
-- ============================================

-- 3.4 members (會員資料)
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    gender VARCHAR(10) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    birthday DATE,
    id_number VARCHAR(20),
    address VARCHAR(255),
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sales_person_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED')),
    join_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    avatar UUID,
    height FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_code ON members(member_code);
CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_sales_person ON members(sales_person_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);

COMMENT ON TABLE members IS '會員資料表';

-- 3.5 membership_plans (會籍/產品方案)
CREATE TABLE IF NOT EXISTS membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('TIME_BASED', 'COUNT_BASED')),
    description TEXT,
    duration_months INTEGER DEFAULT 0,
    class_counts INTEGER DEFAULT 0,
    price DECIMAL(10, 2) NOT NULL,
    allow_pause BOOLEAN NOT NULL DEFAULT TRUE,
    max_pause_days INTEGER DEFAULT 30,
    allow_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_plans_code ON membership_plans(code);

COMMENT ON TABLE membership_plans IS '會籍/產品方案表';

-- 3.6 contracts (電子合約/會籍實例)
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    contract_no VARCHAR(30) NOT NULL UNIQUE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sales_person_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'TERMINATED')),
    sign_date TIMESTAMPTZ,
    start_date DATE NOT NULL,
    original_end_date DATE NOT NULL,
    end_date DATE NOT NULL,
    remaining_counts INTEGER DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
    digital_signature UUID,
    contract_pdf UUID,
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_no ON contracts(contract_no);
CREATE INDEX IF NOT EXISTS idx_contracts_member ON contracts(member_id);
CREATE INDEX IF NOT EXISTS idx_contracts_branch ON contracts(branch_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_payment_status ON contracts(payment_status);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at);

COMMENT ON TABLE contracts IS '電子合約/會籍實例表';

-- 3.7 contract_logs (合約異動紀錄)
CREATE TABLE IF NOT EXISTS contract_logs (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('PAUSE', 'EXTENSION', 'TRANSFER')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INTEGER NOT NULL,
    reason VARCHAR(255),
    original_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    target_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_logs_contract ON contract_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_logs_type ON contract_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_contract_logs_transfer ON contract_logs(target_member_id) WHERE log_type = 'TRANSFER';

COMMENT ON TABLE contract_logs IS '合約異動紀錄表';

-- ============================================
-- C. HR 與考勤模組 (HR System)
-- ============================================

-- 3.8 attendances (打卡紀錄)
CREATE TABLE IF NOT EXISTS attendances (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    check_in TIMESTAMPTZ NOT NULL,
    check_out TIMESTAMPTZ,
    work_hours FLOAT DEFAULT 0,
    check_in_ip VARCHAR(45),
    check_out_ip VARCHAR(45),
    check_in_location JSONB,
    check_out_location JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (status IN ('NORMAL', 'LATE', 'EARLY_LEAVE', 'ABSENT')),
    notes VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendances_employee ON attendances(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendances_branch ON attendances(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendances_check_in ON attendances(check_in);

COMMENT ON TABLE attendances IS '打卡紀錄表';

-- 3.9 leave_requests (休假申請)
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('SICK', 'ANNUAL', 'PERSONAL', 'COMPENSATORY')),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    days FLOAT NOT NULL,
    reason VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approver_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    reject_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

COMMENT ON TABLE leave_requests IS '休假申請表';

-- ============================================
-- D. 財務模組 (Finance)
-- ============================================

-- 3.10 payments (收付款紀錄)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'LINE_PAY', 'TRANSFER')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type VARCHAR(20) NOT NULL DEFAULT 'INCOME' CHECK (type IN ('INCOME', 'REFUND')),
    receipt_no VARCHAR(30),
    notes VARCHAR(255),
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);

COMMENT ON TABLE payments IS '收付款紀錄表';

-- ============================================
-- E. 教練課程模組 (Coach & Classes)
-- ============================================

-- 3.11 class_bookings (課程預約)
CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status VARCHAR(20) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'COMPLETED', 'MEMBER_CANCELLED', 'COACH_CANCELLED', 'NO_SHOW')),
    booked_by VARCHAR(20) NOT NULL CHECK (booked_by IN ('MEMBER', 'COACH', 'RECEPTION')),
    cancelled_at TIMESTAMPTZ,
    cancel_reason VARCHAR(255),
    is_charged BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_member ON class_bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_coach ON class_bookings(coach_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled ON class_bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON class_bookings(status);

COMMENT ON TABLE class_bookings IS '課程預約表';

-- 3.12 class_records (執課紀錄)
CREATE TABLE IF NOT EXISTS class_records (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    booking_id UUID NOT NULL REFERENCES class_bookings(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    class_date DATE NOT NULL,
    warmup_content TEXT,
    main_content JSONB NOT NULL DEFAULT '{}',
    cooldown_content TEXT,
    member_condition TEXT,
    member_feedback JSONB,
    coach_notes TEXT,
    next_plan TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_records_booking ON class_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_class_records_coach ON class_records(coach_id);
CREATE INDEX IF NOT EXISTS idx_class_records_member ON class_records(member_id);

COMMENT ON TABLE class_records IS '執課紀錄表';

-- 3.13 coach_schedules (教練排班/可用時段)
CREATE TABLE IF NOT EXISTS coach_schedules (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE,
    effective_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_schedules_coach ON coach_schedules(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_schedules_day ON coach_schedules(day_of_week);

COMMENT ON TABLE coach_schedules IS '教練排班/可用時段表';

-- 3.14 teaching_materials (教學資源)
CREATE TABLE IF NOT EXISTS teaching_materials (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('VIDEO', 'TEMPLATE', 'EXERCISE')),
    category VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    file_id UUID,
    video_url VARCHAR(500),
    muscle_groups JSONB,
    equipment JSONB,
    difficulty VARCHAR(20) CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    template_content JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_materials_type ON teaching_materials(type);
CREATE INDEX IF NOT EXISTS idx_teaching_materials_category ON teaching_materials(category);

COMMENT ON TABLE teaching_materials IS '教學資源表';

-- 3.15 member_coaches (主副教練關係)
CREATE TABLE IF NOT EXISTS member_coaches (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('PRIMARY', 'SECONDARY')),
    assigned_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(member_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_member_coaches_member ON member_coaches(member_id);
CREATE INDEX IF NOT EXISTS idx_member_coaches_coach ON member_coaches(coach_id);

COMMENT ON TABLE member_coaches IS '主副教練關係表';

-- ============================================
-- F. HR 進階模組 (HR Advanced)
-- ============================================

-- 3.16 work_schedules (排班表)
CREATE TABLE IF NOT EXISTS work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('MORNING', 'AFTERNOON', 'FULL_DAY', 'CUSTOM')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    work_tasks JSONB,
    google_event_id VARCHAR(100),
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_employee ON work_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_date ON work_schedules(date);

COMMENT ON TABLE work_schedules IS '排班表';

-- 3.17 performance_reviews (績效考核)
CREATE TABLE IF NOT EXISTS performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    review_period VARCHAR(20) NOT NULL,
    review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    kpi_data JSONB NOT NULL DEFAULT '{}',
    score DECIMAL(3, 1),
    reviewer_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    reviewer_comments TEXT,
    employee_comments TEXT,
    improvement_plan TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED')),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_period ON performance_reviews(review_period);

COMMENT ON TABLE performance_reviews IS '績效考核表';

-- 3.18 salary_records (薪資紀錄)
CREATE TABLE IF NOT EXISTS salary_records (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    base_salary DECIMAL(10, 2) NOT NULL,
    commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
    bonus DECIMAL(10, 2) NOT NULL DEFAULT 0,
    overtime_pay DECIMAL(10, 2) NOT NULL DEFAULT 0,
    deductions DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_salary DECIMAL(10, 2) NOT NULL,
    work_days INTEGER NOT NULL,
    overtime_hours FLOAT NOT NULL DEFAULT 0,
    leave_days JSONB,
    calculation_detail JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID')),
    approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, period)
);

CREATE INDEX IF NOT EXISTS idx_salary_records_employee ON salary_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_records_period ON salary_records(period);

COMMENT ON TABLE salary_records IS '薪資紀錄表';

-- 3.19 promotion_records (升遷紀錄)
CREATE TABLE IF NOT EXISTS promotion_records (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PROMOTION', 'TRANSFER', 'DEMOTION')),
    from_job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
    to_job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
    from_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    effective_date DATE NOT NULL,
    reason TEXT,
    approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotion_records_employee ON promotion_records(employee_id);

COMMENT ON TABLE promotion_records IS '升遷紀錄表';

-- ============================================
-- G. 行銷模組 (Marketing)
-- ============================================

-- 3.20 leads (潛在客戶)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    source VARCHAR(20) NOT NULL CHECK (source IN ('FB_AD', 'IG_AD', 'GOOGLE_AD', 'WEBSITE', 'WALK_IN', 'REFERRAL')),
    utm_source VARCHAR(50),
    utm_medium VARCHAR(50),
    utm_campaign VARCHAR(100),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED', 'LOST')),
    interest JSONB,
    notes TEXT,
    converted_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_branch ON leads(branch_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);

COMMENT ON TABLE leads IS '潛在客戶表';

-- 3.21 lead_activities (跟進紀錄)
CREATE TABLE IF NOT EXISTS lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('CALL', 'SMS', 'EMAIL', 'VISIT', 'TRIAL')),
    content TEXT NOT NULL,
    result VARCHAR(255),
    next_action VARCHAR(255),
    next_action_date DATE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);

COMMENT ON TABLE lead_activities IS '跟進紀錄表';

-- 3.22 campaigns (行銷活動)
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PROMOTION', 'EVENT', 'CHECKIN', 'REFERRAL')),
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    target_audience JSONB,
    budget DECIMAL(10, 2),
    actual_cost DECIMAL(10, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED')),
    metrics JSONB,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

COMMENT ON TABLE campaigns IS '行銷活動表';

-- 3.23 coupons (優惠券)
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    discount_value DECIMAL(10, 2) NOT NULL,
    min_purchase DECIMAL(10, 2) DEFAULT 0,
    max_discount DECIMAL(10, 2),
    usage_limit INTEGER,
    usage_per_member INTEGER DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    applicable_plans JSONB,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXPIRED')),
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

COMMENT ON TABLE coupons IS '優惠券表';

-- 3.24 coupon_usages (優惠券核銷)
CREATE TABLE IF NOT EXISTS coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
    discount_amount DECIMAL(10, 2) NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_by UUID REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_member ON coupon_usages(member_id);

COMMENT ON TABLE coupon_usages IS '優惠券核銷表';

-- 3.25 marketing_assets (行銷素材庫)
CREATE TABLE IF NOT EXISTS marketing_assets (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('IMAGE', 'VIDEO', 'COPY', 'TEMPLATE')),
    category VARCHAR(50) NOT NULL,
    file_id UUID,
    content TEXT,
    tags JSONB,
    usage_stats JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_type ON marketing_assets(type);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_category ON marketing_assets(category);

COMMENT ON TABLE marketing_assets IS '行銷素材庫表';

-- 3.26 member_goals (會員健身目標)
CREATE TABLE IF NOT EXISTS member_goals (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    goal_type VARCHAR(20) NOT NULL CHECK (goal_type IN ('WEIGHT_LOSS', 'MUSCLE_GAIN', 'BODY_SHAPE', 'HEALTH', 'OTHER')),
    target_value JSONB NOT NULL,
    current_value JSONB,
    start_date DATE NOT NULL,
    target_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'ACHIEVED', 'ABANDONED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_goals_member ON member_goals(member_id);
CREATE INDEX IF NOT EXISTS idx_member_goals_status ON member_goals(status);

COMMENT ON TABLE member_goals IS '會員健身目標表';

-- 3.27 issue_reports (問題回報)
CREATE TABLE IF NOT EXISTS issue_reports (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT')),
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_reports_member ON issue_reports(member_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_branch ON issue_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports(status);

COMMENT ON TABLE issue_reports IS '問題回報表';

-- ============================================
-- H. 運動歷程 (Wger Integration)
-- ============================================

-- 3.28 body_measurements (身體數據)
CREATE TABLE IF NOT EXISTS body_measurements (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    weight FLOAT,
    body_fat FLOAT,
    muscle_mass FLOAT,
    bmi FLOAT,
    source VARCHAR(20) NOT NULL CHECK (source IN ('MANUAL', 'INBODY', 'APPLE_HEALTH')),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_member ON body_measurements(member_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements(date);

COMMENT ON TABLE body_measurements IS '身體數據表';

-- 3.29 workout_logs (運動日誌)
CREATE TABLE IF NOT EXISTS workout_logs (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    duration INTEGER,
    calories INTEGER,
    exercises JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_member ON workout_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);

COMMENT ON TABLE workout_logs IS '運動日誌表';

-- ============================================
-- I. RFM 分群與績效模組 (RFM Segmentation & Performance)
-- ============================================

-- 3.30 rfm_scores (RFM 分數)
CREATE TABLE IF NOT EXISTS rfm_scores (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    recency_score INTEGER NOT NULL CHECK (recency_score BETWEEN 1 AND 5),
    frequency_score INTEGER NOT NULL CHECK (frequency_score BETWEEN 1 AND 5),
    monetary_score INTEGER NOT NULL CHECK (monetary_score BETWEEN 1 AND 5),
    rfm_segment VARCHAR(30) NOT NULL CHECK (rfm_segment IN ('CHAMPIONS', 'LOYAL', 'POTENTIAL_LOYAL', 'NEW_CUSTOMERS', 'PROMISING', 'NEED_ATTENTION', 'ABOUT_TO_SLEEP', 'AT_RISK', 'HIBERNATING', 'LOST')),
    last_payment_date DATE,
    last_checkin_date DATE,
    total_payments_12m DECIMAL(12, 2) DEFAULT 0,
    total_checkins_12m INTEGER DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(member_id)
);

CREATE INDEX IF NOT EXISTS idx_rfm_scores_member ON rfm_scores(member_id);
CREATE INDEX IF NOT EXISTS idx_rfm_scores_branch ON rfm_scores(branch_id);
CREATE INDEX IF NOT EXISTS idx_rfm_scores_segment ON rfm_scores(rfm_segment);

COMMENT ON TABLE rfm_scores IS 'RFM 會員分群分數表';

-- 3.31 kpi_templates (KPI 範本)
CREATE TABLE IF NOT EXISTS kpi_templates (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    name VARCHAR(100) NOT NULL,
    job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
    review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    kpi_config JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_templates_job_title ON kpi_templates(job_title_id);

COMMENT ON TABLE kpi_templates IS 'KPI 考核範本表';
COMMENT ON COLUMN kpi_templates.kpi_config IS 'KPI 配置 JSON: [{"id": "new_contracts", "name": "新簽合約數", "weight": 30, "target": 10, "unit": "件"}]';

-- ============================================
-- 觸發器函數 (Triggers)
-- ============================================

-- 自動計算工時
CREATE OR REPLACE FUNCTION calculate_work_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_out IS NOT NULL THEN
        NEW.work_hours = EXTRACT(EPOCH FROM (NEW.check_out - NEW.check_in)) / 3600;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_work_hours ON attendances;
CREATE TRIGGER trg_calculate_work_hours
    BEFORE INSERT OR UPDATE ON attendances
    FOR EACH ROW
    EXECUTE FUNCTION calculate_work_hours();

-- 更新合約已收金額
CREATE OR REPLACE FUNCTION update_contract_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE contracts
    SET paid_amount = (
        SELECT COALESCE(SUM(
            CASE WHEN type = 'INCOME' THEN amount
                 WHEN type = 'REFUND' THEN -amount
            END
        ), 0)
        FROM payments
        WHERE contract_id = NEW.contract_id
    ),
    payment_status = CASE
        WHEN (SELECT COALESCE(SUM(
            CASE WHEN type = 'INCOME' THEN amount
                 WHEN type = 'REFUND' THEN -amount
            END
        ), 0) FROM payments WHERE contract_id = NEW.contract_id) >= total_amount THEN 'PAID'
        WHEN (SELECT COALESCE(SUM(
            CASE WHEN type = 'INCOME' THEN amount
                 WHEN type = 'REFUND' THEN -amount
            END
        ), 0) FROM payments WHERE contract_id = NEW.contract_id) > 0 THEN 'PARTIAL'
        ELSE 'UNPAID'
    END
    WHERE id = NEW.contract_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_contract_paid ON payments;
CREATE TRIGGER trg_update_contract_paid
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_paid_amount();

-- 更新 updated_at 時間戳
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 為所有需要的表添加 updated_at 觸發器
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'branches', 'employees', 'members', 'membership_plans', 'contracts',
        'leave_requests', 'class_bookings', 'class_records', 'leads',
        'member_goals', 'issue_reports'
    ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_updated_at ON %I;
            CREATE TRIGGER trg_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- ============================================
-- 初始資料 (Seed Data)
-- ============================================

-- 插入預設職位 (使用 UUID v7 格式，時間戳: 2026-01-01 00:00:00 UTC)
INSERT INTO job_titles (id, name, code, description, permissions_config, sort) VALUES
    ('0193ae7a-4000-7000-8000-000000000001', '總部管理員', 'HQ_ADMIN', '最高權限管理者', '{"can_view_all_branches": true, "can_edit_contracts": true, "can_delete_contracts": true, "can_view_all_revenue": true, "can_assign_leads": true, "can_approve_leave": true, "can_export_data": true, "can_manage_employees": true}', 1),
    ('0193ae7a-4000-7000-8000-000000000002', '分店店長', 'STORE_MANAGER', '分店級管理權限', '{"can_view_all_branches": false, "can_edit_contracts": true, "can_delete_contracts": false, "can_view_all_revenue": false, "can_assign_leads": true, "can_approve_leave": true, "can_export_data": true, "can_manage_employees": false}', 2),
    ('0193ae7a-4000-7000-8000-000000000003', '教練', 'COACH', '教練個人級權限', '{"can_view_all_branches": false, "can_edit_contracts": true, "can_delete_contracts": false, "can_view_all_revenue": false, "can_assign_leads": false, "can_approve_leave": false, "can_export_data": false, "can_manage_employees": false}', 3),
    ('0193ae7a-4000-7000-8000-000000000004', '行政/櫃檯', 'RECEPTION', '分店級受限權限', '{"can_view_all_branches": false, "can_edit_contracts": false, "can_delete_contracts": false, "can_view_all_revenue": false, "can_assign_leads": false, "can_approve_leave": false, "can_export_data": false, "can_manage_employees": false}', 4)
ON CONFLICT (code) DO NOTHING;

-- 插入預設總部 (使用 UUID v7 格式)
INSERT INTO branches (id, name, type, code, address, phone, settings) VALUES
    ('0193ae7a-4000-7000-8000-000000000011', 'Gym Nexus 總部', 'HEADQUARTER', 'HQ', '台北市信義區信義路五段7號', '02-1234-5678', '{"business_hours": {"weekday": {"open": "09:00", "close": "18:00"}}, "allow_cross_branch_access": true}')
ON CONFLICT (code) DO NOTHING;

-- 插入預設會籍方案 (使用 UUID v7 格式)
INSERT INTO membership_plans (id, name, code, type, description, duration_months, class_counts, price, allow_pause, max_pause_days, allow_transfer, is_active, sort) VALUES
    ('0193ae7a-4000-7000-8000-000000000021', '月費會員', 'MONTHLY', 'TIME_BASED', '每月自動續約會籍', 1, 0, 1500.00, true, 7, false, true, 1),
    ('0193ae7a-4000-7000-8000-000000000022', '季費會員', 'QUARTERLY', 'TIME_BASED', '三個月會籍', 3, 0, 4000.00, true, 14, false, true, 2),
    ('0193ae7a-4000-7000-8000-000000000023', '年費會員', 'YEARLY', 'TIME_BASED', '年度會籍（最優惠）', 12, 0, 12000.00, true, 30, true, true, 3),
    ('0193ae7a-4000-7000-8000-000000000024', '私教 10 堂', 'PT10', 'COUNT_BASED', '私人教練課程 10 堂', 0, 10, 12000.00, false, 0, true, true, 4),
    ('0193ae7a-4000-7000-8000-000000000025', '私教 20 堂', 'PT20', 'COUNT_BASED', '私人教練課程 20 堂', 0, 20, 22000.00, false, 0, true, true, 5),
    ('0193ae7a-4000-7000-8000-000000000026', '私教 30 堂', 'PT30', 'COUNT_BASED', '私人教練課程 30 堂', 0, 30, 30000.00, false, 0, true, true, 6)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 完成訊息
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Gym Nexus Schema 初始化完成！';
    RAISE NOTICE '📊 已創建 29 個業務表格';
    RAISE NOTICE '🔑 已創建 4 個預設職位';
    RAISE NOTICE '🏢 已創建 1 個預設總部';
    RAISE NOTICE '📦 已創建 6 個預設會籍方案';
END;
$$;
