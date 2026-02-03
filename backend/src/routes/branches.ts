import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, branches, employees, members } from '../db/index.js';
import { eq, sql, desc } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createBranchSchema = z.object({
  name: z.string().min(1, '請輸入分店名稱'),
  type: z.enum(['HEADQUARTER', 'BRANCH']),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  settings: z.record(z.unknown()).optional(),
});

const updateBranchSchema = createBranchSchema.partial();

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;

  const result = await db
    .select({
      branch: branches,
      employeeCount: sql<number>`(SELECT COUNT(*) FROM employees WHERE employees.branch_id = ${branches.id} AND employees.status = 'ACTIVE')`,
      memberCount: sql<number>`(SELECT COUNT(*) FROM members WHERE members.branch_id = ${branches.id} AND members.status = 'ACTIVE')`,
    })
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(desc(branches.type), branches.name);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.branch,
      stats: {
        employeeCount: Number(r.employeeCount),
        memberCount: Number(r.memberCount),
      },
    })),
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '分店不存在' }, 404);
  }

  if (branch.tenantId !== tenantId) {
    return c.json({ success: false, error: '無權限存取此分店' }, 403);
  }

  const branchEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.branchId, id))
    .orderBy(employees.fullName);

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.branchId, id));

  return c.json({
    success: true,
    data: {
      ...branch,
      employees: branchEmployees,
      stats: {
        employeeCount: branchEmployees.length,
        memberCount: Number(memberCount?.count || 0),
      },
    },
  });
});

app.post('/', requireRole('super_admin', 'admin'), zValidator('json', createBranchSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  // Generate branch code from name
  const branchCode = data.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) + '-' + Date.now().toString(36).slice(-4).toUpperCase();

  const [newBranch] = await db.insert(branches).values({
    ...data,
    code: branchCode,
    tenantId,
  }).returning();

  return c.json({ success: true, data: newBranch }, 201);
});

app.patch('/:id', requireRole('super_admin', 'admin', 'manager'), zValidator('json', updateBranchSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '分店不存在' }, 404);
  }

  if (branch.tenantId !== tenantId) {
    return c.json({ success: false, error: '無權限修改此分店' }, 403);
  }

  const [updatedBranch] = await db
    .update(branches)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(branches.id, id))
    .returning();

  return c.json({ success: true, data: updatedBranch });
});

app.delete('/:id', requireRole('super_admin', 'admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '分店不存在' }, 404);
  }

  if (branch.tenantId !== tenantId) {
    return c.json({ success: false, error: '無權限刪除此分店' }, 403);
  }

  if (branch.type === 'HEADQUARTER') {
    return c.json({ success: false, error: '無法刪除總店' }, 400);
  }

  const [employeeCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(eq(employees.branchId, id));

  if (Number(employeeCount?.count || 0) > 0) {
    return c.json({ success: false, error: '此分店仍有員工，請先轉移員工' }, 400);
  }

  await db
    .update(branches)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(branches.id, id));

  return c.json({ success: true, message: '分店已封存' });
});

export default app;
