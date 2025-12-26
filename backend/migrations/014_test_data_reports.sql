-- ============================================
-- Migration 014: 報表測試資料生成
-- ============================================
-- 生成 30 天的考勤紀錄、休假申請、付款資料等用於報表測試

BEGIN;

-- ============================================
-- 1. 生成過去 30 天的員工考勤資料
-- ============================================
-- 為每個 ACTIVE 員工生成 20-25 天的打卡紀錄

INSERT INTO attendances (
    employee_id,
    attendance_date,
    check_in,
    check_out,
    work_hours,
    branch_id,
    check_type,
    late_minutes,
    early_leave_minutes,
    overtime_hours,
    attendance_status
)
SELECT
    e.id AS employee_id,
    (CURRENT_DATE - (random() * 30)::integer) AS attendance_date,
    -- Check-in 時間：8:30-9:30 之間（有些遲到）
    (CURRENT_DATE - (random() * 30)::integer)::timestamp +
        (TIME '08:30:00' + (random() * INTERVAL '1 hour')) AS check_in,
    -- Check-out 時間：17:30-19:00 之間
    (CURRENT_DATE - (random() * 30)::integer)::timestamp +
        (TIME '17:30:00' + (random() * INTERVAL '1.5 hours')) AS check_out,
    -- 工作時數：8-10 小時
    8 + (random() * 2)::numeric(5,2) AS work_hours,
    e.branch_id,
    (ARRAY['REGULAR', 'OVERTIME', 'MAKEUP'])[floor(random() * 3 + 1)] AS check_type,
    -- 遲到分鐘數：0-30 分鐘
    floor(random() * 30)::integer AS late_minutes,
    -- 早退分鐘數：0-15 分鐘
    floor(random() * 15)::integer AS early_leave_minutes,
    -- 加班時數：0-2 小時
    (random() * 2)::numeric(5,2) AS overtime_hours,
    (ARRAY['PRESENT', 'LATE', 'EARLY_LEAVE'])[floor(random() * 3 + 1)] AS attendance_status
FROM employees e
CROSS JOIN generate_series(1, 23) -- 每人約 23 天的出勤記錄
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active';

-- 為部分員工添加請假/缺勤記錄
INSERT INTO attendances (
    employee_id,
    attendance_date,
    attendance_status,
    branch_id,
    notes
)
SELECT
    e.id,
    (CURRENT_DATE - (random() * 30)::integer) AS attendance_date,
    (ARRAY['ABSENT', 'LEAVE', 'HOLIDAY'])[floor(random() * 3 + 1)] AS attendance_status,
    e.branch_id,
    '系統自動生成的測試資料' AS notes
FROM employees e
CROSS JOIN generate_series(1, 3) -- 每人 3 天的請假/缺勤
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active'
  AND random() < 0.5; -- 只有 50% 的員工有請假記錄

-- ============================================
-- 2. 生成更多休假申請案例（過去 30 天和未來 30 天）
-- ============================================

-- 已批准的休假申請
INSERT INTO leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    leave_status,
    approver_id,
    reason,
    days_requested,
    hours_requested,
    submitted_at,
    approved_at,
    is_half_day,
    half_day_type
)
SELECT
    e.id AS employee_id,
    (ARRAY['ANNUAL', 'SICK', 'PERSONAL'])[floor(random() * 3 + 1)] AS leave_type,
    -- 開始日期：過去 30 天或未來 30 天
    (CURRENT_DATE + ((random() * 60)::integer - 30)) AS start_date,
    -- 結束日期：開始日期 + 1-3 天
    (CURRENT_DATE + ((random() * 60)::integer - 30) + (random() * 3)::integer + 1) AS end_date,
    'APPROVED' AS leave_status,
    e.supervisor_id AS approver_id,
    (ARRAY['個人事務', '身體不適', '家庭因素', '年假', '醫療就診'])[floor(random() * 5 + 1)] AS reason,
    (random() * 3 + 1)::numeric(5,2) AS days_requested,
    ((random() * 3 + 1) * 8)::numeric(5,2) AS hours_requested,
    NOW() - (random() * INTERVAL '30 days') AS submitted_at,
    NOW() - (random() * INTERVAL '29 days') AS approved_at,
    random() < 0.2 AS is_half_day, -- 20% 的機率是半天假
    CASE WHEN random() < 0.5 THEN 'AM' ELSE 'PM' END AS half_day_type
