# Phase 4 API 使用指南

本文档提供 Phase 4 新增 API 的使用示例和最佳实践。

---

## 计费和订阅管理 API

### 1. 获取租户订阅信息

```bash
GET /gym/billing/subscriptions
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": "uuid",
        "tenant_name": "ABC Gym",
        "plan_type": "professional",
        "status": "active",
        "billing_cycle": "monthly",
        "current_period_start": "2026-01-01",
        "current_period_end": "2026-02-01",
        "monthly_price": 5999.00,
        "days_until_renewal": 24,
        "latest_invoice_number": "INV-202601-12345678-0001",
        "latest_invoice_status": "paid"
      }
    ],
    "count": 1
  }
}
```

### 2. 获取账单列表

```bash
GET /gym/billing/invoices?status=open&limit=10
```

**查询参数：**
- `status`: 账单状态（draft, open, paid, void）
- `limit`: 返回数量（默认 50）
- `offset`: 偏移量（默认 0）
- `tenant_id`: 租户 ID（仅超级管理员）

**响应示例：**
```json
{
  "success": true,
  "data": {
    "invoices": [
      {
        "id": "uuid",
        "invoice_number": "INV-202601-12345678-0001",
        "amount_subtotal": 5999.00,
        "amount_tax": 299.95,
        "amount_total": 6298.95,
        "currency": "TWD",
        "status": "open",
        "due_date": "2026-02-01",
        "period_start": "2026-01-01",
        "period_end": "2026-01-31",
        "plan_type": "professional",
        "billing_cycle": "monthly"
      }
    ],
    "count": 1
  }
}
```

### 3. 标记账单为已付款（仅超级管理员）

```bash
PATCH /gym/billing/invoices/:id/pay
Content-Type: application/json

{
  "payment_method": "credit_card",
  "payment_transaction_id": "TXN123456"
}
```

### 4. 获取使用量记录

```bash
GET /gym/billing/usage-records?start_date=2026-01-01&end_date=2026-01-31
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "record_date": "2026-01-08",
        "members_count": 450,
        "employees_count": 25,
        "branches_count": 3,
        "storage_mb": 2048,
        "api_calls_count": 12543,
        "active_contracts_count": 380,
        "daily_revenue": 45000.00
      }
    ],
    "period": {
      "start": "2026-01-01",
      "end": "2026-01-31"
    }
  }
}
```

### 5. 收集今日使用量（仅超级管理员，定时任务调用）

```bash
POST /gym/billing/usage-records/collect
Content-Type: application/json

{
  "tenant_id": "uuid"  // 可选，不提供则收集所有活跃租户
}
```

---

## 审计日志 API

### 1. 获取审计日志列表

```bash
GET /gym/audit/logs?action=create&resource_type=members&limit=50
```

**查询参数：**
- `action`: 操作类型（create, read, update, delete, login 等）
- `resource_type`: 资源类型（members, contracts, employees 等）
- `severity`: 严重程度（debug, info, warning, error, critical）
- `start_date`: 开始日期（YYYY-MM-DD）
- `end_date`: 结束日期（YYYY-MM-DD）
- `limit`: 返回数量（默认 100）
- `offset`: 偏移量（默认 0）

**响应示例：**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "date_created": "2026-01-08T10:30:00Z",
        "tenant_name": "ABC Gym",
        "employee_name": "张三",
        "action": "create",
        "resource_type": "members",
        "resource_id": "uuid",
        "description": "创建新会员：李四",
        "severity": "info",
        "ip_address": "192.168.1.100",
        "changed_fields_count": 5,
        "response_status": 200
      }
    ],
    "count": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### 2. 获取审计日志详情

```bash
GET /gym/audit/logs/:id
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "date_created": "2026-01-08T10:30:00Z",
    "tenant_id": "uuid",
    "user_id": "uuid",
    "employee_id": "uuid",
    "action": "update",
    "resource_type": "members",
    "resource_id": "uuid",
    "description": "更新会员信息",
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "old_values": {
      "phone": "0912-345-678",
      "email": "old@example.com"
    },
    "new_values": {
      "phone": "0987-654-321",
      "email": "new@example.com"
    },
    "diff": {
      "phone": {
        "old": "0912-345-678",
        "new": "0987-654-321"
      },
      "email": {
        "old": "old@example.com",
        "new": "new@example.com"
      }
    },
    "severity": "info",
    "response_status": 200,
    "response_time_ms": 145
  }
}
```

