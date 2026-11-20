import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, notifications, branches, members, employees } from '../db/index.js';
import { eq, and, sql, desc, isNull, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createNotificationSchema = z.object({
  notificationType: z.string().min(1),
  title: z.string().min(1, '標題必填'),
  message: z.string().min(1, '內容必填'),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  targetMemberId: z.string().uuid().optional(),
  targetEmployeeId: z.string().uuid().optional(),
  branchId: z.string().uuid(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
  expiresAt: z.string().optional(),
});

// List notifications
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const branchId = c.req.query('branchId');
  const unreadOnly = c.req.query('unreadOnly') === 'true';
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
      unreadCount: 0,
    });
  }

  const targetBranchIds = branchId ? branchIds.filter(id => id === branchId) : branchIds;
  if (targetBranchIds.length === 0) {
    return c.json({
      success: true,
      data: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
      unreadCount: 0,
    });
  }

  const conditions = [inArray(notifications.branchId, targetBranchIds)];

  if (unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  // Filter by target (employee or branch-wide)
  if (user.employeeId) {
    conditions.push(
      sql`(${notifications.targetEmployeeId} = ${user.employeeId} OR ${notifications.targetEmployeeId} IS NULL)`
    );
  }

  const [result, [countResult], [unreadCount]] = await Promise.all([
    db
      .select({
        notification: notifications,
        branch: {
          id: branches.id,
          name: branches.name,
        },
      })
      .from(notifications)
      .innerJoin(branches, eq(notifications.branchId, branches.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditions)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditions, isNull(notifications.readAt))),
  ]);

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.notification,
      branch: r.branch,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    unreadCount: Number(unreadCount?.count || 0),
  });
});

// Get single notification
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select({
      notification: notifications,
      branch: {
        id: branches.id,
        name: branches.name,
      },
      targetMember: {
        id: members.id,
        fullName: members.fullName,
      },
      targetEmployee: {
        id: employees.id,
        fullName: employees.fullName,
      },
    })
    .from(notifications)
    .innerJoin(branches, eq(notifications.branchId, branches.id))
    .leftJoin(members, eq(notifications.targetMemberId, members.id))
    .leftJoin(employees, eq(notifications.targetEmployeeId, employees.id))
    .where(and(eq(notifications.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '通知不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.notification,
      branch: result.branch,
      targetMember: result.targetMember,
      targetEmployee: result.targetEmployee,
    },
  });
});

// Create notification
app.post('/', zValidator('json', createNotificationSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Verify branch
  const branchIds = await getTenantBranchIds(tenantId);
  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const [newNotification] = await db.insert(notifications).values({
    ...data,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
  }).returning();

  return c.json({
    success: true,
    data: newNotification,
  }, 201);
});

// Mark as read
app.post('/:id/read', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '通知不存在' }, 404);
  }

  const [updated] = await db
    .update(notifications)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(notifications.id, id), inArray(notifications.branchId, branchIds)))
    .returning({ id: notifications.id });

  if (!updated) {
    return c.json({ success: false, error: '通知不存在' }, 404);
  }

  return c.json({ success: true, message: '已標記為已讀' });
});

// Mark all as read
app.post('/read-all', async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const branchId = c.req.query('branchId');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({
      success: true,
      message: '已將 0 則通知標記為已讀',
    });
  }

  const targetBranchIds = branchId ? branchIds.filter(id => id === branchId) : branchIds;
  if (targetBranchIds.length === 0) {
    return c.json({
      success: true,
      message: '已將 0 則通知標記為已讀',
    });
  }

  const conditions = [
    inArray(notifications.branchId, targetBranchIds),
    isNull(notifications.readAt),
  ];

  if (user.employeeId) {
    conditions.push(
      sql`(${notifications.targetEmployeeId} = ${user.employeeId} OR ${notifications.targetEmployeeId} IS NULL)`
    );
  }

  // Direct atomic update
  const updatedRows = await db
    .update(notifications)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: notifications.id });

  return c.json({
    success: true,
    message: `已將 ${updatedRows.length} 則通知標記為已讀`,
  });
});

// Delete notification
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '通知不存在' }, 404);
  }

  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), inArray(notifications.branchId, branchIds)))
    .returning({ id: notifications.id });

  if (!deleted) {
    return c.json({ success: false, error: '通知不存在' }, 404);
  }

  return c.json({ success: true, message: '通知已刪除' });
});

// Get unread count
app.get('/count/unread', async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const branchId = c.req.query('branchId');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: { count: 0 },
    });
  }

  const targetBranchIds = branchId ? branchIds.filter(id => id === branchId) : branchIds;
  if (targetBranchIds.length === 0) {
    return c.json({
      success: true,
      data: { count: 0 },
    });
  }

  const conditions = [
    inArray(notifications.branchId, targetBranchIds),
    isNull(notifications.readAt),
  ];

  if (user.employeeId) {
    conditions.push(
      sql`(${notifications.targetEmployeeId} = ${user.employeeId} OR ${notifications.targetEmployeeId} IS NULL)`
    );
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(...conditions));

  return c.json({
    success: true,
    data: { count: Number(result?.count || 0) },
  });
});

export default app;
