# Looker Studio 整合設定指南

本指南將協助您設定 Looker Studio 與 Gym Nexus 系統的整合，建立專業的報表儀表板。

## 整合架構

```
Gym Nexus (PostgreSQL)
    ↓
BigQuery (資料倉儲)
    ↓
Looker Studio (視覺化報表)
```

整合流程：
1. 定期將報表資料從 PostgreSQL 匯出到 BigQuery
2. Looker Studio 連接到 BigQuery 資料源
3. 使用 Looker Studio 建立互動式儀表板

## 前置需求

- Google Cloud 專案（與 Google Sheets 整合可共用）
- BigQuery API 已啟用
- 服務帳號（Service Account）權限
- 約 15-30 分鐘設定時間

---

## 第一部分：BigQuery 設定

### 步驟 1: 啟用 BigQuery API

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 選擇您的專案
3. 前往「API 和服務」→「程式庫」
4. 搜尋「BigQuery API」並點擊「啟用」

### 步驟 2: 建立 BigQuery 資料集

1. 在 Google Cloud Console 中，前往「BigQuery」
2. 在左側導覽列中，找到您的專案
3. 點擊專案名稱旁的「⋮」→「建立資料集」
4. 填寫資料集資訊：
   - **資料集 ID**: `gym_nexus_reports`
   - **資料位置**: 選擇最接近您的區域（例如：asia-east1 台灣）
   - **預設資料表到期時間**: 永不過期
5. 點擊「建立資料集」

### 步驟 3: 建立報表資料表

在 BigQuery 中建立以下四個資料表：

#### 3.1 營收報表資料表

```sql
CREATE TABLE `gym_nexus_reports.revenue_daily` (
  payment_day DATE NOT NULL,
  branch_id STRING,
  branch_name STRING,
  transaction_count INT64,
  total_income FLOAT64,
  total_refund FLOAT64,
  net_revenue FLOAT64,
  unique_members INT64,
  cash_income FLOAT64,
  credit_card_income FLOAT64,
  bank_transfer_income FLOAT64,
  line_pay_income FLOAT64,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY payment_day
OPTIONS(
  description="每日營收報表資料",
  require_partition_filter=false
);
```

#### 3.2 會員成長資料表

```sql
CREATE TABLE `gym_nexus_reports.member_growth_daily` (
  join_day DATE NOT NULL,
  branch_id STRING,
  branch_name STRING,
  new_members INT64,
  active_members INT64,
  male_count INT64,
  female_count INT64,
  sales_persons_involved INT64,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY join_day
OPTIONS(
  description="每日會員成長資料"
);
```

#### 3.3 合約到期提醒資料表

```sql
CREATE TABLE `gym_nexus_reports.contract_expiry` (
  contract_id STRING NOT NULL,
  contract_no STRING,
  member_id STRING,
  member_name STRING,
  member_code STRING,
  member_phone STRING,
  member_email STRING,
  branch_id STRING,
  branch_name STRING,
  plan_name STRING,
  start_date DATE,
  end_date DATE,
  contract_status STRING,
  payment_status STRING,
  days_until_expiry INT64,
  sales_person_id STRING,
  sales_person_name STRING,
  total_amount FLOAT64,
  total_paid FLOAT64,
  outstanding_amount FLOAT64,
  snapshot_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY snapshot_date
OPTIONS(
  description="合約到期提醒資料（每日快照）"
);
```

#### 3.4 會員活躍度資料表

```sql
CREATE TABLE `gym_nexus_reports.member_activity_daily` (
  activity_day DATE NOT NULL,
  branch_id STRING,
  branch_name STRING,
  total_check_ins INT64,
  unique_members INT64,
  qr_code_count INT64,
  manual_count INT64,
  card_count INT64,
  morning_count INT64,
  afternoon_count INT64,
  evening_count INT64,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY activity_day
OPTIONS(
  description="每日會員活躍度資料"
);
```

### 步驟 4: 建立服務帳號

1. 前往「IAM 與管理」→「服務帳號」
2. 點擊「建立服務帳號」
3. 填寫服務帳號資訊：
   - **名稱**: `gym-nexus-bigquery`
   - **描述**: `BigQuery 資料上傳服務帳號`
4. 授予權限：
   - 選擇「BigQuery 資料編輯者」(BigQuery Data Editor)
   - 選擇「BigQuery 工作使用者」(BigQuery Job User)
5. 點擊「完成」

### 步驟 5: 建立服務帳號金鑰

1. 在服務帳號列表中，找到剛建立的服務帳號
2. 點擊「⋮」→「管理金鑰」
3. 點擊「新增金鑰」→「建立新的金鑰」
4. 選擇「JSON」格式
5. 點擊「建立」，JSON 金鑰檔案會自動下載
6. **妥善保管此檔案**，將其儲存到安全位置（例如：`backend/config/google-service-account-key.json`）
7. **切勿將此檔案提交到 Git**，請將其加入 `.gitignore`

