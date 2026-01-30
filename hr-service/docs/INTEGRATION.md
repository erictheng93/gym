# HR Service Integration Guide

## Overview

The HR Service is a standalone microservice that can be integrated with any main system (Gym Nexus, other projects). It provides attendance tracking, leave management, and employee data synchronization.

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Main System (Gym Nexus)                  │
│                                                              │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────────┐  │
│  │   Frontend    │    │   Backend     │    │   Database  │  │
│  │  (Admin-web)  │    │  (Directus)   │    │ (PostgreSQL)│  │
│  └───────┬───────┘    └───────┬───────┘    └─────────────┘  │
│          │                    │                              │
└──────────┼────────────────────┼──────────────────────────────┘
           │                    │
           │  REST API          │  Webhook
           ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      HR Service                              │
│                                                              │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────────┐  │
│  │   REST API    │    │   Business    │    │  HR Database│  │
│  │  (Express)    │◄───│    Logic      │◄───│ (PostgreSQL)│  │
│  └───────────────┘    └───────────────┘    └─────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Deploy HR Service

```bash
# Using Docker Compose
cd hr-service
docker-compose -f docker/docker-compose.yml up -d

# Run migrations
pnpm migrate:up
```

### 2. Configure Environment

Create `.env` file:

```env
# Database
DATABASE_URL=postgresql://hr_user:hr_password@localhost:5432/hr_db

# JWT (share with main system for SSO)
JWT_SECRET=your-shared-jwt-secret

# Main System Integration
MAIN_SYSTEM_API_URL=http://localhost:8500
MAIN_SYSTEM_API_KEY=your-api-key

# Employee Sync
SYNC_ENABLED=true
SYNC_WEBHOOK_SECRET=your-webhook-secret
```

### 3. Set Up Employee Sync

Choose one of these methods:

#### Method A: Webhook (Recommended)

Configure the main system to send webhooks when employees are created/updated:

```javascript
// In main system (Directus hook)
action('employees.items.create', async ({ payload, key }) => {
  await fetch('http://hr-service:3001/api/sync/employee', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': generateSignature(payload),
      'X-Webhook-Timestamp': Date.now().toString()
    },
    body: JSON.stringify({
      id: key,
      fullName: payload.full_name,
      employeeCode: payload.employee_code,
      branchId: payload.branch_id,
      supervisorId: payload.supervisor_id,
      employmentStatus: payload.employment_status,
      employmentType: payload.employment_type
    })
  });
});
```

#### Method B: Batch Sync

Periodically sync all employees:

```javascript
// Cron job or scheduled task
const employees = await fetchEmployeesFromMainSystem();
await fetch('http://hr-service:3001/api/sync/employees', {
  method: 'POST',
  headers: {
    'X-Webhook-Signature': generateSignature({ employees }),
    'X-Webhook-Timestamp': Date.now().toString()
  },
  body: JSON.stringify({ employees })
});
```

## Frontend Integration

### Using HR Composables

Install the packages:

```bash
pnpm add @gym-nexus/hr-core @gym-nexus/hr-composables
```

Configure the HR context in your Nuxt app:

```typescript
// plugins/hr-context.client.ts
import { defineNuxtPlugin } from '#app'
import { createHRContext, provideHRContext } from '@gym-nexus/hr-composables'
import { createHRAdapters } from '@gym-nexus/hr-directus-adapter'

export default defineNuxtPlugin((nuxtApp) => {
  const { $directus, $auth } = useNuxtApp()

  const adapters = createHRAdapters($directus, $auth.data.value)
  const context = createHRContext(adapters)

  nuxtApp.vueApp.runWithContext(() => {
    provideHRContext(context)
  })
})
```

Use in components:

```vue
<script setup lang="ts">
import { useAttendance } from '@gym-nexus/hr-composables'

const {
  todayAttendance,
  checkIn,
  checkOut,
  isLoading
} = useAttendance()
</script>
```

### Direct API Integration

If not using the composables package:

```typescript
// services/hrApi.ts
const HR_API_URL = process.env.HR_SERVICE_URL || 'http://localhost:3001/api'

export async function checkIn(token: string) {
  const response = await fetch(`${HR_API_URL}/attendance/check-in`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      checkInTime: new Date().toISOString()
    })
  })
  return response.json()
}
```

## Authentication

### Shared JWT

For seamless SSO, use the same JWT secret across both systems:

1. Main system generates JWT with employee info
2. HR service validates the same JWT
3. Employee ID is extracted from token for HR operations

```typescript
// JWT payload structure
interface JwtPayload {
  userId: string;       // Main system user ID
  employeeId: string;   // Employee ID (synced)
  branchId?: string;    // For multi-tenant filtering
  isAdmin?: boolean;    // Admin flag
}
```

### API Key for Service-to-Service

For backend-to-backend communication:

```typescript
// Headers
{
  'X-API-Key': process.env.MAIN_SYSTEM_API_KEY
}
```

## Multi-Tenant Support

HR service supports multi-tenant data isolation:

1. **Branch ID**: Passed in JWT payload
2. **Data Filtering**: All queries automatically filter by branch
3. **Cross-Branch Access**: Admins can access all branches

```typescript
// JWT with branch context
{
  employeeId: 'uuid',
  branchId: 'branch-uuid',
  isAdmin: false
}
```

## Error Handling

All errors follow a standard format:

```typescript
interface ErrorResponse {
  error: string;
  code: string;
  details?: Array<{ path: string; message: string }>;
}
```

Handle errors in your frontend:

```typescript
try {
  const result = await hrApi.checkIn(token)
  if (!result.success) {
    throw new Error(result.error)
  }
} catch (error) {
  if (error.code === 'VALIDATION_ERROR') {
    // Handle validation errors
  } else if (error.code === 'CONFLICT') {
    // Already checked in today
  }
}
```

## Monitoring

### Health Check

```bash
curl http://localhost:3001/api/health
```

### Sync Status

```bash
curl http://localhost:3001/api/sync/status
```

## Troubleshooting

### Common Issues

1. **JWT validation failed**
   - Ensure JWT_SECRET matches between systems
   - Check token expiration

2. **Employee not found**
   - Verify employee sync is working
   - Check webhook signature

3. **Duplicate check-in error**
   - Employee already checked in today
   - Check attendance records

4. **Leave balance insufficient**
   - Verify leave balance is correctly calculated
   - Check annual leave days based on tenure
