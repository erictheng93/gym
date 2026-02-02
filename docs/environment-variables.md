# Gym Nexus Environment Variables Reference

> ⚠️ **Updated for Hono.js + Drizzle ORM architecture**
>
> 本文件已更新為新架構。完整的環境變數範例請參考 [`/backend/.env.example`](../backend/.env.example)

## Quick Reference

### Backend (`/backend/.env`)

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/gym_nexus

# Server
PORT=8056
NODE_ENV=development
ENABLE_CRON=true

# Auth Secrets
SESSION_SECRET=your-session-secret-min-32-chars
MEMBER_JWT_SECRET=your-member-jwt-secret-min-32-chars
COACH_JWT_SECRET=your-coach-jwt-secret-min-32-chars

# CORS
CORS_ORIGIN=http://localhost:3001,http://localhost:3002,http://localhost:3003
```

### Frontend (`/frontend/apps/*/env`)

```env
API_BASE_URL=http://localhost:8056
```

---

## Complete Environment Variables

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |

**Format:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

**Example:**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/gym_nexus
```

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | **Yes** | - | Staff session signing secret (min 32 chars) |
| `MEMBER_JWT_SECRET` | **Yes** | - | Member app JWT secret (min 32 chars) |
| `COACH_JWT_SECRET` | **Yes** | - | Coach app JWT secret (min 32 chars) |

**Generate secrets:**
```bash
openssl rand -hex 32
```

### Email (SMTP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_TRANSPORT` | No | `smtp` | Email transport type |
| `EMAIL_FROM` | No | - | From address (e.g., `Gym Nexus <noreply@example.com>`) |
| `EMAIL_SMTP_HOST` | If using SMTP | - | SMTP server host |
| `EMAIL_SMTP_PORT` | If using SMTP | `587` | SMTP port |
| `EMAIL_SMTP_USER` | If using SMTP | - | SMTP username |
| `EMAIL_SMTP_PASSWORD` | If using SMTP | - | SMTP password |
| `EMAIL_SMTP_SECURE` | No | `false` | Use TLS |

### Push Notifications (VAPID)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | If using Push | - | VAPID public key |
| `VAPID_PRIVATE_KEY` | If using Push | - | VAPID private key |
| `VAPID_SUBJECT` | If using Push | - | VAPID subject (mailto:) |

**Generate VAPID keys:**
```bash
npx web-push generate-vapid-keys
```

### LINE Messaging API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | If using LINE | - | Channel access token |
| `LINE_MESSAGING_CHANNEL_SECRET` | If using LINE | - | Channel secret |

### SMS (Mitake - Taiwan)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MITAKE_USERNAME` | If using SMS | - | Mitake username |
| `MITAKE_PASSWORD` | If using SMS | - | Mitake password |
| `MITAKE_API_URL` | No | `https://smsapi.mitake.com.tw/...` | API endpoint |

### Payment Gateways

#### Stripe

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | If using Stripe | Secret API key |
| `STRIPE_WEBHOOK_SECRET` | If using Stripe | Webhook signing secret |

#### ECPay (Taiwan - 綠界)

| Variable | Required | Description |
|----------|----------|-------------|
| `ECPAY_MERCHANT_ID` | If using ECPay | Merchant ID |
| `ECPAY_HASH_KEY` | If using ECPay | Hash key |
| `ECPAY_HASH_IV` | If using ECPay | Hash IV |

#### LINE Pay

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEPAY_CHANNEL_ID` | If using LINE Pay | Channel ID |
| `LINEPAY_CHANNEL_SECRET` | If using LINE Pay | Channel secret |

### File Storage (S3/R2)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `S3_BUCKET` | If using S3 | - | Bucket name |
| `S3_REGION` | If using S3 | `auto` | Region |
| `S3_ACCESS_KEY` | If using S3 | - | Access key |
| `S3_SECRET_KEY` | If using S3 | - | Secret key |
| `S3_ENDPOINT` | If using R2 | - | Custom endpoint for R2 |
| `R2_ACCOUNT_ID` | If using R2 | - | Cloudflare account ID |
| `R2_PUBLIC_URL` | If using R2 | - | Public URL for files |

### OAuth Providers

#### Google

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | If using Google | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | If using Google | OAuth client secret |

#### LINE Login

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ID` | If using LINE | Channel ID |
| `LINE_CHANNEL_SECRET` | If using LINE | Channel secret |

#### Apple Sign In

| Variable | Required | Description |
|----------|----------|-------------|
| `APPLE_CLIENT_ID` | If using Apple | Client ID |
| `APPLE_TEAM_ID` | If using Apple | Team ID |
| `APPLE_KEY_ID` | If using Apple | Key ID |
| `APPLE_PRIVATE_KEY` | If using Apple | Private key |

### CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` | **Yes*** | - | Comma-separated allowed origins |

*Required in production

**Example:**
```
CORS_ORIGIN=https://admin.gym-nexus.com,https://member.gym-nexus.com,https://coach.gym-nexus.com
```

### Frontend URLs

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMBER_APP_URL` | No | Member app URL (for email links) |
| `ADMIN_APP_URL` | No | Admin app URL |
| `COACH_APP_URL` | No | Coach app URL |

---

## Port Configuration

| Service | Development | Production |
|---------|-------------|------------|
| API | 8056 | 8056 |
| PostgreSQL | 15432 | 15432 |
| Admin Web | 3001 | - |
| Member App | 3002 | - |
| Coach App | 3003 | - |

---

## Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Use strong secrets** - Minimum 32 characters, randomly generated
3. **Rotate secrets regularly** - Especially in production
4. **Use different secrets per environment** - Dev, staging, production
5. **Restrict CORS origins** - Only allow your domains in production
