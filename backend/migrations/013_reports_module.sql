-- ============================================
-- Migration 013: 報表模組 (Reports Module)
-- ============================================
-- 建立報表所需的視圖和索引
-- 功能：營收報表、會員成長、合約到期提醒

BEGIN;

-- ============================================
-- 1. 營收報表視圖 (Revenue Report View)
-- ============================================
-- 按日期統計營收的物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_daily_summary AS
SELECT
    DATE(p.payment_date) AS payment_day,
    p.branch_id,
    b.name AS branch_name,
    COUNT(DISTINCT p.id) AS transaction_count,
    SUM(CASE WHEN p.payment_type = 'INCOME' THEN p.amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN p.payment_type = 'REFUND' THEN p.amount ELSE 0 END) AS total_refund,
    SUM(CASE WHEN p.payment_type = 'INCOME' THEN p.amount ELSE -p.amount END) AS net_revenue,
    COUNT(DISTINCT p.member_id) AS unique_members,
    -- 按付款方式統計
    SUM(CASE WHEN p.payment_method = 'CASH' AND p.payment_type = 'INCOME' THEN p.amount ELSE 0 END) AS cash_income,
    SUM(CASE WHEN p.payment_method = 'CREDIT_CARD' AND p.payment_type = 'INCOME' THEN p.amount ELSE 0 END) AS credit_card_income,
    SUM(CASE WHEN p.payment_method = 'BANK_TRANSFER' AND p.payment_type = 'INCOME' THEN p.amount ELSE 0 END) AS bank_transfer_income,
    SUM(CASE WHEN p.payment_method = 'LINE_PAY' AND p.payment_type = 'INCOME' THEN p.amount ELSE 0 END) AS line_pay_income
FROM payments p
LEFT JOIN branches b ON b.id = p.branch_id
WHERE p.payment_date IS NOT NULL
GROUP BY DATE(p.payment_date), p.branch_id, b.name;

-- 建立索引以加速查詢
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
-- 按日期統計會員新增和狀態變化
CREATE MATERIALIZED VIEW IF NOT EXISTS member_growth_summary AS
SELECT
    DATE(m.date_created) AS join_day,
    m.branch_id,
    b.name AS branch_name,
    COUNT(*) AS new_members,
    COUNT(CASE WHEN m.member_status = 'ACTIVE' THEN 1 END) AS active_members,
    COUNT(CASE WHEN m.gender = 'MALE' THEN 1 END) AS male_count,
    COUNT(CASE WHEN m.gender = 'FEMALE' THEN 1 END) AS female_count,
    -- 銷售人員統計
    COUNT(DISTINCT m.sales_person_id) AS sales_persons_involved
FROM members m
LEFT JOIN branches b ON b.id = m.branch_id
WHERE m.date_created IS NOT NULL
GROUP BY DATE(m.date_created), m.branch_id, b.name;

-- 建立索引
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
-- 列出即將到期的合約（未來 30 天）
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
    c.contract_status,
    c.payment_status,
    -- 計算剩餘天數
    (c.end_date - CURRENT_DATE) AS days_until_expiry,
    -- 銷售人員資訊
    c.sales_person_id,
    e.full_name AS sales_person_name,
    -- 合約金額和付款資訊
    c.total_amount,
    COALESCE(
        (SELECT SUM(p.amount)
         FROM payments p
         WHERE p.contract_id = c.id
           AND p.payment_type = 'INCOME'
           AND p.status = 'active'),
        0
    ) AS total_paid,
    c.total_amount - COALESCE(
        (SELECT SUM(p.amount)
         FROM payments p
         WHERE p.contract_id = c.id
           AND p.payment_type = 'INCOME'
           AND p.status = 'active'),
        0
    ) AS outstanding_amount
FROM contracts c
LEFT JOIN members m ON m.id = c.member_id
LEFT JOIN branches b ON b.id = c.branch_id
LEFT JOIN membership_plans mp ON mp.id = c.plan_id
LEFT JOIN employees e ON e.id = c.sales_person_id
WHERE
    c.contract_status = 'ACTIVE'
    AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
ORDER BY c.end_date ASC;

