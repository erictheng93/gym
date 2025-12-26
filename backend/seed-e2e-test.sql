-- ============================================
-- Gym Nexus 端到端測試資料腳本
-- End-to-End Test Data Scenarios
-- ============================================
-- 目的：建立完整業務流程測試案例，驗證核心邏輯正確性
-- Purpose: Create complete business workflow test cases to verify core logic

BEGIN;

-- ============================================
-- 測試場景 1：新會員完整生命週期
-- Scenario 1: New Member Complete Lifecycle
-- ============================================
-- 新會員「王小明」從註冊到入場的完整流程

-- 1.1 新增會員
INSERT INTO members (
    id, status, date_created, member_code, full_name, phone, email,
    branch_id, member_status, join_date, sales_person_id, gender, birthday
) VALUES (
    'e2e00001-0001-0001-0001-000000000001',
    'active',
    NOW(),
    'M2025-TEST01',
    '王小明',
    '0988-123-456',
    'test.xiaoming@example.com',
    '22222222-2222-2222-2222-222222222222', -- 台北信義店
    'ACTIVE',
    CURRENT_DATE,
    'e2000002-0002-0002-0002-000000000002', -- 張志偉教練
    'MALE',
    '1995-03-15'
);

-- 1.2 簽訂年卡合約
INSERT INTO contracts (
    id, status, date_created, contract_no, member_id, plan_id,
    sign_date, start_date, end_date, original_end_date,
    contract_status, total_amount, payment_status,
    sales_person_id, branch_id, notes
) VALUES (
    'e2ec0001-0001-0001-0001-000000000001',
    'active',
    NOW(),
    'CT2025-TEST-001',
    'e2e00001-0001-0001-0001-000000000001', -- 王小明
    'a4000004-0004-0004-0004-000000000004', -- 年卡方案 (12個月)
    CURRENT_DATE,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '12 months',
    CURRENT_DATE + INTERVAL '12 months',
    'ACTIVE',
    9800.00,
    'PAID',
    'e2000002-0002-0002-0002-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'E2E 測試：新會員年卡'
);

-- 1.3 付款紀錄
INSERT INTO payments (
    id, status, date_created, contract_id, member_id,
    amount, payment_method, payment_date, payment_type,
    branch_id, received_by, notes
) VALUES (
    'e2e10001-0001-0001-0001-000000000001',
    'active',
    NOW(),
    'e2ec0001-0001-0001-0001-000000000001',
    'e2e00001-0001-0001-0001-000000000001',
    9800.00,
    'CREDIT_CARD',
    NOW(),
    'INCOME',
    '22222222-2222-2222-2222-222222222222',
    'e2000003-0003-0003-0003-000000000003', -- 陳美玲櫃檯
    'E2E 測試：年卡付款'
);

-- ============================================
-- 測試場景 2：合約暫停與延期驗證
-- Scenario 2: Contract Pause & Extension Validation
-- ============================================
-- 驗證：暫停 30 天後，end_date 應自動延長 30 天

-- 2.1 新增測試會員（李曉華）
INSERT INTO members (
    id, status, date_created, member_code, full_name, phone, email,
    branch_id, member_status, join_date, sales_person_id, gender, birthday
) VALUES (
    'e2e00002-0002-0002-0002-000000000002',
    'active',
    NOW(),
    'M2025-TEST02',
    '李曉華',
    '0987-654-321',
    'test.xiaohua@example.com',
    '33333333-3333-3333-3333-333333333333', -- 台北大安店
    'ACTIVE',
    CURRENT_DATE - INTERVAL '3 months',
    'e3000002-0002-0002-0002-000000000003',
    'FEMALE',
    '1992-07-20'
);

-- 2.2 簽訂半年卡（已使用 2 個月）
INSERT INTO contracts (
    id, status, date_created, contract_no, member_id, plan_id,
    sign_date, start_date, end_date, original_end_date,
    contract_status, total_amount, payment_status,
    sales_person_id, branch_id
) VALUES (
    'e2ec0002-0002-0002-0002-000000000002',
    'active',
    NOW() - INTERVAL '2 months',
    'CT2025-TEST-002',
    'e2e00002-0002-0002-0002-000000000002',
    'a3000003-0003-0003-0003-000000000003', -- 半年卡
    CURRENT_DATE - INTERVAL '2 months',
    CURRENT_DATE - INTERVAL '2 months',
    CURRENT_DATE + INTERVAL '4 months', -- 還剩 4 個月
    CURRENT_DATE + INTERVAL '4 months', -- original_end_date
    'ACTIVE',
    6000.00,
    'PAID',
    'e3000002-0002-0002-0002-000000000003',
    '33333333-3333-3333-3333-333333333333'
);

-- 2.3 暫停合約 30 天（應延長 end_date）
INSERT INTO contract_logs (
    id, status, date_created, contract_id, log_type,
    start_date, end_date, days_affected, reason,
    created_by_employee
) VALUES (
    'e2e90001-0001-0001-0001-000000000001',
    'active',
    NOW(),
    'e2ec0002-0002-0002-0002-000000000002',
    'PAUSE',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    30,
    'E2E 測試：出國旅遊暫停會籍',
    'e3000002-0002-0002-0002-000000000003'
);

-- 【驗證點】執行後，contracts.end_date 應該變成 CURRENT_DATE + INTERVAL '4 months' + INTERVAL '30 days'
-- 需要透過 Directus Hook 或手動更新來實現此邏輯

-- ============================================
-- 測試場景 3：課程包扣課驗證
-- Scenario 3: Class Package Deduction Validation
-- ============================================
-- 驗證：使用私教課程後，remaining_counts 應正確減少

