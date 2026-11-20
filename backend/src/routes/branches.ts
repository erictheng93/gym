import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, branches, employees, members } from '../db/index.js';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { invalidateTenantBranchesCache } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createBranchSchema = z.object({
  name: z.string().min(1, '請輸入分店名稱'),
  type: z.enum(['HEADQUARTER', 'BRANCH']),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const updateBranchSchema = createBranchSchema.partial();

const BRANCH_SELECT = {
  id: branches.id,
  status: branches.status,
  createdAt: branches.createdAt,
  updatedAt: branches.updatedAt,
  name: branches.name,
  code: branches.code,
  type: branches.type,
  address: branches.address,
  phone: branches.phone,
  taxId: branches.taxId,
  settings: branches.settings,
  tenantId: branches.tenantId,
};

app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;

  const [tenantBranches, employeeCounts, memberCounts] = await Promise.all([
    db
      .select(BRANCH_SELECT)
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(desc(branches.type), branches.name),
    db
      .select({
        branchId: employees.branchId,
        count: count(),
      })
      .from(employees)
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .where(and(eq(branches.tenantId, tenantId), eq(employees.status, 'ACTIVE')))
      .groupBy(employees.branchId),
    db
      .select({
        branchId: members.branchId,
        count: count(),
      })
      .from(members)
      .where(and(eq(members.tenantId, tenantId), eq(members.status, 'ACTIVE')))
      .groupBy(members.branchId),
  ]);

  const empMap = new Map<string, number>();
  for (const ec of employeeCounts) {
    if (ec.branchId) empMap.set(ec.branchId, Number(ec.count));
  }
  const memMap = new Map<string, number>();
  for (const mc of memberCounts) {
    if (mc.branchId) memMap.set(mc.branchId, Number(mc.count));
  }

  return c.json({
    success: true,
    data: tenantBranches.map(branch => ({
      ...branch,
      stats: {
        employeeCount: empMap.get(branch.id) || 0,
        memberCount: memMap.get(branch.id) || 0,
      },
    })),
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [branch] = await db
    .select(BRANCH_SELECT)
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  if (!branch) {
    return c.json({ success: false, error: '分店不存在' }, 404);
  }

  if (branch.tenantId !== tenantId) {
    return c.json({ success: false, error: '無權限存取此分店' }, 403);
  }

  const [branchEmployees, [memberCount]] = await Promise.all([
    db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        phone: employees.phone,
        email: employees.email,
        status: employees.status,
        employmentType: employees.employmentType,
        jobTitleId: employees.jobTitleId,
        branchId: employees.branchId,
        employeeCode: employees.employeeCode,
      })
      .from(employees)
      .where(eq(employees.branchId, id))
      .orderBy(employees.fullName),
    db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.branchId, id)),
  ]);

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

const BRANCH_RETURNING = BRANCH_SELECT;

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
  }).returning(BRANCH_RETURNING);

  invalidateTenantBranchesCache(tenantId);

  return c.json({ success: true, data: newBranch }, 201);
});

app.patch('/:id', requireRole('super_admin', 'admin', 'manager'), zValidator('json', updateBranchSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [updatedBranch] = await db
    .update(branches)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning(BRANCH_RETURNING);

  if (!updatedBranch) {
    const [existing] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: '分店不存在' }, 404);
    }
    return c.json({ success: false, error: '無權限修改此分店' }, 403);
  }

  invalidateTenantBranchesCache(tenantId);

  return c.json({ success: true, data: updatedBranch });
});

app.delete('/:id', requireRole('super_admin', 'admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[branch], [employeeCount]] = await Promise.all([
    db
      .select({ id: branches.id, tenantId: branches.tenantId, type: branches.type })
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(eq(employees.branchId, id)),
  ]);

  if (!branch) {
    return c.json({ success: false, error: '分店不存在' }, 404);
  }

  if (branch.tenantId !== tenantId) {
    return c.json({ success: false, error: '無權限刪除此分店' }, 403);
  }

  if (branch.type === 'HEADQUARTER') {
    return c.json({ success: false, error: '無法刪除總店' }, 400);
  }

  if (Number(employeeCount?.count || 0) > 0) {
    return c.json({ success: false, error: '此分店仍有員工，請先轉移員工' }, 400);
  }

  await db
    .update(branches)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(branches.id, id));

  invalidateTenantBranchesCache(tenantId);

  return c.json({ success: true, message: '分店已封存' });
});

export default app;
