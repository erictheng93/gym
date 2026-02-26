# CLAUDE.md

## Project Overview

Gym Nexus — multi-branch gym management system (CRM/ERP).

- **Backend:** Hono.js + Drizzle ORM + PostgreSQL 17 + PostGIS
- **Frontend:** Nuxt 4 monorepo (admin-web, member-app, coach-app)
- **Infrastructure:** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **Package Manager:** bun（必須使用 bun，不要使用 npm、yarn 或 pnpm）

## Commands

```bash
# Backend (port 8056)
cd backend && bun install
bun run dev / build / start
bun run db:generate / db:migrate / db:push / db:studio / db:seed
bun run test / test:coverage / lint / typecheck

# Frontend (admin :3001, member :3002, coach :3003)
cd frontend && bun install
bun run dev / dev:admin / dev:member / dev:coach
bun run build / lint / typecheck / test / test:e2e

# Docker
cd backend && docker compose up -d
```

## Architecture

```
backend/src/  → routes/, services/, middleware/, db/, hooks/, cron/, auth/, types/, utils/
frontend/apps/  → admin-web/, member-app/, coach-app/
frontend/packages/  → ui/, shared/, hr-core/, hr-composables/
frontend/tests/  → integration/    frontend/e2e/  → Playwright
```

### Authentication (3 types)
- **Staff:** Lucia Auth sessions → `backend/src/auth/`, `middleware/auth.ts`
- **Member:** JWT via `X-Member-Token` → `middleware/member-auth.ts`
- **Coach:** JWT via `X-Coach-Token` → `middleware/coach-auth.ts`

### Business Logic

**Contract types:** `TIME_BASED` (monthly/yearly) | `COUNT_BASED` (class packages)
**Status flow:** `DRAFT → ACTIVE → PAUSED → ACTIVE → EXPIRED/CANCELLED/TRANSFERRED`
**Pause:** `end_date` auto-extends by pause duration

**Check-in:** QR/barcode → validate contract → (COUNT_BASED: decrement) → log entry

### Cron Jobs (`backend/src/cron/`)
billing, analytics, rfm segmentation, contract-expiry notifications

## Auto-Fix Policy

A PostToolUse hook runs `scripts/check.sh` after every Edit/Write on code files (.ts, .tsx, .js, .jsx, .vue). It checks ESLint, TypeScript, and related tests. When errors are reported, fix them immediately without asking the user. Continue fixing until all checks pass.

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
