# Gym Nexus API

Modern REST API for Gym Nexus built with Hono.js and Drizzle ORM.

## Tech Stack

- **Runtime:** Node.js 22
- **Framework:** [Hono.js](https://hono.dev/) v4.x - Fast, lightweight web framework
- **ORM:** [Drizzle](https://orm.drizzle.team/) v0.38.x - Type-safe PostgreSQL access
- **Auth:** [Lucia](https://lucia-auth.com/) v3.x (staff) + JWT (member/coach)
- **Database:** PostgreSQL 17 + PostGIS 3.4

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start database
docker compose up database -d

# Push schema to database
pnpm db:push

# Start development server
pnpm dev
```

API will be available at `http://localhost:8056`

## Development Commands

```bash
pnpm dev              # Start with hot reload
pnpm build            # Build for production
pnpm start            # Start production server
pnpm typecheck        # Type check
pnpm lint             # Lint code
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Drizzle Studio
pnpm db:seed          # Seed database with test data
```

## Project Structure

```
src/
├── app.ts              # Main application entry
├── auth/
│   └── lucia.ts        # Lucia auth configuration
├── db/
│   ├── index.ts        # Database connection
│   ├── schema.ts       # Drizzle schema (51 tables)
│   └── seed.ts         # Database seeding
├── routes/             # API routes (46 route files)
│   ├── auth.ts         # Staff authentication
│   ├── member-*.ts     # Member app endpoints (9 routes)
│   ├── coach-*.ts      # Coach app endpoints (5 routes)
│   └── ...             # Other API routes
├── services/           # Business services (9 services)
│   ├── email.ts        # SMTP email with templates
│   ├── push.ts         # Web push notifications (VAPID)
│   ├── line.ts         # LINE Messaging API
│   ├── sms.ts          # Mitake SMS (Taiwan)
│   ├── payment.ts      # Multi-gateway payments
│   ├── pdf.ts          # PDF generation (Puppeteer)
│   ├── files.ts        # S3/R2 file storage
│   ├── member-jwt.ts   # Member JWT tokens
│   └── coach-jwt.ts    # Coach JWT tokens
├── middleware/         # Middleware (7 middleware)
│   ├── auth.ts         # Staff auth (Lucia sessions)
│   ├── member-auth.ts  # Member JWT validation
│   ├── coach-auth.ts   # Coach JWT validation
│   ├── tenant-context.ts # Multi-tenant context
│   ├── rate-limiter.ts # Rate limiting
│   ├── csrf.ts         # CSRF protection
│   └── api-logger.ts   # Request/response logging
├── hooks/              # Business event hooks (7 hooks)
│   ├── contracts.ts    # Contract lifecycle events
│   ├── payments.ts     # Payment processing
│   ├── check-ins.ts    # Check-in events
│   ├── contract-logs.ts # Contract log events
│   ├── leads.ts        # Lead conversion
│   ├── notifications.ts # Notification triggers
│   └── utils.ts        # Hook utilities
├── cron/               # Scheduled jobs (4 jobs)
│   ├── billing.ts      # Monthly billing
│   ├── analytics.ts    # Daily analytics
│   ├── rfm.ts          # RFM segmentation
│   └── contract-expiry.ts # Expiry notifications
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## API Routes (46 routes)

### Authentication (5 routes)
| Route | Auth | Description |
|-------|------|-------------|
| `/api/auth` | - | Staff login (Lucia sessions) |
| `/api/member/auth` | - | Member JWT auth |
| `/api/member/otp` | - | Member OTP login |
| `/api/member/oauth` | - | Member OAuth (Google, LINE, Apple) |
| `/api/coach/auth` | - | Coach JWT auth |

### Member App (9 routes, X-Member-Token header)
| Route | Description |
|-------|-------------|
| `/api/member/me` | Profile CRUD |
| `/api/member/push` | Push notification subscription |
| `/api/member/notifications` | In-app notifications |
| `/api/member/check-in` | Check-in & history |
| `/api/member/workouts` | Workout logs |
| `/api/member/goals` | Fitness goals |
| `/api/member/measurements` | Body measurements |
| `/api/member/reviews` | Class reviews |
| `/api/member/issues` | Support tickets |

### Coach App (5 routes, X-Coach-Token header)
| Route | Description |
|-------|-------------|
| `/api/coach/me` | Profile |
| `/api/coach/classes` | Classes & attendance |
| `/api/coach/schedule` | Weekly schedule |
| `/api/coach/students` | Students & notes |
| `/api/coach/lesson-plans` | Lesson planning |
| `/api/coach/teaching-materials` | Exercise library |

### Admin API (Cookie session)
| Route | Description |
|-------|-------------|
| `/api/members` | Member CRUD |
| `/api/contracts` | Contract management |
| `/api/contract-logs` | Contract events |
| `/api/payments` | Payment processing |
| `/api/branches` | Branch management |
| `/api/employees` | Employee management |
| `/api/job-titles` | Job title configuration |
| `/api/membership-plans` | Membership plan management |
| `/api/classes` | Class management |
| `/api/bookings` | Booking management |
| `/api/check-ins` | Check-in management |
| `/api/hr/payroll` | HR payroll |
| `/api/hr/performance` | Performance reviews |
| `/api/leads` | Lead management |
| `/api/campaigns` | Campaign management |
| `/api/coupons` | Coupon management |
| `/api/reports` | Analytics & reports |
| `/api/dashboard` | Dashboard data |
| `/api/notifications` | System notifications |
| `/api/files` | File management |
| `/api/pdf` | PDF generation |
| `/api/tenant` | Tenant configuration |
| `/api/health` | Health check |

## Docker

```bash
# Development
docker compose up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Environment Variables

See `.env.example` for all available options. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Staff auth session secret |
| `MEMBER_JWT_SECRET` | Member app JWT secret |
| `COACH_JWT_SECRET` | Coach app JWT secret |
| `EMAIL_SMTP_*` | SMTP configuration |
| `VAPID_*` | Web push notification keys |
| `LINE_*` | LINE Messaging API keys |
| `STRIPE_*` | Stripe payment keys |
| `ECPAY_*` | ECPay (Taiwan) keys |
| `S3_*` or `R2_*` | File storage configuration |

## Database Schema

The database contains 51 tables organized by domain:

- **Authentication:** users, sessions, tenants
- **Core Business:** branches, employees, jobTitles, membershipPlans, members, contracts, contractLogs, payments
- **Classes:** classes, classSchedules, classSessions, bookings, checkIns
- **Member App:** memberCredentials, pushSubscriptions, classReviews, workoutLogs, memberGoals, bodyMeasurements, issueReports
- **Coach App:** coachMemberAssignments, coachNotes, lessonPlans, teachingMaterials, classRecords
- **HR:** attendances, leaveRequests, salaryRecords, performanceReviews, promotionRecords, kpiTemplates
- **Marketing:** leads, leadActivities, campaigns, coupons, couponUsages
- **Notifications:** notifications, branchNotificationConfig, lineMessageLogs, smsLogs

## Architecture

| Feature | Implementation |
|---------|----------------|
| Auth | Lucia (staff sessions) + JWT (member/coach) |
| ORM | Drizzle with type-safe queries |
| Hooks | Native TypeScript event handlers |
| File storage | S3/R2 compatible |
| Notifications | Email, Push, LINE, SMS |
| Payments | Stripe, ECPay, LINE Pay, Manual |
| Avg latency | ~50ms |
