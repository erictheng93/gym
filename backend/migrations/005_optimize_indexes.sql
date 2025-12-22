-- ============================================
-- 資料庫索引優化 Migration
-- 版本: 005
-- 日期: 2025-12-21
-- 說明:
--   1. 補充缺失的外鍵索引
--   2. 新增複合索引（多租戶查詢優化）
--   3. 新增 GIN 索引（JSONB 欄位）
--   4. 新增 BRIN 索引（時序資料）
--   5. 新增部分索引（熱點資料優化）
-- 相依: schema.sql, 002_hr_attendance_leave.sql
-- ============================================

BEGIN;

-- ============================================
-- 1. 補充缺失的外鍵索引
-- ============================================
-- 外鍵欄位如果沒有索引，JOIN 和 CASCADE 操作會很慢

-- employees 表
CREATE INDEX IF NOT EXISTS idx_employees_job_title
    ON employees(job_title_id);
CREATE INDEX IF NOT EXISTS idx_employees_user
    ON employees(user_id);

-- members 表
CREATE INDEX IF NOT EXISTS idx_members_sales
    ON members(sales_person_id);

-- contracts 表
CREATE INDEX IF NOT EXISTS idx_contracts_plan
    ON contracts(plan_id);
CREATE INDEX IF NOT EXISTS idx_contracts_sales
    ON contracts(sales_person_id);

-- payments 表
CREATE INDEX IF NOT EXISTS idx_payments_member
    ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_received_by
    ON payments(received_by);
CREATE INDEX IF NOT EXISTS idx_payments_date
    ON payments(payment_date);

-- contract_logs 表
CREATE INDEX IF NOT EXISTS idx_contract_logs_type
    ON contract_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_contract_logs_created_by
    ON contract_logs(created_by_employee);
CREATE INDEX IF NOT EXISTS idx_contract_logs_original_member
    ON contract_logs(original_member_id);

-- attendances 表
CREATE INDEX IF NOT EXISTS idx_attendances_branch
    ON attendances(branch_id);

-- member_checkins 表
CREATE INDEX IF NOT EXISTS idx_member_checkins_contract
    ON member_checkins(contract_id);
CREATE INDEX IF NOT EXISTS idx_member_checkins_verified_by
    ON member_checkins(verified_by);

-- ============================================
-- 2. 複合索引（多租戶查詢優化）
-- ============================================
-- 大多數查詢都會先按 branch_id 篩選，複合索引可大幅提升效能

-- 會員查詢：按分店 + 狀態
CREATE INDEX IF NOT EXISTS idx_members_branch_status
    ON members(branch_id, member_status);

-- 會員查詢：按分店 + 姓名（模糊搜尋用）
CREATE INDEX IF NOT EXISTS idx_members_branch_name
    ON members(branch_id, full_name);

-- 合約查詢：按分店 + 狀態
CREATE INDEX IF NOT EXISTS idx_contracts_branch_status_combo
    ON contracts(branch_id, contract_status);

-- 合約查詢：按分店 + 日期範圍
CREATE INDEX IF NOT EXISTS idx_contracts_branch_dates
    ON contracts(branch_id, start_date, end_date);

-- 合約查詢：按分店 + 付款狀態
CREATE INDEX IF NOT EXISTS idx_contracts_branch_payment
    ON contracts(branch_id, payment_status);

-- 付款查詢：按分店 + 日期
CREATE INDEX IF NOT EXISTS idx_payments_branch_date
    ON payments(branch_id, payment_date);

