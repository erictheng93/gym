# Gym Nexus Monitoring Setup Guide

> **Updated for Hono.js + Drizzle ORM architecture**

This document describes how to set up and configure monitoring for the Gym Nexus platform.

## Table of Contents

1. [Overview](#overview)
2. [Health Check Endpoints](#health-check-endpoints)
3. [Logging Configuration](#logging-configuration)
4. [Error Tracking (Sentry)](#error-tracking-sentry)
5. [Performance Monitoring](#performance-monitoring)
6. [Alert Configuration](#alert-configuration)
7. [Dashboards](#dashboards)

---

## Overview

### Monitoring Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Error Tracking | Sentry | Frontend + Backend errors |
| Logging | Pino (JSON) | Structured application logs |
| Health Checks | Built-in `/health` | Service availability |
| Metrics | Docker stats / Prometheus | Resource utilization |
| Uptime | Cloudflare / UptimeRobot | External monitoring |

### Key Metrics to Monitor

| Category | Metric | Alert Threshold |
|----------|--------|-----------------|
| Availability | Uptime | < 99.9% |
| Performance | Response time | > 500ms (p95) |
| Errors | Error rate | > 1% |
| Resources | CPU usage | > 80% |
| Resources | Memory usage | > 85% |
| Database | Connection pool | > 80% utilized |

---

## Health Check Endpoints

### Backend Health Check

The API exposes a health endpoint at `/health`:

```bash
curl https://api.gym-nexus.com/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "api": "up",
    "database": "up"
  },
  "version": "2.0.0"
}
```

### Health Check Integration

```bash
# Simple check (for uptime monitors)
curl -f https://api.gym-nexus.com/health

# Docker health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8056/health || exit 1
```

### Frontend Health

Check if frontend apps are accessible:

```bash
# Admin Web
curl -f https://admin.gym-nexus.com -o /dev/null -w "%{http_code}"

# Member App
curl -f https://member.gym-nexus.com -o /dev/null -w "%{http_code}"

# Coach App
curl -f https://coach.gym-nexus.com -o /dev/null -w "%{http_code}"
```

---

## Logging Configuration

### Backend Logging

The backend uses structured JSON logging via Pino. Logs include:

```json
{
  "level": "info",
  "time": 1705316400000,
  "method": "GET",
  "path": "/api/members",
  "status": 200,
  "duration": "45ms",
  "userId": "uuid",
  "tenantId": "uuid"
}
```

### Log Levels

| Level | When to Use |
|-------|-------------|
| `error` | Errors that need immediate attention |
| `warn` | Potential issues or deprecations |
| `info` | Normal operational events |
| `debug` | Detailed debugging information |

### Environment Configuration

```bash
# Set log level
LOG_LEVEL=info  # production
LOG_LEVEL=debug # development
```

### Log Aggregation

For production, pipe logs to a log aggregation service:

```bash
# Send to Papertrail
docker logs gym-nexus-api 2>&1 | logger -t gym-nexus-api

# Send to Datadog
docker run -d \
  --name dd-agent \
  -e DD_API_KEY=<your-api-key> \
  -e DD_LOGS_ENABLED=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  datadog/agent:latest
```

---

## Error Tracking (Sentry)

### Backend Setup

Add Sentry to your backend:

```typescript
// src/app.ts
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions
  });
}

// Error handling middleware
app.onError((err, c) => {
  Sentry.captureException(err);
  return c.json({ error: 'Internal server error' }, 500);
});
```

### Frontend Setup

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
    }
  }
});

// plugins/sentry.client.ts
import * as Sentry from '@sentry/vue';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();

  if (config.public.sentryDsn) {
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: config.public.sentryDsn,
      environment: process.env.NODE_ENV,
    });
  }
});
```

### Environment Variables

```bash
# Backend
SENTRY_DSN=https://xxx@sentry.io/xxx

# Frontend
NUXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Performance Monitoring

### API Response Time

The API automatically logs response times:

```json
{
  "method": "GET",
  "path": "/api/members",
  "status": 200,
  "duration": "45ms"
}
```

### Database Query Performance

Enable slow query logging in PostgreSQL:

```sql
-- postgresql.conf
log_min_duration_statement = 100  -- Log queries > 100ms
```

### Container Metrics

```bash
# Docker stats
docker stats gym-nexus-api

# Prometheus metrics (if using)
# Add prometheus middleware to collect metrics
```

---

## Alert Configuration

### UptimeRobot Setup

1. Create HTTP(s) monitor for each service
2. Configure alert contacts
3. Set check interval (1-5 minutes)

**Monitors to Create:**

| Service | URL | Check Interval |
|---------|-----|----------------|
| API Health | `https://api.gym-nexus.com/health` | 1 min |
| Admin Web | `https://admin.gym-nexus.com` | 5 min |
| Member App | `https://member.gym-nexus.com` | 5 min |
| Coach App | `https://coach.gym-nexus.com` | 5 min |

### Cloudflare Health Checks

If using Cloudflare:

1. Go to Traffic > Health Checks
2. Create health check for API endpoint
3. Configure alert notifications

### Custom Alerts

```bash
# Simple bash script for alerting
#!/bin/bash
HEALTH_URL="https://api.gym-nexus.com/health"
SLACK_WEBHOOK="https://hooks.slack.com/services/xxx"

if ! curl -sf "$HEALTH_URL" > /dev/null; then
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"🚨 Gym Nexus API is DOWN!"}' \
    "$SLACK_WEBHOOK"
fi
```

---

## Dashboards

### Recommended Metrics Dashboard

Create a dashboard with these panels:

1. **Availability**
   - Uptime percentage
   - Health check status

2. **Performance**
   - Average response time
   - P95 response time
   - Requests per second

3. **Errors**
   - Error rate
   - Error count by type
   - Sentry issue count

4. **Resources**
   - CPU usage
   - Memory usage
   - Database connections

5. **Business Metrics**
   - Active users
   - API calls per endpoint
   - Auth success/failure rate

### Grafana Dashboard Example

```json
{
  "panels": [
    {
      "title": "API Response Time",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket)"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) * 100"
        }
      ]
    }
  ]
}
```

---

## Quick Setup Checklist

- [ ] Configure health check monitoring (UptimeRobot/Cloudflare)
- [ ] Set up Sentry for error tracking
- [ ] Configure log aggregation (if needed)
- [ ] Set up alert notifications (Slack/Email/SMS)
- [ ] Create monitoring dashboard
- [ ] Document on-call procedures
- [ ] Test alert system

---

## Troubleshooting

### No Logs Appearing

```bash
# Check container logs
docker logs gym-nexus-api

# Check log level
echo $LOG_LEVEL
```

### Sentry Not Receiving Errors

1. Verify `SENTRY_DSN` is set correctly
2. Check Sentry project settings
3. Verify network connectivity to Sentry

### High Response Times

1. Check database query performance
2. Review slow query logs
3. Check for memory/CPU constraints
4. Review recent code changes
