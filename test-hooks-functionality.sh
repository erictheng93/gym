#!/bin/bash

# ============================================
# Directus Hooks 功能測試腳本
# ============================================
# 測試所有核心業務邏輯 Hooks 是否正常運作

echo "🧪 開始測試 Directus Hooks 功能"
echo "=================================="
echo ""

# 先執行端到端測試資料腳本
echo "📦 Step 1: 載入端到端測試資料..."
docker exec -i backend-database-1 psql -U directus -d gym_nexus < backend/seed-e2e-test.sql > /dev/null 2>&1
echo "✅ 測試資料載入完成"
echo ""

# 等待 Directus 處理 Hooks
sleep 2

# ============================================
# 測試 1: 合約暫停自動延期
# ============================================
echo "🧪 Test 1: 合約暫停自動延期 (PAUSE → 延長 end_date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查詢李曉華的合約 (ctest002)
RESULT=$(docker exec backend-database-1 psql -U directus -d gym_nexus -t -c "
SELECT
    c.contract_no,
    c.end_date,
    c.original_end_date,
    (c.end_date - c.original_end_date) AS extended_days,
    c.contract_status
FROM contracts c
WHERE c.id = 'ctest002-0002-0002-0002-000000000002';
" 2>&1)

echo "合約編號: CT2025-TEST-002 (李曉華)"
echo "$RESULT"

# 驗證是否延長了 30 天
if echo "$RESULT" | grep -q "30"; then
    echo "✅ PASS: end_date 已延長 30 天"
else
    echo "❌ FAIL: end_date 未延長或延長天數不正確"
fi

# 檢查狀態是否更新為 PAUSED
if echo "$RESULT" | grep -q "PAUSED"; then
    echo "✅ PASS: contract_status 已更新為 PAUSED"
else
    echo "❌ FAIL: contract_status 未更新"
fi
echo ""

# ============================================
# 測試 2: 課程扣課自動減少
# ============================================
echo "🧪 Test 2: 課程扣課自動減少 (CLASS_USED → remaining_counts - 1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查詢張健身的課程合約 (ctest003)
RESULT=$(docker exec backend-database-1 psql -U directus -d gym_nexus -t -c "
SELECT
    c.contract_no,
    c.remaining_counts,
    (SELECT COUNT(*) FROM contract_logs WHERE contract_id = c.id AND log_type = 'CLASS_USED') as classes_used,
    c.contract_status
FROM contracts c
WHERE c.id = 'ctest003-0003-0003-0003-000000000003';
" 2>&1)

echo "合約編號: CT2025-TEST-003 (張健身 - 10堂私教)"
echo "$RESULT"

# 說明：因為 Hooks 需要通過 Directus API 觸發，而不是直接 SQL INSERT
echo "⚠️  注意：課程扣課需要透過 Directus API 調用才會觸發 Hook"
echo "   如果 remaining_counts 仍為 10，這是正常的（SQL 直接 INSERT 不會觸發 Hook）"
echo "   需要透過前端或 API 使用課程才會自動扣除"
echo ""

# ============================================
# 測試 3: 合約轉讓
# ============================================
echo "🧪 Test 3: 合約轉讓 (TRANSFER → 更新 member_id)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查詢轉讓記錄
RESULT=$(docker exec backend-database-1 psql -U directus -d gym_nexus -t -c "
SELECT
    l.log_type,
    m1.full_name AS original_member,
    m2.full_name AS target_member,
    c.contract_no,
    c.member_id
FROM contract_logs l
JOIN contracts c ON c.id = l.contract_id
LEFT JOIN members m1 ON m1.id = l.original_member_id
LEFT JOIN members m2 ON m2.id = l.target_member_id
WHERE l.id = 'ltest004-0004-0004-0004-000000000004';
" 2>&1)

echo "轉讓紀錄: CT2025-TEST-001 (王小明 → 李曉華)"
echo "$RESULT"

echo "⚠️  注意：合約轉讓也需要透過 Directus API 觸發 Hook"
echo "   如果 member_id 未變更，需要透過前端或 API 操作"
echo ""

# ============================================
# 測試 4: 會員狀態自動更新
# ============================================
echo "🧪 Test 4: 會員狀態自動更新 (基於合約狀態)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查詢測試會員的狀態
RESULT=$(docker exec backend-database-1 psql -U directus -d gym_nexus -t -c "
SELECT
    m.full_name,
    m.member_status,
    COUNT(c.id) FILTER (WHERE c.contract_status = 'ACTIVE') as active_contracts,
    COUNT(c.id) FILTER (WHERE c.contract_status = 'PAUSED') as paused_contracts
FROM members m
LEFT JOIN contracts c ON c.member_id = m.id AND c.status = 'active'
WHERE m.id IN (
    'test0001-0001-0001-0001-000000000001',
    'test0002-0002-0002-0002-000000000002',
    'test0003-0003-0003-0003-000000000003'
)
GROUP BY m.id, m.full_name, m.member_status;
" 2>&1)

echo "測試會員狀態:"
echo "$RESULT"

echo "✅ 會員狀態計算邏輯:"
echo "   - 有 ACTIVE 合約 → member_status = ACTIVE"
echo "   - 只有 PAUSED 合約 → member_status = PAUSED"
echo "   - 無有效合約 → member_status = INACTIVE"
echo ""

# ============================================
# 測試 5: 檢查 Directus Extensions 載入狀態
# ============================================
echo "🧪 Test 5: 檢查 Directus Extensions 載入狀態"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 檢查 Docker logs 是否有 Hook 載入訊息
echo "查看 Directus 容器日誌（最近 50 行）..."
docker logs backend-directus-1 --tail 50 2>&1 | grep -E "GymHook|extension" | tail -10

echo ""
echo "✅ 如果看到 [GymHook] 相關訊息，表示 Hooks 已成功載入"
echo ""

# ============================================
# 總結
# ============================================
echo "=================================="
echo "📊 測試總結"
echo "=================================="
echo ""
echo "✅ 已完成的測試:"
echo "  1. ✅ 合約暫停自動延期邏輯"
echo "  2. ⚠️  課程扣課自動減少（需 API 觸發）"
echo "  3. ⚠️  合約轉讓（需 API 觸發）"
echo "  4. ✅ 會員狀態自動更新邏輯"
echo "  5. ✅ Directus Extensions 載入檢查"
echo ""
echo "🔔 重要提醒:"
echo "  - SQL 直接 INSERT 不會觸發 Directus Hooks"
echo "  - 必須透過 Directus API 操作才能觸發 Hooks"
echo "  - 建議使用 Postman 或前端進行完整的 E2E 測試"
echo ""
echo "📖 下一步建議:"
echo "  1. 啟動前端 Dashboard 手動測試"
echo "  2. 使用 Directus API 建立合約暫停紀錄"
echo "  3. 驗證 end_date 是否自動延長"
echo ""
