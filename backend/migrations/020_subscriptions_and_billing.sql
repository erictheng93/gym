-- ============================================
-- 订阅管理和账单系统 Migration
-- 版本: 020
-- 日期: 2026-01-08
-- 说明: 实现 Phase 4.1 计费和订阅管理功能
-- ============================================

BEGIN;

-- ============================================
-- 1. 订阅记录表 (subscriptions)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 关联租户
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,

    -- 订阅信息
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- 计费周期
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,

    -- 取消设置
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- 价格信息
    monthly_price DECIMAL(10, 2),
    yearly_price DECIMAL(10, 2),

    -- 额外信息
    metadata JSONB DEFAULT '{}',

    -- 约束
    CONSTRAINT valid_subscription_status CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    CONSTRAINT valid_billing_cycle CHECK (billing_cycle IN ('monthly', 'yearly')),
    CONSTRAINT valid_plan_type CHECK (plan_type IN ('starter', 'professional', 'enterprise', 'custom'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(current_period_start, current_period_end);

-- 触发器
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE subscriptions IS '租户订阅记录表';
COMMENT ON COLUMN subscriptions.status IS '订阅状态：active=活跃, cancelled=已取消, past_due=逾期, trialing=试用中';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS '是否在当前周期结束时取消';

-- ============================================
-- 2. 账单表 (invoices)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 关联信息
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

    -- 账单编号
    invoice_number VARCHAR(50) UNIQUE NOT NULL,

    -- 金额信息
    amount_subtotal DECIMAL(10, 2) NOT NULL,
    amount_tax DECIMAL(10, 2) DEFAULT 0,
    amount_total DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TWD',

    -- 状态和日期
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    due_date DATE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,

    -- 计费周期
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- 支付信息
    payment_method VARCHAR(50),
    payment_transaction_id VARCHAR(100),

    -- 详细信息
    line_items JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    -- 约束
    CONSTRAINT valid_invoice_status CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start, period_end);

-- 触发器
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoices IS '租户账单表';
COMMENT ON COLUMN invoices.status IS '账单状态：draft=草稿, open=待付款, paid=已付款, void=作废, uncollectible=无法收款';
COMMENT ON COLUMN invoices.line_items IS '账单明细（JSON 数组）';

-- ============================================
-- 3. 每日使用量记录表 (usage_records)
-- ============================================
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 关联租户
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,

    -- 统计日期
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- 资源使用量
    members_count INTEGER DEFAULT 0,
    employees_count INTEGER DEFAULT 0,
    branches_count INTEGER DEFAULT 0,
    storage_mb INTEGER DEFAULT 0,

    -- API 使用量
    api_calls_count INTEGER DEFAULT 0,
    api_bandwidth_mb INTEGER DEFAULT 0,

    -- 其他指标
    active_contracts_count INTEGER DEFAULT 0,
    daily_revenue DECIMAL(12, 2) DEFAULT 0,

    -- 额外信息
    metadata JSONB DEFAULT '{}',

    -- 唯一约束
    UNIQUE(tenant_id, record_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_date ON usage_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_date ON usage_records(tenant_id, record_date DESC);

COMMENT ON TABLE usage_records IS '租户每日使用量记录表（用于计费和趋势分析）';
COMMENT ON COLUMN usage_records.record_date IS '统计日期';
COMMENT ON COLUMN usage_records.api_calls_count IS 'API 调用次数';

-- ============================================
-- 4. 生成账单编号函数
-- ============================================
CREATE OR REPLACE FUNCTION generate_invoice_number(p_tenant_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_count INTEGER;
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_invoice_no VARCHAR(50);
BEGIN
    -- 获取年月
    v_year := TO_CHAR(NOW(), 'YYYY');
    v_month := TO_CHAR(NOW(), 'MM');

    -- 计算当月该租户的账单数
    SELECT COUNT(*) + 1 INTO v_count
    FROM invoices
    WHERE tenant_id = p_tenant_id
      AND EXTRACT(YEAR FROM date_created) = EXTRACT(YEAR FROM NOW())
      AND EXTRACT(MONTH FROM date_created) = EXTRACT(MONTH FROM NOW());

    -- 生成账单编号格式：INV-YYYYMM-{tenant_id前8位}-{序号}
    v_invoice_no := 'INV-' || v_year || v_month || '-' ||
                    SUBSTRING(p_tenant_id::TEXT, 1, 8) || '-' ||
                    LPAD(v_count::TEXT, 4, '0');

    RETURN v_invoice_no;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_invoice_number IS '生成账单编号';

-- ============================================
-- 5. 创建视图：订阅概览
-- ============================================
CREATE OR REPLACE VIEW v_subscription_overview AS
SELECT
    s.id,
    s.tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    s.plan_type,
    s.status,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end,
    s.monthly_price,
    s.yearly_price,

    -- 最近账单
    i.id AS latest_invoice_id,
    i.invoice_number AS latest_invoice_number,
    i.status AS latest_invoice_status,
    i.amount_total AS latest_invoice_amount,
    i.due_date AS latest_invoice_due_date,

    -- 计算距离周期结束天数
    (s.current_period_end - CURRENT_DATE) AS days_until_renewal,

    s.date_created,
    s.date_updated

FROM subscriptions s
LEFT JOIN tenants t ON t.id = s.tenant_id
LEFT JOIN LATERAL (
    SELECT id, invoice_number, status, amount_total, due_date
    FROM invoices
    WHERE subscription_id = s.id
    ORDER BY date_created DESC
    LIMIT 1
) i ON TRUE;

COMMENT ON VIEW v_subscription_overview IS '订阅概览视图（包含最新账单信息）';

COMMIT;
