# CLAUDE.md

此文件為 Claude Code (claude.ai/code) 在處理此儲存庫程式碼時提供指導方針。

## 專案概覽 (Project Overview)

Gym Nexus 是一個多分店健身房管理系統 (CRM/ERP)，建構於：
- **後端 (Backend):** Directus (Headless CMS) 運行於 Node.js
- **資料庫 (Database):** PostgreSQL
- **前端 (Frontend):** Nuxt 3 (monorepo 架構，包含 member-app 和 admin-web)
- **基礎設施 (Infrastructure):** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **套件管理器 (Package Manager):** pnpm (必須使用 pnpm，請勿使用 npm 或 yarn)

## 開發指令 (Development Commands)

### 後端 (Directus + PostgreSQL)
```bash
cd backend
docker-compose up -d
# Directus 運行於 http://localhost:8055
```

### 前端 (Nuxt 3)
```bash
cd frontend
pnpm install
pnpm dev
# 開發伺服器運行於 http://localhost:3000
```

## 架構 (Architecture)

### 專案結構 (Project Structure)
```
gym-nexus/
├── backend/
│   ├── extensions/     # 自定義 Directus hooks/endpoints
│   ├── migrations/     # 資料庫遷移 (包含索引優化)
│   ├── schema/         # 資料庫結構快照
│   ├── DATABASE_INDEXES.md  # 索引優化文件 (100+ 個索引)
│   └── docker-compose.yml
├── frontend/
│   ├── apps/
│   │   ├── member-app/ # 會員 PWA (預約、合約、入場條碼)
│   │   └── admin-web/  # 員工後台 (電子合約、報表)
│   └── packages/       # 共用 UI 元件
└── docs/
```

### 核心資料庫實體 (Core Database Entities)
1. **branches** - 多租戶根節點 (分為 HEADQUARTER 總部 / BRANCH 分店類型)
2. **employees** - 連結至 directus_users 的員工資料，包含職稱 (job_title) 和所屬分店 (branch)
3. **members** - 客戶資料，其狀態 (status) 會根據合約狀態自動更新
4. **contracts** - 核心業務資料表，連結會員 (members) 與會籍方案 (membership_plans)
5. **contract_logs** - 追蹤暫停/轉讓/展延紀錄 (自動展延 end_date)
6. **payments** - 每份合約的財務紀錄

### 權限模型 (Row-Level Security)
- **總部管理員 (HQ Admin):** 擁有完整系統存取權限
- **分店經理 (Store Manager):** 僅限 `branch_id = $CURRENT_USER.branch_id`
- **教練 (Coach):** 僅限 `sales_person_id = $CURRENT_USER.id`
- 權限設定儲存於 `job_titles.permissions_config` (JSON)，並可透過 `employees.custom_permissions` 針對個別員工進行覆寫

### 關鍵業務邏輯 (Key Business Logic)
- **合約類型:** 以時間為基礎 (TIME_BASED，如月費/年費) 和以次數為基礎 (COUNT_BASED，如課程包)
- **暫停邏輯:** 當合約暫停時，`end_date` 必須根據暫停期間自動展延
- **跨分店入場:** 會員歸屬於一個主要分店，但系統支援並記錄跨分店入場

### 通知系統 (Notification System)
- **電子郵件 (SMTP):** 透過 `EMAIL_SMTP_*` 環境變數設定，支援合約到期提醒、預約確認、歡迎信
- **推播通知 (Push Notifications):** 透過 VAPID keys (`VAPID_*` 環境變數) 進行 Web Push
- **郵件模板:** 位於 `backend/extensions/directus-extension-gym-hooks/src/email-service.js`

### 報表 API (Reports API)
- **端點:** `/gym/reports/revenue`, `/gym/reports/member-growth`, `/gym/reports/contract-expiry`, `/gym/reports/member-activity`
- **快取:** 可選的 Redis 快取用於報表查詢 (10 分鐘 TTL)
- **文件:** 詳細 API 文件請參閱 `backend/REPORTS_API.md`

### 資料庫效能 (Database Performance)
- **PostgreSQL 18 + PostGIS 3.6**: 支援空間查詢的最新版本
- **100+ 優化索引**: B-tree, GIN (JSONB), GiST (spatial/range), BRIN (timeseries), Partial
- **效能**: 多租戶查詢效能提升 40-50 倍
- **細節:** 完整文件請參閱 `backend/DATABASE_INDEXES.md`

### 連接埠設定 (Port Configuration - 避免 Windows 衝突)
- **Directus**: http://localhost:8055
- **PostgreSQL**: localhost:15432
- **Redis**: localhost:6333

## 語言 (Language)

專案文件與使用者介面 (UI) 使用 **繁體中文 (Traditional Chinese)**。程式碼與技術實作 (如變數名稱) 應使用英文。
