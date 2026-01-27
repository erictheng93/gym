-- =====================================================
-- UUID v7 選擇性遷移
-- Migration: 026_uuid_v7_selective_migration.sql
-- 日期: 2026-01-27
-- 說明:
--   1. 將適合的表格遷移至 UUID v7
--   2. 保留安全敏感表格使用 UUID v4
--   3. 建立 UUID 版本選擇指南
-- =====================================================

BEGIN;

-- =====================================================
-- 1. 遷移至 UUID v7 的表格（業務/日誌表）
-- =====================================================

-- otp_send_logs（日誌表，時間有序有助於分析）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_send_logs') THEN
        EXECUTE 'ALTER TABLE otp_send_logs ALTER COLUMN id SET DEFAULT gen_uuid_v7()';
        RAISE NOTICE '已將 otp_send_logs 遷移至 UUID v7';
    END IF;
END $$;

-- member_social_accounts（業務表，索引效能受益）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_social_accounts') THEN
        EXECUTE 'ALTER TABLE member_social_accounts ALTER COLUMN id SET DEFAULT gen_uuid_v7()';
        RAISE NOTICE '已將 member_social_accounts 遷移至 UUID v7';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已將適合的表格遷移至 UUID v7'; END $$;

-- =====================================================
-- 2. 明確保留 UUID v4 的表格（安全考量）
-- =====================================================

-- otp_tokens：保留 UUID v4
-- 原因：
--   - OTP token 需要不可預測性
--   - UUID v7 的時間戳可被攻擊者利用縮小暴力破解範圍
--   - 安全性優先於索引效能

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_tokens') THEN
        -- 確保 otp_tokens 使用 gen_random_uuid()
        EXECUTE 'ALTER TABLE otp_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid()';
        RAISE NOTICE '已確認 otp_tokens 保留 UUID v4（安全考量）';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_tokens') THEN
        EXECUTE 'COMMENT ON TABLE otp_tokens IS ''OTP 驗證 Token（使用 UUID v4 以確保不可預測性）- 安全考量：此表不應使用 UUID v7，防止時序攻擊''';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 已確認安全敏感表格保留 UUID v4'; END $$;

-- =====================================================
-- 3. 建立 UUID 版本選擇指南（作為資料庫文檔）
-- =====================================================

-- 建立文檔表（如果不存在）
CREATE TABLE IF NOT EXISTS _schema_docs (
    id SERIAL PRIMARY KEY,
    doc_key VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入 UUID 選擇指南
INSERT INTO _schema_docs (doc_key, title, content)
VALUES (
    'uuid_version_guide',
    'UUID 版本選擇指南',
    '# UUID 版本選擇指南

## UUID v7 (gen_uuid_v7)
適用場景：
- 主鍵 ID（所有業務表）
- 日誌/審計記錄
- 時序資料
- 需要按創建時間排序的場景

優點：
- B-tree 索引效能高 30-50%
- 可從 ID 提取創建時間
- 順序插入減少頁面分裂

## UUID v4 (gen_random_uuid)
適用場景：
- OTP Token
- API Key
- Session Token
- Password Reset Token
- 任何需要不可預測性的 ID

原因：
- 完全隨機，無法推測
- 防止時序攻擊
- 安全性優先於效能

## Gym Nexus 表格分類

### 使用 UUID v7：
members, employees, contracts, payments, branches,
class_bookings, class_records, leads, attendances,
check_ins, tenants, audit_logs, otp_send_logs,
member_social_accounts, ...（大多數業務表）

### 使用 UUID v4：
otp_tokens（安全 Token）

### 注意事項：
1. 新建表格預設使用 gen_uuid_v7()
2. 安全相關表格必須使用 gen_random_uuid()
3. 對外暴露的 ID 需評估是否洩漏創建時間
'
) ON CONFLICT (doc_key) DO UPDATE
SET content = EXCLUDED.content,
    updated_at = NOW();

DO $$ BEGIN RAISE NOTICE '✅ 已建立 UUID 版本選擇指南文檔'; END $$;

-- =====================================================
-- 4. 驗證 UUID 版本配置
-- =====================================================

DO $$
DECLARE
    v_table_name TEXT;
    v_default_val TEXT;
    v_uuid_version TEXT;
    v_security_tables TEXT[] := ARRAY['otp_tokens'];
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UUID Version Configuration Summary';
    RAISE NOTICE '========================================';

    FOR v_table_name, v_default_val IN
        SELECT
            t.table_name,
            c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name = 'id'
          AND c.data_type = 'uuid'
          AND t.table_name NOT LIKE 'directus_%'
        ORDER BY t.table_name
    LOOP
        IF v_default_val LIKE '%gen_uuid_v7%' THEN
            v_uuid_version := 'v7';
        ELSIF v_default_val LIKE '%gen_random_uuid%' OR v_default_val LIKE '%uuid_generate_v4%' THEN
            v_uuid_version := 'v4';
        ELSE
            v_uuid_version := '? (custom/none)';
        END IF;

        -- 標記安全表格
        IF v_table_name = ANY(v_security_tables) THEN
            IF v_uuid_version = 'v4' THEN
                v_uuid_version := 'v4 [SECURITY - OK]';
            ELSE
                v_uuid_version := v_uuid_version || ' [WARNING: should use v4!]';
            END IF;
        END IF;

        RAISE NOTICE '  %: %', v_table_name, v_uuid_version;
    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 026 Complete';
    RAISE NOTICE '========================================';
END;
$$;

COMMIT;
