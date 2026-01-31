# Gym Nexus 專案 Gemini 指南

## 1. 專案概覽 (Project Overview)
Gym Nexus 是一套為支援 **多店點/連鎖架構 (Multi-Store/Chain)** 設計的綜合健身房管理系統。
本專案採用現代化的全端架構，包含 Headless CMS 後端與 Nuxt 前端 Monorepo。

### 核心設計理念
- **通用會員帳號 (Universal ID):** 跨分店與服務的單一底層使用者帳號系統。
- **分層管理 (Hierarchical Management):** 明確區分總部 (HQ) 與分店 (Branch) 的營運權限。
- **整合解決方案:** 統一整合 CRM 客戶管理、電子合約、HR/薪資管理以及 BI 營運報表。

### 核心目標
- **會員管理:** 合約管理、簽到入場、個人檔案、通用存取權。
- **管理後台:** 員工管理、報表分析、系統設定、多店視圖。
- **會員 App:** 課程預約、線上支付、QR Code 入場。
- **可擴展性:** 容器化服務 (Dockerized)、Redis 快取、PostgreSQL 優化。

## 2. 技術堆疊與架構 (Tech Stack & Architecture)

### 2.1 技術堆疊
#### 後端 (Dockerized)
位於 `backend/`
- **CMS/API:** [Directus 11](https://directus.io/) (Headless CMS, Node.js)
- **資料庫:** PostgreSQL 17 + PostGIS 3.4 (地理空間支援)
- **快取:** Redis 7 (Session, API 快取)
- **基礎設施:** Docker Compose

#### 前端 (Monorepo)
位於 `frontend/` (透過 `pnpm` workspaces 管理)
- **框架:** [Nuxt 4](https://nuxt.com/) (Vue 3, Vite)
- **語言:** TypeScript
- **樣式:** Tailwind CSS
- **狀態/驗證:** Zod, Pinia
- **測試:** Vitest (單元測試), Playwright (E2E 測試)

#### 應用程式
- **Admin Web (管理後台):** `apps/admin-web` (Port 3001) - 供員工與管理層使用。
- **Member App (會員 App):** `apps/member-app` (Port 3002) - 供健身房會員使用的 PWA。
- **共用套件:** `packages/shared`, `packages/ui`

### 2.2 系統架構邏輯
- **多店架構支援:**
  - **總部 (HQ):** 可存取所有分店數據、跨店報表以及全域政策設定。
  - **分店 (Branch):** 僅能存取本地數據、員工與會員資料。
- **通用會員系統 (Global Membership):**
  - 唯一的底層 `User` ID。
  - 支援未來擴充至其他服務型態（如：皮拉提斯、物理治療），並共用基礎資料。

## 3. 功能模組詳解 (Functional Modules)

### 模組一：CRM 與合約中心
*目標：具備精確篩選與數位化行政管理的完整會員資料庫。*

- **客戶名單資料庫:**
  - **篩選器:** 分店、月份、負責教練、關鍵字（姓名/電話/ID）、合約狀態（合約中/過期/已終止）。
  - **列表欄位:** 會員資訊、當前方案、財務狀況（預收/已實現營收）、負責教練。
  - **管理功能:** 店長可執行會員/合約的「移交」作業（更換負責教練）。
- **會員個人檔案:**
  - **基本資料:** 個人簡介、時間軸、聯絡資訊。
  - **電子合約:** 合約生成、數位簽名、自動寄送副本、雲端存檔。
  - **歷程紀錄:** 消費紀錄、上課/簽到紀錄。

### 模組二：HR 與薪資管理 (HRM)
*目標：獨立的員工管理系統，包含考勤與薪酬計算。*

- **員工檔案:** 職位、所屬分店、在職狀態、RBAC 角色。
- **考勤與休假:**
  - 上下班打卡紀錄（時間與地點/IP）。
  - 請假申請與簽核流程（特休、病假、事假等）。
- **薪資計算:**
  - **公式:** 底薪 + 執行獎金 (課時費) + 銷售佣金 (業績抽成) - 請假扣款。
  - 支援依職級設定不同的抽成比例。

### 模組三：BI 營運報表中心
*目標：自動化產出圖表與數據，支援「單店」與「全分店彙整」視角。*

- **維度:** 日/週/月；全店/個人。
- **五大核心報表:**
  1.  **銷售報表 (Sales Report):** 新簽訂合約金額（現金流）。
  2.  **執行報表 (Execution Report):** 實際授課認列金額（已實現收入）。
  3.  **損益報表 (Revenue/Profitability):** 銷售額 - (人事 + 營運成本) = 粗利。
  4.  **退費報表 (Refund Report):** 退費紀錄、原因分析與手續費。
  5.  **應收報表 (AR):** 已簽約但尚未入帳之款項。

### 模組四：權限與安全管理 (Admin & Security)

- **角色權限控制 (RBAC):**
  - **總管理員 (Super Admin):** 擁有完整權限。
  - **店長 (Store Manager):** 完整分店權限、員工請假審核、會員移交。
  - **副店長 (Vice Manager):** 協助店長，僅唯讀或部分操作權限。
  - **教練 (Coach):** 僅檢視自己負責的會員、執行課程核銷、查看個人業績。
  - **行政人員 (Admin Staff):** 資料輸入、收款、退費操作（無法查看薪資）。
  - **行銷 (Marketing):** 匯出匿名名單進行分析。
- **權限介面:** 在預設角色之上，提供細顆粒度的 Checkbox 勾選系統以自訂權限。

## 4. 技術與數據策略 (Technical & Data Strategy)

1.  **Tenant ID (Store_ID):**
    - 所有核心資料表（會員、合約、交易紀錄）必須包含 `Store_ID` 欄位。
    - 實現數據隔離：總部可見 `Store_ID = All`，分店僅見 `Store_ID = X`。
2.  **全域用戶 (Global User) vs 本地會員 (Local Member):**
    - 將 `Users` 表（帳號驗證、Universal ID）與 `Members` 表（分店專屬會籍）分離。
    - 一個 `User` 可對應多個 `Member` 紀錄（例如：在 A 店是教練，在 B 店是一般會員）。
3.  **薪資計算實作策略:**
    - 初期階段：專注於「業績獎金」與「課時費」的計算。
    - 底薪與複雜扣款初期建議透過匯出 Excel 或外部系統處理，以降低開發風險。

## 5. 快速開始指南

### 前置需求
- Node.js & pnpm (前端用)
- Docker & Docker Compose (後端用)

### 後端設置
1. 進入後端目錄:
   ```bash
   cd backend
   ```
2. 啟動服務:
   ```bash
   docker-compose up -d
   ```
   - Directus 控制台: `http://localhost:8055`
   - 資料庫: Port 5444
   - Redis: Port 6333

### 前端設置
1. 進入前端目錄:
   ```bash
   cd frontend
   ```
2. 安裝依賴:
   ```bash
   pnpm install
   ```
3. 啟動開發伺服器:
   - **管理後台 (Admin Web):**
     ```bash
     pnpm dev:admin
     ```
   - **會員 App (Member App):**
     ```bash
     pnpm dev:member
     ```

## 6. 關鍵指令參考

| 類別 | 指令 | 說明 | 目錄 |
|----------|---------|-------------|-----------|
| **Backend** | `docker-compose up -d` | 啟動後端服務 | `backend/` |
| | `docker-compose down` | 停止後端服務 | `backend/` |
| | `docker-compose logs -f` | 查看日誌 | `backend/` |
| **Frontend** | `pnpm install` | 安裝依賴 | `frontend/` |
| | `pnpm dev:admin` | 啟動管理後台 (Port 3001) | `frontend/` |
| | `pnpm dev:member` | 啟動會員 App (Port 3002) | `frontend/` |
| | `pnpm build` | 建置所有應用 | `frontend/` |
| | `pnpm typecheck` | 執行型別檢查 | `frontend/` |
| | `pnpm lint` | 執行 ESLint | `frontend/` |
| **Testing** | `pnpm test` | 執行單元測試 (Vitest) | `frontend/` |
| | `pnpm test:e2e` | 執行 E2E 測試 (Playwright) | `frontend/` |
| | `pnpm test:e2e:ui` | E2E 測試 (UI 模式) | `frontend/` |

## 7. 目錄結構概覽

```
.
├── backend/                # 後端基礎設施與設定
│   ├── docker-compose.yml  # 服務定義
│   ├── migrations/         # SQL 資料庫遷移檔
│   ├── extensions/         # Directus 自訂擴充
│   └── uploads/            # 本地檔案儲存
├── frontend/               # 前端 Monorepo 根目錄
│   ├── apps/
│   │   ├── admin-web/      # 管理後台 (Nuxt)
│   │   └── member-app/     # 會員 PWA (Nuxt)
│   ├── packages/           # 共用程式碼
│   ├── e2e/                # Playwright E2E 測試
│   └── package.json        # Workspace 腳本
├── docs/                   # 專案文件
└── .github/                # CI/CD 工作流程
```

## 8. 開發規範與 AI 指引

### 程式碼風格
- **Vue/Nuxt:** 使用 Composition API (`<script setup lang="ts">`)。
- **TypeScript:** 偏好嚴格型別 (Strict typing)。使用 Zod 進行執行時驗證。
- **命名:** 元件使用 PascalCase，函式/變數使用 camelCase。

### 測試
- **單元測試:** 針對工具函式與複雜元件編寫 Vitest 測試。
- **E2E 測試:** 關鍵流程（驗證、支付、預約）必須由 Playwright 覆蓋。
- **執行測試:** 提交前務必執行 `pnpm typecheck` 與 `pnpm lint`。

### Git 工作流
- **Commit 訊息:** 遵循 Conventional Commits (例如: `feat:`, `fix:`, `chore:`)。
- **分支:** 偏好使用功能分支 (Feature branches)。

### 重要注意事項
- **Directus:** 後端邏輯高度依賴 Directus 數據驅動。Schema 變更通常需要遷移檔 (`backend/migrations`)。
- **環境變數:** 請檢查各目錄下的 `.env.example` 檔案以確認所需變數。
