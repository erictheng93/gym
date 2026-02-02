# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gym Nexus is a multi-branch gym management system (CRM/ERP) built with:
- **Backend:** Hono.js API on Node.js with Drizzle ORM
- **Database:** PostgreSQL 17 + PostGIS 3.4
- **Frontend:** Nuxt 3 (monorepo with member-app, admin-web, coach-app)
- **Infrastructure:** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **Package Manager:** pnpm (必須使用 pnpm，不要使用 npm 或 yarn)

## Development Commands

### Backend (Hono.js + Drizzle)
```bash
cd backend
pnpm install
pnpm dev                        # Development with hot reload (http://localhost:8056)
pnpm build                      # Build for production
pnpm db:push                    # Push schema changes to database
pnpm db:studio                  # Open Drizzle Studio
```

### Frontend (Nuxt 3)
```bash
cd frontend
pnpm install
pnpm dev                        # All apps in parallel
pnpm dev:admin                  # Admin web only (http://localhost:3001)
pnpm dev:member                 # Member app only (http://localhost:3002)
pnpm dev:coach                  # Coach app only (http://localhost:3003)
```

## Architecture

### Project Structure
```
gym-nexus/
├── backend/                    # Hono.js API
│   ├── src/
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic (email, sms, line, payment, pdf)
│   │   ├── middleware/        # Auth, CSRF, rate limiting
│   │   ├── db/                # Drizzle schema and migrations
│   │   ├── hooks/             # Business event hooks
│   │   └── cron/              # Scheduled jobs
│   ├── docker-compose.yml     # Development environment
│   └── Dockerfile             # Production build
├── frontend/
│   ├── apps/
│   │   ├── admin-web/         # Staff dashboard (e-contracts, reports, HR)
│   │   ├── member-app/        # Member PWA (booking, profile, check-in)
│   │   └── coach-app/         # Coach app (classes, students, lesson plans)
│   └── packages/              # Shared UI components
└── docs/
```

### Backend Architecture

**Tech Stack:**
- Hono.js (web framework)
- Drizzle ORM (type-safe database access)
- Lucia Auth (session-based staff auth)
- JWT (member/coach auth with X-Member-Token/X-Coach-Token)
- Node.js 22

**Route Files (~35 routes):**
| Category | Files | Description |
|----------|-------|-------------|
| Auth | auth, member-auth, member-otp, member-oauth, coach-auth | Multi-type authentication |
| Core | members, contracts, contract-logs, branches, employees | Core business entities |
| Classes | classes, bookings, check-ins, coach-classes, coach-schedule | Booking system |
| Finance | payments, payment-webhooks, payroll | Payments & HR |
| Marketing | leads, campaigns, coupons | Marketing tools |
| Member App | member-profile, member-push, member-notifications, member-reviews, member-check-in, member-workouts, member-goals, member-measurements, member-issues | Full member functionality |
| Coach App | coach-profile, coach-students, coach-lesson-plans, coach-teaching-materials | Coach functionality |
| System | dashboard, reports, notifications, files, pdf, health | System utilities |
| HR | hr-payroll, hr-performance | Human resources |

**Services:**
- `email.ts` - SMTP email with templates
- `push.ts` - Web push notifications (VAPID)
- `line.ts` - LINE Messaging API (Flex messages, multicast)
- `sms.ts` - Mitake SMS gateway (Taiwan)
- `payment.ts` - Multi-gateway (Stripe, ECPay, LINE Pay, Manual)
- `pdf.ts` - PDF generation (Puppeteer)
- `storage.ts` - S3/R2 file storage

**Middleware:**
- `auth.ts` - Staff authentication (Lucia sessions)
- `member-auth.ts` - Member JWT validation
- `coach-auth.ts` - Coach JWT validation
- `tenant-context.ts` - Multi-tenant context
- `rate-limiter.ts` - Rate limiting
- `csrf.ts` - CSRF protection

### Database Schema (Drizzle)

