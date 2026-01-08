-- ============================================
-- 多租户架构 Migration
-- 版本: 019
-- 日期: 2026-01-07
-- 說明:
--   1. 創建租戶主表 (tenants)
--   2. 更新 branches 表添加 tenant_id
--   3. 實現租戶隔離和多租戶架構
--   4. 支持套餐管理、配額限制、計費系統
-- 相依: schema.sql (branches, employees, directus_users 表)
-- ============================================

BEGIN;

-- ============================================
-- 1. 創建 update_updated_at_column 觸發器函數（如果不存在）
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. 租戶主表 (tenants)
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 基本資訊
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),

    -- 套餐和配額
    plan_type VARCHAR(50) DEFAULT 'starter',
    max_branches INTEGER DEFAULT 1,
    max_members INTEGER DEFAULT 100,
    max_employees INTEGER DEFAULT 10,
    max_storage_mb INTEGER DEFAULT 1024,

    -- 狀態和計費
    tenant_status VARCHAR(20) DEFAULT 'trial',
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    next_billing_date DATE,
    monthly_price DECIMAL(10, 2),

    -- 設定
    settings JSONB DEFAULT '{}',

    -- 創建人
    created_by UUID,

    -- 約束
    CONSTRAINT valid_plan_type CHECK (plan_type IN ('starter', 'professional', 'enterprise', 'custom')),
    CONSTRAINT valid_tenant_status CHECK (tenant_status IN ('trial', 'active', 'suspended', 'cancelled')),
    CONSTRAINT valid_billing_cycle CHECK (billing_cycle IN ('monthly', 'yearly'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_tenant_status ON tenants(tenant_status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(date_created);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_type ON tenants(plan_type);

-- 觸發器：自動更新 date_updated
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 註釋
COMMENT ON TABLE tenants IS '租戶主表：每個租戶代表一個獨立的客戶（可擁有多個分店）';
COMMENT ON COLUMN tenants.slug IS '租戶唯一標識符，用於子域名（如：acme.gym-nexus.com）';
COMMENT ON COLUMN tenants.plan_type IS '訂閱套餐類型：starter, professional, enterprise, custom';
COMMENT ON COLUMN tenants.max_branches IS '允許創建的最大分店數';
COMMENT ON COLUMN tenants.max_members IS '允許的最大會員數';
COMMENT ON COLUMN tenants.max_employees IS '允許的最大員工數';
COMMENT ON COLUMN tenants.tenant_status IS '租戶狀態：trial=試用, active=活躍, suspended=暫停, cancelled=已取消';

-- ============================================
-- 3. 創建預設租戶（遷移現有數據）
-- ============================================
INSERT INTO tenants (
    id,
    name,
    slug,
    email,
    plan_type,
    tenant_status,
    max_branches,
    max_members,
    max_employees,
    max_storage_mb
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '預設租戶',
    'default-tenant',
    'admin@gym-nexus.com',
    'enterprise',
    'active',
    999,
    999999,
    999,
    999999
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. 更新 branches 表添加 tenant_id
-- ============================================
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- 將現有分店關聯到預設租戶
UPDATE branches
SET tenant_id = '11111111-1111-1111-1111-111111111111'
WHERE tenant_id IS NULL;

-- 設置為 NOT NULL（確保所有數據已遷移）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM branches WHERE tenant_id IS NULL
    ) THEN
        RAISE EXCEPTION '仍有 branches 記錄的 tenant_id 為 NULL，請先手動處理';
    END IF;

    ALTER TABLE branches ALTER COLUMN tenant_id SET NOT NULL;
END $$;

-- 創建複合索引
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_branches_tenant_name ON branches(tenant_id, name);

COMMENT ON COLUMN branches.tenant_id IS '所屬租戶 ID（外鍵關聯 tenants 表）';

-- ============================================
-- 5. 租戶使用量統計表 (tenant_usage_stats)
-- ============================================
CREATE TABLE IF NOT EXISTS tenant_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- 使用量統計
    current_branches INTEGER DEFAULT 0,
    current_members INTEGER DEFAULT 0,
    current_employees INTEGER DEFAULT 0,
    current_storage_mb INTEGER DEFAULT 0,

    -- API 使用量
    api_calls_today INTEGER DEFAULT 0,
    api_calls_month INTEGER DEFAULT 0,

    -- 其他統計
    active_contracts INTEGER DEFAULT 0,
    monthly_revenue DECIMAL(12, 2) DEFAULT 0,

    UNIQUE(tenant_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_date ON tenant_usage_stats(stat_date);

-- 觸發器：自動更新 date_updated
DROP TRIGGER IF EXISTS update_tenant_usage_stats_updated_at ON tenant_usage_stats;
CREATE TRIGGER update_tenant_usage_stats_updated_at
    BEFORE UPDATE ON tenant_usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tenant_usage_stats IS '租戶使用量統計表（用於配額檢查和計費）';

-- ============================================
-- 6. 創建租戶配額檢查函數
-- ============================================
CREATE OR REPLACE FUNCTION check_tenant_quota(
    p_tenant_id UUID,
    p_resource_type VARCHAR,
    p_current_count INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_max_count INTEGER;
BEGIN
    -- 獲取租戶的資源配額
    SELECT
        CASE p_resource_type
            WHEN 'branches' THEN max_branches
            WHEN 'members' THEN max_members
            WHEN 'employees' THEN max_employees
            ELSE 0
        END
    INTO v_max_count
    FROM tenants
    WHERE id = p_tenant_id AND tenant_status = 'active';

    -- 檢查是否超過配額
    IF v_max_count IS NULL THEN
        RETURN FALSE; -- 租戶不存在或已停用
    END IF;

    RETURN p_current_count < v_max_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_tenant_quota IS '檢查租戶資源配額是否已達上限';

-- ============================================
-- 7. 創建視圖：租戶統計概覽
-- ============================================
CREATE OR REPLACE VIEW v_tenant_overview AS
SELECT
    t.id,
    t.name,
    t.slug,
    t.email,
    t.plan_type,
    t.tenant_status,
    t.trial_ends_at,
    t.date_created,

    -- 配額
    t.max_branches,
    t.max_members,
    t.max_employees,

    -- 當前使用量
    COUNT(DISTINCT b.id) AS current_branches,
    COUNT(DISTINCT m.id) AS current_members,
    COUNT(DISTINCT e.id) AS current_employees,

    -- 配額使用率
    ROUND(COUNT(DISTINCT b.id)::NUMERIC / NULLIF(t.max_branches, 0) * 100, 2) AS branches_usage_percent,
    ROUND(COUNT(DISTINCT m.id)::NUMERIC / NULLIF(t.max_members, 0) * 100, 2) AS members_usage_percent,
    ROUND(COUNT(DISTINCT e.id)::NUMERIC / NULLIF(t.max_employees, 0) * 100, 2) AS employees_usage_percent,

    -- 活躍合約數
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') AS active_contracts

FROM tenants t
LEFT JOIN branches b ON t.id = b.tenant_id AND b.status = 'active'
LEFT JOIN members m ON b.id = m.branch_id AND m.status = 'active'
LEFT JOIN employees e ON b.id = e.branch_id AND e.status = 'active'
LEFT JOIN contracts c ON m.id = c.member_id
GROUP BY
    t.id, t.name, t.slug, t.email, t.plan_type, t.tenant_status,
    t.trial_ends_at, t.date_created, t.max_branches, t.max_members, t.max_employees;

COMMENT ON VIEW v_tenant_overview IS '租戶統計概覽視圖（包含使用量和配額信息）';

COMMIT;
