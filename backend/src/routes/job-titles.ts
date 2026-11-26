import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, jobTitles } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireTenant, requireRole } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createJobTitleSchema = z.object({
  name: z.string().min(1, '職稱名稱必填'),
  code: z.string().min(1, '職稱代碼必填').max(20),
  description: z.string().optional(),
  level: z.number().int().min(0).max(10).optional(),
  sort: z.number().int().optional(),
  permissionsConfig: z.record(z.string(), z.unknown()).optional(),
});

const updateJobTitleSchema = createJobTitleSchema.partial();

// A job title's permissionsConfig is every holder's default permission set: admins only.
const PERMISSION_ADMIN_ROLES = ['super_admin', 'admin'];

const JOB_TITLE_SELECT = {
  id: jobTitles.id,
  createdAt: jobTitles.createdAt,
  name: jobTitles.name,
  code: jobTitles.code,
  description: jobTitles.description,
  level: jobTitles.level,
  sort: jobTitles.sort,
  permissionsConfig: jobTitles.permissionsConfig,
  tenantId: jobTitles.tenantId,
};

const JOB_TITLE_RETURNING = JOB_TITLE_SELECT;

const JOB_TITLE_ID_RETURNING = {
  id: jobTitles.id,
};

// List job titles
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;

  const result = await db
    .select(JOB_TITLE_SELECT)
    .from(jobTitles)
    .where(eq(jobTitles.tenantId, tenantId))
    .orderBy(jobTitles.name);

  return c.json({
    success: true,
    data: result,
  });
});

// Get single job title
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [jobTitle] = await db
    .select(JOB_TITLE_SELECT)
    .from(jobTitles)
    .where(and(eq(jobTitles.id, id), eq(jobTitles.tenantId, tenantId)))
    .limit(1);

  if (!jobTitle) {
    return c.json({ success: false, error: '職稱不存在' }, 404);
  }

  return c.json({
    success: true,
    data: jobTitle,
  });
});

// Create job title (admin/manager only)
app.post('/', requireRole('super_admin', 'admin', 'manager'), zValidator('json', createJobTitleSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');
  if (data.permissionsConfig !== undefined && !PERMISSION_ADMIN_ROLES.includes(c.get('user')!.role)) {
    return c.json({ success: false, error: '權限不足' }, 403);
  }

  const [newJobTitle] = await db.insert(jobTitles).values({
    ...data,
    tenantId,
  }).returning(JOB_TITLE_RETURNING);

  return c.json({
    success: true,
    data: newJobTitle,
  }, 201);
});

// Update job title
app.patch('/:id', requireRole('super_admin', 'admin', 'manager'), zValidator('json', updateJobTitleSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');
  if (data.permissionsConfig !== undefined && !PERMISSION_ADMIN_ROLES.includes(c.get('user')!.role)) {
    return c.json({ success: false, error: '權限不足' }, 403);
  }

  const [updated] = await db
    .update(jobTitles)
    .set(data)
    .where(and(eq(jobTitles.id, id), eq(jobTitles.tenantId, tenantId)))
    .returning(JOB_TITLE_RETURNING);

  if (!updated) {
    return c.json({ success: false, error: '職稱不存在' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete job title
app.delete('/:id', requireRole('super_admin', 'admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [deleted] = await db
    .delete(jobTitles)
    .where(and(eq(jobTitles.id, id), eq(jobTitles.tenantId, tenantId)))
    .returning(JOB_TITLE_ID_RETURNING);

  if (!deleted) {
    return c.json({ success: false, error: '職稱不存在' }, 404);
  }

  return c.json({ success: true, message: '職稱已刪除' });
});

export default app;
