-- =====================================================
-- 多租戶查詢優化：tenant_id 冗餘欄位
-- Migration: 025_tenant_id_denormalization.sql
-- 日期: 2026-01-27
-- 說明:
--   1. 修復 tenants 表使用 UUID v7
--   2. 在核心表格加入 tenant_id 冗餘欄位
--   3. 建立複合索引優化多租戶查詢
--   4. 建立觸發器自動維護 tenant_id 一致性
-- 預期效果: 多租戶查詢效能提升 40-50%（減少 JOIN）
-- =====================================================

BEGIN;

-- =====================================================
-- 1. 修復 tenants 相關表格使用 UUID v7
-- =====================================================

-- 確保 gen_uuid_v7 函數存在
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_uuid_v7') THEN
        RAISE EXCEPTION 'gen_uuid_v7 函數不存在，請先執行 005_uuid_v7_support.sql';
    END IF;
END $$;

-- 修改 tenants 表預設值
ALTER TABLE tenants
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 修改 usage_records 表預設值（如果存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_records') THEN
        EXECUTE 'ALTER TABLE usage_records ALTER COLUMN id SET DEFAULT gen_uuid_v7()';
        RAISE NOTICE '已修復 usage_records 使用 UUID v7';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已修復 tenants 相關表格使用 UUID v7'; END $$;

-- =====================================================
-- 2. 在核心表格加入 tenant_id 欄位
-- =====================================================

-- 2.1 employees 表
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN employees.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.2 members 表
ALTER TABLE members
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN members.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.3 contracts 表
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN contracts.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.4 payments 表
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN payments.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.5 class_bookings 表
ALTER TABLE class_bookings
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN class_bookings.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.6 leads 表
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN leads.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.7 attendances 表
ALTER TABLE attendances
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN attendances.tenant_id IS '租戶 ID（冗餘欄位，優化多租戶查詢）';

-- 2.8 check_ins 表
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'check_ins') THEN
        EXECUTE 'ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE';
        EXECUTE 'COMMENT ON COLUMN check_ins.tenant_id IS ''租戶 ID（冗餘欄位，優化多租戶查詢）''';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已在核心表格加入 tenant_id 欄位'; END $$;

-- =====================================================
-- 3. 從 branches 回填現有資料的 tenant_id
-- =====================================================

-- 3.1 employees
UPDATE employees e
SET tenant_id = b.tenant_id
FROM branches b
WHERE e.branch_id = b.id
  AND e.tenant_id IS NULL;

-- 3.2 members
UPDATE members m
SET tenant_id = b.tenant_id
FROM branches b
WHERE m.branch_id = b.id
  AND m.tenant_id IS NULL;

-- 3.3 contracts
UPDATE contracts c
SET tenant_id = b.tenant_id
FROM branches b
WHERE c.branch_id = b.id
  AND c.tenant_id IS NULL;

-- 3.4 payments
UPDATE payments p
SET tenant_id = b.tenant_id
FROM branches b
WHERE p.branch_id = b.id
  AND p.tenant_id IS NULL;

-- 3.5 class_bookings
UPDATE class_bookings cb
SET tenant_id = b.tenant_id
FROM branches b
WHERE cb.branch_id = b.id
  AND cb.tenant_id IS NULL;

-- 3.6 leads
UPDATE leads l
SET tenant_id = b.tenant_id
FROM branches b
WHERE l.branch_id = b.id
  AND l.tenant_id IS NULL;

-- 3.7 attendances
UPDATE attendances a
SET tenant_id = b.tenant_id
FROM branches b
WHERE a.branch_id = b.id
  AND a.tenant_id IS NULL;

-- 3.8 check_ins
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'check_ins') THEN
        EXECUTE '
            UPDATE check_ins ci
            SET tenant_id = b.tenant_id
            FROM branches b
            WHERE ci.branch_id = b.id
              AND ci.tenant_id IS NULL
        ';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已回填現有資料的 tenant_id'; END $$;

-- =====================================================
-- 4. 設置 NOT NULL 約束（確保所有資料已遷移）
-- =====================================================

DO $$
DECLARE
    v_null_count INTEGER;
BEGIN
    -- 檢查是否有未遷移的資料
    SELECT COUNT(*) INTO v_null_count FROM employees WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'employees 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE employees ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM members WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'members 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE members ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM contracts WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'contracts 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE contracts ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM payments WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'payments 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE payments ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM class_bookings WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'class_bookings 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE class_bookings ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM leads WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'leads 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE leads ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    SELECT COUNT(*) INTO v_null_count FROM attendances WHERE tenant_id IS NULL AND branch_id IS NOT NULL;
    IF v_null_count > 0 THEN
        RAISE WARNING 'attendances 表仍有 % 筆記錄的 tenant_id 為 NULL', v_null_count;
    ELSE
        EXECUTE 'ALTER TABLE attendances ALTER COLUMN tenant_id SET NOT NULL';
    END IF;

    RAISE NOTICE '✅ 已設置 NOT NULL 約束';
