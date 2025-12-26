-- ============================================
-- Migration 012: 會員入場系統 (Check-in System)
-- ============================================
-- 建立會員入場紀錄資料表，用於追蹤會員到店打卡

BEGIN;

-- ============================================
-- 1. 建立 check_ins 資料表
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    -- 基本欄位
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE,

    -- 入場資訊
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 入場方式
    check_in_method VARCHAR(20) NOT NULL CHECK (check_in_method IN (
        'QR_CODE',      -- QR Code 掃描
        'MANUAL',       -- 手動輸入會員編號
        'CARD',         -- 會員卡感應
        'BIOMETRIC'     -- 生物識別（預留）
    )),

    -- 地點資訊
    location_ip VARCHAR(50),       -- IP 位址
    location_device VARCHAR(100),  -- 裝置資訊

    -- 額外資訊
    notes TEXT,

    -- 索引優化
    CONSTRAINT fk_check_ins_member FOREIGN KEY (member_id) REFERENCES members(id),
    CONSTRAINT fk_check_ins_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 2. 建立索引（效能優化）
-- ============================================
-- 按會員查詢入場紀錄
CREATE INDEX IF NOT EXISTS idx_check_ins_member_id ON check_ins(member_id);

-- 按分店查詢入場紀錄
CREATE INDEX IF NOT EXISTS idx_check_ins_branch_id ON check_ins(branch_id);

-- 按時間範圍查詢（常用於報表）
CREATE INDEX IF NOT EXISTS idx_check_ins_time ON check_ins(check_in_time DESC);

-- 複合索引：按分店+時間查詢
CREATE INDEX IF NOT EXISTS idx_check_ins_branch_time ON check_ins(branch_id, check_in_time DESC);

-- 複合索引：按會員+時間查詢
CREATE INDEX IF NOT EXISTS idx_check_ins_member_time ON check_ins(member_id, check_in_time DESC);

-- ============================================
-- 3. 插入測試資料（過去 7 天的入場紀錄）
-- ============================================
-- 為每個會員隨機生成 2-5 次入場紀錄

-- 台北信義店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id AS member_id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days') AS check_in_time,
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)] AS check_in_method,
    '192.168.1.' || floor(random() * 254 + 1)::text AS location_ip
FROM members m
CROSS JOIN generate_series(1, 3) -- 每人 3 次入場
WHERE m.branch_id = '22222222-2222-2222-2222-222222222222' -- 台北信義店
  AND m.member_status = 'ACTIVE';

-- 台北大安店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.2.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '33333333-3333-3333-3333-333333333333'
  AND m.member_status = 'ACTIVE';

-- 新北板橋店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.3.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '44444444-4444-4444-4444-444444444444'
  AND m.member_status = 'ACTIVE';

-- 新北中和店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.4.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '55555555-5555-5555-5555-555555555555'
  AND m.member_status = 'ACTIVE';

-- 台中西屯店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.5.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '66666666-6666-6666-6666-666666666666'
  AND m.member_status = 'ACTIVE';

-- 台中北屯店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.6.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '77777777-7777-7777-7777-777777777777'
  AND m.member_status = 'ACTIVE';

-- 台南東區店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.7.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '88888888-8888-8888-8888-888888888888'
  AND m.member_status = 'ACTIVE';

-- 台南中西店會員入場紀錄
INSERT INTO check_ins (member_id, branch_id, check_in_time, check_in_method, location_ip)
SELECT
    m.id,
    m.branch_id,
    NOW() - (random() * INTERVAL '7 days'),
    (ARRAY['QR_CODE', 'MANUAL', 'CARD'])[floor(random() * 3 + 1)],
    '192.168.8.' || floor(random() * 254 + 1)::text
FROM members m
CROSS JOIN generate_series(1, 3)
WHERE m.branch_id = '99999999-9999-9999-9999-999999999999'
  AND m.member_status = 'ACTIVE';

COMMIT;

-- ============================================
-- 驗證查詢 (Verification Queries)
-- ============================================

-- 查詢 1：檢查入場紀錄總數
-- SELECT COUNT(*) AS total_check_ins FROM check_ins;

-- 查詢 2：按分店統計入場次數
-- SELECT
--     b.name AS branch_name,
--     COUNT(c.id) AS check_in_count,
--     COUNT(DISTINCT c.member_id) AS unique_members
-- FROM check_ins c
-- JOIN branches b ON b.id = c.branch_id
-- WHERE c.check_in_time >= NOW() - INTERVAL '7 days'
-- GROUP BY b.id, b.name
-- ORDER BY check_in_count DESC;

-- 查詢 3：查看今日入場紀錄
-- SELECT
--     c.check_in_time,
--     m.full_name,
--     m.member_code,
--     b.name AS branch_name,
--     c.check_in_method
-- FROM check_ins c
-- JOIN members m ON m.id = c.member_id
-- JOIN branches b ON b.id = c.branch_id
-- WHERE DATE(c.check_in_time) = CURRENT_DATE
-- ORDER BY c.check_in_time DESC;

-- 查詢 4：會員入場頻率分析
-- SELECT
--     m.full_name,
--     m.member_code,
--     COUNT(c.id) AS check_in_count,
--     MIN(c.check_in_time) AS first_check_in,
--     MAX(c.check_in_time) AS last_check_in
-- FROM members m
-- LEFT JOIN check_ins c ON c.member_id = m.id
-- WHERE c.check_in_time >= NOW() - INTERVAL '7 days'
-- GROUP BY m.id, m.full_name, m.member_code
-- ORDER BY check_in_count DESC
-- LIMIT 10;

-- 查詢 5：跨分店入場紀錄（檢測是否有會員在非主分店入場）
-- SELECT
--     m.full_name,
--     m.member_code,
--     mb.name AS primary_branch,
--     cb.name AS check_in_branch,
--     c.check_in_time
-- FROM check_ins c
-- JOIN members m ON m.id = c.member_id
-- JOIN branches mb ON mb.id = m.branch_id
-- JOIN branches cb ON cb.id = c.branch_id
-- WHERE m.branch_id != c.branch_id
-- ORDER BY c.check_in_time DESC;
