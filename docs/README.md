# Gym Nexus Documentation

## ⚠️ Important Notice

> **部分文件可能過時 (Some documentation may be outdated)**
>
> 本專案已從 Directus 遷移至 Hono.js + Drizzle ORM 架構。
> 部分文件仍引用舊的 Directus 設定，請以下列文件為準：
>
> This project has migrated from Directus to Hono.js + Drizzle ORM.
> Some documentation still references the old Directus setup. Please refer to:

### 最新技術文件 (Up-to-date Documentation)

| 文件 | 說明 |
|------|------|
| **[/CLAUDE.md](../CLAUDE.md)** | 專案架構與開發指令總覽 |
| **[/README.md](../README.md)** | 專案介紹與快速開始 |
| **[/backend/README.md](../backend/README.md)** | 後端 API 文件 |
| **[/backend/.env.example](../backend/.env.example)** | 環境變數參考 |

### 文件分類

#### 部署與運維 (Deployment & Operations)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - 完整部署指南 (Cloudflare Pages + Tunnel)
- **[deployment/setup-cloudflare-tunnel.md](./deployment/setup-cloudflare-tunnel.md)** - Cloudflare Tunnel 設定
- `deployment-runbook.md` - 部署操作手冊
- `monitoring-setup.md` - 監控設定
- `disaster-recovery.md` - 災難復原

#### 功能文件 (Feature Documentation)
- **[ADMIN_WEB.md](./ADMIN_WEB.md)** - Admin Web 功能說明
- **[MEMBER_APP.md](./MEMBER_APP.md)** - Member App 功能說明
- **[SECURITY.md](./SECURITY.md)** - 安全性設計

#### 測試 (Testing)
- **[testing/E2E-TEST-SETUP.md](./testing/E2E-TEST-SETUP.md)** - E2E 測試設定

#### 整合 (Integrations)
- `LOOKER_STUDIO_SETUP.md` - Looker Studio 設定
- `GOOGLE_WORKSPACE_INTEGRATION_QUICKSTART.md` - Google Workspace 整合

#### 商業策略 (Business Strategy)
- `BUSINESS_STRATEGY.md` - 商業策略
- `BUSINESS_STRATEGY_V2.md` - 商業策略 V2

#### 環境設定 (Environment)
- `environment-variables.md` - 環境變數說明 (請以 `/backend/.env.example` 為準)

#### 歷史紀錄 (Historical Reference - archive/)
- `archive/` - 已歸檔的舊版實作紀錄

---

## 新架構概覽 (New Architecture Overview)

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Nuxt 3)                       │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Admin Web     │   Member App    │       Coach App         │
│   Port 3001     │   Port 3002     │       Port 3003         │
└────────┬────────┴────────┬────────┴────────────┬────────────┘
         │                 │                      │
         │    Session      │      JWT             │    JWT
         │    Cookie       │  X-Member-Token      │ X-Coach-Token
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend API (Hono.js)                       │
│                     Port 8056                                │
├─────────────────────────────────────────────────────────────┤
│  Routes  │  Services  │  Middleware  │  Hooks  │   Cron     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL 17 + PostGIS 3.4                     │
│                     Port 15432                               │
└─────────────────────────────────────────────────────────────┘
```

## 技術堆疊 (Tech Stack)

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Hono.js + Drizzle ORM + Lucia Auth | 4.x / 0.38.x / 3.x |
| Database | PostgreSQL + PostGIS | 17 / 3.4 |
| Frontend | Nuxt + Vue + Tailwind CSS | 3 / 3.5 / 3.x |
| Auth (Staff) | Lucia (Session-based) | 3.x |
| Auth (Member/Coach) | JWT (X-Member-Token / X-Coach-Token) | - |
| File Storage | Cloudflare R2 / S3 | - |
| Deployment | VPS (Docker) + Cloudflare Pages + Tunnel | - |
| Runtime | Node.js | 22 |
| Package Manager | pnpm | - |

## 專案統計 (Project Statistics)

| Component | Count |
|-----------|-------|
| Backend Routes | 46 |
| Backend Services | 9 |
| Backend Middleware | 7 |
| Backend Hooks | 7 |
| Cron Jobs | 4 |
| Database Tables | 51 |
| Frontend Apps | 3 |
| Frontend Packages | 4 |