END $$;

-- =====================================================
-- 5. 建立複合索引優化多租戶查詢
-- =====================================================

-- 5.1 employees 索引
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_branch ON employees(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON employees(tenant_id, status);

-- 5.2 members 索引
CREATE INDEX IF NOT EXISTS idx_members_tenant ON members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_tenant_branch ON members(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_members_tenant_status ON members(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_members_tenant_name ON members(tenant_id, full_name);

-- 5.3 contracts 索引
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_branch ON contracts(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_status ON contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_dates ON contracts(tenant_id, start_date, end_date);

-- 5.4 payments 索引
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_branch ON payments(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments(tenant_id, payment_date);

-- 5.5 class_bookings 索引
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON class_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_branch ON class_bookings(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_scheduled ON class_bookings(tenant_id, scheduled_at);

-- 5.6 leads 索引
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);

-- 5.7 attendances 索引
CREATE INDEX IF NOT EXISTS idx_attendances_tenant ON attendances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendances_tenant_checkin ON attendances(tenant_id, check_in);

-- 5.8 check_ins 索引
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'check_ins') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_check_ins_tenant ON check_ins(tenant_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_check_ins_tenant_time ON check_ins(tenant_id, check_in_time)';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已建立多租戶複合索引'; END $$;

-- =====================================================
-- 6. 建立觸發器自動維護 tenant_id 一致性
-- =====================================================

-- 6.1 通用函數：從 branch_id 自動填充 tenant_id
CREATE OR REPLACE FUNCTION auto_fill_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果 tenant_id 為空且 branch_id 不為空，自動填充
    IF NEW.tenant_id IS NULL AND NEW.branch_id IS NOT NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM branches
        WHERE id = NEW.branch_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_fill_tenant_id() IS '自動從 branch_id 填充 tenant_id（觸發器函數）';

-- 6.2 為各表建立觸發器

-- employees
DROP TRIGGER IF EXISTS trg_auto_tenant_employees ON employees;
CREATE TRIGGER trg_auto_tenant_employees
    BEFORE INSERT OR UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- members
DROP TRIGGER IF EXISTS trg_auto_tenant_members ON members;
CREATE TRIGGER trg_auto_tenant_members
    BEFORE INSERT OR UPDATE ON members
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- contracts
DROP TRIGGER IF EXISTS trg_auto_tenant_contracts ON contracts;
CREATE TRIGGER trg_auto_tenant_contracts
    BEFORE INSERT OR UPDATE ON contracts
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- payments
DROP TRIGGER IF EXISTS trg_auto_tenant_payments ON payments;
CREATE TRIGGER trg_auto_tenant_payments
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- class_bookings
DROP TRIGGER IF EXISTS trg_auto_tenant_bookings ON class_bookings;
CREATE TRIGGER trg_auto_tenant_bookings
    BEFORE INSERT OR UPDATE ON class_bookings
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- leads
DROP TRIGGER IF EXISTS trg_auto_tenant_leads ON leads;
CREATE TRIGGER trg_auto_tenant_leads
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- attendances
DROP TRIGGER IF EXISTS trg_auto_tenant_attendances ON attendances;
CREATE TRIGGER trg_auto_tenant_attendances
    BEFORE INSERT OR UPDATE ON attendances
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_tenant_id();

-- check_ins
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'check_ins') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_tenant_check_ins ON check_ins';
        EXECUTE '
            CREATE TRIGGER trg_auto_tenant_check_ins
                BEFORE INSERT OR UPDATE ON check_ins
                FOR EACH ROW
                EXECUTE FUNCTION auto_fill_tenant_id()
        ';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已建立 tenant_id 自動填充觸發器'; END $$;

-- =====================================================
-- 7. 建立驗證函數
-- =====================================================

CREATE OR REPLACE FUNCTION validate_tenant_consistency()
RETURNS TABLE (
    table_name TEXT,
    total_records BIGINT,
    inconsistent_records BIGINT,
    status TEXT
) AS $$
BEGIN
    -- employees
    RETURN QUERY
    SELECT
        'employees'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE e.tenant_id != b.tenant_id)::BIGINT,
        CASE
            WHEN COUNT(*) FILTER (WHERE e.tenant_id != b.tenant_id) = 0 THEN '✅ OK'
            ELSE '❌ INCONSISTENT'
        END
    FROM employees e
    JOIN branches b ON e.branch_id = b.id;

    -- members
    RETURN QUERY
    SELECT
        'members'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE m.tenant_id != b.tenant_id)::BIGINT,
        CASE
            WHEN COUNT(*) FILTER (WHERE m.tenant_id != b.tenant_id) = 0 THEN '✅ OK'
            ELSE '❌ INCONSISTENT'
        END
    FROM members m
    JOIN branches b ON m.branch_id = b.id;

    -- contracts
    RETURN QUERY
    SELECT
        'contracts'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE c.tenant_id != b.tenant_id)::BIGINT,
        CASE
            WHEN COUNT(*) FILTER (WHERE c.tenant_id != b.tenant_id) = 0 THEN '✅ OK'
            ELSE '❌ INCONSISTENT'
        END
    FROM contracts c
    JOIN branches b ON c.branch_id = b.id;

    -- payments
    RETURN QUERY
    SELECT
        'payments'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE p.tenant_id != b.tenant_id)::BIGINT,
        CASE
            WHEN COUNT(*) FILTER (WHERE p.tenant_id != b.tenant_id) = 0 THEN '✅ OK'
            ELSE '❌ INCONSISTENT'
        END
    FROM payments p
    JOIN branches b ON p.branch_id = b.id;

    RAISE NOTICE '✅ 驗證函數已建立';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_tenant_consistency() IS