### 3. 创建审计日志

```bash
POST /gym/audit/logs
Content-Type: application/json

{
  "action": "update",
  "resource_type": "members",
  "resource_id": "uuid",
  "description": "更新会员电话号码",
  "old_values": {
    "phone": "0912-345-678"
  },
  "new_values": {
    "phone": "0987-654-321"
  },
  "severity": "info",
  "category": "member_management"
}
```

### 4. 获取审计日志统计

```bash
GET /gym/audit/stats?group_by=action&start_date=2026-01-01&end_date=2026-01-31
```

**查询参数：**
- `group_by`: 分组方式（action, resource_type, severity, user, day）
- `start_date`: 开始日期
- `end_date`: 结束日期

**响应示例：**
```json
{
  "success": true,
  "data": {
    "stats": [
      {
        "group_key": "create",
        "total_count": 1250,
        "success_count": 1230,
        "failed_count": 20,
        "error_count": 5,
        "avg_response_time_ms": 145.32
      },
      {
        "group_key": "update",
        "total_count": 890,
        "success_count": 875,
        "failed_count": 15,
        "error_count": 3,
        "avg_response_time_ms": 178.56
      }
    ],
    "period": {
      "start": "2026-01-01",
      "end": "2026-01-31"
    },
    "group_by": "action"
  }
}
```

### 5. 导出审计日志（CSV）

```bash
GET /gym/audit/export?start_date=2026-01-01&end_date=2026-01-31&format=csv
```

返回 CSV 文件，包含以下字段：
- 日期时间、租户、操作员、操作、资源类型、资源ID、描述、严重程度、IP地址、变更字段数、响应状态

### 6. 清理旧审计日志（仅超级管理员）

```bash
DELETE /gym/audit/logs/cleanup?retention_days=365
```

默认保留 365 天，error 和 critical 级别的日志不会被删除。

---

## 使用场景示例

### 场景 1：监控租户使用量并生成账单

```javascript
// 1. 收集今日使用量（定时任务，每天 23:59 执行）
const collectUsage = async (tenantId) => {
  const response = await fetch('/gym/billing/usage-records/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId })
  });
  return response.json();
};

// 2. 每月1号生成上月账单
const generateMonthlyInvoice = async (tenantId, subscriptionId) => {
  // 获取上月使用量
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

  // 创建账单
  const response = await fetch('/gym/billing/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      amount_subtotal: 5999.00,
      amount_tax: 299.95,
      period_start: startDate.toISOString().split('T')[0],
      period_end: endDate.toISOString().split('T')[0]
    })
  });

  return response.json();
};
```

### 场景 2：审计重要操作

```javascript
// Hook 中自动记录审计日志
const logAudit = async (context, action, resourceType, resourceId, oldValues, newValues) => {
  const { tenantId, userId, employeeId } = context;

  await fetch('/gym/audit/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      severity: 'info'
    })
  });
};

// 使用示例
const updateMember = async (memberId, updates) => {
  const oldMember = await getMember(memberId);

  // 执行更新
  const result = await updateMemberData(memberId, updates);

  // 记录审计日志
  await logAudit(
    context,
    'update',
    'members',
    memberId,
    oldMember,
    result
  );

  return result;
};
```

### 场景 3：查看安全告警

```javascript
// 获取最近的安全相关日志
const getSecurityAlerts = async () => {
  const response = await fetch(
    '/gym/audit/logs?' +
    'severity=warning,error,critical&' +
    'action=login_failed,permission_denied&' +
    'limit=100'
  );

  return response.json();
};

// 生成安全报告
const generateSecurityReport = async (startDate, endDate) => {
  const stats = await fetch(
    `/gym/audit/stats?` +
    `group_by=action&` +
    `start_date=${startDate}&` +
    `end_date=${endDate}`
  ).then(r => r.json());

  // 导出详细日志
  const csvUrl = `/gym/audit/export?` +
    `start_date=${startDate}&` +
    `end_date=${endDate}&` +
    `format=csv`;

  return { stats, csvUrl };
};
```

