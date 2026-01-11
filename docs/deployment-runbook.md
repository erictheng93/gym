# Gym Nexus Deployment Runbook

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
- [ ] All tests passing in CI (`pnpm test`)
- [ ] TypeScript compilation successful (`pnpm typecheck`)
- [ ] ESLint passing (`pnpm lint`)
- [ ] E2E tests passing (for PRs)

### Database
- [ ] Database migrations reviewed and tested locally
- [ ] Production database backup taken (within last hour)
- [ ] Migration rollback scripts prepared (if applicable)

### Configuration
- [ ] Environment variables configured for target environment
- [ ] Secrets rotated if required (API keys, passwords)
- [ ] CORS origins updated for new domains (if any)

### Infrastructure
- [ ] Docker images built and tested locally
- [ ] Sufficient disk space on target servers
- [ ] Redis and PostgreSQL services healthy

### Communication
- [ ] Deployment window communicated to stakeholders
- [ ] Support team notified of potential downtime
- [ ] Rollback plan reviewed with team

---

## Environment Setup

### Required Environment Variables

Copy from `backend/.env.example` and configure:

```bash
# Critical - Must be set in production
SECRET=<random-64-char-string>
DB_PASSWORD=<secure-database-password>

# CORS - Configure for your domains
CORS_ORIGIN=https://member.gym-nexus.com,https://admin.gym-nexus.com

# OAuth Providers (if using social login)
AUTH_PROVIDERS=google,line
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
LINE_CHANNEL_ID=<your-line-channel-id>
LINE_CHANNEL_SECRET=<your-line-channel-secret>

# Email (Amazon SES recommended)
EMAIL_SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
EMAIL_SMTP_USER=<ses-smtp-username>
EMAIL_SMTP_PASSWORD=<ses-smtp-password>

# Push Notifications
VAPID_PUBLIC_KEY=<generated-vapid-public-key>
VAPID_PRIVATE_KEY=<generated-vapid-private-key>
```

### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

### Generate Secret Key

```bash
openssl rand -hex 32
```

---

## Backend Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Navigate to backend directory
cd backend

# Pull latest code
git pull origin main

# Build production image
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Stop existing containers (with grace period)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml stop -t 30

# Start new containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify containers are running
docker-compose ps

# Check logs for errors
docker-compose logs -f --tail=100 directus
```

### Option 2: Manual Docker Build

```bash
# Build the image
docker build -t gym-nexus-backend:$(git rev-parse --short HEAD) .

# Tag as latest
docker tag gym-nexus-backend:$(git rev-parse --short HEAD) gym-nexus-backend:latest

# Run container
docker run -d \
  --name gym-nexus-backend \
  --restart unless-stopped \
  -p 8055:8055 \
  --env-file .env \
  gym-nexus-backend:latest
```

### Health Check Verification

```bash
# Liveness probe
curl -f http://localhost:8055/gym/health

# Readiness probe (checks database)
curl -f http://localhost:8055/gym/ready

# Detailed status
curl http://localhost:8055/gym/status
```

Expected responses:
```json
// /gym/health
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z","service":"gym-api"}

// /gym/ready
{"status":"ready","database":"connected","redis":"connected"}
```

---

## Frontend Deployment

### Member App (Nuxt 3 SSR)

```bash
cd frontend/apps/member-app

# Install dependencies
pnpm install --frozen-lockfile

# Build for production
pnpm build

# Start production server
node .output/server/index.mjs
```

### Admin Web (Nuxt 3 SSR)

```bash
cd frontend/apps/admin-web

# Install dependencies
pnpm install --frozen-lockfile

# Build for production
pnpm build

# Start production server
node .output/server/index.mjs
```

### Cloudflare Pages Deployment

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy member-app
cd frontend/apps/member-app
pnpm build
wrangler pages deploy .output/public --project-name=gym-nexus-member

# Deploy admin-web
cd frontend/apps/admin-web
pnpm build
wrangler pages deploy .output/public --project-name=gym-nexus-admin
```

---

## Database Migrations

### Running Migrations

Migrations are automatically applied when Directus starts. For manual control:

```bash
# Apply pending migrations
docker-compose exec directus npx directus database migrate:latest

# Check migration status
docker-compose exec directus npx directus database migrate:status
```

### Custom SQL Migrations

