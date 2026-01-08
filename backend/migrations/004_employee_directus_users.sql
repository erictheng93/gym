-- ============================================
-- 員工 Directus 用戶關聯 Migration
-- 版本: 004
-- 日期: 2025-12-17
-- 說明: 為所有員工創建對應的 directus_users 並建立關聯
-- 相依: seed.sql (employees 數據已存在)
-- ============================================

BEGIN;

-- ============================================
-- 1. 創建額外的 Directus 角色
-- ============================================

-- 店長角色 (可存取 App，部分管理權限)
INSERT INTO directus_roles (id, name, icon, description) VALUES
('11111111-aaaa-aaaa-aaaa-111111111111', 'Manager', 'supervisor_account', '店長 - 分店管理權限')
ON CONFLICT (id) DO NOTHING;

-- 教練角色 (可存取 App，限制權限)
INSERT INTO directus_roles (id, name, icon, description) VALUES
('22222222-bbbb-bbbb-bbbb-222222222222', 'Coach', 'fitness_center', '教練 - 會員與課程管理')
ON CONFLICT (id) DO NOTHING;

-- 櫃檯人員角色 (可存取 App，基本權限)
INSERT INTO directus_roles (id, name, icon, description) VALUES
('33333333-cccc-cccc-cccc-333333333333', 'Staff', 'badge', '櫃檯人員 - 入場與基本操作')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. 創建員工對應的 Directus 用戶
-- 預設密碼: password123 (使用 argon2id hash)
-- 用戶可在首次登錄後修改密碼
-- ============================================

-- 密碼 hash 說明:
-- 使用與 admin 相同的 hash 格式 (argon2id)
-- 預設密碼統一為 "password123"
-- Hash: $argon2id$v=19$m=65536,t=3,p=4$cGFzc3dvcmQxMjM$...

-- 使用更簡單的方式：直接設定與 admin 相同的密碼 hash (password = admin)
-- 生產環境應該要求員工首次登入時更改密碼

-- 總經理 - 王大明 (HQ001) - Administrator 角色
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a1000001-0001-0001-0001-000000000001', 'hq001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '大明', '王', 'active', (SELECT id FROM directus_roles WHERE name = 'Administrator'), 'default')
ON CONFLICT (id) DO NOTHING;