---

## 第二部分：資料上傳腳本

### 建立資料上傳服務

在 `backend/services/bigquery-export.js` 中建立資料上傳腳本：

```javascript
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

// 初始化 BigQuery 客戶端
const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  keyFilename: path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
});

const datasetId = process.env.BIGQUERY_DATASET_ID || 'gym_nexus_reports';

/**
 * 上傳營收報表資料到 BigQuery
 */
async function uploadRevenueData(data) {
  const tableId = 'revenue_daily';
  const rows = data.map(row => ({
    payment_day: row.payment_day,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    transaction_count: parseInt(row.transaction_count),
    total_income: parseFloat(row.total_income),
    total_refund: parseFloat(row.total_refund),
    net_revenue: parseFloat(row.net_revenue),
    unique_members: parseInt(row.unique_members),
    cash_income: parseFloat(row.cash_income),
    credit_card_income: parseFloat(row.credit_card_income),
    bank_transfer_income: parseFloat(row.bank_transfer_income),
    line_pay_income: parseFloat(row.line_pay_income)
  }));

  await bigquery
    .dataset(datasetId)
    .table(tableId)
    .insert(rows);

  console.log(`✓ 已上傳 ${rows.length} 筆營收資料到 BigQuery`);
}

/**
 * 上傳會員成長資料到 BigQuery
 */
async function uploadMemberGrowthData(data) {
  const tableId = 'member_growth_daily';
  const rows = data.map(row => ({
    join_day: row.join_day,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    new_members: parseInt(row.new_members),
    active_members: parseInt(row.active_members),
    male_count: parseInt(row.male_count),
    female_count: parseInt(row.female_count),
    sales_persons_involved: parseInt(row.sales_persons_involved)
  }));

  await bigquery
    .dataset(datasetId)
    .table(tableId)
    .insert(rows);

  console.log(`✓ 已上傳 ${rows.length} 筆會員成長資料到 BigQuery`);
}

/**
 * 上傳合約到期提醒資料到 BigQuery
 */
async function uploadContractExpiryData(data) {
  const tableId = 'contract_expiry';
  const today = new Date().toISOString().split('T')[0];

  const rows = data.map(row => ({
    contract_id: row.contract_id,
    contract_no: row.contract_no,
    member_id: row.member_id,
    member_name: row.member_name,
    member_code: row.member_code,
    member_phone: row.member_phone,
    member_email: row.member_email,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    plan_name: row.plan_name,
    start_date: row.start_date,
    end_date: row.end_date,
    contract_status: row.contract_status,
    payment_status: row.payment_status,
    days_until_expiry: parseInt(row.days_until_expiry),
    sales_person_id: row.sales_person_id,
    sales_person_name: row.sales_person_name,
    total_amount: parseFloat(row.total_amount),
    total_paid: parseFloat(row.total_paid),
    outstanding_amount: parseFloat(row.outstanding_amount),
    snapshot_date: today
  }));

  await bigquery
    .dataset(datasetId)
    .table(tableId)
    .insert(rows);

  console.log(`✓ 已上傳 ${rows.length} 筆合約到期資料到 BigQuery`);
}

/**
 * 上傳會員活躍度資料到 BigQuery
 */
async function uploadMemberActivityData(data) {
  const tableId = 'member_activity_daily';
  const rows = data.map(row => ({
    activity_day: row.activity_day,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    total_check_ins: parseInt(row.total_check_ins),
    unique_members: parseInt(row.unique_members),
    qr_code_count: parseInt(row.qr_code_count),
    manual_count: parseInt(row.manual_count),
    card_count: parseInt(row.card_count),
    morning_count: parseInt(row.morning_count),
    afternoon_count: parseInt(row.afternoon_count),
    evening_count: parseInt(row.evening_count)
  }));

  await bigquery
    .dataset(datasetId)
    .table(tableId)
    .insert(rows);

  console.log(`✓ 已上傳 ${rows.length} 筆會員活躍度資料到 BigQuery`);
}

/**
 * 執行完整的資料同步
 */
async function syncAllReportsToBigQuery() {
  try {
    console.log('開始同步報表資料到 BigQuery...');

    // 從 Directus API 獲取報表資料
    const baseURL = process.env.DIRECTUS_URL || 'http://localhost:8055';

    // 營收報表
    const revenueResponse = await fetch(`${baseURL}/gym/reports/revenue`);
    const revenueData = await revenueResponse.json();
    if (revenueData.success && revenueData.data.length > 0) {
      await uploadRevenueData(revenueData.data);
    }

    // 會員成長報表
    const growthResponse = await fetch(`${baseURL}/gym/reports/member-growth`);
    const growthData = await growthResponse.json();
    if (growthData.success && growthData.data.length > 0) {
      await uploadMemberGrowthData(growthData.data);
    }

    // 合約到期提醒
    const expiryResponse = await fetch(`${baseURL}/gym/reports/contract-expiry?days_ahead=90`);
    const expiryData = await expiryResponse.json();
    if (expiryData.success && expiryData.data.length > 0) {
      await uploadContractExpiryData(expiryData.data);
    }

    // 會員活躍度報表
    const activityResponse = await fetch(`${baseURL}/gym/reports/member-activity`);
    const activityData = await activityResponse.json();
    if (activityData.success && activityData.data.length > 0) {
      await uploadMemberActivityData(activityData.data);
    }

    console.log('✓ 所有報表資料已同步到 BigQuery');
  } catch (error) {
    console.error('同步失敗:', error);
    throw error;
  }
}

module.exports = {
  uploadRevenueData,
  uploadMemberGrowthData,
  uploadContractExpiryData,
  uploadMemberActivityData,
  syncAllReportsToBigQuery
};
```

