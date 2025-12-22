-- ============================================
-- 原子操作函數 (Atomic Operations)
-- 解決並發 Race Condition 問題
-- ============================================

-- ============================================
-- 1. 合約次數扣除 - 原子操作
-- ============================================

-- 安全地扣除合約次數，返回扣除後的剩餘次數
-- 使用 SELECT FOR UPDATE 鎖定行，防止並發問題
CREATE OR REPLACE FUNCTION deduct_contract_count(
    p_contract_id UUID,
    p_deduct_amount INTEGER DEFAULT 1
)
RETURNS TABLE (
    success BOOLEAN,
    remaining INTEGER,
    contract_status VARCHAR,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_count INTEGER;
    v_new_count INTEGER;
    v_contract_status VARCHAR;
BEGIN
    -- 使用 FOR UPDATE 鎖定該行，防止並發讀取
    SELECT c.remaining_counts, c.contract_status
    INTO v_current_count, v_contract_status
    FROM contracts c
    WHERE c.id = p_contract_id
    FOR UPDATE;

    -- 檢查合約是否存在
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::VARCHAR, '合約不存在'::TEXT;
        RETURN;
    END IF;

    -- 檢查是否為次數制合約
    IF v_current_count IS NULL THEN
        RETURN QUERY SELECT TRUE, NULL::INTEGER, v_contract_status, '非次數制合約，無需扣除'::TEXT;
        RETURN;
    END IF;

    -- 檢查剩餘次數是否足夠
    IF v_current_count < p_deduct_amount THEN
        RETURN QUERY SELECT FALSE, v_current_count, v_contract_status, '剩餘次數不足'::TEXT;
        RETURN;
    END IF;

    -- 計算新的剩餘次數
    v_new_count := v_current_count - p_deduct_amount;

    -- 原子更新
    IF v_new_count = 0 THEN
        -- 次數用完，同時更新狀態為 EXPIRED
        UPDATE contracts
        SET remaining_counts = v_new_count,
            contract_status = 'EXPIRED',
            date_updated = NOW()
        WHERE id = p_contract_id;

        RETURN QUERY SELECT TRUE, v_new_count, 'EXPIRED'::VARCHAR, '次數扣除成功，合約已過期'::TEXT;
    ELSE
        UPDATE contracts
        SET remaining_counts = v_new_count,
            date_updated = NOW()
        WHERE id = p_contract_id;

        RETURN QUERY SELECT TRUE, v_new_count, v_contract_status, '次數扣除成功'::TEXT;
    END IF;
END;
$$;

-- ============================================
-- 2. 付款狀態計算 - 原子操作
-- ============================================

-- 重新計算合約的付款狀態 (使用單一 SQL 語句)
CREATE OR REPLACE FUNCTION recalculate_payment_status(
    p_contract_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    old_status VARCHAR,
    new_status VARCHAR,
    total_amount NUMERIC,
    paid_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_status VARCHAR;
    v_new_status VARCHAR;
    v_total_amount NUMERIC;
    v_paid_amount NUMERIC;
BEGIN
    -- 鎖定合約行
    SELECT c.payment_status, c.total_amount
    INTO v_old_status, v_total_amount
    FROM contracts c
    WHERE c.id = p_contract_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR, NULL::VARCHAR, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 使用單一查詢計算已付金額 (收入 - 退款)
    SELECT COALESCE(SUM(
        CASE
            WHEN p.payment_type = 'REFUND' THEN -p.amount
            ELSE p.amount
        END
    ), 0)
    INTO v_paid_amount
    FROM payments p
    WHERE p.contract_id = p_contract_id
      AND p.status = 'active';

    -- 計算新狀態
    IF v_total_amount IS NULL OR v_total_amount <= 0 THEN
        v_new_status := 'PAID';
    ELSIF v_paid_amount <= 0 THEN
        v_new_status := 'UNPAID';
    ELSIF v_paid_amount >= v_total_amount THEN
        v_new_status := 'PAID';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;

    -- 只在狀態改變時更新
    IF v_new_status != v_old_status OR v_old_status IS NULL THEN
        UPDATE contracts
        SET payment_status = v_new_status,
            date_updated = NOW()
        WHERE id = p_contract_id;
    END IF;

    RETURN QUERY SELECT TRUE, v_old_status, v_new_status, v_total_amount, v_paid_amount;
END;
$$;

-- ============================================
-- 3. 休假餘額更新 - 原子操作
-- ============================================

-- 原子更新休假餘額 (pending_days 和 used_days)
CREATE OR REPLACE FUNCTION update_leave_balance(
    p_employee_id UUID,
    p_leave_type VARCHAR,
    p_year INTEGER,
    p_pending_delta NUMERIC DEFAULT 0,
    p_used_delta NUMERIC DEFAULT 0
)
RETURNS TABLE (
    success BOOLEAN,
    new_pending NUMERIC,
    new_used NUMERIC,
    remaining NUMERIC,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance_id UUID;
    v_total_days NUMERIC;
    v_pending NUMERIC;
    v_used NUMERIC;
    v_new_pending NUMERIC;
    v_new_used NUMERIC;
BEGIN
    -- 鎖定餘額記錄
    SELECT lb.id, lb.total_days, lb.pending_days, lb.used_days
    INTO v_balance_id, v_total_days, v_pending, v_used
    FROM leave_balances lb
    WHERE lb.employee_id = p_employee_id
      AND lb.leave_type = p_leave_type
      AND lb.year = p_year
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, '找不到休假餘額記錄'::TEXT;
        RETURN;
    END IF;

    -- 計算新值
    v_new_pending := GREATEST(0, COALESCE(v_pending, 0) + p_pending_delta);
    v_new_used := GREATEST(0, COALESCE(v_used, 0) + p_used_delta);

    -- 檢查是否超額
    IF v_new_used > v_total_days THEN
        RETURN QUERY SELECT FALSE, v_new_pending, v_new_used,
                     v_total_days - v_new_used, '休假天數超過額度'::TEXT;
        RETURN;
    END IF;

    -- 更新餘額
    UPDATE leave_balances
    SET pending_days = v_new_pending,
        used_days = v_new_used,
        date_updated = NOW()
    WHERE id = v_balance_id;

    RETURN QUERY SELECT TRUE, v_new_pending, v_new_used,
                 v_total_days - v_new_used - v_new_pending, '更新成功'::TEXT;
END;
$$;

-- ============================================
-- 4. 會員狀態計算 - 原子操作
-- ============================================

-- 重新計算會員狀態 (基於所有有效合約)
CREATE OR REPLACE FUNCTION recalculate_member_status(
    p_member_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    old_status VARCHAR,
    new_status VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_status VARCHAR;
    v_new_status VARCHAR;
    v_has_active BOOLEAN;
    v_has_paused BOOLEAN;
BEGIN
    -- 鎖定會員記錄
    SELECT m.member_status
    INTO v_old_status
    FROM members m
    WHERE m.id = p_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 檢查是否有 ACTIVE 合約
    SELECT EXISTS(
        SELECT 1 FROM contracts c
        WHERE c.member_id = p_member_id
          AND c.status = 'active'
          AND c.contract_status = 'ACTIVE'
    ) INTO v_has_active;

    -- 檢查是否有 PAUSED 合約
    SELECT EXISTS(
        SELECT 1 FROM contracts c
        WHERE c.member_id = p_member_id
          AND c.status = 'active'
          AND c.contract_status = 'PAUSED'
    ) INTO v_has_paused;

    -- 決定會員狀態
    IF v_has_active THEN
        v_new_status := 'ACTIVE';
    ELSIF v_has_paused THEN
        v_new_status := 'PAUSED';
    ELSE
        v_new_status := 'INACTIVE';
    END IF;

    -- 更新會員狀態
    IF v_new_status != v_old_status OR v_old_status IS NULL THEN
        UPDATE members
        SET member_status = v_new_status,
            date_updated = NOW()
        WHERE id = p_member_id;
    END IF;

    RETURN QUERY SELECT TRUE, v_old_status, v_new_status;
END;
$$;

-- ============================================
-- 5. 合約到期批量更新 - 高效原子操作
-- ============================================

-- 批量更新過期合約，返回受影響的會員 ID 列表
CREATE OR REPLACE FUNCTION expire_contracts_batch()
RETURNS TABLE (
    expired_count INTEGER,
    affected_member_ids UUID[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_expired_count INTEGER;
    v_member_ids UUID[];
BEGIN
    -- 使用 CTE 批量更新，收集受影響的會員
    WITH expired AS (
        UPDATE contracts
        SET contract_status = 'EXPIRED',
            date_updated = NOW()
        WHERE end_date < v_today
          AND contract_status IN ('ACTIVE', 'PAUSED')
          AND status = 'active'
        RETURNING member_id
    )
    SELECT COUNT(*)::INTEGER, ARRAY_AGG(DISTINCT member_id)
    INTO v_expired_count, v_member_ids
    FROM expired;

    RETURN QUERY SELECT v_expired_count, COALESCE(v_member_ids, ARRAY[]::UUID[]);
END;
$$;

-- ============================================
-- 添加索引以支援原子操作的效能
-- ============================================

-- 確保合約的 member_id + status 索引存在 (用於會員狀態計算)
CREATE INDEX IF NOT EXISTS idx_contracts_member_status_lookup
ON contracts(member_id, status, contract_status);

-- 確保付款的 contract_id + status 索引存在 (用於付款狀態計算)
CREATE INDEX IF NOT EXISTS idx_payments_contract_status_lookup
ON payments(contract_id, status);

-- 確保休假餘額的複合索引存在
CREATE INDEX IF NOT EXISTS idx_leave_balances_lookup
ON leave_balances(employee_id, leave_type, year);

-- ============================================
-- 授權說明
-- ============================================
COMMENT ON FUNCTION deduct_contract_count IS '原子扣除合約次數，防止並發 Race Condition';
COMMENT ON FUNCTION recalculate_payment_status IS '原子重算付款狀態，使用 SQL 聚合避免應用層計算';
COMMENT ON FUNCTION update_leave_balance IS '原子更新休假餘額，防止並發衝突';
COMMENT ON FUNCTION recalculate_member_status IS '原子計算會員狀態，基於合約狀態';
COMMENT ON FUNCTION expire_contracts_batch IS '批量過期合約，高效處理定時任務';
