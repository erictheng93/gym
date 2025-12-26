# 報表模組 API 文件

報表模組提供了完整的營收、會員成長、合約到期提醒和會員活躍度報表功能。

## 資料庫結構

### 物化視圖 (Materialized Views)

1. **revenue_daily_summary** - 每日營收摘要
2. **member_growth_summary** - 會員成長摘要
3. **member_activity_summary** - 會員活躍度摘要

### 視圖 (Views)

1. **contract_expiry_alerts** - 合約到期提醒（即時視圖）

### 刷新物化視圖

物化視圖需要定期刷新以獲取最新資料：

```sql
-- 刷新所有報表視圖
SELECT refresh_report_views();

-- 或個別刷新
REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_daily_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY member_growth_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY member_activity_summary;
```

建議在以下情況刷新：
- 每天凌晨自動刷新（透過 cron job 或排程）
- 新增大量資料後手動刷新
- 執行報表查詢前確保資料是最新的

## API Endpoints

所有報表 API 的基礎路徑為 `/gym/reports`

### 1. 營收報表

**GET** `/gym/reports/revenue`

查詢指定期間的營收統計資料。

**查詢參數：**
- `start_date` (選填) - 開始日期 (YYYY-MM-DD)，預設為 30 天前
- `end_date` (選填) - 結束日期 (YYYY-MM-DD)，預設為今天
- `branch_id` (選填) - 分店 UUID，不提供則查詢所有分店

**回應範例：**
```json
{
  "success": true,
  "period": {
    "start_date": "2025-11-26",
    "end_date": "2025-12-26"
  },
  "summary": {
    "total_income": 290834.25,
    "total_refund": 49626.67,
    "net_revenue": 241207.58,
    "total_transactions": 14,
    "average_daily_revenue": "17229.11"
  },
  "data": [
    {
      "payment_day": "2025-12-26T00:00:00.000Z",
      "branch_id": "22222222-2222-2222-2222-222222222222",
      "branch_name": "健身工廠台北信義店",
      "transaction_count": "1",
      "total_income": "9800.00",
      "total_refund": "0",
      "net_revenue": "9800.00",
      "unique_members": "1",
      "cash_income": "0",
      "credit_card_income": "9800.00",
      "bank_transfer_income": "0",
      "line_pay_income": "0"
    }
  ]
}
```

**使用範例：**
```bash
# 查詢最近 30 天的營收
curl "http://localhost:8055/gym/reports/revenue"

# 查詢特定期間的營收
curl "http://localhost:8055/gym/reports/revenue?start_date=2025-12-01&end_date=2025-12-31"

# 查詢特定分店的營收
curl "http://localhost:8055/gym/reports/revenue?branch_id=22222222-2222-2222-2222-222222222222"
```

---

### 2. 會員成長報表

**GET** `/gym/reports/member-growth`

查詢指定期間的會員新增趨勢。

**查詢參數：**
- `start_date` (選填) - 開始日期 (YYYY-MM-DD)，預設為 30 天前
- `end_date` (選填) - 結束日期 (YYYY-MM-DD)，預設為今天
- `branch_id` (選填) - 分店 UUID

**回應範例：**
```json
{
  "success": true,
  "period": {
    "start_date": "2025-11-26",
    "end_date": "2025-12-26"
  },
  "summary": {
    "total_new_members": 126,
    "total_members": 126,
    "average_daily_growth": "1.31",
    "gender_distribution": {
      "male": 58,
      "female": 68
    }
  },
  "data": [
    {
      "join_day": "2025-12-26T00:00:00.000Z",
      "branch_id": "22222222-2222-2222-2222-222222222222",
      "branch_name": "健身工廠台北信義店",
      "new_members": "3",
      "active_members": "3",
      "male_count": "1",
      "female_count": "2",
      "sales_persons_involved": "2"
    }
  ]
}
```

**使用範例：**
```bash
# 查詢最近 30 天的會員成長
curl "http://localhost:8055/gym/reports/member-growth"

# 查詢本月的會員成長
curl "http://localhost:8055/gym/reports/member-growth?start_date=2025-12-01"
```

---

### 3. 合約到期提醒

**GET** `/gym/reports/contract-expiry`

列出即將到期的合約，用於提醒續約。

