-- Gym Nexus Database Schema
-- Creates all business tables

BEGIN;

-- ============================================
-- 1. branches (分店)
-- ============================================
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('HEADQUARTER', 'BRANCH')),
    address TEXT,
    phone VARCHAR(50),
    tax_id VARCHAR(20),
    settings JSONB DEFAULT '{}'
);

-- ============================================
-- 2. job_titles (職稱)
-- ============================================
CREATE TABLE job_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    name VARCHAR(100) NOT NULL,
    permissions_config JSONB DEFAULT '{}'
);

-- ============================================
-- 3. employees (員工)
-- ============================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    employee_code VARCHAR(20) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    branch_id UUID REFERENCES branches(id),
    job_title_id UUID REFERENCES job_titles(id),
    user_id UUID,
    employment_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'RESIGNED', 'SUSPENDED')),
    employment_type VARCHAR(20) CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT')),
    hire_date DATE,
    basic_salary DECIMAL(12, 2),
    custom_permissions JSONB
);

-- ============================================
-- 4. membership_plans (會籍方案)
-- ============================================
CREATE TABLE membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    name VARCHAR(100) NOT NULL,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('TIME_BASED', 'COUNT_BASED')),
    duration_months INTEGER,
    class_counts INTEGER,
    price DECIMAL(12, 2) NOT NULL,
    allow_transfer BOOLEAN DEFAULT false,
    allow_pause BOOLEAN DEFAULT false,
    description TEXT
);

-- ============================================
-- 5. members (會員)
-- ============================================
CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    member_code VARCHAR(20) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    branch_id UUID REFERENCES branches(id),
    member_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (member_status IN ('ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED')),
    join_date DATE,
    sales_person_id UUID REFERENCES employees(id),
    gender VARCHAR(10) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    birthday DATE,
    address TEXT,
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(50),
    tags JSONB,
    notes TEXT
);

-- ============================================
-- 6. contracts (合約)
-- ============================================
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    contract_no VARCHAR(30) UNIQUE,
    member_id UUID REFERENCES members(id) NOT NULL,
    plan_id UUID REFERENCES membership_plans(id),
    sign_date DATE,
    start_date DATE NOT NULL,
    end_date DATE,
    original_end_date DATE,
    contract_status VARCHAR(20) DEFAULT 'DRAFT' CHECK (contract_status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED', 'TRANSFERRED')),
    remaining_counts INTEGER,
    total_amount DECIMAL(12, 2),
    payment_status VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED')),
    sales_person_id UUID REFERENCES employees(id),
    branch_id UUID REFERENCES branches(id),
    notes TEXT
);

-- ============================================
-- 7. contract_logs (合約異動紀錄)
-- ============================================
CREATE TABLE contract_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    contract_id UUID REFERENCES contracts(id) NOT NULL,
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('PAUSE', 'RESUME', 'EXTEND', 'TRANSFER', 'CANCEL', 'CLASS_USED', 'RENEWAL')),
    start_date DATE,
    end_date DATE,
    days_affected INTEGER,
    reason TEXT,
    created_by_employee UUID REFERENCES employees(id)
);

-- ============================================
-- 8. payments (付款紀錄)
-- ============================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    contract_id UUID REFERENCES contracts(id),
    member_id UUID REFERENCES members(id),
    amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'LINE_PAY', 'OTHER')),
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_type VARCHAR(20) DEFAULT 'INCOME' CHECK (payment_type IN ('INCOME', 'REFUND')),
    branch_id UUID REFERENCES branches(id),
    received_by UUID REFERENCES employees(id),
    notes TEXT
);

-- ============================================
-- 9. attendances (員工打卡紀錄)
-- ============================================
CREATE TABLE attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    employee_id UUID REFERENCES employees(id) NOT NULL,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    work_hours DECIMAL(5, 2),
    branch_id UUID REFERENCES branches(id),
    location_ip VARCHAR(50)
);

-- ============================================
-- 10. leave_requests (請假紀錄)
-- ============================================
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,
    employee_id UUID REFERENCES employees(id) NOT NULL,
    leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'BEREAVEMENT', 'OTHER')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    leave_status VARCHAR(20) DEFAULT 'PENDING' CHECK (leave_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approver_id UUID REFERENCES employees(id),
    reason TEXT
);

-- ============================================
-- Create indexes for better performance
-- ============================================
CREATE INDEX idx_employees_branch ON employees(branch_id);
CREATE INDEX idx_members_branch ON members(branch_id);
CREATE INDEX idx_members_status ON members(member_status);
CREATE INDEX idx_contracts_member ON contracts(member_id);
CREATE INDEX idx_contracts_branch ON contracts(branch_id);
CREATE INDEX idx_contracts_status ON contracts(contract_status);
CREATE INDEX idx_contract_logs_contract ON contract_logs(contract_id);
CREATE INDEX idx_payments_contract ON payments(contract_id);
CREATE INDEX idx_payments_branch ON payments(branch_id);
CREATE INDEX idx_attendances_employee ON attendances(employee_id);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);

COMMIT;
