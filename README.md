# Gym Nexus - 智慧健身房全方位管理系統 (CRM/ERP)

[![Hono.js](https://img.shields.io/badge/Backend-Hono.js-E36002?style=flat-square&logo=hono)](https://hono.dev/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2017%2F18-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Nuxt](https://img.shields.io/badge/Frontend-Nuxt%204-00DC82?style=flat-square&logo=nuxt.js)](https://nuxt.com/)
[![Bun](https://img.shields.io/badge/Runtime-Bun%201.x-fbf0df?style=flat-square&logo=bun)](https://bun.sh/)
[![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?style=flat-square)](https://orm.drizzle.team/)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?style=flat-square&logo=playwright)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Gym Nexus** 是一個基於現代化全端技術堆疊構建的高效能、多場館健身房營運管理系統 (SaaS CRM/ERP)。本專案採用 **Hono.js + Drizzle ORM + PostgreSQL** 的輕量高效後端架構，搭配 **Nuxt 4 + Bun Monorepo** 前端，具備離線優先 (Offline-first PWA)、高並發保護與嚴謹的資料一致性設計。

---

## 📖 文件導覽 (Documentation)

| 文件 | 說明 | 適合讀者 |
|------|------|----------|
| **[CLAUDE.md](./CLAUDE.md)** | AI 開發助理指引 - 專案結構、開發規範與命令 | AI 工具、新進開發者 |
| **[backend/README.md](./backend/README.md)** | 後端 API 文件 - 路由清單、服務架構、資料庫綱要 | 後端開發者 |
| **[docs/README.md](./docs/README.md)** | 技術文件索引與架構規範總覽 | 全端工程師、架構師 |
| **[docs/testing/E2E-TEST-SETUP.md](./docs/testing/E2E-TEST-SETUP.md)** | Playwright E2E 測試設定與執行手冊 | QA、全端開發者 |
| **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | 雲端部署指南 (Cloudflare Pages + Dokploy VPS) | DevOps、SRE |

---

## 🎯 專案目標 (Project Goals)

### 商業目標
- **多場館擴展**：支援 **50+ 間分店** 規模的數據隔離與高頻查詢效能。
- **合約生命週期自動化**：精準計算會籍到期日、請假順延、轉讓、逾期與扣點核銷。
- **權限與資料隔離**：總部 (HQ) 與各分店 (Branch) 資料嚴格隔離，支援多租戶與角色權限管控 (RBAC)。
- **全渠道通知與金流**：整合台灣在地簡訊 (三竹 Mitake)、LINE Messaging API、Email、Web Push 及多元支付 (Stripe / ECPay / LINE Pay)。

### 技術目標
- **高並發與資料一致性 (Data Integrity)**：金流 Webhook 交易事務保護與冪等性、防止併發重複扣款與展期。
- **離線優先 (Offline-First)**：PWA + IndexedDB 離線快取與 FIFO 順序佇列同步機制。
- **防踩踏單飛互斥鎖 (Single-Flight Lock)**：Token 刷新競爭自動合併，杜絕多 API 同時 401 造成的連鎖登出。
- **極致響應速度**：後端平均延遲 < 50ms，高頻查詢全複合索引優化，大數據分群批次平行聚合。

---

## 🚀 技術堆疊 (Tech Stack)

### Backend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Hono.js** | 輕量、超高速 Web 框架 | v4.x |
| **Drizzle ORM** | Type-safe 資料庫 ORM | v0.38.x |
| **Lucia Auth** | 員工 Session 狀態管理 | v3.x |
| **PostgreSQL + PostGIS** | 核心資料庫與地理空間運算 | v17 / 18 + PostGIS 3.4 |
| **Node.js / pnpm** | 後端執行環境與套件管理 | Node.js >= 22 LTS, pnpm >= 9 |

### Frontend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Nuxt** | SSR / SSG / PWA 現代化全端框架 | v4.x (`^4.2.2`) |
| **Vue** | 響應式 UI 核心 | v3.5 |
| **Tailwind CSS** | 實用導向樣式系統 | v3.x |
| **Bun** | 前端極速套件管理器與測試執行環境 | Bun v1.x (Workspaces) |
| **Playwright** | 跨瀏覽器端到端 (E2E) 自動化測試 | v1.57+ |
| **Vitest** | 單元與整合測試框架 | v3.x |

### Infrastructure & DevOps
| 服務 | 用途 |
|------|------|
| **Cloudflare Pages** | 前端三端 App 邊緣託管與自動化部署 |
| **Cloudflare R2** | 相容 S3 之物件儲存 (合約 PDF、數位簽名、證照照片) |
| **Docker / Dokploy** | 本地容器化開發環境與正式 VPS 部署 |
| **Lighthouse CI** | 效能預算與 PWA 指標自動化稽核 |

---

## 📚 核心功能與架構特色 (Core Features & Architecture)

### 1. 多租戶架構 (Multi-Tenancy)
- 支援總部 (HEADQUARTER) 與分店 (BRANCH) 多層級架構。
- 透過 `tenantContextMiddleware` 與 `branch_id` 自動隔離資料與報表。

### 2. 會員全生命週期 CRM
- 會員狀態自動化：合約生效/暫停/過期自動連動會員權限。
- RFM 價值分群：日排程自動針對消費額度、入場頻率與近期活動評分，以平行聚合加速批次標籤標註。
- 跨店與多門市入場簽到、體態測量紀錄與目標管理。

### 3. 三端應用程式 (Apps)
- **Admin Web** (預設 `http://localhost:3001` 或 `3000`) - 櫃檯簽到、會員與合約管理、營運與 HR 報表。
- **Member App** (預設 `http://localhost:3002`) - 會員 PWA、電子會員卡、合約與扣點預覽、線上預約課程。
- **Coach App** (預設 `http://localhost:3003`) - 教練課表、學員管理、課程點名與課單教案設計。

### 4. 系統強韌度與高並發防護 (Hardened Concurrency)
- **金流 Webhook 冪等性與 Transaction 事務**：確保每筆第三方支付通知僅入帳一次，更新收款與合約啟動全程包裹於資料庫交易內。
- **離線同步 FIFO 順序佇列**：解決離線資料同步時先建後修的依賴亂序問題。
- **防踩踏單飛互斥鎖 (Token Stampede Mutex)**：多 API 同時觸發 401 時自動合併 Refresh 請求，保護使用者 Session 不被重複輪換作廢。
- **櫃檯簽到遠端搜尋與防抖取消**：250ms 防抖搜尋結合 `AbortController`，防止快速輸入時過時回應覆蓋最新結果。
- **資料庫複合索引優化**：針對 `check_ins` (`member_id, check_in_time`) 與 `payments` (`branch_id, type, payment_date`) 建立專屬複合索引。

---

## 🛠️ 專案結構 (Project Structure)

```
gym/
├── backend/                    # Hono.js 後端 API (pnpm)
│   ├── src/
│   │   ├── routes/            # API 路由模組 (46+ 個檔案)
│   │   ├── services/          # 核心業務邏輯 (Email, Push, LINE, SMS, Payment, PDF, Storage...)
│   │   ├── middleware/        # 認證、CSRF、Rate Limiting、Tenant 隔離
│   │   ├── db/                # Drizzle Schema (51+ 張表) 與 Migration
│   │   ├── hooks/             # 業務事件鉤子 (合約、支付、簽到觸發連動)
│   │   └── cron/              # 定時排程 (月結帳、日營收統計、RFM 分群、合約到期)
│   ├── tests/                 # Vitest 後端整合與單元測試套件
│   ├── docker-compose.yml     # PostgreSQL + PostGIS 本地容器
│   └── package.json           # pnpm 管理
│
├── frontend/                   # Nuxt 4 Monorepo 前端 (bun)
│   ├── apps/
│   │   ├── admin-web/         # 員工後台管理系統 (Port 3001)
│   │   ├── member-app/        # 會員專用 PWA (Port 3002)
│   │   └── coach-app/         # 教練端行動應用 (Port 3003)
│   ├── packages/
│   │   ├── ui/                # 共用 UI 元件庫 (Layer 機制)
│   │   ├── shared/            # 共用型別、Composables (離線同步、網路請求)
│   │   ├── hr-core/           # 人資考勤核心運算邏輯
│   │   └── hr-composables/    # 人資考勤 Composables
│   ├── e2e/                   # Playwright 完整業務流 E2E 自動化測試 (16 套測試組)
│   ├── package.json           # bun workspaces 管理
│   └── bun.lock               # bun lockfile
│
├── docs/                       # 系統技術文件與架構手冊
├── CLAUDE.md                   # AI 助理開發指南與指令總覽
└── README.md                   # 本文件
```

---

## ⚡ 快速開始 (Quick Start)

### 環境需求
- **Node.js** >= 22.x LTS
- **Docker & Docker Compose** (用於 PostgreSQL 容器)
- **pnpm** >= 9.x (後端使用)
- **Bun** >= 1.1.x (前端 Monorepo 使用)

### 1. Clone 專案
```bash
git clone https://github.com/erictheng93/gym.git
cd gym
```

### 2. 啟動後端 (Backend)
```bash
cd backend

# 1. 建立環境變數檔案
cp .env.example .env

# 2. 啟動 PostgreSQL 容器
docker compose up database -d

# 3. 安裝依賴並推播 Schema
pnpm install
pnpm db:push

# 4. 啟動後端開發伺服器 (預設 Port 8056)
pnpm dev
```
後端 API 伺服器將在 `http://localhost:8056` 運行。

### 3. 啟動前端 (Frontend)
```bash
cd frontend

# 1. 使用 Bun 安裝 Monorepo 依賴
bun install

# 2. 啟動各端應用程式 (可個別啟動或同時啟動)
bun run dev:admin    # Admin Web  -> http://localhost:3001
bun run dev:member   # Member App -> http://localhost:3002
bun run dev:coach    # Coach App  -> http://localhost:3003
```

---

## 🔐 環境變數 (Environment Variables)

### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/gym_nexus

# Auth Secrets
SESSION_SECRET=your-session-secret
MEMBER_JWT_SECRET=your-member-jwt-secret
COACH_JWT_SECRET=your-coach-jwt-secret

# Email (SMTP)
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email
EMAIL_SMTP_PASSWORD=your-password
EMAIL_FROM=noreply@example.com

# Push Notifications
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your-line-token
LINE_CHANNEL_SECRET=your-line-secret

# Payment
STRIPE_SECRET_KEY=sk_test_xxx
ECPAY_MERCHANT_ID=your-ecpay-merchant
```

### Frontend (.env)
```env
API_BASE_URL=http://localhost:8056
```

---

## 📊 API 概覽

### 認證方式
| 應用 | 認證方式 | Header/Cookie |
|------|---------|---------------|
| Admin Web | Lucia Session | Cookie (自動) |
| Member App | JWT | `X-Member-Token` |
| Coach App | JWT | `X-Coach-Token` |

### 主要端點
```
# 員工認證
POST /api/auth/login
POST /api/auth/logout

# 會員 App
POST /api/member/otp/send
POST /api/member/auth/verify
GET  /api/member/me
GET  /api/member/check-in/history

# 教練 App
POST /api/coach/auth/login
GET  /api/coach/me
GET  /api/coach/classes
GET  /api/coach/students

# 管理 API (需認證)
GET  /api/members
GET  /api/contracts
GET  /api/payments
GET  /api/reports/*
```

詳細 API 文件請參考 [backend/README.md](./backend/README.md)

---

## 🧪 測試體系 (Testing & Quality Assurance)

專案具備多層級的自動化測試防護網：

### 後端單元與整合測試 (Backend Unit & Integration)
```bash
cd backend
pnpm test              # 執行全套 Vitest 測試 (40+ 測試檔案、780+ 測試項目)
pnpm test:coverage     # 產生程式碼覆蓋率報告
pnpm typecheck         # 執行 TypeScript 嚴格型別檢查
```

### 前端單元與組件測試 (Frontend Unit & Component)
```bash
cd frontend
bun run test --run     # 執行全套 Vitest 單元測試 (80 套測試組、1,890+ 項測試)
bun run typecheck      # 執行 Nuxt 全端型別檢查
bun run lint           # ESLint 程式碼品質檢查
```

### 端到端自動化測試 (Playwright E2E)
```bash
cd frontend
# 執行所有 E2E 測試 (涵蓋櫃檯簽到、合約核銷、預約流程、跨店入場等 16 套流程)
bun run test:e2e

# 啟動 Playwright UI 互動介面
bun run test:e2e:ui

# 執行指定測試流程 (以櫃檯簽到流程為例)
BASE_URL=http://localhost:3001 bunx playwright test e2e/16-reception-checkin-flow.spec.ts
```

### 效能與 PWA 稽核 (Lighthouse CI)
```bash
cd frontend
bun run lighthouse:admin
bun run lighthouse:member
```

---

## 📝 開發與協作規範 (Development Guidelines)

### 命名慣例
- **資料庫表與欄位**: `snake_case`（例如 `member_code`, `check_in_time`）
- **TypeScript / Vue**: `camelCase`（例如 `memberCode`, `checkInTime`）
- **Vue 組件名稱**: `PascalCase`（例如 `VerificationMethodSelector.vue`）

### Git Commit 訊息格式
依循 Conventional Commits 規範：
```
<type>(<scope>): <subject>

feat(checkin): implement debounced remote search with AbortController
fix(webhook): ensure idempotency and wrap operations in transaction
perf(cron): batch parallel pre-aggregation for RFM segmentation
docs(readme): update repository info, bun instructions, and testing guide
```

### 語言政策
- **文件 / 使用者介面 (UI)**: 繁體中文 (Traditional Chinese)
- **程式碼、變數名、註解**: 英文 (English)

---

## 📞 聯絡與支援 (Contact & Support)

- **專案儲存庫**: [GitHub - erictheng93/gym](https://github.com/erictheng93/gym)
- **問題追蹤**: [GitHub Issues](https://github.com/erictheng93/gym/issues)
- **專案授權**: Proprietary (版權所有，未經授權禁止散布)