-- 銷售業績：按業務員 + 分店
CREATE INDEX IF NOT EXISTS idx_contracts_sales_branch
    ON contracts(sales_person_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_members_sales_branch
    ON members(sales_person_id, branch_id);

-- 員工查詢：按分店 + 狀態
CREATE INDEX IF NOT EXISTS idx_employees_branch_status
    ON employees(branch_id, employment_status);

-- 打卡查詢：按員工 + 日期
CREATE INDEX IF NOT EXISTS idx_attendances_employee_date
    ON attendances(employee_id, attendance_date);

-- 入場查詢：按會員 + 時間
CREATE INDEX IF NOT EXISTS idx_checkins_member_time
    ON member_checkins(member_id, check_time);

-- ============================================
-- 3. GIN 索引（JSONB 欄位）
-- ============================================
-- 使用 jsonb_path_ops 運算子類別，支援 @> 包含查詢，索引更小更快

-- 會員標籤搜尋（CRM 核心功能）
CREATE INDEX IF NOT EXISTS idx_members_tags_gin
    ON members USING GIN (tags jsonb_path_ops);

-- 分店設定查詢
CREATE INDEX IF NOT EXISTS idx_branches_settings_gin
    ON branches USING GIN (settings jsonb_path_ops);

-- 職稱權限查詢
CREATE INDEX IF NOT EXISTS idx_job_titles_perms_gin
    ON job_titles USING GIN (permissions_config jsonb_path_ops);

-- 員工自訂權限查詢
CREATE INDEX IF NOT EXISTS idx_employees_custom_perms_gin
    ON employees USING GIN (custom_permissions jsonb_path_ops);

-- 班表適用日查詢
CREATE INDEX IF NOT EXISTS idx_shifts_days_gin
    ON shift_schedules USING GIN (applicable_days jsonb_path_ops);

-- ============================================
-- 4. BRIN 索引（時序資料）
-- ============================================
-- BRIN 索引體積小（約 B-tree 的 1/100），適合按時間順序插入的資料
-- 適用於大範圍時間掃描的報表查詢

-- 打卡紀錄
CREATE INDEX IF NOT EXISTS idx_attendances_created_brin
    ON attendances USING BRIN (date_created);

-- 會員入場紀錄
CREATE INDEX IF NOT EXISTS idx_checkins_time_brin
    ON member_checkins USING BRIN (check_time);

-- 付款紀錄
CREATE INDEX IF NOT EXISTS idx_payments_created_brin
    ON payments USING BRIN (date_created);

-- 合約異動紀錄
CREATE INDEX IF NOT EXISTS idx_contract_logs_created_brin
    ON contract_logs USING BRIN (date_created);

-- 休假審核歷史
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_brin
    ON leave_approval_logs USING BRIN (date_created);

-- ============================================
-- 5. 部分索引（熱點資料優化）
-- ============================================
-- 只索引常用的子集，減少索引大小，提升查詢效能

-- 有效合約（最常查詢的狀態）
CREATE INDEX IF NOT EXISTS idx_contracts_active_partial
    ON contracts(member_id, end_date)
    WHERE contract_status = 'ACTIVE';

-- 待審核休假申請
CREATE INDEX IF NOT EXISTS idx_leave_pending_partial
    ON leave_requests(employee_id, start_date)
    WHERE leave_status = 'PENDING';

-- 活躍會員
CREATE INDEX IF NOT EXISTS idx_members_active_partial
    ON members(branch_id, full_name)
    WHERE member_status = 'ACTIVE';

-- 未付款/部分付款合約
CREATE INDEX IF NOT EXISTS idx_contracts_unpaid_partial
    ON contracts(branch_id, member_id)
    WHERE payment_status IN ('UNPAID', 'PARTIAL');

-- 在職員工
CREATE INDEX IF NOT EXISTS idx_employees_active_partial
    ON employees(branch_id, full_name)
    WHERE employment_status = 'ACTIVE';

-- ============================================
-- 6. 註解說明
-- ============================================
COMMENT ON INDEX idx_members_tags_gin IS 'GIN 索引：支援會員標籤 JSONB 查詢，如 tags @> ''["VIP"]''';
COMMENT ON INDEX idx_contracts_active_partial IS '部分索引：只索引有效合約，提升常用查詢效能';
COMMENT ON INDEX idx_checkins_time_brin IS 'BRIN 索引：適合時序資料的大範圍掃描';

COMMIT;
