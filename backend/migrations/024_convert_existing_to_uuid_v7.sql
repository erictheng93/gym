-- =====================================================
-- 將現有記錄轉換為 UUID v7
-- Migration: 024_convert_existing_to_uuid_v7.sql
-- 日期: 2026-01-20
-- 說明: 將所有現有 UUID v4 主鍵轉換為 UUID v7
-- 警告: 這是一個破壞性操作，請先備份資料庫！
-- =====================================================

-- 確保 pgcrypto 擴展已啟用
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. 建立 UUID v7 生成函數（如果不存在）
-- =====================================================

CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    unix_ts_ms BIGINT;
    uuid_bytes BYTEA;
BEGIN
    unix_ts_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    uuid_bytes := gen_random_bytes(16);
    uuid_bytes := set_byte(uuid_bytes, 0, ((unix_ts_ms >> 40) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 1, ((unix_ts_ms >> 32) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 2, ((unix_ts_ms >> 24) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 3, ((unix_ts_ms >> 16) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 4, ((unix_ts_ms >> 8) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 5, (unix_ts_ms & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

-- 基於時間戳生成 UUID v7（用於保持記錄的時間順序）
CREATE OR REPLACE FUNCTION gen_uuid_v7_from_timestamp(ts TIMESTAMPTZ)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    unix_ts_ms BIGINT;
    uuid_bytes BYTEA;
BEGIN
    unix_ts_ms := (EXTRACT(EPOCH FROM ts) * 1000)::BIGINT;
    uuid_bytes := gen_random_bytes(16);
    uuid_bytes := set_byte(uuid_bytes, 0, ((unix_ts_ms >> 40) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 1, ((unix_ts_ms >> 32) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 2, ((unix_ts_ms >> 24) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 3, ((unix_ts_ms >> 16) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 4, ((unix_ts_ms >> 8) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 5, (unix_ts_ms & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

-- 檢查 UUID 是否為 v7 格式
CREATE OR REPLACE FUNCTION is_uuid_v7(uuid_val uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN substring(replace(uuid_val::text, '-', '') from 13 for 1) = '7';
END;
$$;

-- =====================================================
-- 2. 建立 UUID 映射表
-- =====================================================

CREATE TABLE IF NOT EXISTS _uuid_migration_map (
    table_name TEXT NOT NULL,
    old_uuid UUID NOT NULL,
    new_uuid UUID NOT NULL,
    migrated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (table_name, old_uuid)
);

-- =====================================================
-- 3. 主要轉換函數
-- =====================================================

CREATE OR REPLACE FUNCTION migrate_table_to_uuid_v7(
    p_table_name TEXT,
    p_pk_column TEXT DEFAULT 'id',
    p_timestamp_column TEXT DEFAULT 'created_at'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER := 0;
    v_record RECORD;
    v_new_uuid UUID;
    v_ts TIMESTAMPTZ;
    v_sql TEXT;
BEGIN
    -- 遍歷表中所有非 UUID v7 的記錄
    v_sql := format(
        'SELECT %I as pk_value, COALESCE(%I, NOW()) as ts FROM %I WHERE NOT is_uuid_v7(%I)',
        p_pk_column, p_timestamp_column, p_table_name, p_pk_column
    );

    FOR v_record IN EXECUTE v_sql
    LOOP
        -- 基於 created_at 時間戳生成新的 UUID v7
        v_new_uuid := gen_uuid_v7_from_timestamp(v_record.ts);

        -- 記錄映射
        INSERT INTO _uuid_migration_map (table_name, old_uuid, new_uuid)
        VALUES (p_table_name, v_record.pk_value, v_new_uuid)
        ON CONFLICT (table_name, old_uuid) DO UPDATE SET new_uuid = EXCLUDED.new_uuid;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- =====================================================
-- 4. 開始遷移（在事務中執行）
-- =====================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UUID v7 Migration Started at %', NOW();
    RAISE NOTICE '========================================';

    -- 4.1 為所有表建立映射
    RAISE NOTICE 'Phase 1: Creating UUID mappings...';

    -- 基礎表（無外鍵依賴）
    SELECT migrate_table_to_uuid_v7('branches', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  branches: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('job_titles', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  job_titles: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('membership_plans', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  membership_plans: % records to migrate', v_count;

    -- 員工表（依賴 branches, job_titles）
    SELECT migrate_table_to_uuid_v7('employees', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  employees: % records to migrate', v_count;

    -- 會員表（依賴 branches, employees）
    SELECT migrate_table_to_uuid_v7('members', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  members: % records to migrate', v_count;

    -- 合約表（依賴 members, membership_plans, branches, employees）
    SELECT migrate_table_to_uuid_v7('contracts', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  contracts: % records to migrate', v_count;

    -- 其他業務表
    SELECT migrate_table_to_uuid_v7('contract_logs', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  contract_logs: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('payments', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  payments: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('attendances', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  attendances: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('leave_requests', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  leave_requests: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('class_bookings', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  class_bookings: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('class_records', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  class_records: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('coach_schedules', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  coach_schedules: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('teaching_materials', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  teaching_materials: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('member_coaches', 'id', 'assigned_at') INTO v_count;
    RAISE NOTICE '  member_coaches: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('work_schedules', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  work_schedules: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('performance_reviews', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  performance_reviews: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('salary_records', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  salary_records: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('promotion_records', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  promotion_records: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('leads', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  leads: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('lead_activities', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  lead_activities: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('campaigns', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  campaigns: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('coupons', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  coupons: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('coupon_usages', 'id', 'used_at') INTO v_count;
    RAISE NOTICE '  coupon_usages: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('marketing_assets', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  marketing_assets: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('member_goals', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  member_goals: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('issue_reports', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  issue_reports: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('body_measurements', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  body_measurements: % records to migrate', v_count;

    SELECT migrate_table_to_uuid_v7('workout_logs', 'id', 'created_at') INTO v_count;
    RAISE NOTICE '  workout_logs: % records to migrate', v_count;

    RAISE NOTICE 'Phase 1 Complete: UUID mappings created';
END;
$$;

-- =====================================================
-- 5. 應用映射更新主鍵和外鍵
-- =====================================================

-- 暫時禁用觸發器
SET session_replication_role = replica;

-- 5.1 更新基礎表的主鍵（無外鍵依賴）

-- branches
UPDATE branches b
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND b.id = m.old_uuid;

-- job_titles
UPDATE job_titles jt
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'job_titles' AND jt.id = m.old_uuid;

-- membership_plans
UPDATE membership_plans mp
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'membership_plans' AND mp.id = m.old_uuid;

-- 5.2 更新外鍵引用（employees 相關）

-- 先更新 employees 的外鍵
UPDATE employees e
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND e.branch_id = m.old_uuid;

UPDATE employees e
SET job_title_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'job_titles' AND e.job_title_id = m.old_uuid;

-- 更新 employees 的主鍵
UPDATE employees e
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND e.id = m.old_uuid;

-- 5.3 更新 members 的外鍵和主鍵

UPDATE members mb
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND mb.branch_id = m.old_uuid;

UPDATE members mb
SET sales_person_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND mb.sales_person_id = m.old_uuid;

UPDATE members mb
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND mb.id = m.old_uuid;

-- 5.4 更新 contracts 的外鍵和主鍵

UPDATE contracts c
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND c.member_id = m.old_uuid;

UPDATE contracts c
SET plan_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'membership_plans' AND c.plan_id = m.old_uuid;

UPDATE contracts c
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND c.branch_id = m.old_uuid;

UPDATE contracts c
SET sales_person_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND c.sales_person_id = m.old_uuid;

UPDATE contracts c
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND c.created_by = m.old_uuid;

UPDATE contracts c
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contracts' AND c.id = m.old_uuid;

-- 5.5 更新 contract_logs

UPDATE contract_logs cl
SET contract_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contracts' AND cl.contract_id = m.old_uuid;

UPDATE contract_logs cl
SET original_member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND cl.original_member_id = m.old_uuid;

UPDATE contract_logs cl
SET target_member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND cl.target_member_id = m.old_uuid;

UPDATE contract_logs cl
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cl.created_by = m.old_uuid;

UPDATE contract_logs cl
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contract_logs' AND cl.id = m.old_uuid;

-- 5.6 更新 payments

UPDATE payments p
SET contract_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contracts' AND p.contract_id = m.old_uuid;

UPDATE payments p
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND p.member_id = m.old_uuid;

UPDATE payments p
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND p.branch_id = m.old_uuid;

UPDATE payments p
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND p.created_by = m.old_uuid;

UPDATE payments p
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'payments' AND p.id = m.old_uuid;

-- 5.7 更新 attendances

UPDATE attendances a
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND a.employee_id = m.old_uuid;

UPDATE attendances a
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND a.branch_id = m.old_uuid;

UPDATE attendances a
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'attendances' AND a.id = m.old_uuid;

-- 5.8 更新 leave_requests

UPDATE leave_requests lr
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND lr.employee_id = m.old_uuid;

UPDATE leave_requests lr
SET approver_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND lr.approver_id = m.old_uuid;

UPDATE leave_requests lr
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'leave_requests' AND lr.id = m.old_uuid;

-- 5.9 更新 class_bookings

UPDATE class_bookings cb
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND cb.member_id = m.old_uuid;

UPDATE class_bookings cb
SET contract_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contracts' AND cb.contract_id = m.old_uuid;

UPDATE class_bookings cb
SET coach_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cb.coach_id = m.old_uuid;

UPDATE class_bookings cb
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND cb.branch_id = m.old_uuid;

UPDATE class_bookings cb
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'class_bookings' AND cb.id = m.old_uuid;

-- 5.10 更新 class_records

UPDATE class_records cr
SET booking_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'class_bookings' AND cr.booking_id = m.old_uuid;

UPDATE class_records cr
SET coach_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cr.coach_id = m.old_uuid;

UPDATE class_records cr
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND cr.member_id = m.old_uuid;

UPDATE class_records cr
SET deleted_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cr.deleted_by = m.old_uuid;

UPDATE class_records cr
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'class_records' AND cr.id = m.old_uuid;

-- 5.11 更新 coach_schedules

UPDATE coach_schedules cs
SET coach_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cs.coach_id = m.old_uuid;

UPDATE coach_schedules cs
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND cs.branch_id = m.old_uuid;

UPDATE coach_schedules cs
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'coach_schedules' AND cs.id = m.old_uuid;

-- 5.12 更新 teaching_materials

UPDATE teaching_materials tm
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND tm.created_by = m.old_uuid;

UPDATE teaching_materials tm
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'teaching_materials' AND tm.id = m.old_uuid;

-- 5.13 更新 member_coaches

UPDATE member_coaches mc
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND mc.member_id = m.old_uuid;

UPDATE member_coaches mc
SET coach_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND mc.coach_id = m.old_uuid;

UPDATE member_coaches mc
SET assigned_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND mc.assigned_by = m.old_uuid;

UPDATE member_coaches mc
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'member_coaches' AND mc.id = m.old_uuid;

-- 5.14 更新 work_schedules

UPDATE work_schedules ws
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND ws.employee_id = m.old_uuid;

UPDATE work_schedules ws
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND ws.branch_id = m.old_uuid;

UPDATE work_schedules ws
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND ws.created_by = m.old_uuid;

UPDATE work_schedules ws
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'work_schedules' AND ws.id = m.old_uuid;

-- 5.15 更新 performance_reviews

UPDATE performance_reviews pr
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND pr.employee_id = m.old_uuid;

UPDATE performance_reviews pr
SET reviewer_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND pr.reviewer_id = m.old_uuid;

UPDATE performance_reviews pr
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'performance_reviews' AND pr.id = m.old_uuid;

-- 5.16 更新 salary_records

UPDATE salary_records sr
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND sr.employee_id = m.old_uuid;

UPDATE salary_records sr
SET approved_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND sr.approved_by = m.old_uuid;

UPDATE salary_records sr
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'salary_records' AND sr.id = m.old_uuid;

-- 5.17 更新 promotion_records

UPDATE promotion_records prom
SET employee_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND prom.employee_id = m.old_uuid;

UPDATE promotion_records prom
SET from_job_title_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'job_titles' AND prom.from_job_title_id = m.old_uuid;

UPDATE promotion_records prom
SET to_job_title_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'job_titles' AND prom.to_job_title_id = m.old_uuid;

UPDATE promotion_records prom
SET from_branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND prom.from_branch_id = m.old_uuid;

UPDATE promotion_records prom
SET to_branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND prom.to_branch_id = m.old_uuid;

UPDATE promotion_records prom
SET approved_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND prom.approved_by = m.old_uuid;

UPDATE promotion_records prom
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'promotion_records' AND prom.id = m.old_uuid;

-- 5.18 更新 leads

UPDATE leads l
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND l.branch_id = m.old_uuid;

UPDATE leads l
SET assigned_to = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND l.assigned_to = m.old_uuid;

UPDATE leads l
SET converted_member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND l.converted_member_id = m.old_uuid;

UPDATE leads l
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'leads' AND l.id = m.old_uuid;

-- 5.19 更新 lead_activities

UPDATE lead_activities la
SET lead_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'leads' AND la.lead_id = m.old_uuid;

UPDATE lead_activities la
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND la.created_by = m.old_uuid;

UPDATE lead_activities la
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'lead_activities' AND la.id = m.old_uuid;

-- 5.20 更新 campaigns

UPDATE campaigns camp
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND camp.created_by = m.old_uuid;

UPDATE campaigns camp
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'campaigns' AND camp.id = m.old_uuid;

-- 5.21 更新 coupons

UPDATE coupons cp
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cp.created_by = m.old_uuid;

UPDATE coupons cp
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'coupons' AND cp.id = m.old_uuid;

-- 5.22 更新 coupon_usages

UPDATE coupon_usages cu
SET coupon_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'coupons' AND cu.coupon_id = m.old_uuid;

UPDATE coupon_usages cu
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND cu.member_id = m.old_uuid;

UPDATE coupon_usages cu
SET contract_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'contracts' AND cu.contract_id = m.old_uuid;

UPDATE coupon_usages cu
SET used_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND cu.used_by = m.old_uuid;

UPDATE coupon_usages cu
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'coupon_usages' AND cu.id = m.old_uuid;

-- 5.23 更新 marketing_assets

UPDATE marketing_assets ma
SET created_by = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND ma.created_by = m.old_uuid;

UPDATE marketing_assets ma
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'marketing_assets' AND ma.id = m.old_uuid;

-- 5.24 更新 member_goals

UPDATE member_goals mg
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND mg.member_id = m.old_uuid;

UPDATE member_goals mg
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'member_goals' AND mg.id = m.old_uuid;

-- 5.25 更新 issue_reports

UPDATE issue_reports ir
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND ir.member_id = m.old_uuid;

UPDATE issue_reports ir
SET branch_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'branches' AND ir.branch_id = m.old_uuid;

UPDATE issue_reports ir
SET assigned_to = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'employees' AND ir.assigned_to = m.old_uuid;

UPDATE issue_reports ir
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'issue_reports' AND ir.id = m.old_uuid;

-- 5.26 更新 body_measurements

UPDATE body_measurements bm
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND bm.member_id = m.old_uuid;

UPDATE body_measurements bm
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'body_measurements' AND bm.id = m.old_uuid;

-- 5.27 更新 workout_logs

UPDATE workout_logs wl
SET member_id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'members' AND wl.member_id = m.old_uuid;

UPDATE workout_logs wl
SET id = m.new_uuid
FROM _uuid_migration_map m
WHERE m.table_name = 'workout_logs' AND wl.id = m.old_uuid;

-- 重新啟用觸發器
SET session_replication_role = DEFAULT;

-- =====================================================
-- 6. 更新表的默認值為 gen_uuid_v7()
-- =====================================================

ALTER TABLE branches ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE job_titles ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE employees ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE members ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE membership_plans ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE contracts ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE contract_logs ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE payments ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE attendances ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE leave_requests ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE class_bookings ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE class_records ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE coach_schedules ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE teaching_materials ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE member_coaches ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE work_schedules ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE performance_reviews ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE salary_records ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE promotion_records ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE leads ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE lead_activities ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE campaigns ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE coupons ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE coupon_usages ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE marketing_assets ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE member_goals ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE issue_reports ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE body_measurements ALTER COLUMN id SET DEFAULT gen_uuid_v7();
ALTER TABLE workout_logs ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- =====================================================
-- 7. 驗證遷移結果
-- =====================================================

DO $$
DECLARE
    v_table TEXT;
    v_count INTEGER;
    v_non_v7 INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UUID v7 Migration Verification';
    RAISE NOTICE '========================================';

    FOR v_table IN
        SELECT unnest(ARRAY[
            'branches', 'job_titles', 'employees', 'members', 'membership_plans',
            'contracts', 'contract_logs', 'payments', 'attendances', 'leave_requests',
            'class_bookings', 'class_records', 'coach_schedules', 'teaching_materials',
            'member_coaches', 'work_schedules', 'performance_reviews', 'salary_records',
            'promotion_records', 'leads', 'lead_activities', 'campaigns', 'coupons',
            'coupon_usages', 'marketing_assets', 'member_goals', 'issue_reports',
            'body_measurements', 'workout_logs'
        ])
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_count;
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE NOT is_uuid_v7(id)', v_table) INTO v_non_v7;

        IF v_non_v7 > 0 THEN
            RAISE WARNING '  %: % records, % NOT UUID v7', v_table, v_count, v_non_v7;
        ELSE
            RAISE NOTICE '  %: % records, all UUID v7', v_table, v_count;
        END IF;
    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration Complete at %', NOW();
    RAISE NOTICE '========================================';
END;
$$;

-- =====================================================
-- 8. 清理（可選：遷移成功後執行）
-- =====================================================

-- 如果確認遷移成功，可以刪除映射表
-- DROP TABLE IF EXISTS _uuid_migration_map;
-- DROP FUNCTION IF EXISTS migrate_table_to_uuid_v7(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS gen_uuid_v7_from_timestamp(TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS is_uuid_v7(uuid);

-- 保留輔助函數供日後使用
COMMENT ON TABLE _uuid_migration_map IS
'UUID v4 到 UUID v7 的映射表。遷移成功驗證後可刪除。';