FROM employees e
CROSS JOIN generate_series(1, 5) -- 每人 5 筆已批准的休假
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active'
  AND e.supervisor_id IS NOT NULL
  AND random() < 0.7; -- 70% 的員工有休假記錄

-- 待審核的休假申請
INSERT INTO leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    leave_status,
    approver_id,
    reason,
    days_requested,
    hours_requested,
    submitted_at,
    is_half_day,
    half_day_type
)
SELECT
    e.id,
    (ARRAY['ANNUAL', 'SICK', 'PERSONAL', 'BEREAVEMENT'])[floor(random() * 4 + 1)] AS leave_type,
    CURRENT_DATE + ((random() * 30)::integer + 1) AS start_date,
    CURRENT_DATE + ((random() * 30)::integer + (random() * 2)::integer + 2) AS end_date,
    'PENDING' AS leave_status,
    e.supervisor_id,
    (ARRAY['家庭聚會', '私人事務', '就醫', '喪假', '婚假'])[floor(random() * 5 + 1)] AS reason,
    (random() * 2 + 1)::numeric(5,2) AS days_requested,
    ((random() * 2 + 1) * 8)::numeric(5,2) AS hours_requested,
    NOW() - (random() * INTERVAL '5 days') AS submitted_at,
    random() < 0.3 AS is_half_day,
    CASE WHEN random() < 0.5 THEN 'AM' ELSE 'PM' END
FROM employees e
CROSS JOIN generate_series(1, 2) -- 每人 2 筆待審核
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active'
  AND e.supervisor_id IS NOT NULL
  AND random() < 0.4; -- 40% 的員工有待審核的休假

-- 已拒絕的休假申請
INSERT INTO leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    leave_status,
    approver_id,
    reason,
    days_requested,
    submitted_at,
    approval_notes
)
SELECT
    e.id,
    (ARRAY['ANNUAL', 'PERSONAL'])[floor(random() * 2 + 1)],
    CURRENT_DATE + ((random() * 20)::integer + 1),
    CURRENT_DATE + ((random() * 20)::integer + 2),
    'REJECTED',
    e.supervisor_id,
    '臨時請假' AS reason,
    1,
    NOW() - (random() * INTERVAL '10 days'),
    (ARRAY['人手不足', '已有其他同仁請假', '重要會議', '業務繁忙期'])[floor(random() * 4 + 1)]
FROM employees e
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active'
  AND e.supervisor_id IS NOT NULL
  AND random() < 0.15; -- 15% 的員工有被拒絕的休假

-- ============================================
-- 3. 生成過去 30 天的付款資料（用於營收報表）
-- ============================================

