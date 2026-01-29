# Admin Web Dashboard (apps/admin-web) Documentation

**上次更新時間:** 2026-01-29
**狀態:** 已完成 Phase 4 開發，進入維護與優化階段 (Production Ready)

## 1. 專案概述
`admin-web` 是 Gym Nexus 系統的核心管理後台，專為健身房管理者、教練及櫃檯人員設計。採用 **Nuxt 4** 框架構建，支援多門店 (Multi-Store/Chain) 架構與 SaaS 租戶管理。

### 技術棧
- **Framework:** Nuxt 4.2.1 (Vue 3.5.25, Vite)
- **Language:** TypeScript (Strict Mode)
- **State Management:** Composables (Vue 3 Composition API)
- **Styling:** Tailwind CSS, Shadcn/UI (via `packages/ui`)
- **API Client:** Directus SDK (Auto-typed)
- **Validation:** Zod
- **PDF/Excel:** jsPDF, jspdf-autotable, xlsx
- **Error Monitoring:** Sentry
- **PWA:** @vite-pwa/nuxt

## 2. 核心功能模組 (Core Modules)

### 2.1 儀表板 (Dashboard)
- **路徑:** `/`
- **功能:** 顯示關鍵營運指標 (KPIs)，如今日入場人數、新簽合約、待處理事項。

### 2.2 CRM 客戶關係管理

#### 會員管理 (`/members`)
- 會員列表與搜尋 (姓名、電話、ID)
- 新增會員 (`/members/new`)
- 會員詳細資料 (`/members/[memberId]`)
- 編輯會員資料 (`/members/[memberId]/edit`)
- 會員時間軸 (Timeline)：記錄所有互動與變更

#### 合約管理 (`/contracts`)
- 合約列表與搜尋
- 建立新合約 (`/contracts/new`)
- 合約詳情與電子簽署 (`/contracts/[contractId]`)
- 合約狀態追蹤 (DRAFT, ACTIVE, PAUSED, EXPIRED, TERMINATED)
- 暫停與請假管理（自動延長結束日期）

#### 方案管理 (`/plans`)
- 會籍方案列表
- 新增方案 (`/plans/new`)
- 編輯方案 (`/plans/[planId]/edit`)
- 支援 TIME_BASED（期限制）與 COUNT_BASED（堂數制）

### 2.3 營運與課務 (Operations)

#### 入場簽到 (`/checkin`)
- 會員掃碼/輸入 ID 入場（整合 QR Code 掃描器）
- 即時顯示會員狀態（是否欠費、合約有效性）
- 身份驗證方式選擇

#### 課程管理 (`/classes`)
- 團課與私教課設定 (`/classes`, `/classes/new`)
- 課程類別管理 (`/classes/categories`)
- 課表排程 (`/classes/schedule`)
- 預約管理 (`/classes/bookings`)

#### 員工排班 (`/schedules`)
- 班表管理首頁 (`/schedules`)
- 排班行事曆 (`/schedules/calendar`)
- 排班報表 (`/schedules/reports`)

> **注意：** 此模組為員工值班排程，與 `/classes/schedule`（課程排課）和 `/hr/schedules`（HR 出勤排班）為不同功能。

### 2.4 人力資源 (HRM)
- **路徑:** `/hr`

#### 員工管理 (`/hr/employees`)
- 員工列表、新增、編輯、詳情頁
- 員工檔案與職位資訊

#### 職位管理 (`/hr/job-titles`)
- 職位列表、新增、編輯
- 權限設定 (`permissions_config`)

#### 出勤管理
- 打卡記錄 (`/hr/attendance`)
- 請假審批 (`/hr/leaves`)
- 補休/調休管理 (`/hr/makeup`)
- HR 排班管理 (`/hr/schedules`)
- HR 報表統計 (`/hr/reports`)

### 2.5 財務與報表 (Finance & BI)

#### 支付管理 (`/payments`)
- 交易記錄查詢
- 新增付款記錄 (`/payments/new`)
- 退款處理

#### BI 報表中心 (`/reports`)
- 銷售報表 (Sales Report)
- 消課報表 (Execution Report)
- 營收與利潤分析
- 會員增長統計

### 2.6 門店管理 (`/branches`)
- 分店列表與管理
- 新增分店 (`/branches/new`)
- 分店詳情與編輯 (`/branches/[branchId]`, `/branches/[branchId]/edit`)
- 支援 HEADQUARTER / BRANCH 層級

### 2.7 系統設定 (`/settings`)

#### 通知設定 (`/settings/notifications`)
- 通知偏好設定
- 通知使用量統計 (`/settings/notifications/usage`)

#### Google 整合 (`/settings/google-integration`)
- Google Sheets 匯出功能
- OAuth 授權回調 (`/settings/google-integration/callback`)

## 3. 進階管理功能 (Admin Features - Phase 4)

這些功能位於 `/admin` 路徑下，主要由 HQ 或系統管理員使用。

### 3.1 SaaS 訂閱與帳單管理

#### 訂閱管理 (`/admin/subscriptions`)
- 查看所有租戶的訂閱狀態
- 建立新訂閱 (`/admin/subscriptions/new`)
- 訂閱詳情與變更 (`/admin/subscriptions/[subscriptionId]`)
- 變更方案、取消訂閱

