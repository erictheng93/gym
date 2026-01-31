# Gym Nexus Environment Variables Reference

Complete reference for all environment variables used in the Gym Nexus platform.

## Table of Contents

1. [Backend (Directus)](#backend-directus)
2. [Frontend (Member App)](#frontend-member-app)
3. [Frontend (Admin Web)](#frontend-admin-web)
4. [Docker Compose](#docker-compose)
5. [CI/CD](#cicd)

---

## Backend (Directus)

### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET` | **Yes** | - | JWT signing secret. Generate with `openssl rand -hex 32` |
| `ADMIN_EMAIL` | No | - | Initial admin email (first run only) |
| `ADMIN_PASSWORD` | No | - | Initial admin password (first run only) |
| `LOG_LEVEL` | No | `info` | Logging level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `NODE_ENV` | No | `development` | Environment: `development`, `production` |

### Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_CLIENT` | No | `pg` | Database client (PostgreSQL) |
| `DB_HOST` | No | `database` | Database host |
| `DB_PORT` | No | `5432` | Database port |
| `DB_DATABASE` | No | `gym_nexus` | Database name |
| `DB_USER` | No | `directus` | Database user |
| `DB_PASSWORD` | **Yes*** | - | Database password |
| `DB_POOL__MIN` | No | `2` | Minimum pool connections |
| `DB_POOL__MAX` | No | `50` | Maximum pool connections |

*Required in production

### Redis / Cache Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CACHE_ENABLED` | No | `true` | Enable caching |
| `CACHE_STORE` | No | `redis` | Cache store type |
| `CACHE_REDIS` | No | `redis://redis:6379` | Redis connection URL |
| `CACHE_TTL` | No | `5m` | Cache time-to-live |
| `CACHE_AUTO_PURGE` | No | `true` | Auto-purge on data changes |
| `CACHE_NAMESPACE` | No | `gym` | Cache key namespace |
| `REDIS_HOST` | No | `redis` | Redis host (for hooks) |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password (optional) |

### CORS Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ENABLED` | No | `true` | Enable CORS |
| `CORS_ORIGIN` | **Yes*** | `http://localhost:3000,...` | Allowed origins (comma-separated) |
| `CORS_CREDENTIALS` | No | `true` | Allow credentials |
| `CORS_ALLOWED_HEADERS` | No | `Content-Type,Authorization,X-Member-Token` | Allowed headers |

*Required in production - must match frontend domains

### OAuth / Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_PROVIDERS` | No | - | Enabled providers: `google,line,apple` |
| `MEMBER_ROLE_ID` | No | `b1000000-...` | Default role for OAuth users |

#### Google OAuth

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | If using Google | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | If using Google | OAuth client secret |

#### LINE Login

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ID` | If using LINE | LINE channel ID |
| `LINE_CHANNEL_SECRET` | If using LINE | LINE channel secret |

#### Apple Sign In

| Variable | Required | Description |
|----------|----------|-------------|
| `APPLE_CLIENT_ID` | If using Apple | Apple client ID |
| `APPLE_CLIENT_SECRET` | If using Apple | Apple client secret |

### Email Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_TRANSPORT` | No | `smtp` | Transport: `smtp`, `sendmail`, `ses` |
| `EMAIL_FROM` | No | `Gym Nexus <noreply@gym-nexus.com>` | From address |
| `EMAIL_SMTP_HOST` | If SMTP | - | SMTP server host |
| `EMAIL_SMTP_PORT` | If SMTP | `587` | SMTP server port |
| `EMAIL_SMTP_USER` | If SMTP | - | SMTP username |
| `EMAIL_SMTP_PASSWORD` | If SMTP | - | SMTP password |
| `EMAIL_SMTP_SECURE` | No | `false` | Use SSL/TLS |
| `EMAIL_SMTP_IGNORE_TLS` | No | `false` | Ignore TLS |

### Push Notifications (Web Push)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | If using push | - | VAPID public key |
| `VAPID_PRIVATE_KEY` | If using push | - | VAPID private key |
| `VAPID_SUBJECT` | No | `mailto:admin@gym-nexus.com` | VAPID subject |

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### LINE Messaging API

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | If using LINE messages | Channel access token |
| `LINE_MESSAGING_CHANNEL_SECRET` | If using LINE messages | Channel secret |

### SMS Gateway (Mitake)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MITAKE_USERNAME` | If using SMS | - | Mitake account username |
| `MITAKE_PASSWORD` | If using SMS | - | Mitake account password |
| `MITAKE_API_URL` | No | `https://smsapi.mitake.com.tw/api/mtk/SmSend` | API endpoint |
| `MITAKE_COST_PER_SMS` | No | `0.5` | Cost per SMS (for tracking) |
| `SMS_DAILY_LIMIT_PER_MEMBER` | No | `5` | Daily SMS limit per member |
| `SMS_OTP_ONLY` | No | `false` | Restrict SMS to OTP only |

### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMITER_ENABLED` | No | `false` | Enable rate limiting |
| `RATE_LIMITER_STORE` | No | `redis` | Store type |
| `RATE_LIMITER_REDIS` | No | - | Redis URL for rate limiter |
| `RATE_LIMITER_POINTS` | No | `100` | Max requests per duration |
| `RATE_LIMITER_DURATION` | No | `60` | Duration window in seconds |

### Error Tracking

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | No | Sentry DSN for backend errors |

---

## Frontend (Member App)

Located in `frontend/apps/member-app/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DIRECTUS_URL` | No | `http://localhost:8055` | Backend API URL |
| `PORT` | No | `3002` | Dev server port |
| `NUXT_PUBLIC_SENTRY_DSN` | No | - | Sentry DSN |
| `NUXT_PUBLIC_SENTRY_DEBUG` | No | `false` | Enable Sentry debug mode |
| `APP_VERSION` | No | `1.0.0` | App version for Sentry releases |

### Production Example

```bash
# frontend/apps/member-app/.env.production
DIRECTUS_URL=https://api.gym-nexus.com
NUXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
APP_VERSION=1.2.3
```

---

## Frontend (Admin Web)

Located in `frontend/apps/admin-web/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DIRECTUS_URL` | No | `http://localhost:8055` | Backend API URL |
| `PORT` | No | `3001` | Dev server port |
| `NUXT_PUBLIC_SENTRY_DSN` | No | - | Sentry DSN |

### Google Workspace Integration

| Variable | Required | Description |
|----------|----------|-------------|
| `NUXT_PUBLIC_GOOGLE_PROJECT_ID` | If using Google | GCP project ID |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | If using Google | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | If using Google | OAuth client secret |
| `NUXT_PUBLIC_GOOGLE_REDIRECT_URI` | If using Google | OAuth redirect URI |
| `NUXT_PUBLIC_GOOGLE_SCOPES` | No | Sheets and Drive scopes |

### Looker Studio / BigQuery

| Variable | Required | Description |
|----------|----------|-------------|
| `NUXT_PUBLIC_BIGQUERY_PROJECT_ID` | If using BigQuery | BigQuery project ID |
| `NUXT_PUBLIC_BIGQUERY_DATASET_ID` | If using BigQuery | Dataset ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | If using BigQuery | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | If using BigQuery | Path to service account key |

---

## Docker Compose

Variables used in `docker-compose.yml`:

### PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `directus` | Database user |
| `POSTGRES_PASSWORD` | `directus` | Database password |
| `POSTGRES_DB` | `gym_nexus` | Database name |

### Port Mapping

| Service | Internal Port | External Port | Description |
|---------|---------------|---------------|-------------|
| Directus | 8055 | 8500 | API server |
| PostgreSQL | 5432 | 5444 | Database |
| Redis | 6379 | 6333 | Cache |

---

## CI/CD

### GitHub Actions Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `TEST_MEMBER_EMAIL` | For E2E | Test member email |
| `TEST_MEMBER_PASSWORD` | For E2E | Test member password |
| `CODECOV_TOKEN` | For coverage | Codecov upload token |

### GitHub Actions Variables

| Variable | Description |
|----------|-------------|
| `DOCKER_REGISTRY` | Docker registry URL |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |

---

## Environment File Templates

### Development (.env)

```bash
# Backend - backend/.env
SECRET=dev-secret-change-in-production
DB_PASSWORD=directus
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:3002
CACHE_ENABLED=false
RATE_LIMITER_ENABLED=false
LOG_LEVEL=debug

# Frontend - frontend/apps/member-app/.env
DIRECTUS_URL=http://localhost:8055
PORT=3002

# Frontend - frontend/apps/admin-web/.env
DIRECTUS_URL=http://localhost:8055
PORT=3001
```

### Staging (.env.staging)

```bash
# Backend
SECRET=<staging-secret>
DB_PASSWORD=<staging-db-password>
CORS_ORIGIN=https://staging-member.gym-nexus.com,https://staging-admin.gym-nexus.com
CACHE_ENABLED=true
RATE_LIMITER_ENABLED=true
LOG_LEVEL=info
SENTRY_DSN=<staging-sentry-dsn>

# Frontend
DIRECTUS_URL=https://staging-api.gym-nexus.com
NUXT_PUBLIC_SENTRY_DSN=<staging-sentry-dsn>
```

### Production (.env.production)

```bash
# Backend
SECRET=<production-secret-64-chars>
DB_PASSWORD=<secure-production-password>
CORS_ORIGIN=https://member.gym-nexus.com,https://admin.gym-nexus.com
CACHE_ENABLED=true
CACHE_TTL=10m
RATE_LIMITER_ENABLED=true
RATE_LIMITER_POINTS=100
LOG_LEVEL=info
SENTRY_DSN=<production-sentry-dsn>

# OAuth
AUTH_PROVIDERS=google,line
GOOGLE_CLIENT_ID=<production-google-id>
GOOGLE_CLIENT_SECRET=<production-google-secret>
LINE_CHANNEL_ID=<production-line-id>
LINE_CHANNEL_SECRET=<production-line-secret>

# Email (SES)
EMAIL_SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
EMAIL_SMTP_USER=<ses-username>
EMAIL_SMTP_PASSWORD=<ses-password>

# Push
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>

# Frontend
DIRECTUS_URL=https://api.gym-nexus.com
NUXT_PUBLIC_SENTRY_DSN=<production-sentry-dsn>
```

---

## Security Best Practices

1. **Never commit secrets to Git**
   - Use `.env` files (gitignored)
   - Use CI/CD secrets management
   - Use secret management services (AWS Secrets Manager, HashiCorp Vault)

2. **Rotate secrets regularly**
   - `SECRET`: Quarterly or after security incidents
   - `DB_PASSWORD`: Annually
   - OAuth secrets: When compromised or annually

3. **Use strong secrets**
   - `SECRET`: At least 32 random bytes (64 hex chars)
   - Passwords: At least 16 characters, mixed case, numbers, symbols

4. **Limit scope**
   - OAuth scopes: Request minimum required
   - Database users: Use read-only where possible
   - API keys: Restrict to specific IPs/domains

---

## Troubleshooting

### Common Issues

**"SECRET is required"**
```bash
# Generate and set SECRET
export SECRET=$(openssl rand -hex 32)
```

**"CORS origin not allowed"**
```bash
# Check CORS_ORIGIN includes your frontend URL
CORS_ORIGIN=https://your-frontend.com,https://your-admin.com
```

**"Database connection refused"**
```bash
# Verify database is running and accessible
docker-compose exec database pg_isready -U directus

# Check connection settings
DB_HOST=database  # Use container name, not localhost
DB_PORT=5432      # Internal port
```

**"Redis connection failed"**
```bash
# Verify Redis is running
docker-compose exec redis redis-cli ping

# Check connection URL format
CACHE_REDIS=redis://redis:6379  # No password
CACHE_REDIS=redis://:password@redis:6379  # With password
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | DevOps Team | Initial version |