Located in `backend/migrations/`. Run manually:

```bash
# Connect to database
docker-compose exec database psql -U directus -d gym_nexus

# Run migration file
\i /path/to/migration.sql
```

### Index Optimization

After major data imports, run:

```sql
-- Analyze tables for query optimization
ANALYZE;

-- Reindex if needed (during low traffic)
REINDEX DATABASE gym_nexus;
```

---

## Post-deployment Verification

### Functional Tests

1. **Authentication**
   - [ ] Admin login works
   - [ ] Member login works (email/password)
   - [ ] OAuth login works (Google, LINE)
   - [ ] OTP login works

2. **Core Features**
   - [ ] Member can view dashboard
   - [ ] Member can make bookings
   - [ ] Admin can view reports
   - [ ] Admin can manage members

3. **Integrations**
   - [ ] Push notifications sending
   - [ ] Email notifications sending
   - [ ] SMS gateway responding (if configured)

### Performance Verification

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8055/gym/health

# Check database connections
docker-compose exec database psql -U directus -d gym_nexus -c "SELECT count(*) FROM pg_stat_activity;"

# Check Redis connections
docker-compose exec redis redis-cli info clients
```

### Log Verification

```bash
# Check for errors in last hour
docker-compose logs --since 1h directus | grep -i error

# Check application logs
docker-compose logs --since 1h directus | grep -E '"level":"(error|fatal)"'
```

---

## Rollback Procedures

### Quick Rollback (Docker)

```bash
# Stop current containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml stop

# Start previous version
docker run -d \
  --name gym-nexus-backend \
  gym-nexus-backend:<previous-tag>

# Or revert docker-compose
git checkout <previous-commit> -- docker-compose.yml docker-compose.prod.yml
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Database Rollback

**WARNING: Only if migration caused data issues**

```bash
# Restore from backup
docker-compose exec database pg_restore \
  -U directus \
  -d gym_nexus \
  -c \
  /backups/gym_nexus_<timestamp>.dump

# Or run rollback migration
docker-compose exec database psql -U directus -d gym_nexus \
  -f /migrations/rollback/<migration-name>.sql
```

### Frontend Rollback

```bash
# Cloudflare Pages - rollback to previous deployment
wrangler pages deployment list --project-name=gym-nexus-member
wrangler pages deployment rollback <deployment-id> --project-name=gym-nexus-member
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs directus

# Common issues:
# 1. Database not ready - wait for health check
# 2. Environment variable missing - check .env file
# 3. Port already in use - check with `netstat -tlnp`
```

### Database Connection Failed

```bash
# Check database is running
docker-compose exec database pg_isready -U directus

# Check connection from Directus container
docker-compose exec directus nc -zv database 5432

# Verify credentials
docker-compose exec database psql -U directus -d gym_nexus -c "SELECT 1;"
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose exec redis redis-cli ping

# Check from Directus container
docker-compose exec directus nc -zv redis 6379
```

### High Memory Usage

```bash
# Check container resources
docker stats

# Restart with memory limits
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Clear Redis cache if needed
docker-compose exec redis redis-cli FLUSHDB
```

### SSL/TLS Issues

```bash
# Verify certificate
openssl s_client -connect api.gym-nexus.com:443 -servername api.gym-nexus.com

# Check certificate expiry
echo | openssl s_client -connect api.gym-nexus.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| DevOps Lead | devops@gym-nexus.com | 24/7 |
| Database Admin | dba@gym-nexus.com | Business hours |
| Security Team | security@gym-nexus.com | 24/7 |

---

## Appendix

### Useful Commands Reference

```bash
# View all containers
docker-compose ps -a

# View container resource usage
docker stats --no-stream

# Export database backup
docker-compose exec database pg_dump -U directus gym_nexus > backup.sql

# Import database backup
docker-compose exec -T database psql -U directus gym_nexus < backup.sql

# Clear Directus cache
docker-compose exec directus npx directus cache:clear

# Restart single service
docker-compose restart directus

# View real-time logs
docker-compose logs -f --tail=50
```

### Health Check URLs

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/gym/health` | Liveness probe | `{"status":"ok"}` |
| `/gym/ready` | Readiness probe | `{"status":"ready"}` |
| `/gym/status` | Detailed status | Full system status |
| `/server/health` | Directus health | `{"status":"ok"}` |
