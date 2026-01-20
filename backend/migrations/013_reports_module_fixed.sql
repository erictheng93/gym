-- ============================================
-- Migration 013: 報表模組 (Reports Module) - 修復版
-- ============================================
-- 修正欄位名稱以匹配實際 schema
-- payment_type -> type
-- date_created -> created_at
-- member_status -> status
-- contract_status -> status

BEGIN;

-- ============================================
-- 1. 營收報表視圖 (Revenue Report View)
-- ============================================
DROP MATERIALIZED VIEW IF EXISTS revenue_daily_summary CASCADE;
CREATE MATERIALIZED VIEW revenue_daily_summary AS
SELECT
    DATE(p.payment_date) AS payment_day,
    p.branch_id,
    b.name AS branch_name,
    COUNT(DISTINCT p.id) AS transaction_count,
    SUM(CASE WHEN p.type = 'INCOME' THEN p.amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN p.type = 'REFUND' THEN p.amount ELSE 0 END) AS total_refund,
    SUM(CASE WHEN p.type = 'INCOME' THEN p.amount ELSE -p.amount END) AS net_revenue,
    COUNT(DISTINCT p.member_id) AS unique_members,
    -- 按付款方式統計
    SUM(CASE WHEN p.payment_method = 'CASH' AND p.type = 'INCOME' THEN p.amount ELSE 0 END) AS cash_income,
    SUM(CASE WHEN p.payment_method = 'CREDIT_CARD' AND p.type = 'INCOME' THEN p.amount ELSE 0 END) AS credit_card_income,
    SUM(CASE WHEN p.payment_method = 'TRANSFER' AND p.type = 'INCOME' THEN p.amount ELSE 0 END) AS bank_transfer_income,
    SUM(CASE WHEN p.payment_method = 'LINE_PAY' AND p.type = 'INCOME' THEN p.amount ELSE 0 END) AS line_pay_income
FROM payments p
LEFT JOIN branches b ON b.id = p.branch_id
WHERE p.payment_date IS NOT NULL
GROUP BY DATE(p.payment_date), p.branch_id, b.name;

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_daily_summary_unique
ON revenue_daily_summary (payment_day, branch_id);