**查詢參數：**
- `days_ahead` (選填) - 提前天數，預設為 30 天
- `branch_id` (選填) - 分店 UUID
- `limit` (選填) - 限制筆數，預設為 100

**回應範例：**
```json
{
  "success": true,
  "summary": {
    "total_expiring": 15,
    "urgent_count": 3,
    "soon_count": 8,
    "upcoming_count": 4
  },
  "grouped": {
    "urgent": [
      {
        "contract_id": "...",
        "contract_no": "C20251201001",
        "member_name": "王小明",
        "member_code": "M0001234",
        "member_phone": "0912345678",
        "member_email": "test@example.com",
        "branch_name": "健身工廠台北信義店",
        "plan_name": "月繳會員",
        "start_date": "2024-12-01",
        "end_date": "2025-12-28",
        "contract_status": "ACTIVE",
        "payment_status": "PAID",
        "days_until_expiry": 2,
        "sales_person_name": "李銷售",
        "total_amount": "15000.00",
        "total_paid": "15000.00",
        "outstanding_amount": "0"
      }
    ],
    "soon": [],
    "upcoming": []
  },
  "data": []
}
```

**分類說明：**
- **urgent** - 7 天內到期（緊急）
- **soon** - 8-30 天內到期
- **upcoming** - 31-90 天內到期

**使用範例：**
```bash
# 查詢 30 天內到期的合約
curl "http://localhost:8055/gym/reports/contract-expiry"

# 查詢 90 天內到期的合約
curl "http://localhost:8055/gym/reports/contract-expiry?days_ahead=90"

# 查詢特定分店即將到期的合約
curl "http://localhost:8055/gym/reports/contract-expiry?branch_id=22222222-2222-2222-2222-222222222222&days_ahead=60"
```

---

### 4. 會員活躍度報表

**GET** `/gym/reports/member-activity`

基於會員入場紀錄統計會員活躍度。

**查詢參數：**
- `start_date` (選填) - 開始日期 (YYYY-MM-DD)，預設為 30 天前
- `end_date` (選填) - 結束日期 (YYYY-MM-DD)，預設為今天
- `branch_id` (選填) - 分店 UUID

**回應範例：**
```json
{
  "success": true,
  "period": {
    "start_date": "2025-11-26",
    "end_date": "2025-12-26"
  },
  "summary": {
    "total_check_ins": 21,
    "average_daily_check_ins": "1.17",
    "method_distribution": {
      "qr_code": 5,
      "manual": 8,
      "card": 8
    }
  },
  "data": [
    {
      "activity_day": "2025-12-26T00:00:00.000Z",
      "branch_id": "22222222-2222-2222-2222-222222222222",
      "branch_name": "健身工廠台北信義店",
      "total_check_ins": "15",
      "unique_members": "12",
      "qr_code_count": "8",
      "manual_count": "5",
      "card_count": "2",
      "morning_count": "3",
      "afternoon_count": "5",
      "evening_count": "7"
    }
  ]
}
```

**時段定義：**
- **morning** - 06:00-12:00
- **afternoon** - 12:00-18:00
- **evening** - 18:00-24:00

**使用範例：**
```bash
# 查詢最近 30 天的會員活躍度
curl "http://localhost:8055/gym/reports/member-activity"

# 查詢特定分店本週的活躍度
curl "http://localhost:8055/gym/reports/member-activity?start_date=2025-12-20&branch_id=22222222-2222-2222-2222-222222222222"
```

---

### 5. 刷新報表資料

**POST** `/gym/reports/refresh`

手動刷新所有報表物化視圖，確保資料是最新的。

**回應範例：**
```json
{
  "success": true,
  "message": "報表資料已更新",
  "refreshed_at": "2025-12-26T14:30:00.000Z"
}
```

**使用範例：**
```bash
# 刷新報表資料
curl -X POST "http://localhost:8055/gym/reports/refresh"
```

**注意事項：**
- 此操作會鎖定物化視圖並重新計算，可能需要幾秒到幾分鐘
- 建議在低峰期執行
- 使用 `CONCURRENTLY` 選項避免完全鎖定
- 可透過 cron job 自動排程執行

---

## 測試資料

系統已自動生成 30 天的測試資料，包括：

