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
- [ ] All tests passing (`pnpm test`)
- [ ] TypeScript compilation successful (`pnpm typecheck`)
- [ ] ESLint passing (`pnpm lint`)
- [ ] Backend builds successfully (`cd backend && pnpm build`)

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

# SMS (Mitake)
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
pnpm install --frozen-lockfile

# Build
pnpm build

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
Build command: cd frontend && pnpm install && pnpm build:admin
Build output directory: frontend/apps/admin-web/.output/public
Root directory: /

# Member App
Build command: cd frontend && pnpm install && pnpm build:member
Build output directory: frontend/apps/member-app/.output/public

# Coach App
Build command: cd frontend && pnpm install && pnpm build:coach
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
pnpm install

# Build all apps
pnpm build

# Or build specific app
pnpm build:admin
pnpm build:member
pnpm build:coach
```

---

## Database Migrations

### Using Drizzle

```bash
cd backend

# Generate migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:push

# Or run migrations manually
pnpm db:migrate
```

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
