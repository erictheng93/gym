# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gym Nexus is a multi-branch gym management system (CRM/ERP) built with:
- **Backend:** Hono.js API on Node.js with Drizzle ORM
- **Database:** PostgreSQL 17 + PostGIS 3.4
- **Frontend:** Nuxt 4 (monorepo with member-app, admin-web, coach-app)
- **Infrastructure:** Cloudflare (Pages, Workers, R2) + VPS (Coolify)
- **Package Manager:** bun (必須使用 bun，不要使用 npm、yarn 或 pnpm)

## Development Commands

### Backend (Hono.js + Drizzle)
```bash
cd backend
bun install
bun run dev                     # Development with hot reload (http://localhost:8056)
bun run build                   # Build for production
bun run start                   # Run production build
bun run db:generate             # Generate migrations
bun run db:migrate              # Run migrations
bun run db:push                 # Push schema changes to database
bun run db:studio               # Open Drizzle Studio
bun run db:seed                 # Seed database with test data
bun run test                    # Run tests
bun run test:coverage           # Run tests with coverage
bun run lint                    # Lint source code
bun run typecheck               # TypeScript type checking
```

### Frontend (Nuxt 4)
```bash
cd frontend
bun install
bun run dev                     # All apps in parallel
bun run dev:admin               # Admin web only (http://localhost:3001)
bun run dev:member              # Member app only (http://localhost:3002)
bun run dev:coach               # Coach app only (http://localhost:3003)
bun run build                   # Build all apps for production
bun run lint                    # Lint all packages
bun run typecheck               # TypeScript type checking
bun run test                    # Run unit tests
bun run test:e2e                # Run Playwright E2E tests
```

## Architecture

### Project Structure
```
gym-nexus/
├── backend/                    # Hono.js API
│   ├── src/
│   │   ├── routes/            # API route handlers (49 routes)
│   │   ├── services/          # Business logic services (10 services)
│   │   ├── middleware/        # Auth, CSRF, rate limiting (7 middleware)
│   │   ├── db/                # Drizzle schema and migrations
│   │   ├── hooks/             # Business event hooks (7 hooks)
│   │   ├── cron/              # Scheduled jobs (4 cron jobs)
│   │   ├── auth/              # Lucia auth configuration
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Utility functions
│   ├── docker-compose.yml     # Development environment
│   └── Dockerfile             # Production build
├── frontend/
│   ├── apps/
│   │   ├── admin-web/         # Staff dashboard (e-contracts, reports, HR)
│   │   ├── member-app/        # Member PWA (booking, profile, check-in)
│   │   └── coach-app/         # Coach app (classes, students, lesson plans)
│   ├── packages/
│   │   ├── ui/                # Shared UI components
│   │   ├── shared/            # Shared utilities and types
│   │   ├── hr-core/           # HR feature core logic
│   │   └── hr-composables/    # HR feature composables
│   ├── tests/                 # Integration tests
│   └── e2e/                   # Playwright E2E tests
└── docs/                      # Documentation
```

### Backend Architecture

**Tech Stack:**
- Hono.js 4.x (web framework)
- Drizzle ORM 0.38.x (type-safe database access)
- Lucia Auth 3.x (session-based staff auth)
- JWT (member/coach auth with X-Member-Token/X-Coach-Token)
- Node.js >=20

**Route Files (49 routes):**
| Category | Files | Description |
|----------|-------|-------------|
| Auth | auth, member-auth, member-otp, member-oauth, coach-auth | Multi-type authentication |
| Core | members, contracts, contract-logs, branches, employees, job-titles, users, tenant | Core business entities |
| Classes | classes, bookings, check-ins, coach-classes, coach-schedule | Booking system |
| Finance | payments, payment-webhooks, membership-plans | Payments & plans |
| Marketing | leads, campaigns, coupons | Marketing tools |
| Member App | member-profile, member-push, member-notifications, member-reviews, member-check-in, member-workouts, member-goals, member-measurements, member-issues | Full member functionality |
| Coach App | coach-profile, coach-students, coach-lesson-plans, coach-teaching-materials | Coach functionality |
| System | dashboard, reports, notifications, files, pdf, health | System utilities |
| HR | hr-payroll, hr-performance, shift-schedules | Human resources |
| Tenant | admin-tenants, branding | Multi-tenant management |

**Services (10 services):**
- `email.ts` - SMTP email with templates
- `push.ts` - Web push notifications (VAPID)
- `line.ts` - LINE Messaging API (Flex messages, multicast)
- `sms.ts` - Mitake SMS gateway (Taiwan)
- `payment.ts` - Multi-gateway (Stripe, ECPay, LINE Pay, Manual)
- `pdf.ts` - PDF generation (Puppeteer)
- `files.ts` - S3/R2 file storage
- `export.ts` - CSV/Excel report export (payroll, revenue, members, contracts)
- `member-jwt.ts` - Member JWT token generation/validation
- `coach-jwt.ts` - Coach JWT token generation/validation

