-- ============================================
-- Dashboard KPIs Migration
-- 版本: 027
-- 日期: 2026-01-29
-- 說明: 創建戰情室 Dashboard 所需的物化視圖和營收目標表
-- ============================================

-- ============================================
-- 1. 營收目標表 (Revenue Targets)
-- ============================================

CREATE TABLE IF NOT EXISTS revenue_targets (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    target_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(branch_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_revenue_targets_branch ON revenue_targets(branch_id);
CREATE INDEX IF NOT EXISTS idx_revenue_targets_period ON revenue_targets(year, month);

COMMENT ON TABLE revenue_targets IS '營收目標表 - 各分店月度營收目標';
COMMENT ON COLUMN revenue_targets.target_amount IS '目標營收金額';

-- ============================================
-- 2. Dashboard KPIs 物化視圖
-- ============================================

-- 2.1 每日營收摘要物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_revenue_summary AS
SELECT
    DATE(payment_date) as report_date,
    branch_id,
    SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
    SUM(CASE WHEN type = 'REFUND' THEN amount ELSE 0 END) as refund,
    SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END) as net_revenue,
    COUNT(CASE WHEN type = 'INCOME' THEN 1 END) as income_count,
    COUNT(CASE WHEN type = 'REFUND' THEN 1 END) as refund_count,
    jsonb_object_agg(
        COALESCE(payment_method, 'OTHER'),
        payment_method_sum
    ) FILTER (WHERE payment_method IS NOT NULL) as by_payment_method
FROM payments
LEFT JOIN LATERAL (
    SELECT payment_method, SUM(amount) as payment_method_sum
    FROM payments p2
    WHERE p2.payment_date = payments.payment_date
      AND p2.branch_id = payments.branch_id
      AND p2.type = 'INCOME'
    GROUP BY payment_method
) pm ON true
GROUP BY DATE(payment_date), branch_id
ORDER BY report_date DESC, branch_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_revenue_date_branch
    ON mv_daily_revenue_summary(report_date, branch_id);

-- 2.2 會員統計物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_member_stats AS
SELECT
    branch_id,
    COUNT(*) as total_members,
    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_members,
    COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired_members,
    COUNT(CASE WHEN status = 'SUSPENDED' THEN 1 END) as suspended_members,
    COUNT(CASE WHEN gender = 'MALE' THEN 1 END) as male_count,
    COUNT(CASE WHEN gender = 'FEMALE' THEN 1 END) as female_count,
    COUNT(CASE WHEN join_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_7d,
    COUNT(CASE WHEN join_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_30d,
    AVG(EXTRACT(YEAR FROM AGE(birthday))) FILTER (WHERE birthday IS NOT NULL) as avg_age
FROM members
GROUP BY branch_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_member_stats_branch
    ON mv_member_stats(branch_id);

-- 2.3 合約統計物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_contract_stats AS
SELECT
    branch_id,
    COUNT(*) as total_contracts,
    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_contracts,
    COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as expiring_7d,
    COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as expiring_30d,
    COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) as expiring_90d,
    AVG(total_amount) as avg_contract_value,
    SUM(total_amount) FILTER (WHERE status = 'ACTIVE') as active_contract_value
FROM contracts
GROUP BY branch_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_contract_stats_branch
    ON mv_contract_stats(branch_id);

-- 2.4 每日打卡統計物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_checkin_summary AS
SELECT
    DATE(check_in) as checkin_date,
    branch_id,
    COUNT(*) as total_checkins,
    COUNT(DISTINCT employee_id) as unique_employees,
    EXTRACT(HOUR FROM check_in) as peak_hour,
    jsonb_agg(
        jsonb_build_object(
            'hour', EXTRACT(HOUR FROM check_in),
            'count', 1
        )
    ) as hourly_distribution
FROM attendances
WHERE check_in >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(check_in), branch_id, EXTRACT(HOUR FROM check_in)
ORDER BY checkin_date DESC, branch_id;

CREATE INDEX IF NOT EXISTS idx_mv_daily_checkin_date
    ON mv_daily_checkin_summary(checkin_date);

-- 2.5 綜合 KPI 物化視圖
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_kpis AS
WITH revenue_today AS (
    SELECT
        branch_id,
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as today_revenue,
        COUNT(CASE WHEN type = 'INCOME' THEN 1 END) as today_transactions
    FROM payments
    WHERE DATE(payment_date) = CURRENT_DATE
    GROUP BY branch_id
),
revenue_mtd AS (
    SELECT
        branch_id,
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as mtd_revenue
    FROM payments
    WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY branch_id
),
revenue_ytd AS (
    SELECT
        branch_id,
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as ytd_revenue
    FROM payments
    WHERE payment_date >= DATE_TRUNC('year', CURRENT_DATE)
    GROUP BY branch_id
),
checkins_today AS (
    SELECT
        branch_id,
        COUNT(*) as today_checkins
    FROM attendances
    WHERE DATE(check_in) = CURRENT_DATE
    GROUP BY branch_id
)
SELECT
    b.id as branch_id,
    b.name as branch_name,
    b.type as branch_type,
    -- Revenue KPIs
    COALESCE(rt.today_revenue, 0) as today_revenue,
    COALESCE(rt.today_transactions, 0) as today_transactions,
    COALESCE(rm.mtd_revenue, 0) as mtd_revenue,
    COALESCE(ry.ytd_revenue, 0) as ytd_revenue,
    -- Member KPIs
    COALESCE(ms.total_members, 0) as total_members,
    COALESCE(ms.active_members, 0) as active_members,
    COALESCE(ms.new_7d, 0) as new_members_7d,
    COALESCE(ms.new_30d, 0) as new_members_30d,
    CASE WHEN ms.total_members > 0
         THEN ROUND((ms.active_members::NUMERIC / ms.total_members) * 100, 1)
         ELSE 0 END as active_rate,
    -- Contract KPIs
    COALESCE(cs.active_contracts, 0) as active_contracts,
    COALESCE(cs.expiring_7d, 0) as expiring_7d,
    COALESCE(cs.expiring_30d, 0) as expiring_30d,
    COALESCE(cs.expiring_90d, 0) as expiring_90d,
    COALESCE(cs.avg_contract_value, 0) as avg_contract_value,
    -- Operations KPIs
    COALESCE(ct.today_checkins, 0) as today_checkins,
    -- Target
    COALESCE(tg.target_amount, 0) as month_target,
    CASE WHEN tg.target_amount > 0
         THEN ROUND((rm.mtd_revenue / tg.target_amount) * 100, 1)
         ELSE 0 END as target_achievement,
    -- Metadata
    NOW() as refreshed_at
FROM branches b
LEFT JOIN revenue_today rt ON rt.branch_id = b.id
LEFT JOIN revenue_mtd rm ON rm.branch_id = b.id
LEFT JOIN revenue_ytd ry ON ry.branch_id = b.id
LEFT JOIN mv_member_stats ms ON ms.branch_id = b.id
LEFT JOIN mv_contract_stats cs ON cs.branch_id = b.id
LEFT JOIN checkins_today ct ON ct.branch_id = b.id
LEFT JOIN revenue_targets tg ON tg.branch_id = b.id
    AND tg.year = EXTRACT(YEAR FROM CURRENT_DATE)
    AND tg.month = EXTRACT(MONTH FROM CURRENT_DATE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_kpis_branch
    ON mv_dashboard_kpis(branch_id);

-- ============================================
-- 3. 刷新函數
-- ============================================

CREATE OR REPLACE FUNCTION refresh_dashboard_kpis()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 刷新所有物化視圖
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_member_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_contract_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_checkin_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_kpis;

    RAISE NOTICE 'Dashboard KPIs refreshed at %', NOW();
END;
$$;

COMMENT ON FUNCTION refresh_dashboard_kpis() IS
'刷新所有 Dashboard 相關的物化視圖
- 建議每 15 分鐘執行一次
- 使用 CONCURRENTLY 確保不阻塞查詢';

-- ============================================
-- 4. 打卡熱力圖視圖
-- ============================================

CREATE OR REPLACE VIEW v_checkin_heatmap AS
SELECT
    branch_id,
    EXTRACT(DOW FROM check_in)::INTEGER as day_of_week,
    EXTRACT(HOUR FROM check_in)::INTEGER as hour,
    COUNT(*) as count,
    DATE_TRUNC('week', check_in)::DATE as week_start
FROM attendances
WHERE check_in >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY branch_id, day_of_week, hour, week_start
ORDER BY branch_id, day_of_week, hour;

COMMENT ON VIEW v_checkin_heatmap IS '打卡熱力圖視圖 - 按星期幾和小時統計打卡次數';

-- ============================================
-- 5. 合約到期警示視圖
-- ============================================

CREATE OR REPLACE VIEW v_contract_expiry_alerts AS
SELECT
    c.id as contract_id,
    c.contract_no,
    c.status,
    c.start_date,
    c.end_date,
    (c.end_date - CURRENT_DATE) as days_until_expiry,
    c.total_amount,
    c.paid_amount,
    (c.total_amount - c.paid_amount) as outstanding_amount,
    m.id as member_id,
    m.full_name as member_name,
    m.phone as member_phone,
    m.email as member_email,
    b.id as branch_id,
    b.name as branch_name,
    mp.name as plan_name,
    mp.type as plan_type,
    e.full_name as sales_person_name,
    CASE
        WHEN (c.end_date - CURRENT_DATE) <= 7 THEN 'URGENT'
        WHEN (c.end_date - CURRENT_DATE) <= 30 THEN 'SOON'
        ELSE 'UPCOMING'
    END as urgency
FROM contracts c
JOIN members m ON m.id = c.member_id
JOIN branches b ON b.id = c.branch_id
JOIN membership_plans mp ON mp.id = c.plan_id
LEFT JOIN employees e ON e.id = c.sales_person_id
WHERE c.status = 'ACTIVE'
  AND c.end_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY c.end_date ASC;

COMMENT ON VIEW v_contract_expiry_alerts IS '合約到期警示視圖 - 顯示即將到期的合約';

-- ============================================
-- 6. 權限設定
-- ============================================

-- 授予 Directus 角色訪問權限 (如果需要)
-- GRANT SELECT ON mv_dashboard_kpis TO directus_user;
-- GRANT SELECT ON mv_member_stats TO directus_user;
-- GRANT SELECT ON mv_contract_stats TO directus_user;
-- GRANT SELECT ON mv_daily_revenue_summary TO directus_user;
-- GRANT SELECT ON v_checkin_heatmap TO directus_user;
-- GRANT SELECT ON v_contract_expiry_alerts TO directus_user;

-- ============================================
-- 7. 初始刷新
-- ============================================

-- 首次創建後立即刷新
SELECT refresh_dashboard_kpis();

-- ============================================
-- 完成
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Dashboard KPIs Migration 完成!';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE '已創建:';
    RAISE NOTICE '  - revenue_targets 表';
    RAISE NOTICE '  - mv_daily_revenue_summary 物化視圖';
    RAISE NOTICE '  - mv_member_stats 物化視圖';
    RAISE NOTICE '  - mv_contract_stats 物化視圖';
    RAISE NOTICE '  - mv_daily_checkin_summary 物化視圖';
    RAISE NOTICE '  - mv_dashboard_kpis 綜合物化視圖';
    RAISE NOTICE '  - v_checkin_heatmap 視圖';
    RAISE NOTICE '  - v_contract_expiry_alerts 視圖';
    RAISE NOTICE '  - refresh_dashboard_kpis() 函數';
    RAISE NOTICE '========================================';
END;
$$;