### 安裝必要的套件

```bash
cd backend
npm install @google-cloud/bigquery
```

### 設定環境變數

在 `backend/.env` 中加入：

```bash
# BigQuery 設定
GOOGLE_PROJECT_ID=your_project_id_here
BIGQUERY_DATASET_ID=gym_nexus_reports
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/google-service-account-key.json
```

### 建立排程任務

使用 cron 或系統排程器每日自動同步資料：

```bash
# 每天凌晨 3 點執行同步
0 3 * * * cd /path/to/backend && node -e "require('./services/bigquery-export').syncAllReportsToBigQuery()"
```

或使用 Node.js cron 套件：

```javascript
const cron = require('node-cron');
const { syncAllReportsToBigQuery } = require('./services/bigquery-export');

// 每天凌晨 3 點執行
cron.schedule('0 3 * * *', async () => {
  console.log('執行每日 BigQuery 同步...');
  await syncAllReportsToBigQuery();
});
```

---

## 第三部分：Looker Studio 設定

### 步驟 1: 建立 Looker Studio 報表

1. 前往 [Looker Studio](https://lookerstudio.google.com/)
2. 點擊「建立」→「報表」
3. 選擇「BigQuery」作為資料來源
4. 授權 Looker Studio 存取您的 BigQuery 專案

### 步驟 2: 連接資料來源

1. 在資料來源選擇器中：
   - **專案**: 選擇您的 Google Cloud 專案
   - **資料集**: `gym_nexus_reports`
   - **資料表**: 選擇您要視覺化的資料表（例如：`revenue_daily`）
2. 點擊「新增」
3. 設定欄位類型（確保日期欄位是 Date 類型，數值欄位是 Number 類型）
4. 點擊「建立報表」

### 步驟 3: 建立報表元件

#### 營收報表儀表板範例

建議包含以下圖表：

1. **KPI 卡片**（關鍵指標）
   - 總營收
   - 淨營收
   - 交易筆數
   - 平均每日營收

2. **折線圖**（趨勢分析）
   - X 軸：payment_day
   - Y 軸：net_revenue
   - 系列：branch_name（分店比較）

3. **堆疊柱狀圖**（收入來源）
   - X 軸：payment_day
   - Y 軸：收入金額
   - 維度：現金、信用卡、銀行轉帳、LINE Pay

4. **圓餅圖**（分店營收佔比）
   - 維度：branch_name
   - 指標：net_revenue

5. **表格**（詳細資料）
   - 欄位：所有營收相關欄位
   - 可排序、可篩選

### 步驟 4: 新增篩選器

1. 點擊工具列的「新增控制項」→「日期範圍控制項」
2. 拖曳到報表頂部
3. 設定預設日期範圍（例如：過去 30 天）

4. 新增「分店篩選器」：
   - 點擊「新增控制項」→「下拉式選單」
   - 控制欄位：branch_name
   - 允許多選

### 步驟 5: 設定自動重新整理

1. 點擊「資源」→「管理新增的資料來源」
2. 選擇您的 BigQuery 資料來源
3. 點擊「編輯」
4. 在「資料新鮮度」設定中：
   - 選擇「啟用資料快取」
   - 設定快取期限（建議：1 小時）
5. 儲存變更

### 步驟 6: 共享報表

1. 點擊右上角「共用」按鈕
2. 設定存取權限：
   - **檢視者**：只能查看報表
   - **編輯者**：可以修改報表
3. 複製連結或透過電子郵件邀請使用者

---

## 儀表板範本建議

### 1. 營收分析儀表板

**資料來源**: `revenue_daily`

**主要元件**:
- 日期範圍選擇器
- 分店篩選器
- KPI 卡片（總收入、淨收入、退款金額、交易筆數）
- 營收趨勢折線圖（按日期）
- 分店營收比較橫條圖
- 收入來源圓餅圖（現金、信用卡等）
- 詳細交易表格

### 2. 會員成長儀表板

**資料來源**: `member_growth_daily`

**主要元件**:
- 日期範圍選擇器
- 分店篩選器
- KPI 卡片（總會員數、新增會員、活躍會員、成長率）
- 會員成長趨勢面積圖
- 性別分布圓餅圖
- 分店會員數比較圖
- 銷售人員績效表格

### 3. 合約管理儀表板

**資料來源**: `contract_expiry`

**主要元件**:
- 即將到期合約數量（7/30/90 天）
- 到期提醒時間軸
- 分店合約分布圖
- 付款狀態圓餅圖
- 未付款金額警示
- 合約詳細列表（可排序、可搜尋）

### 4. 會員活躍度儀表板

**資料來源**: `member_activity_daily`

**主要元件**:
- 入場次數趨勢圖
- 不重複會員數趨勢
- 入場方式分布（QR Code、手動、卡片）
- 時段分析熱圖（早/午/晚）
- 分店活躍度比較
- 每日入場詳細表格

---

## 進階功能

### 1. 混合資料來源

結合多個 BigQuery 資料表建立綜合報表：

1. 在 Looker Studio 中，點擊「資源」→「管理混合資料」
2. 點擊「新增混合資料」
3. 選擇要混合的資料表（例如：revenue_daily + member_growth_daily）
4. 設定聯結鍵（例如：payment_day = join_day, branch_id = branch_id）
5. 選擇需要的欄位
6. 儲存混合資料來源

### 2. 計算欄位

建立自訂計算欄位：

```
成長率 = (new_members / LAG(new_members)) - 1
平均客單價 = total_income / transaction_count
退款率 = total_refund / total_income
```

### 3. 嵌入報表到網站

1. 在報表中，點擊「檔案」→「嵌入報表」
2. 複製嵌入程式碼
3. 在您的網站中貼上 iframe 程式碼

```html
<iframe
  width="100%"
  height="800"
  src="https://lookerstudio.google.com/embed/reporting/YOUR_REPORT_ID/page/YOUR_PAGE_ID"
  frameborder="0"
  style="border:0"
  allowfullscreen
></iframe>
```

---

## 常見問題

### Q1: 資料沒有即時更新怎麼辦？

A: Looker Studio 有快取機制，資料可能延遲數分鐘到數小時。若需立即查看最新資料：
1. 點擊報表右上角的「重新整理資料」
2. 或設定較短的快取時間（資源 → 管理新增的資料來源 → 資料新鮮度）

### Q2: BigQuery 費用如何計算？

A: BigQuery 採用按查詢收費：
- **儲存費用**: 前 10 GB 免費，之後約 $0.02/GB/月
- **查詢費用**: 前 1 TB 免費，之後約 $5/TB
- **建議**: 使用分區資料表 (PARTITION BY) 降低查詢成本

### Q3: 如何設定資料存取權限？

A:
1. 在 BigQuery 中設定資料集權限（IAM → 新增成員）
2. 授予「BigQuery 資料檢視者」角色給需要查看報表的使用者
3. 在 Looker Studio 中，這些使用者可以建立自己的報表副本

### Q4: 如何備份 Looker Studio 報表？

A:
1. 開啟報表
2. 點擊「檔案」→「建立副本」
3. 定期匯出為 PDF（檔案 → 下載為 PDF）

---

## 最佳實踐

1. **定期同步資料**: 設定每日自動同步，確保資料最新
2. **使用分區資料表**: 降低 BigQuery 查詢成本
3. **建立多個專門儀表板**: 不要將所有圖表放在一個頁面
4. **設定適當的快取**: 平衡資料新鮮度和查詢效能
5. **監控 BigQuery 用量**: 定期檢查費用和配額使用情況
6. **備份報表設定**: 定期建立報表副本
7. **使用資料新鮮度指標**: 在報表中顯示最後更新時間

---

## 進一步學習資源

- [Looker Studio 官方文件](https://support.google.com/looker-studio)
- [BigQuery 最佳實踐](https://cloud.google.com/bigquery/docs/best-practices)
- [Looker Studio 社群範本](https://lookerstudio.google.com/gallery)

---

## 技術支援

如有問題，請聯繫技術支援團隊或參考：
- [Google Cloud 支援](https://cloud.google.com/support)
- [Looker Studio 說明中心](https://support.google.com/looker-studio)
