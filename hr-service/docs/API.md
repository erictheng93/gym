# HR Service API Documentation

## Base URL

```
Development: http://localhost:3001/api
Production: https://hr-api.your-domain.com/api
```

## Authentication

All endpoints (except `/health` and `/sync/*`) require JWT authentication.

**Header:**
```
Authorization: Bearer <token>
```

**JWT Payload:**
```typescript
{
  userId: string;
  employeeId: string;
  branchId?: string;
  isAdmin?: boolean;
}
```

---

## Health Check

### GET /health

Check service health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T12:00:00.000Z",
  "service": "hr-service",
  "version": "0.1.0"
}
```

---

## Attendance API

### POST /attendance/check-in

Record employee check-in.

**Request Body:**
```json
{
  "checkInTime": "2025-01-30T09:00:00.000Z",
  "location": "Main Office",           // optional
  "note": "Working from home"          // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "employeeId": "uuid",
    "date": "2025-01-30",
    "checkInTime": "2025-01-30T09:00:00.000Z",
    "status": "PRESENT",
    "lateMinutes": 0,
    "isLate": false
  }
}
```

### POST /attendance/:id/check-out

Record employee check-out.

**Request Body:**
```json
{
  "checkOutTime": "2025-01-30T18:00:00.000Z",
  "note": "Finished for the day"       // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "checkOutTime": "2025-01-30T18:00:00.000Z",
    "workHours": 8.5,
    "overtimeHours": 0.5,
    "status": "PRESENT"
  }
}
```

### GET /attendance/today

Get all attendance records for today (filtered by branch).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "employeeId": "uuid",
      "date": "2025-01-30",
      "checkInTime": "2025-01-30T09:00:00.000Z",
      "checkOutTime": null,
      "status": "PRESENT",
      "workHours": null,
      "isLate": false
    }
  ]
}
```

### GET /attendance/employee/:employeeId/today

Get specific employee's attendance for today.

**Response:** Same as single attendance record.

### GET /attendance/employee/:employeeId

Get employee's attendance history.

**Query Parameters:**
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

### GET /attendance/:id

Get specific attendance record.

---

## Leave API

### POST /leave/apply

Submit a leave request.

**Request Body:**
```json
{
  "leaveType": "ANNUAL",
  "startDate": "2025-02-01",
  "endDate": "2025-02-03",
  "reason": "Family vacation"
}
```

**Leave Types:**
- `ANNUAL` - Annual leave
- `SICK` - Sick leave
- `PERSONAL` - Personal leave
- `MATERNITY` - Maternity leave
- `PATERNITY` - Paternity leave
- `BEREAVEMENT` - Bereavement leave
- `MARRIAGE` - Marriage leave
- `UNPAID` - Unpaid leave

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "totalDays": 3,
    "message": "Leave request submitted successfully"
  }
}
```

### GET /leave/requests

Get leave requests (for current user or subordinates if supervisor).

**Query Parameters:**
- `status`: Filter by status (PENDING, APPROVED, REJECTED, CANCELLED)
- `startDate`: Filter by start date
- `endDate`: Filter by end date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "employeeId": "uuid",
      "leaveType": "ANNUAL",
      "startDate": "2025-02-01",
      "endDate": "2025-02-03",
      "status": "PENDING",
      "totalDays": 3,
      "reason": "Family vacation",
      "createdAt": "2025-01-30T12:00:00.000Z"
    }
  ]
}
```

### GET /leave/requests/:id

Get specific leave request.

### GET /leave/requests/:id/history

Get approval history for a leave request.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "approverId": "uuid",
      "action": "APPROVED",
      "comment": "Approved",
      "createdAt": "2025-01-30T14:00:00.000Z"
    }
  ]
}
```

### POST /leave/:id/review

Review a leave request (approve/reject).

**Request Body:**
```json
{
  "action": "APPROVE",                  // or "REJECT"
  "comment": "Approved. Enjoy your vacation!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "APPROVED"
  }
}
```

### POST /leave/:id/cancel

Cancel a pending leave request.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CANCELLED"
  }
}
```

### GET /leave/pending

Get pending leave requests for approval (supervisors only).

### GET /leave/balance/:employeeId

Get leave balance for an employee.

**Response:**
```json
{
  "success": true,
  "data": {
    "employeeId": "uuid",
    "year": 2025,
    "balances": {
      "ANNUAL": {
        "total": 15,
        "used": 5,
        "pending": 3,
        "remaining": 7
      },
      "SICK": {
        "total": 10,
        "used": 2,
        "pending": 0,
        "remaining": 8
      }
    }
  }
}
```

---

## Sync API

For employee data synchronization from the main system. Uses webhook signature verification.

**Required Headers:**
- `X-Webhook-Signature`: HMAC-SHA256 signature
- `X-Webhook-Timestamp`: Unix timestamp (ms)

**Signature Generation:**
```javascript
const payload = `${timestamp}.${JSON.stringify(body)}`;
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
```

### POST /sync/employee

Sync a single employee.

**Request Body:**
```json
{
  "id": "uuid",                         // External ID from main system
  "fullName": "John Doe",
  "employeeCode": "EMP001",
  "branchId": "uuid",
  "supervisorId": "uuid",
  "employmentStatus": "ACTIVE",
  "employmentType": "FULL_TIME"
}
```

### POST /sync/employees

Batch sync multiple employees.

**Request Body:**
```json
{
  "employees": [
    {
      "id": "uuid",
      "fullName": "John Doe",
      "employeeCode": "EMP001",
      "branchId": "uuid",
      "supervisorId": null,
      "employmentStatus": "ACTIVE",
      "employmentType": "FULL_TIME"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "meta": {
    "total": 10,
    "synced": 9,
    "failed": 1
  },
  "data": [
    { "success": true, "externalId": "uuid", "id": "uuid" },
    { "success": false, "externalId": "uuid", "error": "..." }
  ]
}
```

### GET /sync/status

Get sync status (no authentication required).

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMinutes": 15,
    "totalEmployees": 100,
    "lastSyncAt": "2025-01-30T12:00:00.000Z"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": [...]                      // optional, for validation errors
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400): Invalid request data
- `UNAUTHORIZED` (401): Missing or invalid authentication
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource already exists
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

---

## Rate Limiting

Default limits:
- 100 requests per minute per IP
- Headers returned:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