-- 3.1 新增會員（張健身）
INSERT INTO members (
    id, status, date_created, member_code, full_name, phone, email,
    branch_id, member_status, join_date, sales_person_id, gender, birthday
) VALUES (
    'e2e00003-0003-0003-0003-000000000003',
    'active',
    NOW(),
    'M2025-TEST03',
    '張健身',
    '0922-333-444',
    'test.fitness@example.com',
    '44444444-4444-4444-4444-444444444444', -- 新北板橋店
    'ACTIVE',
    CURRENT_DATE,
    'e4000002-0002-0002-0002-000000000004',
    'MALE',
    '1988-11-10'
);

-- 3.2 購買 10 堂私教課程
INSERT INTO contracts (
    id, status, date_created, contract_no, member_id, plan_id,
    sign_date, start_date, end_date, original_end_date,
    contract_status, remaining_counts, total_amount, payment_status,
    sales_person_id, branch_id, notes
) VALUES (
    'e2ec0003-0003-0003-0003-000000000003',
    'active',
    NOW(),
    'CT2025-TEST-003',
    'e2e00003-0003-0003-0003-000000000003',
    'a6000006-0006-0006-0006-000000000006', -- 10堂私教課程
    CURRENT_DATE,
    CURRENT_DATE,
    NULL, -- COUNT_BASED 無 end_date
    NULL,
    'ACTIVE',
    10, -- 剩餘 10 堂
    12000.00,
    'PAID',
    'e4000002-0002-0002-0002-000000000004',
    '44444444-4444-4444-4444-444444444444',
    'E2E 測試：私教課程包'
);

-- 3.3 使用第 1 堂課
INSERT INTO contract_logs (
    id, status, date_created, contract_id, log_type,
    start_date, days_affected, reason,
    created_by_employee
) VALUES (
    'e2e90002-0002-0002-0002-000000000002',
    'active',
    NOW(),
    'e2ec0003-0003-0003-0003-000000000003',
    'CLASS_USED',
    CURRENT_DATE,
    NULL,
    'E2E 測試：私教課程第 1 堂 - 胸肌訓練',
    'e4000002-0002-0002-0002-000000000004'
);

-- 3.4 使用第 2 堂課
INSERT INTO contract_logs (
    id, status, date_created, contract_id, log_type,
    start_date, days_affected, reason,
    created_by_employee
) VALUES (
    'e2e90003-0003-0003-0003-000000000003',
    'active',
    NOW() + INTERVAL '3 days',
    'e2ec0003-0003-0003-0003-000000000003',
    'CLASS_USED',
    CURRENT_DATE + INTERVAL '3 days',
    NULL,
    'E2E 測試：私教課程第 2 堂 - 背肌訓練',
    'e4000002-0002-0002-0002-000000000004'
);

-- 【驗證點】執行後，contracts.remaining_counts 應該變成 8（10 - 2）
-- 需要透過 Directus Hook 或手動更新來實現此邏輯

-- ============================================
-- 測試場景 4：跨分店轉讓驗證
-- Scenario 4: Cross-Branch Transfer Validation
-- ============================================

-- 4.1 合約轉讓（從台北信義店轉到台北大安店）
-- 注意：contract_logs 沒有 branch_id, original_member_id, target_member_id 欄位
-- 轉讓邏輯需要透過 Hook 直接更新 contracts 表的 member_id 和 branch_id
INSERT INTO contract_logs (
    id, status, date_created, contract_id, log_type,
    start_date, reason, created_by_employee
) VALUES (
    'e2e90004-0004-0004-0004-000000000004',
    'active',
    NOW(),
    'e2ec0001-0001-0001-0001-000000000001', -- 王小明的年卡
    'TRANSFER',
    CURRENT_DATE,
    'E2E 測試：合約轉讓給朋友（從王小明轉給李曉華）',
    'e3000001-0001-0001-0001-000000000003' -- 台北大安店長審批
);

-- 【驗證點】執行後，contracts.member_id 和 branch_id 應更新

COMMIT;

-- ============================================
-- 驗證查詢（Verification Queries）
-- ============================================
-- 執行以下查詢驗證測試資料是否正確

-- 查詢 1：檢查測試會員是否建立成功
-- SELECT member_code, full_name, branch_id FROM members WHERE member_code LIKE 'M2025-TEST%';

-- 查詢 2：檢查測試合約狀態
-- SELECT contract_no, member_id, contract_status, end_date, remaining_counts
-- FROM contracts
-- WHERE contract_no LIKE 'CT2025-TEST%';

-- 查詢 3：檢查合約異動紀錄
-- SELECT contract_id, log_type, start_date, end_date, days_affected, reason
-- FROM contract_logs
-- WHERE id LIKE 'ltest%';

-- 查詢 4：驗證暫停後 end_date 是否延長（需手動或 Hook 更新）
-- SELECT
--     c.contract_no,
--     c.end_date,
--     c.original_end_date,
--     c.end_date - c.original_end_date AS extended_days
-- FROM contracts c
-- JOIN contract_logs l ON l.contract_id = c.id
-- WHERE l.log_type = 'PAUSE';

-- 查詢 5：驗證課程扣除後 remaining_counts（需手動或 Hook 更新）
-- SELECT
--     c.contract_no,
--     c.remaining_counts,
--     COUNT(l.id) AS classes_used,
--     10 - COUNT(l.id) AS expected_remaining
-- FROM contracts c
-- LEFT JOIN contract_logs l ON l.contract_id = c.id AND l.log_type = 'CLASS_USED'
-- WHERE c.id = 'e2ec0003-0003-0003-0003-000000000003'
-- GROUP BY c.id, c.contract_no, c.remaining_counts;
