# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gym Nexus is a multi-branch gym management system (CRM/ERP) built with:
- **Backend:** Directus (Headless CMS) on Node.js
- **Database:** PostgreSQL
- **Frontend:** Nuxt 3 (monorepo with member-app and admin-web)
- **Infrastructure:** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **Package Manager:** pnpm (必須使用 pnpm，不要使用 npm 或 yarn)

## Development Commands

### Backend (Directus + PostgreSQL)
```bash
cd backend
docker-compose up -d          # 開發環境：只啟動核心服務
# Directus runs at http://localhost:8055
```

### Frontend (Nuxt 3)
```bash
cd frontend
pnpm install
pnpm dev
# Dev server at http://localhost:3000
```

## Docker Architecture

### 檔案結構
```
backend/
├── docker-compose.yml              # 核心服務（開發+生產都用）
├── docker-compose.monitoring.yml   # 監控服務（僅生產環境）
├── PRODUCTION.md                   # 生產環境部署指南
└── scripts/
    ├── backup-to-r2.sh            # R2 自動備份腳本
    ├── restore-from-r2.sh         # 備份恢復腳本
    └── setup-rclone.sh            # R2 設定精靈
```

### 開發環境 vs 生產環境
| 環境 | 啟動命令 | 服務 |
|-----|---------|------|
| 開發 | `docker-compose up -d` | Directus + PostgreSQL |
| 生產 | `docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d` | + Uptime Kuma + Netdata |

### 設計原則
- **不過度設計**: 開發階段不啟動 Redis、監控等非必要服務
- **資料持久化**: PostgreSQL 資料掛載到 `./data/database`
- **環境分離**: 監控服務透過獨立 compose 檔案管理，不影響開發環境

## Architecture

### Project Structure
```
gym-nexus/
├── backend/
│   ├── extensions/     # Custom Directus hooks/endpoints
│   ├── migrations/     # Database migrations (including index optimization)
│   ├── schema/         # Database schema snapshots
│   ├── DATABASE_INDEXES.md  # 索引优化文档（100+ 索引）
│   └── docker-compose.yml
├── frontend/
│   ├── apps/
│   │   ├── member-app/ # Member PWA (booking, contracts, entry barcode)
│   │   └── admin-web/  # Staff dashboard (e-contracts, reports)
│   └── packages/       # Shared UI components
└── docs/
```

### Core Database Entities
1. **branches** - Multi-tenant root (HEADQUARTER/BRANCH types)
2. **employees** - Staff linked to directus_users with job_title and branch
3. **members** - Customer data with status auto-updated by contract state
4. **contracts** - Core business table linking members to membership_plans
5. **contract_logs** - Tracks pause/transfer/extension (auto-extends end_date)
6. **payments** - Financial records per contract

### Permission Model (Row-Level Security)
- **HQ Admin:** Full system access
- **Store Manager:** `branch_id = $CURRENT_USER.branch_id`
- **Coach:** `sales_person_id = $CURRENT_USER.id`
- Permissions stored in `job_titles.permissions_config` (JSON) with per-employee overrides in `employees.custom_permissions`

### Key Business Logic
- **Contract Types:** TIME_BASED (monthly/yearly) and COUNT_BASED (class packages)
- **Pause Logic:** When a contract is paused, `end_date` must auto-extend by pause duration
- **Cross-branch Entry:** Members belong to one primary branch but system supports cross-branch access logging

### Notification System
- **Email (SMTP):** Configurable via `EMAIL_SMTP_*` env vars, supports contract expiry reminders, booking confirmations, welcome emails
- **Push Notifications:** Web Push via VAPID keys (`VAPID_*` env vars)
- **Email Templates:** Located in `backend/extensions/directus-extension-gym-hooks/src/email-service.js`

### Reports API
- **Endpoints:** `/gym/reports/revenue`, `/gym/reports/member-growth`, `/gym/reports/contract-expiry`, `/gym/reports/member-activity`
- **Caching:** 開發環境使用內存緩存，生產環境可選用 Redis（需在 docker-compose.yml 中啟用）
- **Documentation:** See `backend/REPORTS_API.md` for detailed API docs

### Database Performance
- **PostgreSQL 18 + PostGIS 3.6**: Latest version with spatial query support
- **100+ Optimized Indexes**: B-tree, GIN (JSONB), GiST (spatial/range), BRIN (timeseries), Partial
- **Performance**: 40-50x improvement on multi-tenant queries
- **Details**: See `backend/DATABASE_INDEXES.md` for comprehensive documentation

### Port Configuration (避免 Windows 衝突)
| 服務 | 開發環境 | 生產環境 | 說明 |
|-----|---------|---------|------|
| Directus | localhost:8055 | :8055 | API 服務 |
| PostgreSQL | localhost:15432 | :15432 | 資料庫（不對外開放） |
| Uptime Kuma | - | :3001 | 存活監控（僅生產） |
| Netdata | - | :19999 | 系統監控（僅生產） |

### 備份策略（生產環境）
- **備份目標**: Cloudflare R2
- **Daily**: 每天 03:00，保留 7 天
- **Weekly**: 每週日 04:00，保留 30 天
- **腳本位置**: `backend/scripts/backup-to-r2.sh`
- **詳細文檔**: `backend/PRODUCTION.md`

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
