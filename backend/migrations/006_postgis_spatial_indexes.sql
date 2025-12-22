-- ============================================
-- PostGIS 地理空間與範圍索引 Migration
-- 版本: 006
-- 日期: 2025-12-21
-- 說明:
--   1. 啟用 PostGIS 和 btree_gist 擴展
--   2. 分店地理位置欄位與索引（跨店距離查詢）
--   3. 合約有效期範圍索引（日期範圍查詢優化）
--   4. 休假日期範圍與排他約束（防止重疊）
--   5. 輔助函數與觸發器
-- 相依: 005_optimize_indexes.sql
-- 注意: 需要 PostgreSQL 安裝 PostGIS 擴展
-- ============================================

BEGIN;

-- ============================================
-- 1. 啟用必要擴展
-- ============================================
-- PostGIS: 地理空間資料支援
CREATE EXTENSION IF NOT EXISTS postgis;

-- btree_gist: 支援在 GiST 索引中使用標準類型（用於排他約束）
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- 2. 分店地理位置
-- ============================================

-- 2.1 新增經緯度和 PostGIS 地理位置欄位
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

COMMENT ON COLUMN branches.latitude IS '分店緯度（WGS84）';
COMMENT ON COLUMN branches.longitude IS '分店經度（WGS84）';
COMMENT ON COLUMN branches.location IS 'PostGIS 地理位置點（自動從經緯度同步）';

-- 2.2 觸發器：自動同步經緯度到 location 欄位
CREATE OR REPLACE FUNCTION sync_branch_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(
            ST_MakePoint(NEW.longitude, NEW.latitude),
            4326
        )::geography;
    ELSE
        NEW.location = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_branch_location ON branches;
CREATE TRIGGER trg_sync_branch_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON branches
    FOR EACH ROW EXECUTE FUNCTION sync_branch_location();

-- 2.3 GiST 空間索引
CREATE INDEX IF NOT EXISTS idx_branches_location_gist
    ON branches USING GIST (location);