CREATE INDEX IF NOT EXISTS idx_revenue_daily_summary_day
ON revenue_daily_summary (payment_day DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_daily_summary_branch
ON revenue_daily_summary (branch_id);

COMMENT ON MATERIALIZED VIEW revenue_daily_summary IS '每日營收摘要視圖';

-- ============================================
-- 2. 會員成長報表視圖 (Member Growth View)
-- ============================================
DROP MATERIALIZED VIEW IF EXISTS member_growth_summary CASCADE;
CREATE MATERIALIZED VIEW member_growth_summary AS
SELECT
    DATE(m.created_at) AS join_day,
    m.branch_id,
    b.name AS branch_name,
    COUNT(*) AS new_members,
    COUNT(CASE WHEN m.status = 'ACTIVE' THEN 1 END) AS active_members,
    COUNT(CASE WHEN m.gender = 'MALE' THEN 1 END) AS male_count,
    COUNT(CASE WHEN m.gender = 'FEMALE' THEN 1 END) AS female_count,
    COUNT(DISTINCT m.sales_person_id) AS sales_persons_involved
FROM members m
LEFT JOIN branches b ON b.id = m.branch_id
WHERE m.created_at IS NOT NULL
GROUP BY DATE(m.created_at), m.branch_id, b.name;

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_growth_summary_unique
ON member_growth_summary (join_day, branch_id);

CREATE INDEX IF NOT EXISTS idx_member_growth_summary_day
ON member_growth_summary (join_day DESC);

CREATE INDEX IF NOT EXISTS idx_member_growth_summary_branch
ON member_growth_summary (branch_id);

COMMENT ON MATERIALIZED VIEW member_growth_summary IS '會員成長摘要視圖';

-- ============================================
-- 3. 合約到期提醒視圖 (Contract Expiry Alerts)
-- ============================================
CREATE OR REPLACE VIEW contract_expiry_alerts AS
SELECT
    c.id AS contract_id,
    c.contract_no,
    c.member_id,
    m.full_name AS member_name,
    m.member_code,
    m.phone AS member_phone,
    m.email AS member_email,
    c.branch_id,
    b.name AS branch_name,
    c.plan_id,
    mp.name AS plan_name,
    c.start_date,
    c.end_date,
    c.status AS contract_status,
    c.payment_status,
    (c.end_date - CURRENT_DATE) AS days_until_expiry,
    c.sales_person_id,
    e.full_name AS sales_person_name,
    c.total_amount,
    c.paid_amount AS total_paid,
    c.total_amount - c.paid_amount AS outstanding_amount
FROM contracts c
LEFT JOIN members m ON m.id = c.member_id
LEFT JOIN branches b ON b.id = c.branch_id
LEFT JOIN membership_plans mp ON mp.id = c.plan_id
LEFT JOIN employees e ON e.id = c.sales_person_id
WHERE
    c.status = 'ACTIVE'
    AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
ORDER BY c.end_date ASC;

COMMENT ON VIEW contract_expiry_alerts IS '合約到期提醒視圖（未來 90 天）';

-- ============================================
-- 4. 會員活躍度報表視圖 (Member Activity View)
-- ============================================
DROP MATERIALIZED VIEW IF EXISTS member_activity_summary CASCADE;
CREATE MATERIALIZED VIEW member_activity_summary AS
SELECT
    DATE(ci.check_in_time) AS activity_day,
    ci.branch_id,
    b.name AS branch_name,
    COUNT(*) AS total_check_ins,
    COUNT(DISTINCT ci.member_id) AS unique_members,
    COUNT(CASE WHEN ci.check_in_method = 'QR_CODE' THEN 1 END) AS qr_code_count,
    COUNT(CASE WHEN ci.check_in_method = 'MANUAL' THEN 1 END) AS manual_count,
    COUNT(CASE WHEN ci.check_in_method = 'CARD' THEN 1 END) AS card_count,
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 6 AND 12 THEN 1 END) AS morning_count,
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 12 AND 18 THEN 1 END) AS afternoon_count,
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 18 AND 24 THEN 1 END) AS evening_count
FROM check_ins ci
LEFT JOIN branches b ON b.id = ci.branch_id
WHERE ci.check_in_time IS NOT NULL
  AND ci.status = 'active'
GROUP BY DATE(ci.check_in_time), ci.branch_id, b.name;

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_activity_summary_unique
ON member_activity_summary (activity_day, branch_id);

CREATE INDEX IF NOT EXISTS idx_member_activity_summary_day
ON member_activity_summary (activity_day DESC);

CREATE INDEX IF NOT EXISTS idx_member_activity_summary_branch
ON member_activity_summary (branch_id);

COMMENT ON MATERIALIZED VIEW member_activity_summary IS '會員活躍度摘要視圖';

-- ============================================
-- 5. 增強索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_branch_date ON payments(branch_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_branch_created ON members(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_end_date_idx ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status_end_date ON contracts(status, end_date);

-- ============================================
-- 6. 刷新視圖函數
-- ============================================
CREATE OR REPLACE FUNCTION refresh_report_views()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_daily_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY member_growth_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY member_activity_summary;
    RAISE NOTICE '報表視圖已刷新完成';
END;
$$;

COMMENT ON FUNCTION refresh_report_views() IS '刷新所有報表物化視圖';

-- ============================================
-- 7. 初始化視圖資料
-- ============================================
REFRESH MATERIALIZED VIEW revenue_daily_summary;
REFRESH MATERIALIZED VIEW member_growth_summary;
REFRESH MATERIALIZED VIEW member_activity_summary;

COMMIT;
