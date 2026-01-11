# Gym Nexus Monitoring Setup Guide

This document describes how to set up and configure monitoring for the Gym Nexus platform.

## Table of Contents

1. [Overview](#overview)
2. [Sentry Error Tracking](#sentry-error-tracking)
3. [Health Check Endpoints](#health-check-endpoints)
4. [Logging Configuration](#logging-configuration)
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
| Health Checks | Custom endpoints | Service availability |
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
| Cache | Redis memory | > 80% |

---

## Sentry Error Tracking

### Backend Setup

Sentry is configured automatically for Directus errors. For custom error tracking in extensions:

```javascript
// backend/extensions/directus-extension-gym-endpoints/src/utils/sentry.js
import * as Sentry from '@sentry/node'

export function initSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1, // 10% of transactions
      beforeSend(event) {
        // Filter out expected errors
        if (event.exception?.values?.[0]?.type === 'UnauthorizedError') {
          return null
        }
        return event
      },
    })
  }
}

export function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context })
  }
}
```

### Frontend Setup (Member App)

```typescript
// frontend/apps/member-app/plugins/sentry.client.ts
import * as Sentry from '@sentry/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  if (config.public.sentryDsn) {
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: config.public.sentryDsn,
      environment: config.public.environment,
      release: config.public.appVersion,
      integrations: [
        Sentry.browserTracingIntegration({
          router: useRouter(),
        }),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })
  }
})
```

### Frontend Setup (Admin Web)

Similar configuration in `frontend/apps/admin-web/plugins/sentry.client.ts`.

### Environment Variables

```bash
# Backend
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Frontend (member-app)
NUXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Frontend (admin-web)
NUXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Sentry Project Configuration

1. **Create Projects:**
   - `gym-nexus-backend` (Node.js)
   - `gym-nexus-member-app` (Vue)
   - `gym-nexus-admin-web` (Vue)

2. **Configure Alerts:**
   - Error spike: > 10 errors in 1 hour
   - New issue: First occurrence alert
   - Regression: Previously resolved issue reappears

3. **Set Up Releases:**
   ```bash
   # In CI/CD pipeline
   sentry-cli releases new $GIT_SHA
   sentry-cli releases set-commits $GIT_SHA --auto
   sentry-cli releases finalize $GIT_SHA
   ```

---

## Health Check Endpoints

### Available Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /gym/health` | Liveness probe | Process is alive |
| `GET /gym/ready` | Readiness probe | Ready to serve traffic |
| `GET /gym/status` | Detailed status | Full system information |

### Endpoint Responses

```javascript
// GET /gym/health
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "gym-api"
}

// GET /gym/ready
{
  "status": "ready",
  "database": "connected",
  "redis": "connected",
  "responseTime": 45
}

// GET /gym/status
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "checks": {
    "database": { "status": "ok", "latency": 5 },
    "redis": { "status": "ok", "latency": 2 },
    "memory": { "used": 512, "total": 2048, "percent": 25 }
  }
}
```

### Kubernetes/Docker Health Checks

```yaml
# docker-compose.prod.yml
services:
  directus:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8055/gym/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

### External Monitoring

Configure UptimeRobot or Cloudflare Health Checks:

1. **Primary Check:** `https://api.gym-nexus.com/gym/health`
   - Interval: 1 minute
   - Timeout: 10 seconds
   - Alert: Email + Slack

2. **Database Check:** `https://api.gym-nexus.com/gym/ready`
   - Interval: 5 minutes
   - Timeout: 30 seconds
   - Alert: Email + Slack + PagerDuty

---

## Logging Configuration

### Structured Logging with Pino

```javascript
// backend/extensions/directus-extension-gym-endpoints/src/utils/logger.js
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
const currentLevel = process.env.LOG_LEVEL || 'info'

function formatLog(level, message, context = {}) {
  const log = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...context,
  }

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(log)
  }

  // Pretty print for development
  return `[${log.time}] ${level.toUpperCase()}: ${message} ${JSON.stringify(context)}`
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `fatal` | Application crash, unrecoverable error |
| `error` | Error that affects functionality |
| `warn` | Potential issue, degraded performance |
| `info` | Normal operations, milestones |
| `debug` | Detailed debugging information |
| `trace` | Very detailed tracing |

### Log Format (Production)

```json
{
  "level": "error",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Database query failed",
  "requestId": "abc-123",
  "error": "connection timeout",
  "stack": "Error: connection timeout\n    at ...",
  "context": {
    "query": "SELECT * FROM members",
    "duration": 30000
  }
}
```

### Log Aggregation

For production, send logs to a centralized service:

```yaml
# docker-compose.prod.yml
services:
  directus:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
```

Or use Fluentd/Logstash to forward to Elasticsearch, Loki, or CloudWatch.

---

## Performance Monitoring

### Response Time Tracking

```javascript
// Middleware for API response time
export const responseTimeMiddleware = (req, res, next) => {
  const start = process.hrtime()

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start)
    const duration = seconds * 1000 + nanoseconds / 1000000

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Math.round(duration),
      requestId: req.headers['x-request-id'],
    })
  })

  next()
}
```

### Database Query Monitoring

```javascript
// Slow query logging
const SLOW_QUERY_THRESHOLD = 1000 // 1 second