---

## 最佳实践

### 1. 审计日志记录

**应该记录的操作：**
- ✅ 创建、更新、删除重要资源
- ✅ 登录、登出
- ✅ 权限变更
- ✅ 配置修改
- ✅ 支付操作
- ✅ 数据导出

**不应该记录的操作：**
- ❌ 频繁的查询操作（read）
- ❌ 敏感数据（密码、支付卡号）
- ❌ 系统内部调用

### 2. 性能优化

**查询优化：**
```javascript
// ❌ 不好：获取所有日志
const logs = await fetch('/gym/audit/logs?limit=10000');

// ✅ 好：使用分页和筛选
const logs = await fetch(
  '/gym/audit/logs?' +
  'start_date=2026-01-01&' +
  'end_date=2026-01-31&' +
  'severity=error,critical&' +
  'limit=50&offset=0'
);
```

**使用量统计：**
```javascript
// ❌ 不好：实时计算
const usage = await calculateCurrentUsage(tenantId);

// ✅ 好：使用缓存的使用量记录
const usage = await fetch(
  `/gym/billing/usage-records?limit=1`
).then(r => r.json());
```

### 3. 错误处理

```javascript
const createInvoice = async (data) => {
  try {
    const response = await fetch('/gym/billing/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  } catch (error) {
    // 记录错误到审计日志
    await fetch('/gym/audit/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        resource_type: 'invoices',
        severity: 'error',
        description: `账单创建失败：${error.message}`
      })
    });

    throw error;
  }
};
```

---

## 权限要求

| API | 最低权限 |
|-----|----------|
| `/gym/billing/subscriptions` (GET) | 租户成员 |
| `/gym/billing/subscriptions` (POST) | 超级管理员 |
| `/gym/billing/invoices` (GET) | 租户成员 |
| `/gym/billing/invoices` (POST) | 超级管理员 |
| `/gym/billing/invoices/:id/pay` (PATCH) | 超级管理员 |
| `/gym/billing/usage-records` (GET) | 租户成员 |
| `/gym/billing/usage-records/collect` (POST) | 超级管理员 |
| `/gym/audit/logs` (GET) | 租户成员 |
| `/gym/audit/logs/:id` (GET) | 租户成员 |
| `/gym/audit/logs` (POST) | 认证用户 |
| `/gym/audit/stats` (GET) | 租户成员 |
| `/gym/audit/export` (GET) | 租户成员 |
| `/gym/audit/logs/cleanup` (DELETE) | 超级管理员 |

---

## 常见问题

### Q1: 如何自动记录审计日志？

在 Directus Hook 中使用 `action` 钩子：

```javascript
action('items.update', async ({ key, collection, payload }) => {
  // 获取旧值
  const oldItem = await database.raw(
    `SELECT * FROM ${collection} WHERE id = $1`,
    [key]
  );

  // 记录审计日志
  await fetch('/gym/audit/logs', {
    method: 'POST',
    body: JSON.stringify({
      action: 'update',
      resource_type: collection,
      resource_id: key,
      old_values: oldItem.rows[0],
      new_values: payload
    })
  });
});
```

### Q2: 账单编号规则是什么？

格式：`INV-YYYYMM-{tenant_id前8位}-{序号}`

示例：`INV-202601-12345678-0001`

### Q3: 如何清理旧审计日志？

设置定时任务（cron）：

```bash
# 每月1号清理超过365天的日志
0 0 1 * * curl -X DELETE "http://localhost:8500/gym/audit/logs/cleanup?retention_days=365"
```

### Q4: 使用量记录何时更新？

建议每天 23:59 执行一次，通过定时任务调用：

```bash
# 每天 23:59 收集所有租户的使用量
59 23 * * * curl -X POST "http://localhost:8500/gym/billing/usage-records/collect"
```

---

## 相关文档

- [Phase 4 实现总结](./PHASE_4_IMPLEMENTATION_SUMMARY.md)
- [数据库 Schema](./backend/schema.sql)
- [多租户实现](./backend/MULTI_TENANT_IMPLEMENTATION.md)