#### 帳單管理 (`/admin/invoices`)
- 帳單列表
- 帳單詳情與 PDF 下載 (`/admin/invoices/[invoiceId]`)
- 逾期帳單追蹤

### 3.2 數據分析與監控

#### 會員分析 (`/admin/member-analytics`)
- 會員增長趨勢圖
- 會員狀態分佈、年齡分佈、合約類型分佈
- 流失率分析 (Churn Rate)

#### API 使用統計 (`/admin/analytics`)
- 監控 API 請求量、錯誤率、回應時間
- 流量限制 (Rate Limiting) 記錄
- 租戶配額使用狀況

### 3.3 安全與審計

#### 審計日誌 (`/admin/audit-logs`)
- 全面的操作記錄（建立、更新、刪除）
- 支援 JSON Diff 查看資料變更前後差異
- 依操作類型、資源、使用者、嚴重程度篩選
- 匯出 CSV 記錄

### 3.4 租戶管理 (`/admin/tenants`)
- 租戶列表
- 新增租戶 (`/admin/tenants/new`)
- 租戶詳情與配額管理 (`/admin/tenants/[tenantId]`)

## 4. 共用元件 (Components)

| 元件 | 說明 |
|------|------|
| `ConfirmDialog.vue` | 通用確認對話框 |
| `ToastContainer.vue` | Toast 通知容器 |
| `GoogleSheetsExport.vue` | Google Sheets 匯出工具 |
| `QrScanner.vue` | QR Code 掃描器 |
| `SignaturePad.vue` | 電子簽名元件 |
| `VerificationMethodSelector.vue` | 身份驗證方式選擇器 |
| `NoEmployeeWarning.vue` | 員工資料缺失警告 |
| `TenantQuotaCard.vue` | 租戶配額顯示卡片 |
| `admin/HealthBadge.vue` | 健康狀態徽章 |
| `admin/QuotaBar.vue` | 配額進度條 |

> **注意：** 大部分 UI 元件來自共用套件 `packages/ui` 和 `@gym-nexus/shared`。

## 5. Composables (狀態管理)

應用程式使用 **Composables** 進行狀態管理，共 38 個。

### 核心 Composables
| Composable | 說明 |
|------------|------|
| `useAuth()` | 認證與使用者資料 |
| `useDirectus()` | Directus SDK 客戶端 |
| `useApi()` | API 請求封裝 |
| `useErrorHandler()` | 全域錯誤處理 |
| `useFormValidation()` | 表單驗證 |
| `useZodFormValidation()` | Zod Schema 驗證 |
| `useToast()` | Toast 通知 |
| `useConfirm()` | 確認對話框 |
| `useTheme()` | 主題切換 |
| `usePermissions()` | 權限檢查 |

### 業務 Composables
| Composable | 說明 |
|------------|------|
| `useMembers()` | 會員 CRUD |
| `useContracts()` | 合約管理 |
| `usePlans()` | 方案管理 |
| `usePayments()` | 支付記錄 |
| `useBranches()` | 門店管理 |
| `useEmployees()` | 員工管理 |
| `useJobTitles()` | 職位管理 |
| `useClasses()` | 課程管理 |
| `useClassCategories()` | 課程類別 |
| `useClassBookings()` | 課程預約 |
| `useClassSchedule()` | 課表排程 |
| `useCheckin()` | 入場簽到 |
| `useReports()` | 報表資料 |
| `useHR()` | HR 通用操作 |

### HR 專用 Composables (`composables/hr/`)
| Composable | 說明 |
|------------|------|
| `useAttendance()` | 出勤追蹤 |
| `useLeaveRequests()` | 請假管理 |
| `useMakeupRequests()` | 補休管理 |
| `useShiftSchedules()` | 排班管理 |

## 6. 目錄結構
```
apps/admin-web/app/
├── components/         # 共用元件 (10 個)
├── composables/        # 邏輯複用 (38 個)
│   └── hr/             # HR 專用 composables
├── constants/          # 常數定義
│   ├── index.ts        # 主要常數
│   └── permissions.ts  # 權限定義
├── layouts/            # 頁面佈局
│   └── default.vue     # 主佈局（含側邊導航）
├── middleware/         # 路由中介
│   └── auth.ts         # 認證守衛
├── pages/              # 路由頁面 (57 個)
│   ├── admin/          # 進階管理 (SaaS, Analytics, Audit)
│   ├── branches/       # 門店模組
│   ├── checkin/        # 簽到模組
│   ├── classes/        # 課程模組
│   ├── contracts/      # 合約模組
│   ├── hr/             # 人資模組
│   ├── members/        # 會員模組
│   ├── payments/       # 支付模組
│   ├── plans/          # 方案模組
│   ├── reports/        # 報表模組
│   ├── schedules/      # 排班模組
│   └── settings/       # 設定模組
├── plugins/            # 插件 (3 個)
│   ├── directus.client.ts
│   ├── sentry.client.ts
│   └── session-rehydration.client.ts
├── stores/             # (未使用，採用 composables)
└── types/              # TypeScript 定義
```

## 7. 統計摘要

| 類別 | 數量 |
|------|------|
| Vue 頁面 | 57 |
| Composables | 38 |
| 元件 | 10 |
| 插件 | 3 |
| 中介層 | 1 |
| 佈局 | 1 |
