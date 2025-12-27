# Gym Nexus - 智慧健身房管理系統 (CRM/ERP)

[![Directus](https://img.shields.io/badge/Backend-Directus-6644FF?style=flat-square&logo=directus)](https://directus.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Nuxt](https://img.shields.io/badge/Frontend-Nuxt%203-00DC82?style=flat-square&logo=nuxt.js)](https://nuxt.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Gym Nexus** 是一個基於現代化技術堆疊構建的健身房全方位管理系統。本專案旨在解決多場館管理、複雜會籍合約、HR 考勤以及數據報表分析等核心需求。系統架構採用 Headless CMS 搭配高效能前端框架，確保開發速度與系統擴充性。

---

## 📖 文件導覽 (Documentation)

| 文件 | 說明 | 適合讀者 |
|------|------|----------|
| **[PRD.md](./PRD.md)** | 產品需求文件 - 功能規格、使用者角色、驗收標準 | PM、利害關係人、QA |
| **[健身房系統架構設計.md](./健身房系統架構設計.md)** | 技術架構文件 - 資料庫 Schema、欄位定義、權限實作 | 開發者、DBA |
| **[backend/DATABASE_INDEXES.md](./backend/DATABASE_INDEXES.md)** | 資料庫索引優化文件 - 100+ 索引、性能基準 | DBA、後端開發者 |
| **[backend/REPORTS_API.md](./backend/REPORTS_API.md)** | 報表 API 文件 - 營收、會員成長、合約到期提醒 | 前端開發者、API 使用者 |
| **[CLAUDE.md](./CLAUDE.md)** | AI 開發助理指引 - 專案結構與開發命令 | AI 工具、新進開發者 |

---

## 🎯 專案目標 (Project Goals)

### 商業目標
- 建立可擴展架構，支援 **50+ 間分店** 的數據量與查詢效能
- 減少人工作業錯誤，合約異動 (請假/轉讓) **自動計算到期日**
- 提供精準的權限分級，確保 **資料隔離** (總部 → 店長 → 教練)
- 整合 HR 與財務模組，產出 **即時營運報表**

### 技術目標
- 採用 Headless CMS 架構，前後端完全分離
- 實現 Row-Level Security (RLS)，從資料庫層保障資料安全
- 支援 PWA / Capacitor，一套代碼部署 Web + Mobile
- **資料庫性能優化**：100+ 專業索引，查詢速度提升 40-50 倍
- 預留 Wger 運動數據整合接口

---

## 🚀 技術堆疊 (Tech Stack)

### Backend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Directus** | Headless CMS、API 自動生成、權限管理 | v11.x |
| **PostgreSQL + PostGIS** | 核心資料庫 + 地理空間擴展 | v18 + 3.6 |
| **Node.js** | Directus Runtime & Extensions | v20 LTS |
| **Redis** | 快取與 Session 管理 | v7 Alpine |

### Frontend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Nuxt 3** | SSR/SSG 框架 | v3.x |
| **Vue 3** | UI 框架 | v3.5 |
| **Tailwind CSS** | 樣式系統 | v3.x |
| **Pinia** | 狀態管理 | v2.x |

### Infrastructure
| 服務 | 用途 |
|------|------|
| **Cloudflare Pages** | 前端靜態部署 |
| **Cloudflare R2** | 檔案儲存 (合約 PDF、簽名圖檔) |
| **Coolify (VPS)** | Backend 容器部署 |
| **Docker** | 本地開發環境 |

---

## 📚 核心功能 (Core Features)

### 1. 多場館架構 (Multi-Tenancy)
- 支援總部 (HEADQUARTER) 與分店 (BRANCH) 階層
- 資料與報表依 `branch_id` 自動隔離
- 總部可查看全域報表，分店僅見自身數據

### 2. 會員全生命週期管理 (CRM)
- 會員狀態自動化：根據合約狀態更新 (Active → Expired)
- 標籤系統：VIP、高流失風險、舊生回歸等
- 跨店入場紀錄追蹤

### 3. 彈性合約引擎
- **期限制** (TIME_BASED)：月費、年費會籍
- **點數制** (COUNT_BASED)：私人教練課程包
- 內建異動邏輯：
  - 請假 (Pause) → 自動順延 `end_date`
  - 轉讓 (Transfer) → 變更會員歸屬
  - 延期 (Extension) → 手動展延

### 4. HR 與權限系統
- 員工打卡 (GPS/IP 防弊)
- 休假申請與審核流程
- 三層權限架構：
  ```
  HQ Admin     → 全系統存取
  Store Manager → branch_id = 自己分店
  Coach        → sales_person_id = 自己
  ```

### 5. 財務與報表
- 收款紀錄 (現金/刷卡/LinePay/匯款)
- 應收帳款 (AR) 追蹤
- 多維度報表：
  - 總部：各分店營收比較、會員成長率
  - 分店：日營收、新進會員數、教練課程數

---

## 🛠️ 專案結構 (Project Structure)

```
gym-nexus/
├── backend/                    # Directus 後端
│   ├── extensions/             # 自訂 Hooks & Endpoints
│   │   ├── gym-hooks/          # 生命週期鉤子 (合約到期、Email 通知)
│   │   │   ├── index.js        # 主要 Hook 邏輯
│   │   │   ├── cache.js        # Redis 快取模組
│   │   │   └── email-service.js # Email 模板與發送服務
│   │   └── gym-endpoints/      # 自訂 API (報表、QR Code、Push)
│   ├── migrations/             # 資料庫遷移腳本
│   │   ├── 005_optimize_indexes.sql      # 索引優化（40+ 索引）
│   │   └── 006_postgis_spatial_indexes.sql # PostGIS 空間索引
│   ├── schema/                 # 資料庫 Schema 快照
│   ├── uploads/                # 本地上傳檔案 (開發用)
│   ├── DATABASE_INDEXES.md     # 📊 索引優化文件（100+ 索引）
│   ├── REPORTS_API.md          # 📈 報表 API 文件
│   ├── docker-compose.yml      # 開發環境容器配置
│   └── .env.example            # 環境變數範本（含 SMTP、VAPID）
│
├── frontend/                   # Nuxt 3 前端 (Monorepo)
│   ├── apps/
│   │   ├── member-app/         # 會員端 PWA
│   │   │   ├── pages/          # 頁面路由
│   │   │   ├── components/     # UI 元件
│   │   │   └── composables/    # 組合式函數
│   │   └── admin-web/          # 管理後台
│   │       ├── pages/          # 管理頁面
│   │       ├── components/     # 後台元件
│   │       └── layouts/        # 版面配置
│   ├── packages/               # 共用套件
│   │   ├── ui/                 # 共用 UI 元件庫
│   │   ├── api/                # Directus SDK 封裝
│   │   └── types/              # TypeScript 型別定義
│   ├── nuxt.config.ts
│   └── package.json
│
├── docs/                       # 額外文件 (圖表、API 文件等)
│
├── PRD.md                      # 產品需求文件
├── 健身房系統架構設計.md          # 技術架構文件
├── CLAUDE.md                   # AI 開發助理指引 (含端口配置)
└── README.md                   # 本文件

🔥 **性能亮點**:
- PostgreSQL 18 + PostGIS 3.6 最新版本
- 100+ 專業索引：B-tree、GIN、GiST、BRIN、Partial
- 多租戶查詢性能提升 40-50 倍
- 地理空間查詢支援（附近分店搜尋）
```

---

## ⚡ 快速開始 (Quick Start)

### 環境需求
- Node.js >= 20.x
- Docker & Docker Compose
- pnpm (建議) 或 npm

### 1. Clone 專案
```bash
git clone https://github.com/your-org/gym-nexus.git
cd gym-nexus
```

### 2. 啟動 Backend (Directus + PostgreSQL)
```bash
cd backend

# 複製環境變數
cp .env.example .env

# 啟動 Docker 容器
docker-compose up -d

# Directus Admin Panel: http://localhost:8500
# 預設帳號: admin@example.com / password (請於 .env 設定)
```

### 3. 啟動 Frontend (Nuxt 3)
```bash
cd frontend

# 安裝依賴
pnpm install

# 啟動開發伺服器
pnpm run dev

# 開發伺服器: http://localhost:3000
```

### 4. 資料庫初始化 (首次)
```bash
# 進入 backend 目錄
cd backend

# 匯入初始 Schema (若有提供)
docker-compose exec database psql -U directus -d gym_nexus -f /schema/init.sql
```

---

## 🔐 環境變數 (Environment Variables)

### Backend (.env)
```env
# Database
DB_CLIENT=pg
DB_HOST=database
DB_PORT=5432
DB_DATABASE=gym_nexus
DB_USER=directus
DB_PASSWORD=your_secure_password

# Directus
KEY=your-random-key
SECRET=your-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_admin_password

# Storage (R2)
STORAGE_LOCATIONS=cloudflare
STORAGE_CLOUDFLARE_DRIVER=cloudflare-r2
STORAGE_CLOUDFLARE_KEY=your_r2_key
STORAGE_CLOUDFLARE_SECRET=your_r2_secret
STORAGE_CLOUDFLARE_BUCKET=gym-nexus-files
STORAGE_CLOUDFLARE_ENDPOINT=https://xxx.r2.cloudflarestorage.com
```

### Frontend (.env)
```env
NUXT_PUBLIC_API_URL=http://localhost:8500
NUXT_PUBLIC_APP_NAME=Gym Nexus
```

---

## 📊 資料庫核心實體 (Database Entities)

> 詳細欄位定義請參考 [健身房系統架構設計.md](./健身房系統架構設計.md)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  branches   │────<│  employees  │     │ job_titles  │
│  (分店)     │     │  (員工)     │>────│  (職位)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   │ sales_person_id
       ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   members   │────<│  contracts  │>────│ membership_plans │
│   (會員)    │     │  (合約)     │     │ (會籍方案)       │
└─────────────┘     └─────────────┘     └──────────────────┘
                           │
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │ payments  │ │contract_  │ │ (未來)    │
       │ (收款)    │ │   logs    │ │appointments│
       └───────────┘ │ (異動紀錄)│ │ (預約)    │
                     └───────────┘ └───────────┘
```

---

## 🗺️ 開發路線圖 (Roadmap)

> 詳細功能規格請參考 [PRD.md](./PRD.md)

### ✅ Phase 1: MVP 核心 (已完成)
- [x] Directus 環境架設與 Docker 配置
- [x] 核心 Schema 設計 (branches, employees, members, contracts)
- [x] 基礎權限設定 (Role-based + Row-level)
- [x] 會員 CRUD 與標籤系統

### ✅ Phase 2: 營運深化 (已完成)
- [x] HR 打卡與休假系統 (GPS/IP 驗證、補打卡申請)
- [x] 合約異動邏輯 (請假順延自動計算)
- [x] 財務收款紀錄 (多元支付方式)
- [x] 基礎報表 (日/月營收、會員成長、活躍度分析)
- [x] 報表 API 快取 (Redis 10 分鐘 TTL)

### ✅ Phase 3: 會員端 & 進階功能 (已完成)
- [x] Nuxt 會員端 App (PWA)
- [x] 入場條碼 / QR Code 掃描
- [x] 總部戰情室 Dashboard
- [x] 通知系統 (Email + Push Notifications)
- [x] 合約到期 Email 提醒 (7/3/1 天)
- [x] 表單驗證組件 (useFormValidation)

### 🚧 Phase 4: 擴充功能 (進行中)
- [ ] Wger 運動數據整合 (身體數據、訓練日誌)
- [ ] 課程預約系統
- [x] 進階報表與數據分析 (Looker Studio 整合)
- [ ] Mobile App (Capacitor)

---

## 🧪 測試 (Testing)

```bash
# Frontend 單元測試
cd frontend
pnpm run test

# Frontend E2E 測試
pnpm run test:e2e

# 型別檢查
pnpm run type-check
```

---

## 📝 開發規範 (Development Guidelines)

### 命名慣例
- **資料庫表/欄位**: snake_case (`member_code`, `branch_id`)
- **TypeScript/Vue**: camelCase (`memberCode`, `branchId`)
- **元件檔名**: PascalCase (`MemberCard.vue`, `ContractForm.vue`)

### Git Commit 格式
```
<type>(<scope>): <subject>

feat(contract): add pause functionality with auto-extension
fix(member): resolve status update on contract expiry
docs(readme): update project structure section
```

### 語言慣例
- **文件/UI**: 繁體中文 (Traditional Chinese)
- **程式碼/註解**: 英文 (English)
- **資料庫欄位**: 英文 (English)

---

## 🤝 貢獻指南 (Contributing)

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

---

## 📄 授權 (License)

本專案為私有專案，版權所有。未經授權不得複製、修改或散佈。

---

## 📞 聯絡方式 (Contact)

- **專案負責人**: [Your Name]
- **Email**: your.email@example.com
- **Issue Tracker**: [GitHub Issues](https://github.com/your-org/gym-nexus/issues)