-- 2.4 輔助函數：查詢附近分店
CREATE OR REPLACE FUNCTION find_nearby_branches(
    p_lng DECIMAL,
    p_lat DECIMAL,
    p_radius_meters INTEGER DEFAULT 10000,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    branch_id UUID,
    branch_name VARCHAR(255),
    distance_meters DOUBLE PRECISION,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        ST_Distance(
            b.location,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) AS distance_meters,
        b.latitude,
        b.longitude
    FROM branches b
    WHERE b.status = 'active'
        AND b.location IS NOT NULL
        AND ST_DWithin(
            b.location,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            p_radius_meters
        )
    ORDER BY b.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_nearby_branches IS '查詢指定位置附近的分店，預設 10 公里內，最多 10 家';

-- ============================================
-- 3. 合約有效期範圍
-- ============================================

-- 3.1 新增日期範圍欄位
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS valid_period daterange;

COMMENT ON COLUMN contracts.valid_period IS '合約有效期範圍（自動從 start_date/end_date 同步）';

-- 3.2 觸發器：自動同步日期到 valid_period
CREATE OR REPLACE FUNCTION sync_contract_period()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.start_date IS NOT NULL THEN
        -- 使用 '[]' 表示包含兩端
        NEW.valid_period = daterange(NEW.start_date, NEW.end_date, '[]');
    ELSE
        NEW.valid_period = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contract_period ON contracts;
CREATE TRIGGER trg_sync_contract_period
    BEFORE INSERT OR UPDATE OF start_date, end_date ON contracts
    FOR EACH ROW EXECUTE FUNCTION sync_contract_period();

-- 3.3 GiST 範圍索引
CREATE INDEX IF NOT EXISTS idx_contracts_period_gist
    ON contracts USING GIST (valid_period);

-- 3.4 複合索引：會員 + 有效期（查詢會員有效合約）
CREATE INDEX IF NOT EXISTS idx_contracts_member_period_gist
    ON contracts USING GIST (member_id, valid_period);

-- 3.5 複合索引：分店 + 有效期（分店報表）
CREATE INDEX IF NOT EXISTS idx_contracts_branch_period_gist
    ON contracts USING GIST (branch_id, valid_period);

-- 3.6 輔助函數：查詢某日期的有效合約
CREATE OR REPLACE FUNCTION get_active_contracts_on_date(
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    contract_id UUID,
    contract_no VARCHAR(30),
    member_id UUID,
    branch_id UUID,
    start_date DATE,
    end_date DATE,
    contract_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS contract_id,
        c.contract_no,
        c.member_id,
        c.branch_id,
        c.start_date,
        c.end_date,
        c.contract_status
    FROM contracts c
    WHERE c.valid_period @> p_date
        AND c.contract_status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_active_contracts_on_date IS '查詢指定日期的所有有效合約';

-- ============================================
-- 4. 休假日期範圍與排他約束
-- ============================================

-- 4.1 新增時間範圍欄位
ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS leave_period tstzrange;

COMMENT ON COLUMN leave_requests.leave_period IS '休假時間範圍（自動從 start_date/end_date 同步）';

-- 4.2 觸發器：自動同步日期到 leave_period
CREATE OR REPLACE FUNCTION sync_leave_period()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL THEN
        NEW.leave_period = tstzrange(NEW.start_date, NEW.end_date, '[]');
    ELSE
        NEW.leave_period = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_leave_period ON leave_requests;
CREATE TRIGGER trg_sync_leave_period
    BEFORE INSERT OR UPDATE OF start_date, end_date ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION sync_leave_period();

-- 4.3 GiST 索引
CREATE INDEX IF NOT EXISTS idx_leave_period_gist
    ON leave_requests USING GIST (leave_period);

-- 4.4 複合索引：員工 + 休假期間
CREATE INDEX IF NOT EXISTS idx_leave_employee_period_gist
    ON leave_requests USING GIST (employee_id, leave_period);

-- 4.5 排他約束：同一員工不能有重疊的已核准休假
-- 注意：這會在資料庫層面強制防止重疊
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'excl_no_overlapping_approved_leave'
    ) THEN
        ALTER TABLE leave_requests
        ADD CONSTRAINT excl_no_overlapping_approved_leave
        EXCLUDE USING GIST (
            employee_id WITH =,
            leave_period WITH &&
        ) WHERE (leave_status = 'APPROVED');
    END IF;
END $$;

COMMENT ON CONSTRAINT excl_no_overlapping_approved_leave ON leave_requests
    IS '排他約束：同一員工的已核准休假不能有時間重疊';

-- 4.6 輔助函數：檢查休假是否有衝突
CREATE OR REPLACE FUNCTION check_leave_conflict(
    p_employee_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_exclude_request_id UUID DEFAULT NULL
)
RETURNS TABLE (
    conflict_id UUID,
    conflict_type VARCHAR(20),
    conflict_start TIMESTAMPTZ,
    conflict_end TIMESTAMPTZ,
    conflict_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id AS conflict_id,
        lr.leave_type AS conflict_type,
        lr.start_date AS conflict_start,
        lr.end_date AS conflict_end,
        lr.leave_status AS conflict_status
    FROM leave_requests lr
    WHERE lr.employee_id = p_employee_id
        AND lr.leave_status IN ('PENDING', 'APPROVED')
        AND lr.leave_period && tstzrange(p_start_date, p_end_date, '[]')
        AND (p_exclude_request_id IS NULL OR lr.id != p_exclude_request_id);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_leave_conflict IS '檢查指定員工在指定時間範圍是否有休假衝突';

-- ============================================
-- 5. 課程/教室時段排他約束（未來擴展用）
-- ============================================
-- 預留結構，當新增課程表時可使用

-- 範例：
-- ALTER TABLE class_schedules
-- ADD CONSTRAINT excl_no_overlapping_classes
-- EXCLUDE USING GIST (
--     room_id WITH =,
--     tstzrange(start_time, end_time, '[]') WITH &&
-- );

-- ============================================
-- 6. 更新現有資料
-- ============================================

-- 6.1 同步現有合約的 valid_period
UPDATE contracts
SET valid_period = daterange(start_date, end_date, '[]')
WHERE valid_period IS NULL
    AND start_date IS NOT NULL;

-- 6.2 同步現有休假的 leave_period
UPDATE leave_requests
SET leave_period = tstzrange(start_date, end_date, '[]')
WHERE leave_period IS NULL
    AND start_date IS NOT NULL
    AND end_date IS NOT NULL;

-- ============================================
-- 7. 分店範例座標（台灣主要城市）
-- ============================================
-- 這些是範例座標，實際部署時需要更新為真實位置

-- 台北信義區
UPDATE branches SET latitude = 25.0330, longitude = 121.5654
WHERE name LIKE '%信義%' AND latitude IS NULL;

-- 台北大安區
UPDATE branches SET latitude = 25.0267, longitude = 121.5437
WHERE name LIKE '%大安%' AND latitude IS NULL;

-- 新北板橋
UPDATE branches SET latitude = 25.0145, longitude = 121.4627
WHERE name LIKE '%板橋%' AND latitude IS NULL;

-- 新北中和
UPDATE branches SET latitude = 24.9989, longitude = 121.4942
WHERE name LIKE '%中和%' AND latitude IS NULL;

-- 台中西屯
UPDATE branches SET latitude = 24.1815, longitude = 120.6468
WHERE name LIKE '%西屯%' AND latitude IS NULL;

-- 台中北屯
UPDATE branches SET latitude = 24.1827, longitude = 120.6864
WHERE name LIKE '%北屯%' AND latitude IS NULL;

-- 台南東區
UPDATE branches SET latitude = 22.9833, longitude = 120.2269
WHERE name LIKE '%東區%' AND latitude IS NULL;

-- 台南中西區
UPDATE branches SET latitude = 22.9917, longitude = 120.1967
WHERE name LIKE '%中西%' AND latitude IS NULL;

-- ============================================
-- 8. 驗證安裝
-- ============================================
DO $$
DECLARE
    postgis_version TEXT;
BEGIN
    SELECT PostGIS_Version() INTO postgis_version;
    RAISE NOTICE 'PostGIS 版本: %', postgis_version;
    RAISE NOTICE '地理空間索引已建立完成';
END $$;

COMMIT;
