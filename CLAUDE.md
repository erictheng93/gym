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

## UI/UX Design System

**All frontend UI/UX work MUST follow the design system defined in [`docs/UIUX-DESIGN-SYSTEM.md`](docs/UIUX-DESIGN-SYSTEM.md).**

This is the **Apple-Native Soft Minimalism** design system (蘋果原生柔和極簡設計系統). Key rules:

- **Layout:** Bento Grid modular cards, page padding 20px, card gap 16px
- **Shapes:** Cards `rounded-2xl`~`3xl`, buttons/tags `rounded-full`, NO hard borders
- **Shadows:** Soft diffused shadows only, opacity ≤ 8%
- **Colors:** Page bg `#F2F2F7`, cards `#FFFFFF`, text `#1C1C1E` (never pure black)
- **Accents:** `#007AFF` (blue/primary), `#34C759` (green/success), `#FF9500` (orange/warning), `#FF3B30` (red/error)
- **Pastels:** Low-saturation, high-brightness gradients for category tags and schedule blocks
- **Materials:** Navbar glassmorphism `bg-white/80 backdrop-blur-xl` (局部使用)
- **Icons:** SF Symbols style (Lucide Icons for web), outline/filled toggle
- **Motion:** 200–350ms, ease-out, fluid and unobtrusive
- **Typography:** SF Pro / Inter + Noto Sans TC, avoid pure black, strong title/body contrast
- **Output:** Vue + Tailwind CSS, confirm against design checklist before output

When designing any UI component, page, or feature, always read `docs/UIUX-DESIGN-SYSTEM.md` first and apply its full specifications.

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