COMMENT ON VIEW contract_expiry_alerts IS '合約到期提醒視圖（未來 90 天）';

-- ============================================
-- 4. 會員活躍度報表視圖 (Member Activity View)
-- ============================================
-- 基於 check_ins 表，統計會員活躍度
CREATE MATERIALIZED VIEW IF NOT EXISTS member_activity_summary AS
SELECT
    DATE(ci.check_in_time) AS activity_day,
    ci.branch_id,
    b.name AS branch_name,
    COUNT(*) AS total_check_ins,
    COUNT(DISTINCT ci.member_id) AS unique_members,
    -- 按入場方式統計
    COUNT(CASE WHEN ci.check_in_method = 'QR_CODE' THEN 1 END) AS qr_code_count,
    COUNT(CASE WHEN ci.check_in_method = 'MANUAL' THEN 1 END) AS manual_count,
    COUNT(CASE WHEN ci.check_in_method = 'CARD' THEN 1 END) AS card_count,
    -- 時段統計
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 6 AND 12 THEN 1 END) AS morning_count,
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 12 AND 18 THEN 1 END) AS afternoon_count,
    COUNT(CASE WHEN EXTRACT(HOUR FROM ci.check_in_time) BETWEEN 18 AND 24 THEN 1 END) AS evening_count
FROM check_ins ci
LEFT JOIN branches b ON b.id = ci.branch_id
WHERE ci.check_in_time IS NOT NULL
  AND ci.status = 'active'
GROUP BY DATE(ci.check_in_time), ci.branch_id, b.name;

-- 建立索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_activity_summary_unique
ON member_activity_summary (activity_day, branch_id);

CREATE INDEX IF NOT EXISTS idx_member_activity_summary_day
ON member_activity_summary (activity_day DESC);

CREATE INDEX IF NOT EXISTS idx_member_activity_summary_branch
ON member_activity_summary (branch_id);

COMMENT ON MATERIALIZED VIEW member_activity_summary IS '會員活躍度摘要視圖';

-- ============================================
-- 5. 增強現有表的索引（優化報表查詢）
-- ============================================
-- payments 表索引
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_branch_date ON payments(branch_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- members 表索引
CREATE INDEX IF NOT EXISTS idx_members_created ON members(date_created DESC);
CREATE INDEX IF NOT EXISTS idx_members_branch_created ON members(branch_id, date_created DESC);

-- contracts 表索引
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status_end_date ON contracts(contract_status, end_date);

-- ============================================
-- 6. 建立刷新物化視圖的函數
-- ============================================
CREATE OR REPLACE FUNCTION refresh_report_views()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 刷新營收報表視圖
    REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_daily_summary;

    -- 刷新會員成長報表視圖
    REFRESH MATERIALIZED VIEW CONCURRENTLY member_growth_summary;

    -- 刷新會員活躍度報表視圖
    REFRESH MATERIALIZED VIEW CONCURRENTLY member_activity_summary;

    RAISE NOTICE '報表視圖已刷新完成';
END;
$$;

COMMENT ON FUNCTION refresh_report_views() IS '刷新所有報表物化視圖';

-- ============================================
-- 7. 初始化物化視圖資料
-- ============================================
-- 執行初次刷新
REFRESH MATERIALIZED VIEW revenue_daily_summary;
REFRESH MATERIALIZED VIEW member_growth_summary;
REFRESH MATERIALIZED VIEW member_activity_summary;

COMMIT;

-- ============================================
-- 使用說明
-- ============================================
-- 1. 查詢營收報表（最近 30 天）：
--    SELECT * FROM revenue_daily_summary
--    WHERE payment_day >= CURRENT_DATE - INTERVAL '30 days'
--    ORDER BY payment_day DESC;
--
-- 2. 查詢會員成長報表（本月）：
--    SELECT * FROM member_growth_summary
--    WHERE join_day >= DATE_TRUNC('month', CURRENT_DATE)
--    ORDER BY join_day DESC;
--
-- 3. 查詢即將到期的合約：
--    SELECT * FROM contract_expiry_alerts
--    WHERE days_until_expiry <= 30
--    ORDER BY days_until_expiry ASC;
--
-- 4. 刷新報表資料：
--    SELECT refresh_report_views();