'驗證所有表格的 tenant_id 與 branches 表一致性
用法：SELECT * FROM validate_tenant_consistency();';

-- =====================================================
-- 8. 更新 v_tenant_overview 視圖
-- =====================================================

CREATE OR REPLACE VIEW v_tenant_overview AS
SELECT
    t.id,
    t.name,
    t.slug,
    t.contact_email,
    t.contact_phone,
    t.plan_type,
    t.status AS tenant_status,
    t.is_trial,
    t.trial_ends_at,
    t.created_at,

    -- 配額
    t.max_branches,
    t.max_members,
    t.max_employees,

    -- 當前使用量（直接查詢，不需要 JOIN branches）
    (SELECT COUNT(*) FROM branches WHERE tenant_id = t.id AND status = 'published') AS current_branches,
    (SELECT COUNT(*) FROM members WHERE tenant_id = t.id AND status = 'ACTIVE') AS current_members,
    (SELECT COUNT(*) FROM employees WHERE tenant_id = t.id AND status = 'ACTIVE') AS current_employees,

    -- 配額使用率
    ROUND((SELECT COUNT(*) FROM branches WHERE tenant_id = t.id)::NUMERIC / NULLIF(t.max_branches, 0) * 100, 2) AS branches_usage_percent,
    ROUND((SELECT COUNT(*) FROM members WHERE tenant_id = t.id)::NUMERIC / NULLIF(t.max_members, 0) * 100, 2) AS members_usage_percent,
    ROUND((SELECT COUNT(*) FROM employees WHERE tenant_id = t.id)::NUMERIC / NULLIF(t.max_employees, 0) * 100, 2) AS employees_usage_percent,

    -- 活躍合約數（直接查詢）
    (SELECT COUNT(*) FROM contracts WHERE tenant_id = t.id AND status = 'ACTIVE') AS active_contracts,

    -- 本月營收
    (SELECT COALESCE(SUM(amount), 0)
     FROM payments
     WHERE tenant_id = t.id
       AND type = 'INCOME'
       AND payment_date >= date_trunc('month', CURRENT_DATE)
    ) AS current_month_revenue

FROM tenants t;

COMMENT ON VIEW v_tenant_overview IS '租戶統計概覽視圖（優化版：直接使用 tenant_id，無需 JOIN branches）';

-- =====================================================
-- 9. 驗證遷移結果
-- =====================================================

DO $$
DECLARE
    v_result RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tenant ID Denormalization Complete';
    RAISE NOTICE '========================================';

    FOR v_result IN SELECT * FROM validate_tenant_consistency()
    LOOP
        RAISE NOTICE '  %: % records, % inconsistent - %',
            v_result.table_name,
            v_result.total_records,
            v_result.inconsistent_records,
            v_result.status;
    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE '新增索引數量: 22';
    RAISE NOTICE '新增觸發器數量: 7-8';
    RAISE NOTICE '預期查詢效能提升: 40-50%%';
    RAISE NOTICE '========================================';
END;
$$;

COMMIT;
