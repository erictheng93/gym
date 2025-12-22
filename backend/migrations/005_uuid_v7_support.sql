-- =====================================================
-- UUID v7 支援
-- 為 Gym Nexus 實現時間排序的 UUID 生成策略
-- =====================================================

-- 確保 pgcrypto 擴展已啟用（用於 gen_random_bytes）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- UUID v7 生成函數
-- 結構：TTTTTTTT-TTTT-7RRR-RRRR-RRRRRRRRRRRR
-- 前 48 位：Unix 毫秒時間戳
-- 版本位：7
-- 變體位：RFC 9562 (10xx)
-- 其餘：隨機位

CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    unix_ts_ms BIGINT;
    uuid_bytes BYTEA;
BEGIN
    -- 取得當前 Unix 毫秒時間戳
    unix_ts_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

    -- 先生成 16 bytes 隨機數
    uuid_bytes := gen_random_bytes(16);

    -- 覆寫前 6 bytes 為時間戳 (big-endian)
    uuid_bytes := set_byte(uuid_bytes, 0, ((unix_ts_ms >> 40) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 1, ((unix_ts_ms >> 32) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 2, ((unix_ts_ms >> 24) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 3, ((unix_ts_ms >> 16) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 4, ((unix_ts_ms >> 8) & 255)::INT);
    uuid_bytes := set_byte(uuid_bytes, 5, (unix_ts_ms & 255)::INT);

    -- 設定版本 (byte 6 高 4 位 = 0111 = 7)
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);

    -- 設定變體 (byte 8 高 2 位 = 10)
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);

    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

-- 為 gen_uuid_v7 添加註解
COMMENT ON FUNCTION gen_uuid_v7() IS
'生成 UUID v7 (RFC 9562)
- 時間有序：前 48 位為 Unix 毫秒時間戳
- 優化索引：比 UUID v4 的 B-tree 索引效率高 30-50%
- 全球唯一：支援分布式生成
- 用法：SELECT gen_uuid_v7();';

-- 從 UUID v7 提取時間戳
CREATE OR REPLACE FUNCTION uuid_v7_to_timestamp(uuid_val uuid)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    uuid_hex TEXT;
    unix_ts_ms BIGINT;
BEGIN
    uuid_hex := replace(uuid_val::text, '-', '');

    -- 驗證是否為 UUID v7
    IF substring(uuid_hex from 13 for 1) != '7' THEN
        RETURN NULL;
    END IF;

    -- 提取前 48 位（12 個十六進位字元）
    unix_ts_ms := ('x' || substring(uuid_hex from 1 for 12))::bit(48)::bigint;

    RETURN to_timestamp(unix_ts_ms / 1000.0);
END;
$$;

COMMENT ON FUNCTION uuid_v7_to_timestamp(uuid) IS
'從 UUID v7 提取創建時間
- 返回 TIMESTAMPTZ
- 若非 UUID v7 則返回 NULL
- 用法：SELECT uuid_v7_to_timestamp(id) FROM members;';

-- =====================================================
-- 更新現有表格的默認值
-- 將 gen_random_uuid() 替換為 gen_uuid_v7()
-- =====================================================

-- 注意：以下操作會更改現有表格的默認 ID 生成策略
-- 現有資料不受影響，只影響新插入的記錄

-- 會員表
ALTER TABLE members
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 員工表
ALTER TABLE employees
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 合約表
ALTER TABLE contracts
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 合約記錄表
ALTER TABLE contract_logs
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 付款表
ALTER TABLE payments
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 分店表
ALTER TABLE branches
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 會籍方案表
ALTER TABLE membership_plans
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- 職稱表
ALTER TABLE job_titles
    ALTER COLUMN id SET DEFAULT gen_uuid_v7();

-- =====================================================
-- 驗證函數
-- =====================================================

DO $$
DECLARE
    test_uuid uuid;
    extracted_ts timestamptz;
BEGIN
    test_uuid := gen_uuid_v7();
    extracted_ts := uuid_v7_to_timestamp(test_uuid);

    RAISE NOTICE 'UUID v7 Migration Complete:';
    RAISE NOTICE '  Generated: %', test_uuid;
    RAISE NOTICE '  Timestamp: %', extracted_ts;
    RAISE NOTICE '  Version: %', substring(replace(test_uuid::text, '-', '') from 13 for 1);

    IF ABS(EXTRACT(EPOCH FROM (extracted_ts - now()))) > 1 THEN
        RAISE WARNING 'Timestamp extraction may be inaccurate';
    ELSE
        RAISE NOTICE '  ✓ All checks passed';
    END IF;
END;
$$;