async function executeQuery(query, params) {
  const start = Date.now()
  const result = await database.raw(query, params)
  const duration = Date.now() - start

  if (duration > SLOW_QUERY_THRESHOLD) {
    logger.warn('Slow query detected', {
      query: query.substring(0, 200),
      duration,
      threshold: SLOW_QUERY_THRESHOLD,
    })
  }

  return result
}
```

### Redis Cache Monitoring

```bash
# Check Redis memory usage
docker-compose exec redis redis-cli INFO memory

# Monitor commands in real-time
docker-compose exec redis redis-cli MONITOR

# Get slow log
docker-compose exec redis redis-cli SLOWLOG GET 10
```

---

## Alert Configuration

### Alert Priorities

| Priority | Response Time | Examples |
|----------|---------------|----------|
| P1 - Critical | 15 minutes | Complete outage, data loss |
| P2 - High | 1 hour | Major feature unavailable |
| P3 - Medium | 4 hours | Performance degradation |
| P4 - Low | 24 hours | Minor issues, warnings |

### Recommended Alerts

#### Infrastructure Alerts

```yaml
# Example Prometheus alert rules
groups:
  - name: gym-nexus
    rules:
      - alert: HighCPUUsage
        expr: container_cpu_usage_seconds_total > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.container }}"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_memory_limit_bytes > 0.85
        for: 5m
        labels:
          severity: warning

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
```

#### Application Alerts

| Alert | Condition | Priority | Channel |
|-------|-----------|----------|---------|
| API Down | Health check fails 3x | P1 | PagerDuty + Slack |
| Error Spike | > 50 errors/min | P2 | Slack |
| Slow Response | p95 > 2s for 5min | P3 | Slack |
| Database Connection | Pool > 90% | P2 | Slack |
| Redis Memory | Usage > 80% | P3 | Slack |
| Disk Space | < 10% free | P2 | Email |

### Notification Channels

```yaml
# Slack webhook configuration
channels:
  alerts-critical:
    webhook: https://hooks.slack.com/services/xxx/yyy/zzz

  alerts-warning:
    webhook: https://hooks.slack.com/services/xxx/yyy/zzz

# PagerDuty configuration
pagerduty:
  routing_key: xxx
  escalation_policy: default
```

---

## Dashboards

### Key Dashboard Panels

#### Overview Dashboard

1. **Uptime Status**
   - Current uptime percentage
   - Incident timeline

2. **Request Volume**
   - Requests per minute
   - Error rate percentage

3. **Response Times**
   - p50, p95, p99 latencies
   - Slowest endpoints

4. **Error Breakdown**
   - Errors by type
   - Errors by endpoint

#### Infrastructure Dashboard

1. **Container Resources**
   - CPU usage per container
   - Memory usage per container

2. **Database Metrics**
   - Connection pool usage
   - Query execution time
   - Active connections

3. **Redis Metrics**
   - Memory usage
   - Hit/miss ratio
   - Connected clients

### Grafana Dashboard JSON

```json
{
  "title": "Gym Nexus Overview",
  "panels": [
    {
      "title": "API Response Time (p95)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "singlestat",
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

## Quick Reference

### Common Monitoring Commands

```bash
# View application logs
docker-compose logs -f --tail=100 directus

# View error logs only
docker-compose logs directus 2>&1 | grep -E '"level":"(error|fatal)"'

# Check container resources
docker stats --no-stream

# Check database connections
docker-compose exec database psql -U directus -d gym_nexus \
  -c "SELECT count(*) as connections FROM pg_stat_activity WHERE datname = 'gym_nexus';"

# Check Redis memory
docker-compose exec redis redis-cli INFO memory | grep used_memory_human

# Test health endpoints
curl -s http://localhost:8055/gym/health | jq .
curl -s http://localhost:8055/gym/ready | jq .
curl -s http://localhost:8055/gym/status | jq .
```

### Troubleshooting Checklist

- [ ] Check health endpoints responding
- [ ] Review recent error logs
- [ ] Check container resource usage
- [ ] Verify database connectivity
- [ ] Verify Redis connectivity
- [ ] Check for recent deployments
- [ ] Review Sentry for new issues

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | DevOps Team | Initial version |

**Review Schedule:** Quarterly
**Next Review:** TBD
