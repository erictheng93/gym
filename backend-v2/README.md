# Gym Nexus API v2

Modern REST API for Gym Nexus built with Hono.js and Drizzle ORM.

## Tech Stack

- **Runtime:** Node.js 22
- **Framework:** [Hono.js](https://hono.dev/) - Fast, lightweight web framework
- **ORM:** [Drizzle](https://orm.drizzle.team/) - Type-safe PostgreSQL access
- **Auth:** [Lucia](https://lucia-auth.com/) (staff) + JWT (member/coach)
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

## Development

```bash
pnpm dev          # Start with hot reload
pnpm build        # Build for production
pnpm start        # Start production server
pnpm typecheck    # Type check
pnpm db:push      # Push schema changes
pnpm db:studio    # Open Drizzle Studio
```

## Project Structure

```
src/
├── app.ts              # Main application entry
├── db/
│   ├── index.ts        # Database connection
│   └── schema.ts       # Drizzle schema definitions
├── routes/
│   ├── auth.ts         # Staff authentication
│   ├── member-*.ts     # Member app endpoints
│   ├── coach-*.ts      # Coach app endpoints
│   └── ...             # Other API routes
├── services/
│   ├── email.ts        # SMTP email
│   ├── push.ts         # Web push notifications
│   ├── line.ts         # LINE Messaging API
│   ├── sms.ts          # Mitake SMS (Taiwan)
│   ├── payment.ts      # Payment gateways
│   └── pdf.ts          # PDF generation
├── middleware/
│   ├── auth.ts         # Staff auth (Lucia)
│   ├── member-auth.ts  # Member JWT auth
│   ├── coach-auth.ts   # Coach JWT auth
│   └── csrf.ts         # CSRF protection
├── hooks/              # Business event hooks
└── cron/               # Scheduled jobs
```

## API Routes

### Authentication
- `/api/auth` - Staff login (Lucia sessions)
- `/api/member/auth` - Member JWT auth
- `/api/coach/auth` - Coach JWT auth

### Member App (X-Member-Token header)
- `/api/member/me` - Profile
- `/api/member/check-in` - Check-in/history
- `/api/member/workouts` - Workout logs
- `/api/member/goals` - Fitness goals
- `/api/member/reviews` - Class reviews

### Coach App (X-Coach-Token header)
- `/api/coach/me` - Profile
- `/api/coach/classes` - Classes & attendance
- `/api/coach/students` - Student notes
- `/api/coach/lesson-plans` - Lesson planning

### Admin (Cookie session)
- `/api/members` - Member CRUD
- `/api/contracts` - Contract management
- `/api/payments` - Payment processing
- `/api/payroll` - HR payroll
- `/api/performance` - Performance reviews
- `/api/reports` - Analytics

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
| `LINE_*` | LINE Messaging API keys |
| `STRIPE_*` | Stripe payment keys |
| `ECPAY_*` | ECPay (Taiwan) keys |

## Architecture

This API uses a modern stack with improved performance:

| Feature | Stack |
|---------|-------|
| Auth | Lucia + JWT |
| ORM | Drizzle |
| Hooks | Native TypeScript |
| File storage | S3/R2 |
| Avg latency | ~50ms |
