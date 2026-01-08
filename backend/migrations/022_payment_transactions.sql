-- ============================================
-- 支付交易表 Migration
-- 版本: 022
-- 日期: 2026-01-08
-- 说明: 支持多种支付网关的支付交易记录
-- ============================================

BEGIN;

-- ============================================
-- 1. 支付交易表 (payment_transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 关联信息
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- 支付网关
    gateway VARCHAR(50) NOT NULL,
    payment_id VARCHAR(255) NOT NULL,

    -- 金额信息
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TWD',

    -- 状态
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE,

    -- 支付链接
    checkout_url TEXT,

    -- 回调数据
    callback_data JSONB,

    -- 元数据
    metadata JSONB DEFAULT '{}',

    -- 约束
    CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')),
    CONSTRAINT valid_gateway CHECK (gateway IN ('stripe', 'ecpay', 'linepay', 'manual', 'paypal', 'alipay', 'wechatpay'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway ON payment_transactions(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_date ON payment_transactions(date_created DESC);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_unique ON payment_transactions(gateway, payment_id);

-- 触发器
DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 自动设置 tenant_id
CREATE OR REPLACE FUNCTION set_payment_transaction_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        SELECT i.tenant_id INTO NEW.tenant_id
        FROM invoices i
        WHERE i.id = NEW.invoice_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_payment_transaction_tenant_id ON payment_transactions;
CREATE TRIGGER trigger_set_payment_transaction_tenant_id
    BEFORE INSERT ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_payment_transaction_tenant_id();

COMMENT ON TABLE payment_transactions IS '支付交易记录表（支持多种支付网关）';
COMMENT ON COLUMN payment_transactions.gateway IS '支付网关：stripe, ecpay, linepay, manual 等';
COMMENT ON COLUMN payment_transactions.payment_id IS '支付网关返回的支付订单 ID';
COMMENT ON COLUMN payment_transactions.status IS '支付状态：pending, processing, succeeded, failed, cancelled, refunded';

-- ============================================
-- 2. 退款记录表 (refund_transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS refund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 关联信息
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,

    -- 退款信息
    refund_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TWD',

    -- 状态
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    refunded_at TIMESTAMP WITH TIME ZONE,

    -- 原因
    reason TEXT,

    -- 元数据
    metadata JSONB DEFAULT '{}',

    -- 约束
    CONSTRAINT valid_refund_status CHECK (status IN ('pending', 'processing', 'succeeded', 'failed'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_refund_transactions_payment ON refund_transactions(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_invoice ON refund_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_status ON refund_transactions(status);

-- 触发器
DROP TRIGGER IF EXISTS update_refund_transactions_updated_at ON refund_transactions;
CREATE TRIGGER update_refund_transactions_updated_at
    BEFORE UPDATE ON refund_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE refund_transactions IS '退款交易记录表';

-- ============================================
-- 3. 支付配置表（可选）
-- ============================================
CREATE TABLE IF NOT EXISTS payment_gateway_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 租户（可选，为空表示全局配置）
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- 网关
    gateway VARCHAR(50) NOT NULL,

    -- 是否启用
    is_enabled BOOLEAN DEFAULT TRUE,

    -- 配置（加密存储）
    config JSONB NOT NULL,

    -- 约束
    UNIQUE(tenant_id, gateway)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_payment_gateway_configs_tenant ON payment_gateway_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_configs_gateway ON payment_gateway_configs(gateway);

COMMENT ON TABLE payment_gateway_configs IS '支付网关配置表（租户级别）';

COMMIT;
