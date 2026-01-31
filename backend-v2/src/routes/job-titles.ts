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
  level: z.number().int().min(0).max(10).optional(),
  permissionsConfig: z.record(z.unknown()).optional(),
});

const updateJobTitleSchema = createJobTitleSchema.partial();

// List job titles
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;

  const result = await db
    .select()
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
    .select()
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
app.post('/', requireRole('admin', 'manager'), zValidator('json', createJobTitleSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [newJobTitle] = await db.insert(jobTitles).values({
    ...data,
    tenantId,
  }).returning();

  return c.json({
    success: true,
    data: newJobTitle,
  }, 201);
});

// Update job title
app.patch('/:id', requireRole('admin', 'manager'), zValidator('json', updateJobTitleSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const [existing] = await db
    .select()
    .from(jobTitles)
    .where(and(eq(jobTitles.id, id), eq(jobTitles.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '職稱不存在' }, 404);
  }

  const [updated] = await db.update(jobTitles).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(jobTitles.id, id)).returning();

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete job title
app.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [existing] = await db
    .select()
    .from(jobTitles)
    .where(and(eq(jobTitles.id, id), eq(jobTitles.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ success: false, error: '職稱不存在' }, 404);
  }

  await db.delete(jobTitles).where(eq(jobTitles.id, id));

  return c.json({ success: true, message: '職稱已刪除' });
});

export default app;