-- 生成合約付款資料
INSERT INTO payments (
    contract_id,
    member_id,
    amount,
    payment_method,
    payment_date,
    payment_type,
    branch_id,
    received_by,
    notes
)
SELECT
    c.id AS contract_id,
    c.member_id,
    -- 金額：15000 - 50000
    (15000 + random() * 35000)::numeric(12,2) AS amount,
    (ARRAY['CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'LINE_PAY'])[floor(random() * 4 + 1)] AS payment_method,
    -- 付款日期：過去 30 天
    (NOW() - (random() * INTERVAL '30 days'))::timestamp AS payment_date,
    -- 95% 是收入，5% 是退款
    CASE WHEN random() < 0.95 THEN 'INCOME' ELSE 'REFUND' END AS payment_type,
    c.branch_id,
    -- 隨機選擇一個該分店的員工作為收款人
    (SELECT e.id FROM employees e WHERE e.branch_id = c.branch_id AND e.status = 'active' ORDER BY random() LIMIT 1),
    '測試資料' AS notes
FROM contracts c
CROSS JOIN generate_series(1, 2) -- 每個合約平均 2 筆付款記錄
WHERE c.status = 'active'
  AND c.contract_status IN ('ACTIVE', 'PAUSED')
  AND random() < 0.6; -- 60% 的合約有付款記錄

-- 生成零星付款（無合約關聯）
INSERT INTO payments (
    member_id,
    amount,
    payment_method,
    payment_date,
    payment_type,
    branch_id,
    received_by,
    notes
)
SELECT
    m.id,
    (500 + random() * 2000)::numeric(12,2) AS amount,
    (ARRAY['CASH', 'CREDIT_CARD', 'LINE_PAY'])[floor(random() * 3 + 1)],
    (NOW() - (random() * INTERVAL '30 days'))::timestamp,
    'INCOME',
    m.branch_id,
    (SELECT e.id FROM employees e WHERE e.branch_id = m.branch_id AND e.status = 'active' ORDER BY random() LIMIT 1),
    (ARRAY['置物櫃租賃', '教練課程', '運動用品', '飲料銷售', '補充品'])[floor(random() * 5 + 1)]
FROM members m
WHERE m.status = 'active'
  AND m.member_status = 'ACTIVE'
  AND random() < 0.3; -- 30% 的會員有零星消費

-- ============================================
-- 4. 生成過去 30 天的會員入場紀錄（member_checkins）
-- ============================================
-- 注意：migration 012 已經生成了過去 7 天的資料，這裡補充 8-30 天前的資料

INSERT INTO member_checkins (
    member_id,
    contract_id,
    branch_id,
    check_time,
    check_type,
    verification_method,
    is_cross_branch,
    location_ip
)
SELECT
    m.id AS member_id,
    -- 找到該會員的有效合約
    (SELECT c.id FROM contracts c
     WHERE c.member_id = m.id
       AND c.contract_status = 'ACTIVE'
       AND c.status = 'active'
     LIMIT 1) AS contract_id,
    -- 90% 在主分店，10% 跨分店
    CASE
        WHEN random() < 0.9 THEN m.branch_id
        ELSE (SELECT id FROM branches WHERE id != m.branch_id ORDER BY random() LIMIT 1)
    END AS branch_id,
    -- 入場時間：8-30 天前，每天 6:00-22:00 之間
    (CURRENT_DATE - ((random() * 23)::integer + 7))::timestamp +
        (TIME '06:00:00' + (random() * INTERVAL '16 hours')) AS check_time,
    'ENTRY' AS check_type,
    (ARRAY['QR_CODE', 'MANUAL', 'BARCODE', 'FACE_ID'])[floor(random() * 4 + 1)] AS verification_method,
    random() < 0.1 AS is_cross_branch, -- 10% 是跨分店入場
    '192.168.' || floor(random() * 255)::text || '.' || floor(random() * 255)::text AS location_ip
FROM members m
CROSS JOIN generate_series(1, 12) -- 每個會員平均 12 次入場（23天內）
WHERE m.status = 'active'
  AND m.member_status = 'ACTIVE'
  AND random() < 0.8; -- 80% 的活躍會員有入場記錄

-- ============================================
-- 5. 生成過去 30 天的新會員資料（用於會員成長報表）
-- ============================================
-- 每天新增 2-5 個會員

DO $$
DECLARE
    day_offset INTEGER;
    new_members_count INTEGER;
    branch_ids UUID[];
    sales_person_ids UUID[];
BEGIN
    -- 獲取所有分店 ID
    SELECT ARRAY_AGG(id) INTO branch_ids FROM branches WHERE status = 'active';

    -- 獲取所有銷售員工 ID
    SELECT ARRAY_AGG(id) INTO sales_person_ids FROM employees WHERE status = 'active' AND employment_status = 'ACTIVE';

    -- 為每一天生成新會員
    FOR day_offset IN 1..30 LOOP
        new_members_count := 2 + floor(random() * 4)::integer; -- 2-5 個新會員

        FOR i IN 1..new_members_count LOOP
            INSERT INTO members (
                member_code,
                full_name,
                phone,
                email,
                branch_id,
                member_status,
                join_date,
                sales_person_id,
                gender,
                birthday,
                date_created
            ) VALUES (
                'M' || LPAD((1000000 + floor(random() * 900000))::text, 7, '0'),
                (ARRAY['王小明', '李小華', '陳大同', '林美玲', '張志明', '黃小芳', '劉建成', '吳淑芬', '鄭雅文', '謝志豪'])[floor(random() * 10 + 1)] ||
                    floor(random() * 100)::text,
                '09' || LPAD(floor(random() * 100000000)::text, 8, '0'),
                'test' || floor(random() * 1000000)::text || '@example.com',
                branch_ids[1 + floor(random() * array_length(branch_ids, 1))::integer],
                'ACTIVE',
                CURRENT_DATE - day_offset,
                sales_person_ids[1 + floor(random() * array_length(sales_person_ids, 1))::integer],
                (ARRAY['MALE', 'FEMALE'])[floor(random() * 2 + 1)],
                DATE '1980-01-01' + (random() * 14600)::integer, -- 1980-2020 之間
                NOW() - (day_offset || ' days')::interval
            );
        END LOOP;
    END LOOP;

    RAISE NOTICE '已生成 30 天的新會員資料';
END $$;

-- ============================================
-- 6. 更新休假餘額資料
-- ============================================
-- 為所有員工生成當年度的休假餘額

INSERT INTO leave_balances (
    employee_id,
    leave_type,
    year,
    total_days,
    used_days,
    pending_days,
    carried_over_days
)
SELECT
    e.id,
    leave_type,
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    -- 年假通常 7-14 天，病假 30 天，事假 14 天
    CASE leave_type
        WHEN 'ANNUAL' THEN 7 + floor(random() * 8)
        WHEN 'SICK' THEN 30
        WHEN 'PERSONAL' THEN 14
        ELSE 7
    END AS total_days,
    -- 已使用天數
    floor(random() * 5)::numeric(5,2) AS used_days,
    -- 待審核天數
    floor(random() * 2)::numeric(5,2) AS pending_days,
    -- 去年結轉天數
    CASE WHEN random() < 0.3 THEN floor(random() * 3) ELSE 0 END AS carried_over_days
FROM employees e
CROSS JOIN (SELECT unnest(ARRAY['ANNUAL', 'SICK', 'PERSONAL']) AS leave_type) lt
WHERE e.employment_status = 'ACTIVE'
  AND e.status = 'active'
ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

COMMIT;

-- ============================================
-- 驗證查詢
-- ============================================
-- 1. 查看過去 30 天的考勤統計
-- SELECT
--     COUNT(*) AS total_records,
--     COUNT(DISTINCT employee_id) AS unique_employees,
--     AVG(work_hours) AS avg_work_hours,
--     COUNT(CASE WHEN attendance_status = 'LATE' THEN 1 END) AS late_count
-- FROM attendances
-- WHERE attendance_date >= CURRENT_DATE - 30;

-- 2. 查看休假申請統計
-- SELECT
--     leave_status,
--     COUNT(*) AS count,
--     SUM(days_requested) AS total_days
-- FROM leave_requests
-- GROUP BY leave_status;

-- 3. 查看過去 30 天的營收統計
-- SELECT
--     DATE(payment_date) AS day,
--     COUNT(*) AS transactions,
--     SUM(amount) AS total
-- FROM payments
-- WHERE payment_date >= CURRENT_DATE - 30
--   AND payment_type = 'INCOME'
-- GROUP BY DATE(payment_date)
-- ORDER BY day DESC;

-- 4. 查看會員成長統計
-- SELECT
--     DATE(date_created) AS join_day,
--     COUNT(*) AS new_members
-- FROM members
-- WHERE date_created >= CURRENT_DATE - 30
-- GROUP BY DATE(date_created)
-- ORDER BY join_day DESC;
