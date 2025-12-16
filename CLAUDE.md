# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gym Nexus is a multi-branch gym management system (CRM/ERP) built with:
- **Backend:** Directus (Headless CMS) on Node.js
- **Database:** PostgreSQL
- **Frontend:** Nuxt 3 (monorepo with member-app and admin-web)
- **Infrastructure:** Cloudflare (Pages, Workers, R2) + VPS (Coolify)

## Development Commands

### Backend (Directus + PostgreSQL)
```bash
cd backend
docker-compose up -d
# Directus runs at http://localhost:8055
```

### Frontend (Nuxt 3)
```bash
cd frontend
npm install
npm run dev
# Dev server at http://localhost:3000
```

## Architecture

### Project Structure
```
gym-nexus/
├── backend/
│   ├── extensions/     # Custom Directus hooks/endpoints
│   ├── schema/         # Database schema snapshots
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

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