**Core Tables:**
- `tenants` - Multi-tenant root
- `branches` - Branch locations (HEADQUARTER/BRANCH types)
- `employees` - Staff with job titles and permissions
- `members` - Customer data with status management
- `contracts` - Membership contracts (TIME_BASED/COUNT_BASED)
- `contract_logs` - Contract events (pause/transfer/extend)
- `payments` - Financial transactions
- `classes` - Class schedules
- `bookings` - Class bookings
- `check_ins` - Entry logs

**Member App Tables:**
- `member_devices` - Push notification tokens
- `member_reviews` - Class reviews
- `member_issues` - Support tickets
- `member_workouts` - Workout logs
- `member_goals` - Fitness goals
- `member_measurements` - Body measurements

**Coach App Tables:**
- `coach_notes` - Student notes
- `lesson_plans` - Lesson planning
- `teaching_materials` - Exercise library

**HR Tables:**
- `salary_records` - Payroll records
- `promotion_records` - Promotions/raises
- `performance_reviews` - Performance tracking
- `kpi_templates` - KPI templates

**Notification Tables:**
- `branch_notification_config` - Multi-tenant LINE/SMS config
- `line_message_logs` - LINE message tracking
- `sms_logs` - SMS tracking

### API Endpoints Reference

**Member App (X-Member-Token auth):**
```
/api/member/otp/*           - OTP login
/api/member/auth/*          - Auth & refresh
/api/member/me              - Profile CRUD
/api/member/oauth/*         - Social login
/api/member/push/*          - Push notifications
/api/member/notifications/* - In-app notifications
/api/member/reviews/*       - Class reviews
/api/member/check-in/*      - Check-in & history
/api/member/workouts/*      - Workout logs
/api/member/goals/*         - Fitness goals
/api/member/measurements/*  - Body measurements
/api/member/issues/*        - Support tickets
```

**Coach App (X-Coach-Token auth):**
```
/api/coach/auth/*           - Login & refresh
/api/coach/me               - Profile
/api/coach/classes/*        - Classes & attendance
/api/coach/schedule         - Weekly schedule
/api/coach/students/*       - Students & notes
/api/coach/lesson-plans/*   - Lesson plans
/api/coach/teaching-materials/* - Exercise library
```

**Admin/Staff (Lucia session auth):**
```
/api/auth/*                 - Staff login
/api/members/*              - Member management
/api/contracts/*            - Contract management
/api/payments/*             - Payment management
/api/payroll/*              - HR payroll
/api/performance/*          - HR performance
/api/reports/*              - Analytics
/api/dashboard/*            - Dashboard data
```

### Port Configuration
| Service | Development | Production | Description |
|---------|-------------|------------|-------------|
| API | localhost:8056 | :8056 | Hono.js API |
| PostgreSQL | localhost:15432 | :15432 | Database |
| Redis | localhost:6379 | :6379 | Cache (optional) |
| Admin Web | localhost:3001 | - | Staff dashboard |
| Member App | localhost:3002 | - | Member PWA |
| Coach App | localhost:3003 | - | Coach app |

### Docker
```bash
cd backend

# Development
docker compose up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Business Logic

**Contract Types:**
- `TIME_BASED` - Monthly/yearly memberships
- `COUNT_BASED` - Class packages (e.g., 10 sessions)

**Contract Status Flow:**
`DRAFT` → `ACTIVE` → `PAUSED` → `ACTIVE` → `EXPIRED`/`CANCELLED`/`TRANSFERRED`

**Pause Logic:** When paused, `end_date` auto-extends by pause duration

**Check-in Flow:**
1. Member presents QR/barcode
2. System validates active contract
3. For COUNT_BASED: decrement remaining count
4. Log entry with optional class reference

### Cron Jobs (backend/src/cron/)
- `billing.ts` - Monthly billing generation
- `analytics.ts` - Daily analytics aggregation
- `rfm.ts` - RFM segmentation calculation
- `contract-expiry.ts` - Expiry notifications

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
