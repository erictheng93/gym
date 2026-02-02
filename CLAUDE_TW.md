# CLAUDE.md (繁體中文版)

此文件為 Claude Code (claude.ai/code) 在處理此儲存庫程式碼時提供指導方針。

## 專案概覽 (Project Overview)

Gym Nexus 是一個多分店健身房管理系統 (CRM/ERP)，建構於：
- **後端 (Backend):** Hono.js API + Drizzle ORM 運行於 Node.js 22
- **資料庫 (Database):** PostgreSQL 17 + PostGIS 3.4
- **前端 (Frontend):** Nuxt 3 (monorepo 架構，包含 admin-web、member-app、coach-app)
- **基礎設施 (Infrastructure):** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **套件管理器 (Package Manager):** pnpm (必須使用 pnpm，請勿使用 npm 或 yarn)

## 開發指令 (Development Commands)

### 後端 (Hono.js + Drizzle)
```bash
cd backend
pnpm install
pnpm dev                        # 開發伺服器 (http://localhost:8056)
pnpm build                      # 建置生產版本
pnpm db:push                    # 推送 Schema 變更至資料庫
pnpm db:studio                  # 開啟 Drizzle Studio
```

### 前端 (Nuxt 3)
```bash
cd frontend
pnpm install
pnpm dev:admin                  # 員工後台 (http://localhost:3001)
pnpm dev:member                 # 會員 App (http://localhost:3002)
pnpm dev:coach                  # 教練 App (http://localhost:3003)
```

## 架構 (Architecture)

### 專案結構 (Project Structure)
```
gym-nexus/
├── backend/                    # Hono.js API
│   ├── src/
│   │   ├── routes/            # API 路由處理 (~35 個路由)
│   │   ├── services/          # 業務邏輯 (email, sms, line, payment, pdf)
│   │   ├── middleware/        # 認證、CSRF、速率限制
│   │   ├── db/                # Drizzle Schema 與遷移
│   │   ├── hooks/             # 業務事件鉤子
│   │   └── cron/              # 排程任務
│   ├── docker-compose.yml
│   └── Dockerfile
├── frontend/
│   ├── apps/
│   │   ├── admin-web/         # 員工後台 (電子合約、報表、HR)
│   │   ├── member-app/        # 會員 PWA (預約、個人檔案、入場)
│   │   └── coach-app/         # 教練 App (課程、學員、教案)
│   └── packages/              # 共用 UI 元件與工具
└── docs/
```

### 後端架構

**技術堆疊：**
- Hono.js (Web 框架)
- Drizzle ORM (Type-safe 資料庫存取)
- Lucia Auth (員工 Session 認證)
- JWT (會員/教練認證，使用 X-Member-Token / X-Coach-Token)
- Node.js 22

**服務模組：**
- `email.ts` - SMTP 郵件與模板
- `push.ts` - Web Push 通知 (VAPID)
- `line.ts` - LINE Messaging API (Flex 訊息、群發)
- `sms.ts` - 三竹簡訊 (Mitake)
- `payment.ts` - 多金流 (Stripe、綠界 ECPay、LINE Pay)
- `pdf.ts` - PDF 生成 (Puppeteer)

### 核心資料庫實體 (Drizzle Schema)

**核心資料表：**
- `tenants` - 多租戶根節點
- `branches` - 分店據點 (HEADQUARTER/BRANCH 類型)
- `employees` - 員工與職稱、權限
- `members` - 會員資料與狀態管理
- `contracts` - 會籍合約 (TIME_BASED/COUNT_BASED)
- `contract_logs` - 合約異動紀錄 (暫停/轉讓/展延)
- `payments` - 財務交易紀錄

**會員 App 資料表：**
- `member_devices` - 推播通知 Token
- `member_reviews` - 課程評價
- `member_issues` - 客服工單
- `member_workouts` - 運動紀錄
- `member_goals` - 健身目標
- `member_measurements` - 身體數據

**教練 App 資料表：**
- `coach_notes` - 學員筆記
- `lesson_plans` - 教案規劃
- `teaching_materials` - 動作教學庫

### API 端點參考

**會員 App (X-Member-Token 認證):**
```
/api/member/otp/*           - OTP 登入
/api/member/auth/*          - 認證與更新 Token
/api/member/me              - 個人檔案 CRUD
/api/member/check-in/*      - 入場與歷史紀錄
/api/member/workouts/*      - 運動紀錄
/api/member/goals/*         - 健身目標
```

**教練 App (X-Coach-Token 認證):**
```
/api/coach/auth/*           - 登入與更新 Token
/api/coach/me               - 個人檔案
/api/coach/classes/*        - 課程與點名
/api/coach/students/*       - 學員與筆記
/api/coach/lesson-plans/*   - 教案管理
```

**員工後台 (Lucia Session 認證):**
```
/api/auth/*                 - 員工登入
/api/members/*              - 會員管理
/api/contracts/*            - 合約管理
/api/payments/*             - 收款管理
/api/reports/*              - 報表分析
```

### 連接埠設定 (Port Configuration)
| 服務 | 開發環境 | 說明 |
|------|---------|------|
| API | localhost:8056 | Hono.js API |
| PostgreSQL | localhost:15432 | 資料庫 |
| Admin Web | localhost:3001 | 員工後台 |
| Member App | localhost:3002 | 會員 PWA |
| Coach App | localhost:3003 | 教練 App |

### 業務邏輯 (Business Logic)

**合約類型：**
- `TIME_BASED` - 以時間為基礎 (月費/年費)
- `COUNT_BASED` - 以次數為基礎 (課程包)

**合約狀態流程：**
`DRAFT` → `ACTIVE` → `PAUSED` → `ACTIVE` → `EXPIRED`/`CANCELLED`/`TRANSFERRED`

**暫停邏輯：** 當合約暫停時，`end_date` 自動展延暫停天數

### 排程任務 (Cron Jobs)
- `billing.ts` - 每月帳單生成
- `analytics.ts` - 每日分析快照
- `rfm.ts` - RFM 客戶分群計算
- `contract-expiry.ts` - 合約到期通知

## 語言 (Language)

專案文件與使用者介面 (UI) 使用 **繁體中文 (Traditional Chinese)**。程式碼與技術實作應使用英文。
