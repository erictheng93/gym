# Gym Nexus Deployment Runbook

> **Updated for Hono.js + Drizzle ORM architecture**

This document provides step-by-step procedures for deploying Gym Nexus to production and staging environments.

## Table of Contents

1. [Pre-deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Database Migrations](#database-migrations)
6. [Post-deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Pre-deployment Checklist

### Code Quality
- [ ] All tests passing (`bun run test`)
- [ ] TypeScript compilation successful (`bun run typecheck`)
- [ ] ESLint passing (`bun run lint`)
- [ ] Backend builds successfully (`cd backend && bun run build`)

### Database
- [ ] Database migrations reviewed and tested locally
- [ ] Production database backup taken (within last hour)
- [ ] Migration rollback scripts prepared (if applicable)

### Configuration
- [ ] Environment variables configured for target environment
- [ ] Secrets rotated if required (SESSION_SECRET, JWT secrets)
- [ ] CORS origins updated for production domains

### Infrastructure
- [ ] Docker images built and tested locally
- [ ] Sufficient disk space on target servers
- [ ] PostgreSQL services healthy

### Communication
- [ ] Deployment window communicated to stakeholders
- [ ] Support team notified of potential downtime
- [ ] Rollback plan reviewed with team

---

## Environment Setup

### Required Environment Variables

Create `/backend/.env` from `.env.example`:

```bash
# Database (Required)
DATABASE_URL=postgresql://gym_nexus:SECURE_PASSWORD@db.example.com:5432/gym_nexus

# Server
PORT=8056
NODE_ENV=production
ENABLE_CRON=true

# Auth Secrets (Required - generate with: openssl rand -hex 32)
SESSION_SECRET=<64-char-random-string>
MEMBER_JWT_SECRET=<64-char-random-string>
COACH_JWT_SECRET=<64-char-random-string>

# CORS (Required - your production domains)
CORS_ORIGIN=https://admin.gym-nexus.com,https://member.gym-nexus.com,https://coach.gym-nexus.com

# Reverse proxies that append to X-Forwarded-For (Required behind Cloudflare Tunnel: 1)
TRUST_PROXY=1

# Email (Amazon SES recommended)
EMAIL_TRANSPORT=smtp
EMAIL_FROM=Gym Nexus <noreply@gym-nexus.com>
EMAIL_SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=<ses-smtp-username>
EMAIL_SMTP_PASSWORD=<ses-smtp-password>

# Push Notifications
VAPID_PUBLIC_KEY=<generated-vapid-public-key>
VAPID_PRIVATE_KEY=<generated-vapid-private-key>
VAPID_SUBJECT=mailto:admin@gym-nexus.com

# LINE Messaging
LINE_CHANNEL_ACCESS_TOKEN=<your-line-token>
LINE_MESSAGING_CHANNEL_SECRET=<your-line-secret>

# SMS (Mitake) - Required for member phone OTP (login, phone change, complete-profile)
MITAKE_USERNAME=<username>
MITAKE_PASSWORD=<password>

# File Storage (Cloudflare R2)
S3_BUCKET=gym-nexus-files
S3_REGION=auto
S3_ACCESS_KEY=<r2-access-key>
S3_SECRET_KEY=<r2-secret-key>
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.gym-nexus.com

# Payment (if using)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Member phone OTP: SMS (`MITAKE_*`) and gym scope (`TENANT_SLUG`)

Member phone codes (OTP login `POST /api/member/otp/send`, phone verification
`POST /api/member/me/phone/otp`) go out by Mitake SMS. In production:

- `MITAKE_USERNAME` / `MITAKE_PASSWORD` are **required** (or per-branch Mitake
  credentials with SMS enabled in `branch_notification_config`; a branch's own
  account is used for its members, the env account otherwise). Without any SMS
  account these endpoints answer `503 SMS_UNAVAILABLE` and record
  `success=false` in `otp_send_logs`; a Mitake error does the same. Codes are
  never written to the application log or to `sms_logs`.
- In `development`/`test` without credentials no SMS is sent and the code is
  returned in the response (`_devCode` / `data.otp`), as before.

The member-app's `TENANT_SLUG` (the gym's `tenants.slug`, already read for
branding) is now also sent with OTP login, so a phone or email registered at
several gyms logs into this deployment's gym. Set it on every member-app
deployment. A login without it that matches members of several gyms is refused
after the code is verified (`409 MULTIPLE_ACCOUNTS`) instead of picking one.
A wrong slug makes OTP login find no one (send still answers 200), so check it
against `select slug from tenants`.

Check after deploying: request a login code for a real member and confirm the
SMS arrives and `otp_send_logs` has `success = true`; `docker compose logs api`
must not contain the code.

### Client address behind the proxy (`TRUST_PROXY`)

Rate limits keyed by client address (staff and coach login, and every limiter
without its own key) count requests per address. The API reads that address as
follows:

- `TRUST_PROXY` unset / `false` / `0`: the TCP peer of the connection.
  `X-Forwarded-For` and `X-Real-IP` are ignored, since any client can send them.
- `TRUST_PROXY=<n>` (`true` = 1): the *n*-th `X-Forwarded-For` entry from the
  right, i.e. the address the outermost trusted proxy appended. Entries to its
  left come from the client and are never used.

Production runs Cloudflare edge → cloudflared (`tunnel` service) → API. The edge
appends the visitor's address and cloudflared forwards it, so `TRUST_PROXY=1`
(set in `docker-compose.prod.yml`). Add one per extra proxy that appends to the
header (e.g. Traefik in front of the API in Dokploy: `2`).

Required with it:

- The API port must only be reachable through those proxies. Otherwise a client
  connecting directly writes its own right-most entry.
  `docker-compose.prod.yml` publishes 8056 on `127.0.0.1` only.
- Without `TRUST_PROXY` behind the tunnel every visitor shares cloudflared's
  address, so 5 failed staff logins in 15 minutes lock out everyone.

Check after deploying: `docker compose logs api` shows no `429` on normal logins,
and six wrong passwords from one machine get `429` while another machine can
still log in.

### Generate Secrets

```bash
# Generate random secrets
openssl rand -hex 32

# Generate VAPID keys
npx web-push generate-vapid-keys
```

---

## Backend Deployment

### Option 1: Docker Deployment (Recommended)

```bash
# Build production image
cd backend
docker build -t gym-nexus-api:latest .

# Run container
docker run -d \
  --name gym-nexus-api \
  --env-file .env \
  -p 8056:8056 \
  --restart unless-stopped \
  gym-nexus-api:latest
```

### Option 2: Direct Node.js

```bash
cd backend

# Install dependencies
bun install --frozen-lockfile

# Build
bun run build

# Start with PM2
pm2 start dist/app.js --name gym-nexus-api

# Or start directly
NODE_ENV=production node dist/app.js
```

### Docker Compose (with database)

```bash
cd backend

# Production deployment
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Verify Backend

```bash
# Health check
curl https://api.gym-nexus.com/health

# Expected response:
# {"status":"healthy","services":{"api":"up","database":"up"},"version":"2.0.0"}
```

---

## Frontend Deployment

### Cloudflare Pages (Recommended)

1. Connect GitHub repository to Cloudflare Pages
2. Configure build settings:

```yaml
# Admin Web
Build command: cd frontend && bun install && bun run build:admin
Build output directory: frontend/apps/admin-web/.output/public
Root directory: /

# Member App
Build command: cd frontend && bun install && bun run build:member
Build output directory: frontend/apps/member-app/.output/public

# Coach App
Build command: cd frontend && bun install && bun run build:coach
Build output directory: frontend/apps/coach-app/.output/public
```

3. Set environment variables:
```
API_BASE_URL=https://api.gym-nexus.com
```

### Manual Build

```bash
cd frontend

# Install dependencies
bun install

# Build all apps
bun run build

# Or build specific app
bun run build:admin
bun run build:member
bun run build:coach
```

---

## Database Migrations

### Upgrading from an older version (in order)

Run these steps, in this order, on any database deployed before the changes
listed. Take the backup (see "Backup Before Migration" below) first. All commands
run from `backend/` against the target `DATABASE_URL`.

```bash
cd backend

# 1. Backfill tenant_id on legacy rows (#109/#116). Must run BEFORE db:push,
#    which adds NOT NULL to members/contracts/payments.tenant_id.
bun run db:backfill-tenant -- --dry-run   # report only
bun run db:backfill-tenant                # apply (no-op if nothing is NULL)

# 2. Apply the schema. One db:push covers every schema change since the old version:
#    - members/contracts/payments.tenant_id NOT NULL      (#116)
#    - payments.receipt_no widened varchar(30) -> (100)   (#112)
#    - payments.status added, existing rows = COMPLETED   (#119)
#    - performance_reviews.overall_score decimal(5,2)     (#131)
#    - bookings.override_reason / override_by added (NULL) (#136)
bun run db:push
```

Verify:

```bash
# payments.status exists, and no legacy rows are left without a tenant
psql "$DATABASE_URL" -c "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'payments' AND column_name IN ('status', 'receipt_no', 'tenant_id');"
psql "$DATABASE_URL" -c "SELECT count(*) AS payments_without_status_or_tenant FROM payments WHERE status IS NULL OR tenant_id IS NULL;"   # expect 0
psql "$DATABASE_URL" -c "SELECT numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'performance_reviews' AND column_name = 'overall_score';"   # expect 5, 2
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('override_reason', 'override_by');"   # expect 2 rows (text, uuid)
```

The first query must list `status` (varchar 20), `receipt_no` (varchar 100) and
`tenant_id`, and the bookings query must return both override columns. If `db:push` fails on NULL `tenant_id`, you skipped step 1.

For a fresh database, only `bun run db:push` is needed. For other schema changes
use the Drizzle tooling:

```bash
bun run db:generate   # generate a migration from schema changes
bun run db:migrate    # apply generated migrations
```

### Performance score column widened

`performance_reviews.overall_score` is now `decimal(5,2)` (was `decimal(4,2)`,
which overflowed at a score of 100). `bun run db:push` applies it as an
in-place `ALTER COLUMN TYPE`; widening precision is lossless and needs no backfill.

### Booking override columns

`bookings` gains two nullable columns, `override_reason` (text) and `override_by`
(uuid, FK `users.id`, `ON DELETE SET NULL`), which record a manager+ booking made
without a valid contract (trial / make-up class). `bun run db:push` adds them; no
backfill is needed (existing rows stay NULL).

### Tenant backfill details (#109)

`members`, `contracts` and `payments` now have `tenant_id NOT NULL`. `db:push`
fails on a database that still has legacy rows with NULL `tenant_id`, so
backfill them from their branch first (take the backup below beforehand):

```bash
cd backend

# 1. Report NULL counts; changes nothing
bun run db:backfill-tenant -- --dry-run

# 2. Backfill in one transaction (no-op if step 1 found nothing)
bun run db:backfill-tenant

# 3. Apply the schema (adds the NOT NULL constraints)
bun run db:push
```

If the script exits non-zero with `BLOCKED`, the listed branches have NULL
`tenant_id`: set `branches.tenant_id` for each one by hand, then re-run from
step 1. The script never changes anything in that case.

### Payment status column

`payments.status` (`PENDING` / `COMPLETED` / `FAILED`) is added by `db:push` as
`varchar(20) NOT NULL DEFAULT 'COMPLETED'`, so every existing row is backfilled as
`COMPLETED` (all existing rows were entered by staff). No backfill script is
needed: run `bun run db:push` as usual (after `db:backfill-tenant` above).
Gateway checkouts are inserted as `PENDING`, become `COMPLETED` when the gateway
confirms them and `FAILED` when the checkout expires or cannot be created; only
`COMPLETED` rows count towards contract totals, revenue reports and exports.

### Manual Migration

```bash
# Connect to database
docker compose exec database psql -U gym_nexus -d gym_nexus

# Run SQL file
\i /path/to/migration.sql
```

### Backup Before Migration

```bash
# Create backup
docker compose exec database pg_dump \
  -U gym_nexus \
  -d gym_nexus \
  -Fc \
  > backup_$(date +%Y%m%d_%H%M%S).dump
```

---

## Post-deployment Verification

### Health Checks

```bash
# Backend API
curl -f https://api.gym-nexus.com/health

# Admin Web
curl -f https://admin.gym-nexus.com

# Member App
curl -f https://member.gym-nexus.com

# Coach App
curl -f https://coach.gym-nexus.com
```

### Functional Tests

1. **Admin Login**
   - Navigate to admin.gym-nexus.com
   - Login with admin credentials
   - Verify dashboard loads

2. **Member Login**
   - Navigate to member.gym-nexus.com
   - Request OTP
   - Verify OTP received and login works

3. **Coach Login**
   - Navigate to coach.gym-nexus.com
   - Login with coach credentials
   - Verify schedule loads

### Monitor Logs

```bash
# Docker logs
docker logs -f gym-nexus-api

# PM2 logs
pm2 logs gym-nexus-api
```

---

## Rollback Procedures

### Backend Rollback

```bash
# Docker - rollback to previous image
docker stop gym-nexus-api
docker run -d \
  --name gym-nexus-api \
  --env-file .env \
  -p 8056:8056 \
  gym-nexus-api:previous-tag

# PM2 - rollback to previous version
pm2 deploy production revert
```

### Database Rollback

```bash
# Restore from backup
docker compose exec -T database pg_restore \
  -U gym_nexus \
  -d gym_nexus \
  -c \
  < backup_YYYYMMDD_HHMMSS.dump
```

### Frontend Rollback

Cloudflare Pages:
1. Go to Deployments
2. Find previous successful deployment
3. Click "Rollback to this deployment"

---

## Troubleshooting

### Common Issues

#### API returns 500 error
```bash
# Check logs
docker logs gym-nexus-api --tail 100

# Check database connection
docker compose exec database pg_isready -U gym_nexus
```

#### Database connection failed
```bash
# Verify DATABASE_URL
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### CORS errors
```bash
# Verify CORS_ORIGIN includes your frontend domains
# Must match exactly (including https://)
```

#### Auth not working
```bash
# Verify secrets are set
echo $SESSION_SECRET | wc -c  # Should be 64+

# Check cookie settings match domain
```

### Useful Commands

```bash
# View running containers
docker ps

# Restart API
docker restart gym-nexus-api

# Check disk space
df -h

# Check memory
free -h

# Database connections
docker compose exec database psql -U gym_nexus -c "SELECT count(*) FROM pg_stat_activity"
```

---

## Deployment Schedule

| Environment | Branch | Auto-deploy | Approval Required |
|-------------|--------|-------------|-------------------|
| Development | `develop` | Yes | No |
| Staging | `staging` | Yes | No |
| Production | `main` | No | Yes |

## Contact

- **DevOps Lead**: [Contact Info]
- **On-call Engineer**: [Contact Info]
- **Escalation**: [Contact Info]