**Middleware (7 middleware):**
- `auth.ts` - Staff authentication (Lucia sessions)
- `member-auth.ts` - Member JWT validation
- `coach-auth.ts` - Coach JWT validation
- `tenant-context.ts` - Multi-tenant context
- `rate-limiter.ts` - Rate limiting
- `csrf.ts` - CSRF protection
- `api-logger.ts` - Request/response logging

**Hooks (7 hooks):**
- `contracts.ts` - Contract lifecycle events
- `payments.ts` - Payment processing hooks
- `check-ins.ts` - Check-in event hooks
- `contract-logs.ts` - Contract log event handling
- `leads.ts` - Lead conversion hooks
- `notifications.ts` - Notification trigger hooks
- `utils.ts` - Hook utility functions

### Database Schema (Drizzle - 53 tables)

**Authentication & Multi-tenant:**
- `users` - Staff user accounts
- `sessions` - Lucia auth sessions
- `tenants` - Multi-tenant root

**Core Business:**
- `branches` - Branch locations (HEADQUARTER/BRANCH types)
- `employees` - Staff with job titles and permissions
- `jobTitles` - Job title configuration
- `membershipPlans` - Membership plan definitions
- `members` - Customer data with status management
- `contracts` - Membership contracts (TIME_BASED/COUNT_BASED)
- `contractLogs` - Contract events (pause/transfer/extend)
- `payments` - Financial transactions
- `subscriptions` - Recurring payment subscriptions
- `invoices` - Invoice records
- `usageRecords` - Usage tracking

**Classes & Bookings:**
- `classes` - Class definitions
- `classSchedules` - Recurring schedules
- `classSessions` - Individual sessions
- `bookings` - Class bookings
- `checkIns` - Member entry logs

**Member App Tables:**
- `memberCredentials` - Login credentials
- `memberSocialAccounts` - OAuth social accounts
- `pushSubscriptions` - Push notification tokens
- `classReviews` - Class reviews
- `issueReports` - Support tickets
- `workoutLogs` - Workout logs
- `memberGoals` - Fitness goals
- `bodyMeasurements` - Body measurements

**Coach App Tables:**
- `coachMemberAssignments` - Coach-member relationships
- `coachNotes` - Student notes
- `lessonPlans` - Lesson planning
- `teachingMaterials` - Exercise library
- `classRecords` - Class attendance records

**HR Tables:**
- `attendances` - Staff attendance
- `leaveRequests` - Leave management
- `salaryRecords` - Payroll records
- `promotionRecords` - Promotions/raises
- `performanceReviews` - Performance tracking
- `kpiTemplates` - KPI templates
- `shiftSchedules` - Shift schedule definitions
- `employeeShifts` - Employee shift assignments

**Marketing Tables:**
- `leads` - Lead management
- `leadActivities` - Lead activity tracking
- `campaigns` - Marketing campaigns
- `coupons` - Coupon definitions
- `couponUsages` - Coupon usage records

**Notification Tables:**
- `notifications` - In-app notifications
- `branchNotificationConfig` - Multi-tenant LINE/SMS config
- `lineMessageLogs` - LINE message tracking
- `smsLogs` - SMS tracking

**Authentication Tables:**
- `otpTokens` - OTP token storage
- `otpSendLogs` - OTP send rate limiting

**System Tables:**
- `files` - File metadata
- `auditLogs` - Audit trail

### API Endpoints Reference

**Member App (X-Member-Token auth):**
```
/api/member/otp/*           - OTP login
/api/member/auth/*          - Auth & refresh
/api/member/me              - Profile CRUD
/api/member/oauth/*         - Social login (Google, LINE, Apple)
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
/api/contract-logs/*        - Contract event logs
/api/payments/*             - Payment management
/api/branches/*             - Branch management
/api/employees/*            - Employee management
/api/job-titles/*           - Job title configuration
/api/membership-plans/*     - Membership plan management
/api/classes/*              - Class management
/api/bookings/*             - Booking management
/api/hr/payroll/*           - HR payroll
/api/hr/performance/*       - HR performance
/api/shift-schedules/*      - Staff shift scheduling
/api/leads/*                - Lead management
/api/campaigns/*            - Campaign management
/api/coupons/*              - Coupon management
/api/reports/*              - Analytics
/api/dashboard/*            - Dashboard data
/api/notifications/*        - System notifications
/api/files/*                - File management
/api/tenant/*               - Tenant configuration
/api/admin/tenants/*        - Multi-tenant administration
/api/branding/*             - Tenant branding configuration
/api/health                 - Health check
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

### Testing

**Backend Tests:**
```bash
cd backend
bun run test                 # Run all tests
bun run test:coverage        # Run with coverage report
```

**Frontend Tests:**
```bash
cd frontend
bun run test                 # Run Vitest unit tests
bun run test:e2e             # Run Playwright E2E tests
```

**E2E Tests Location:** `frontend/e2e/`
**Integration Tests Location:** `frontend/tests/integration/`

## Language

Project documentation and UI are in Traditional Chinese (繁體中文). Code and technical implementation should use English identifiers.
