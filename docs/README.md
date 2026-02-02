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

#### 仍然適用 (Still Applicable)
- `BUSINESS_STRATEGY*.md` - 商業策略 (非技術相關)
- `LOOKER_STUDIO_SETUP.md` - Looker Studio 設定
- `GOOGLE_WORKSPACE_INTEGRATION_QUICKSTART.md` - Google 整合

#### 需要更新 (Needs Update)
- `environment-variables.md` - 請參考 `/backend/.env.example`
- `deployment-runbook.md` - 部署流程待更新
- `monitoring-setup.md` - 監控設定待更新
- `disaster-recovery.md` - 災難復原待更新

#### 歷史紀錄 (Historical Reference)
- `implementation/` - 舊版實作紀錄
- `*_SUMMARY.md` - 舊版功能摘要

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

| Layer | Technology |
|-------|------------|
| Backend | Hono.js + Drizzle ORM + Lucia Auth |
| Database | PostgreSQL 17 + PostGIS 3.4 |
| Frontend | Nuxt 3 + Vue 3 + Tailwind CSS |
| Auth (Staff) | Lucia (Session-based) |
| Auth (Member/Coach) | JWT |
| File Storage | Cloudflare R2 / S3 |
| Deployment | Coolify (VPS) + Cloudflare Pages |