1. **員工考勤資料** - 每個員工約 23 天的出勤記錄
2. **休假申請** - 已批准、待審核、已拒絕的休假案例
3. **付款資料** - 合約付款和零星消費記錄
4. **會員入場紀錄** - 過去 30 天的 check-in 資料
5. **新會員資料** - 每天 2-5 個新會員

### 驗證測試資料

```sql
-- 查看過去 30 天的考勤統計
SELECT
    COUNT(*) AS total_records,
    COUNT(DISTINCT employee_id) AS unique_employees,
    AVG(work_hours) AS avg_work_hours
FROM attendances
WHERE attendance_date >= CURRENT_DATE - 30;

-- 查看休假申請統計
SELECT
    leave_status,
    COUNT(*) AS count,
    SUM(days_requested) AS total_days
FROM leave_requests
GROUP BY leave_status;

-- 查看過去 30 天的營收
SELECT
    DATE(payment_date) AS day,
    COUNT(*) AS transactions,
    SUM(amount) AS total
FROM payments
WHERE payment_date >= CURRENT_DATE - 30
  AND payment_type = 'INCOME'
GROUP BY DATE(payment_date)
ORDER BY day DESC;
```

---

## 前端整合建議

### 圖表展示

建議使用以下圖表類型：

1. **營收報表** - 折線圖（趨勢）+ 柱狀圖（分店比較）
2. **會員成長** - 面積圖（累積成長）+ 柱狀圖（每日新增）
3. **合約到期** - 表格 + 提醒標籤
4. **會員活躍度** - 熱圖（時段分布）+ 圓餅圖（入場方式）

### 範例程式碼

```javascript
// 獲取營收報表
async function getRevenueReport(startDate, endDate, branchId) {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (branchId) params.append('branch_id', branchId);

  const response = await fetch(`/gym/reports/revenue?${params}`);
  const data = await response.json();

  if (data.success) {
    return data;
  } else {
    throw new Error(data.message);
  }
}

// 獲取即將到期的合約
async function getExpiringContracts(daysAhead = 30) {
  const response = await fetch(`/gym/reports/contract-expiry?days_ahead=${daysAhead}`);
  const data = await response.json();

  if (data.success) {
    return data.grouped; // { urgent, soon, upcoming }
  } else {
    throw new Error(data.message);
  }
}

// 刷新報表資料
async function refreshReports() {
  const response = await fetch('/gym/reports/refresh', {
    method: 'POST'
  });
  const data = await response.json();
  return data;
}
```

---

## 效能優化

### 索引優化

系統已建立以下索引以加速查詢：

- `idx_payments_date` - 付款日期
- `idx_payments_branch_date` - 分店 + 付款日期
- `idx_members_created` - 會員建立日期
- `idx_members_branch_created` - 分店 + 建立日期
- `idx_contracts_end_date` - 合約到期日

### 快取策略

建議實作：

1. **Redis 快取** - 快取報表查詢結果 5-15 分鐘
2. **CDN 快取** - 快取靜態圖表圖片
3. **瀏覽器快取** - 設定適當的 Cache-Control headers

### 查詢最佳化

- 避免查詢過長的時間範圍（建議 ≤ 90 天）
- 使用分店篩選減少資料量
- 定期刷新物化視圖（建議每日凌晨）
- 考慮使用分頁 (pagination) 處理大量資料

---

## 常見問題

### Q1: 報表資料不是最新的怎麼辦？

A: 執行刷新報表 API：
```bash
curl -X POST "http://localhost:8055/gym/reports/refresh"
```

### Q2: 查詢速度慢怎麼辦？

A:
1. 縮小時間範圍
2. 使用分店篩選
3. 檢查物化視圖是否需要刷新
4. 考慮實作快取層

### Q3: 如何自動化報表刷新？

A: 可以使用 cron job 或排程任務：
```bash
# 每天凌晨 2 點刷新報表
0 2 * * * curl -X POST "http://localhost:8055/gym/reports/refresh"
```

### Q4: 可以匯出報表資料嗎？

A: API 回傳 JSON 格式，前端可以：
1. 轉換為 CSV 並下載
2. 生成 PDF 報表
3. 匯出到 Excel

---

## 版本歷史

- **v1.0.0** (2025-12-26)
  - 初始版本
  - 營收報表
  - 會員成長報表
  - 合約到期提醒
  - 會員活躍度報表
  - 測試資料生成

---

## 授權與支援

如有問題請聯繫技術支援團隊。
