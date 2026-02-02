# Gym Nexus - 智慧健身房管理系統 (CRM/ERP)

[![Hono.js](https://img.shields.io/badge/Backend-Hono.js-E36002?style=flat-square&logo=hono)](https://hono.dev/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2017-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Nuxt](https://img.shields.io/badge/Frontend-Nuxt%203-00DC82?style=flat-square&logo=nuxt.js)](https://nuxt.com/)
[![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?style=flat-square)](https://orm.drizzle.team/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)]()

**Gym Nexus** 是一個基於現代化技術堆疊構建的健身房全方位管理系統。本專案採用 Hono.js + Drizzle ORM 後端架構，搭配 Nuxt 3 前端 Monorepo，確保開發效率與系統擴充性。

---

## 📖 文件導覽 (Documentation)

| 文件 | 說明 | 適合讀者 |
|------|------|----------|
| **[CLAUDE.md](./CLAUDE.md)** | AI 開發助理指引 - 專案結構與開發命令 | AI 工具、新進開發者 |
| **[backend/README.md](./backend/README.md)** | 後端 API 文件 - 路由、服務、架構 | 後端開發者 |
| **[docs/](./docs/)** | 其他技術文件 | 各類開發者 |

---

## 🎯 專案目標 (Project Goals)

### 商業目標
- 建立可擴展架構，支援 **50+ 間分店** 的數據量與查詢效能
- 減少人工作業錯誤，合約異動 (請假/轉讓) **自動計算到期日**
- 提供精準的權限分級，確保 **資料隔離** (總部 → 店長 → 教練)
- 整合 HR 與財務模組，產出 **即時營運報表**

### 技術目標
- 採用 Hono.js + Drizzle ORM，輕量高效能 API
- 實現多租戶架構 (Multi-tenancy)
- 支援 PWA，一套代碼部署 Web + Mobile
- Type-safe 全端開發體驗

---

## 🚀 技術堆疊 (Tech Stack)

### Backend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Hono.js** | 輕量 Web 框架 | v4.x |
| **Drizzle ORM** | Type-safe 資料庫存取 | v0.30+ |
| **Lucia Auth** | 員工認證 (Session-based) | v3 |
| **PostgreSQL + PostGIS** | 核心資料庫 + 地理空間 | v17 + 3.4 |
| **Node.js** | Runtime | v22 LTS |

### Frontend
| 技術 | 用途 | 版本 |
|------|------|------|
| **Nuxt 3** | SSR/SSG 框架 | v4.x |
| **Vue 3** | UI 框架 | v3.5 |
| **Tailwind CSS** | 樣式系統 | v3.x |

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
- 內建異動邏輯：請假順延、轉讓、延期

### 4. 三端應用程式
- **Admin Web** (localhost:3001) - 員工後台管理
- **Member App** (localhost:3002) - 會員端 PWA
- **Coach App** (localhost:3003) - 教練端應用

### 5. 通知系統
- Email (SMTP)
- Web Push Notifications (VAPID)
- LINE Messaging API
- SMS (Mitake 三竹簡訊)

---

## 🛠️ 專案結構 (Project Structure)

```
gym-nexus/
├── backend/                    # Hono.js API
│   ├── src/
│   │   ├── routes/            # API 路由 (~35 個)
│   │   ├── services/          # 業務邏輯 (email, sms, line, payment)
│   │   ├── middleware/        # 認證、CSRF、Rate Limiting
│   │   ├── db/                # Drizzle Schema
│   │   ├── hooks/             # 業務事件鉤子
│   │   └── cron/              # 排程任務
│   ├── docker-compose.yml
│   └── Dockerfile
│
├── frontend/                   # Nuxt 3 Monorepo
│   ├── apps/
│   │   ├── admin-web/         # 員工後台 (Port 3001)
│   │   ├── member-app/        # 會員 PWA (Port 3002)
│   │   └── coach-app/         # 教練 App (Port 3003)
│   └── packages/
│       ├── ui/                # 共用 UI 元件
│       └── shared/            # 共用型別與工具
│
├── docs/                       # 技術文件
├── CLAUDE.md                   # AI 開發助理指引
└── README.md                   # 本文件
```

---

## ⚡ 快速開始 (Quick Start)

### 環境需求
- Node.js >= 22.x
- Docker & Docker Compose
- pnpm (必須使用 pnpm)

### 1. Clone 專案
```bash
git clone https://github.com/your-org/gym-nexus.git
cd gym-nexus
```

### 2. 啟動 Backend
```bash
cd backend

# 複製環境變數
cp .env.example .env

# 啟動 PostgreSQL
docker compose up database -d

# 安裝依賴並啟動
pnpm install
pnpm dev

# API: http://localhost:8056
```

### 3. 啟動 Frontend
```bash
cd frontend

# 安裝依賴
pnpm install

# 啟動所有應用 (或選擇單一應用)
pnpm dev:admin    # Admin Web - http://localhost:3001
pnpm dev:member   # Member App - http://localhost:3002
pnpm dev:coach    # Coach App  - http://localhost:3003
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

## 🧪 測試 (Testing)

```bash
# Frontend 單元測試
cd frontend
pnpm test

# Frontend E2E 測試
pnpm test:e2e

# 型別檢查
pnpm typecheck
```

---

## 📝 開發規範 (Development Guidelines)

### 命名慣例
- **資料庫表/欄位**: snake_case (`member_code`, `branch_id`)
- **TypeScript/Vue**: camelCase (`memberCode`, `branchId`)
- **元件檔名**: PascalCase (`MemberCard.vue`)

### Git Commit 格式
```
<type>(<scope>): <subject>

feat(contract): add pause functionality
fix(member): resolve status update issue
docs(readme): update project structure
```

### 語言慣例
- **文件/UI**: 繁體中文 (Traditional Chinese)
- **程式碼/註解**: 英文 (English)

---

## 📄 授權 (License)

本專案為私有專案，版權所有。未經授權不得複製、修改或散佈。

---

## 📞 聯絡方式 (Contact)

- **Issue Tracker**: [GitHub Issues](https://github.com/your-org/gym-nexus/issues)
