-- ============================================
-- 補打卡申請表 Migration
-- 版本: 005
-- 日期: 2025-12-26
-- 說明: 補打卡申請與審核流程
-- ============================================

BEGIN;

-- ============================================
-- 1. 補打卡申請表 (makeup_requests)
-- ============================================
CREATE TABLE IF NOT EXISTS makeup_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 申請人
    employee_id UUID REFERENCES employees(id) NOT NULL,
    branch_id UUID REFERENCES branches(id) NOT NULL,

    -- 補打卡資訊
    target_date DATE NOT NULL,
    makeup_type VARCHAR(20) NOT NULL CHECK (makeup_type IN ('CHECK_IN', 'CHECK_OUT', 'BOTH')),
    requested_check_in TIME,
    requested_check_out TIME,

    -- 原因說明
    reason TEXT NOT NULL,
    document_url TEXT,

    -- 審核資訊
    request_status VARCHAR(20) DEFAULT 'PENDING' CHECK (request_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approver_id UUID REFERENCES employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    approval_notes TEXT,

    -- 提交時間
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_makeup_requests_employee ON makeup_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_makeup_requests_status ON makeup_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_makeup_requests_date ON makeup_requests(target_date);
CREATE INDEX IF NOT EXISTS idx_makeup_requests_branch ON makeup_requests(branch_id);

COMMENT ON TABLE makeup_requests IS '員工補打卡申請表';
COMMENT ON COLUMN makeup_requests.makeup_type IS '補打卡類型: CHECK_IN(補上班), CHECK_OUT(補下班), BOTH(補兩者)';
COMMENT ON COLUMN makeup_requests.target_date IS '需要補打卡的日期';

-- ============================================
-- 2. 補打卡審核歷程表 (makeup_approval_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS makeup_approval_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    makeup_request_id UUID REFERENCES makeup_requests(id) NOT NULL,
    action_by UUID REFERENCES employees(id) NOT NULL,

    action VARCHAR(20) NOT NULL CHECK (action IN ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL')),
    previous_status VARCHAR(20),
    new_status VARCHAR(20),

    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_makeup_approval_logs_request ON makeup_approval_logs(makeup_request_id);
CREATE INDEX IF NOT EXISTS idx_makeup_approval_logs_action_by ON makeup_approval_logs(action_by);

COMMENT ON TABLE makeup_approval_logs IS '補打卡審核歷史紀錄';

COMMIT;
