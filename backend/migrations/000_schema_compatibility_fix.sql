-- ============================================
-- Schema Compatibility Fix Migration
-- 修復 schema 差異並創建缺失的表
-- 此腳本可安全重複執行 (idempotent)
-- ============================================

BEGIN;

-- ============================================
-- 1. 創建/修復 update_updated_at_column 函數
-- 支持 date_updated 和 updated_at 兩種欄位名
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- 優先使用 updated_at，若不存在則使用 date_updated
    IF TG_OP = 'UPDATE' THEN
        BEGIN
            NEW.updated_at = NOW();
        EXCEPTION WHEN undefined_column THEN
            BEGIN
                NEW.date_updated = NOW();
            EXCEPTION WHEN undefined_column THEN
                -- 兩個欄位都不存在，忽略
                NULL;
            END;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. 創建 tenants 表 (多租戶支持)
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 租戶基本信息
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    domain VARCHAR(100),

    -- 訂閱配置
    plan_type VARCHAR(50) DEFAULT 'starter',
    is_trial BOOLEAN DEFAULT FALSE,
    trial_ends_at TIMESTAMPTZ,

    -- 資源配額
    max_branches INTEGER DEFAULT 1,
    max_employees INTEGER DEFAULT 10,
    max_members INTEGER DEFAULT 500,
    max_storage_mb INTEGER DEFAULT 1024,

    -- 設定
    settings JSONB DEFAULT '{}',
    features JSONB DEFAULT '[]',

    -- 聯繫信息
    contact_email VARCHAR(100),
    contact_phone VARCHAR(20),

    CONSTRAINT chk_tenant_status CHECK (status IN ('active', 'suspended', 'cancelled')),
    CONSTRAINT chk_tenant_plan CHECK (plan_type IN ('starter', 'professional', 'enterprise', 'custom'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- 觸發器
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 插入預設租戶
INSERT INTO tenants (id, name, slug, plan_type, max_branches, max_employees, max_members)
VALUES ('11111111-1111-1111-1111-111111111111', 'Gym Nexus 總部', 'gym-nexus-hq', 'enterprise', 100, 1000, 50000)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. 為 branches 添加 tenant_id 欄位
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'branches' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE branches ADD COLUMN tenant_id UUID REFERENCES tenants(id);

        -- 將現有分店關聯到預設租戶
        UPDATE branches SET tenant_id = '11111111-1111-1111-1111-111111111111' WHERE tenant_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- ============================================
-- 4. 創建 classes 表 (課程定義)
-- ============================================
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    name VARCHAR(100) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    max_capacity INTEGER NOT NULL DEFAULT 20,
    instructor_id UUID REFERENCES employees(id),
    branch_id UUID NOT NULL REFERENCES branches(id),
    category_id UUID,
    category VARCHAR(50),
    difficulty_level VARCHAR(20) DEFAULT 'BEGINNER',
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    requires_count BOOLEAN DEFAULT TRUE,
    count_deduction INTEGER DEFAULT 1,

    CONSTRAINT chk_class_difficulty CHECK (difficulty_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    CONSTRAINT chk_class_category CHECK (category IN ('YOGA', 'CARDIO', 'STRENGTH', 'DANCE', 'SPINNING', 'PILATES', 'BOXING', 'SWIMMING', 'OTHER') OR category IS NULL)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_category ON classes(category);
CREATE INDEX IF NOT EXISTS idx_classes_instructor ON classes(instructor_id);

-- 觸發器
DROP TRIGGER IF EXISTS trg_classes_updated_at ON classes;
CREATE TRIGGER trg_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 更新 class_categories 的外鍵
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_categories') THEN
        ALTER TABLE classes
        DROP CONSTRAINT IF EXISTS fk_classes_category;

        ALTER TABLE classes
        ADD CONSTRAINT fk_classes_category
        FOREIGN KEY (category_id) REFERENCES class_categories(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- 忽略錯誤
    NULL;
END $$;

-- ============================================
-- 5. 創建 class_schedules 表 (課程排程)
-- ============================================
CREATE TABLE IF NOT EXISTS class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    instructor_id UUID REFERENCES employees(id),

    day_of_week INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),

    max_capacity INTEGER,
    is_recurring BOOLEAN DEFAULT TRUE,
    valid_from DATE,
    valid_until DATE,

    CONSTRAINT chk_day_of_week CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_schedule_time CHECK (end_time > start_time),
    CONSTRAINT uq_class_schedule UNIQUE (class_id, branch_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_schedules_branch ON class_schedules(branch_id);
CREATE INDEX IF NOT EXISTS idx_schedules_class ON class_schedules(class_id);

-- ============================================
-- 6. 創建 class_sessions 表 (實際課程場次)
-- ============================================
CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    schedule_id UUID REFERENCES class_schedules(id),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    instructor_id UUID REFERENCES employees(id),

    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),

    max_capacity INTEGER NOT NULL,
    current_count INTEGER DEFAULT 0,
    waitlist_count INTEGER DEFAULT 0,

    session_status VARCHAR(20) DEFAULT 'SCHEDULED',
    cancelled_reason TEXT,
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT chk_session_status CHECK (session_status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT chk_session_time CHECK (end_time > start_time),
    CONSTRAINT uq_class_session UNIQUE (class_id, branch_id, session_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(branch_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON class_sessions(class_id);

-- ============================================
-- 7. 創建 bookings 表 (會員預約)
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id),
    contract_id UUID REFERENCES contracts(id),

    booking_status VARCHAR(20) DEFAULT 'CONFIRMED',
    waitlist_position INTEGER,

    booked_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    attended_at TIMESTAMPTZ,
    count_deducted BOOLEAN DEFAULT FALSE,

    CONSTRAINT chk_booking_status CHECK (booking_status IN ('CONFIRMED', 'WAITLIST', 'CANCELLED', 'ATTENDED', 'NO_SHOW')),
    CONSTRAINT uq_member_session UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);

-- ============================================
-- 8. 創建 check_ins 表 (會員入場記錄)
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    check_in_time TIMESTAMPTZ DEFAULT NOW(),

    check_in_method VARCHAR(20) NOT NULL,
    location_ip VARCHAR(50),
    location_device VARCHAR(100),
    notes TEXT,

    CONSTRAINT chk_check_in_method CHECK (check_in_method IN ('QR_CODE', 'MANUAL', 'CARD', 'BIOMETRIC'))
);

CREATE INDEX IF NOT EXISTS idx_check_ins_member ON check_ins(member_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_branch ON check_ins(branch_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_time ON check_ins(check_in_time DESC);

-- ============================================
-- 9. 創建 subscriptions 表 (租戶訂閱)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,

    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,

    monthly_price DECIMAL(10, 2),
    yearly_price DECIMAL(10, 2),

    metadata JSONB DEFAULT '{}',

    CONSTRAINT chk_subscription_status CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    CONSTRAINT chk_billing_cycle CHECK (billing_cycle IN ('monthly', 'yearly')),
    CONSTRAINT chk_plan_type CHECK (plan_type IN ('starter', 'professional', 'enterprise', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================
-- 10. 創建 invoices 表 (帳單)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

    invoice_number VARCHAR(50) UNIQUE NOT NULL,

    amount_subtotal DECIMAL(10, 2) NOT NULL,
    amount_tax DECIMAL(10, 2) DEFAULT 0,
    amount_total DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TWD',

    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    payment_method VARCHAR(50),
    payment_transaction_id VARCHAR(100),

    line_items JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT chk_invoice_status CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ============================================
-- 11. 創建 audit_logs 表 (審計日誌)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES directus_users(id) ON DELETE SET NULL,

    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,

    old_values JSONB,
    new_values JSONB,

    ip_address VARCHAR(45),
    user_agent TEXT,

    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- 12. 創建 class_reviews 表 (課程評價)
-- ============================================
CREATE TABLE IF NOT EXISTS class_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES employees(id),

    rating INTEGER NOT NULL,
    review_text TEXT,

    is_visible BOOLEAN DEFAULT TRUE,
    reviewed_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT uq_booking_review UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_class ON class_reviews(class_id);
CREATE INDEX IF NOT EXISTS idx_reviews_instructor ON class_reviews(instructor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_member ON class_reviews(member_id);

-- ============================================
-- 13. 創建 usage_records 表 (使用量記錄)
-- ============================================
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,

    members_count INTEGER DEFAULT 0,
    employees_count INTEGER DEFAULT 0,
    branches_count INTEGER DEFAULT 0,
    storage_mb INTEGER DEFAULT 0,
    api_calls_count INTEGER DEFAULT 0,
    api_bandwidth_mb INTEGER DEFAULT 0,
    active_contracts_count INTEGER DEFAULT 0,
    daily_revenue DECIMAL(12, 2) DEFAULT 0,

    metadata JSONB DEFAULT '{}',

    UNIQUE(tenant_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant ON usage_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(record_date DESC);

-- ============================================
-- 14. 創建 payment_transactions 表 (支付交易)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,

    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    payment_provider VARCHAR(50) NOT NULL,

    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TWD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    payment_method VARCHAR(50),
    card_last_four VARCHAR(4),

    processed_at TIMESTAMPTZ,
    failed_reason TEXT,

    raw_response JSONB,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT chk_tx_status CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_tx_invoice ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tx_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tx_status ON payment_transactions(status);

-- ============================================
-- 15. 創建 api_usage_logs 表 (API 使用日誌)
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES directus_users(id) ON DELETE SET NULL,

    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,

    ip_address VARCHAR(45),
    user_agent TEXT,

    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_logs_tenant ON api_usage_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_usage_logs(endpoint);

-- ============================================
-- 16. 創建 api_usage_stats 表 (API 使用統計)
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    hour_timestamp TIMESTAMPTZ NOT NULL,

    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    total_bytes_in BIGINT DEFAULT 0,
    total_bytes_out BIGINT DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,

    endpoints JSONB DEFAULT '{}',

    UNIQUE(tenant_id, hour_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_api_stats_tenant ON api_usage_stats(tenant_id, hour_timestamp DESC);

COMMIT;

-- 輸出成功訊息
SELECT 'Schema compatibility fix completed successfully!' AS result;