-- 台北信義店
-- 店長 - 李信義 (XY001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a2000001-0001-0001-0001-000000000002', 'xy001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '信義', '李', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 張志偉 (XY002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a2000002-0002-0002-0002-000000000002', 'xy002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '志偉', '張', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 櫃檯 - 陳美玲 (XY003)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a2000003-0003-0003-0003-000000000003', 'xy003@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '美玲', '陳', 'active', '33333333-cccc-cccc-cccc-333333333333', 'default')
ON CONFLICT (id) DO NOTHING;

-- 台北大安店
-- 店長 - 周大安 (DA001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a3000001-0001-0001-0001-000000000003', 'da001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '大安', '周', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 吳佩琪 (DA002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a3000002-0002-0002-0002-000000000003', 'da002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '佩琪', '吳', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 新北板橋店
-- 店長 - 鄭板橋 (BQ001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a4000001-0001-0001-0001-000000000004', 'bq001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '板橋', '鄭', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 許志明 (BQ002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a4000002-0002-0002-0002-000000000004', 'bq002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '志明', '許', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 新北中和店
-- 店長 - 林中和 (ZH001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a5000001-0001-0001-0001-000000000005', 'zh001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '中和', '林', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 王建民 (ZH002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a5000002-0002-0002-0002-000000000005', 'zh002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '建民', '王', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 台中西屯店
-- 店長 - 陳西屯 (XT001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a6000001-0001-0001-0001-000000000006', 'xt001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '西屯', '陳', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 劉德華 (XT002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a6000002-0002-0002-0002-000000000006', 'xt002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '德華', '劉', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 台中北屯店
-- 店長 - 黃北屯 (BT001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a7000001-0001-0001-0001-000000000007', 'bt001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '北屯', '黃', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 蔡依林 (BT002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a7000002-0002-0002-0002-000000000007', 'bt002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '依林', '蔡', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 台南東區店
-- 店長 - 吳東區 (TE001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a8000001-0001-0001-0001-000000000008', 'te001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '東區', '吳', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 周杰倫 (TE002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a8000002-0002-0002-0002-000000000008', 'te002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '杰倫', '周', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- 台南中西店
-- 店長 - 張中西 (WC001)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a9000001-0001-0001-0001-000000000009', 'wc001@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '中西', '張', 'active', '11111111-aaaa-aaaa-aaaa-111111111111', 'default')
ON CONFLICT (id) DO NOTHING;

-- 教練 - 林志玲 (WC002)
INSERT INTO directus_users (id, email, password, first_name, last_name, status, role, provider) VALUES
('a9000002-0002-0002-0002-000000000009', 'wc002@gym.com', '$argon2id$v=19$m=65536,t=3,p=4$0FfoYXycrECVtrFrwozQFQ$vaocH9bIO8XOoUTXE4mHqHL3h380+IG4y7+m0R+Hoy0', '志玲', '林', 'active', '22222222-bbbb-bbbb-bbbb-222222222222', 'default')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. 更新 employees 表的 user_id 關聯
-- ============================================

-- 總經理
UPDATE employees SET user_id = 'a1000001-0001-0001-0001-000000000001' WHERE employee_code = 'HQ001';

-- 台北信義店
UPDATE employees SET user_id = 'a2000001-0001-0001-0001-000000000002' WHERE employee_code = 'XY001';
UPDATE employees SET user_id = 'a2000002-0002-0002-0002-000000000002' WHERE employee_code = 'XY002';
UPDATE employees SET user_id = 'a2000003-0003-0003-0003-000000000003' WHERE employee_code = 'XY003';

-- 台北大安店
UPDATE employees SET user_id = 'a3000001-0001-0001-0001-000000000003' WHERE employee_code = 'DA001';
UPDATE employees SET user_id = 'a3000002-0002-0002-0002-000000000003' WHERE employee_code = 'DA002';

-- 新北板橋店
UPDATE employees SET user_id = 'a4000001-0001-0001-0001-000000000004' WHERE employee_code = 'BQ001';
UPDATE employees SET user_id = 'a4000002-0002-0002-0002-000000000004' WHERE employee_code = 'BQ002';

-- 新北中和店
UPDATE employees SET user_id = 'a5000001-0001-0001-0001-000000000005' WHERE employee_code = 'ZH001';
UPDATE employees SET user_id = 'a5000002-0002-0002-0002-000000000005' WHERE employee_code = 'ZH002';

-- 台中西屯店
UPDATE employees SET user_id = 'a6000001-0001-0001-0001-000000000006' WHERE employee_code = 'XT001';
UPDATE employees SET user_id = 'a6000002-0002-0002-0002-000000000006' WHERE employee_code = 'XT002';

-- 台中北屯店
UPDATE employees SET user_id = 'a7000001-0001-0001-0001-000000000007' WHERE employee_code = 'BT001';
UPDATE employees SET user_id = 'a7000002-0002-0002-0002-000000000007' WHERE employee_code = 'BT002';

-- 台南東區店
UPDATE employees SET user_id = 'a8000001-0001-0001-0001-000000000008' WHERE employee_code = 'TE001';
UPDATE employees SET user_id = 'a8000002-0002-0002-0002-000000000008' WHERE employee_code = 'TE002';

-- 台南中西店
UPDATE employees SET user_id = 'a9000001-0001-0001-0001-000000000009' WHERE employee_code = 'WC001';
UPDATE employees SET user_id = 'a9000002-0002-0002-0002-000000000009' WHERE employee_code = 'WC002';

-- ============================================
-- 4. 權限設定說明
-- ============================================
-- 角色權限可在 Directus 管理介面設定:
-- 1. 進入 Settings > Roles & Permissions
-- 2. 為 Manager, Coach, Staff 角色分配適當的權限
-- 3. 建議設定:
--    - Manager: 完整的業務資料讀寫權限
--    - Coach: 會員、課程相關讀寫權限
--    - Staff: 入場、基本會員查詢權限

COMMIT;
