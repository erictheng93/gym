import { Hono } from 'hono';
import { db, tenants, members, employees, branches } from '../db/index.js';
import { eq, sql, count } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

// All routes require authentication and tenant context
app.use('*', requireAuth);
app.use('*', requireTenant);

/**
 * GET /api/tenant
 * Get current tenant information
 */
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ success: false, error: '無租戶上下文' }, 400);
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      planType: tenants.planType,
      status: tenants.tenantStatus,
      maxBranches: tenants.maxBranches,
      maxMembers: tenants.maxMembers,
      maxEmployees: tenants.maxEmployees,
      maxStorageMb: tenants.maxStorageMb,
      trialEndsAt: tenants.trialEndsAt,
      billingCycle: tenants.billingCycle,
      nextBillingDate: tenants.nextBillingDate,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return c.json({ success: false, error: '找不到租戶' }, 404);
  }

  return c.json({
    success: true,
    data: tenant,
  });
});

/**
 * GET /api/tenant/quota
 * Get current tenant quota usage
 */
app.get('/quota', async (c) => {
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ success: false, error: '無租戶上下文' }, 400);
  }

  // Get tenant limits
  const [tenant] = await db
    .select({
      maxMembers: tenants.maxMembers,
      maxEmployees: tenants.maxEmployees,
      maxBranches: tenants.maxBranches,
      maxStorageMb: tenants.maxStorageMb,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return c.json({ success: false, error: '找不到租戶' }, 404);
  }

  // Count current usage in parallel
  const [memberCount, employeeCount, branchCount] = await Promise.all([
    db
      .select({ count: count() })
      .from(members)
      .where(eq(members.tenantId, tenantId))
      .then(rows => rows[0]?.count || 0),
    db
      .select({ count: count() })
      .from(employees)
      .where(eq(employees.tenantId, tenantId))
      .then(rows => rows[0]?.count || 0),
    db
      .select({ count: count() })
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .then(rows => rows[0]?.count || 0),
  ]);

  // TODO: Calculate actual storage usage from files table
  const storageUsedMb = 0;

  const quota = {
    members: {
      current: Number(memberCount),
      limit: tenant.maxMembers || 100,
      available: Math.max(0, (tenant.maxMembers || 100) - Number(memberCount)),
    },
    employees: {
      current: Number(employeeCount),
      limit: tenant.maxEmployees || 10,
      available: Math.max(0, (tenant.maxEmployees || 10) - Number(employeeCount)),
    },
    branches: {
      current: Number(branchCount),
      limit: tenant.maxBranches || 1,
      available: Math.max(0, (tenant.maxBranches || 1) - Number(branchCount)),
    },
    storage: {
      current: storageUsedMb,
      limit: tenant.maxStorageMb || 1024,
      available: Math.max(0, (tenant.maxStorageMb || 1024) - storageUsedMb),
    },
  };

  return c.json({
    success: true,
    data: quota,
  });
});

/**
 * GET /api/tenant/quota/check/:resource
 * Check if a resource can be created (quota not exceeded)
 */
app.get('/quota/check/:resource', async (c) => {
  const tenantId = c.get('tenantId');
  const resource = c.req.param('resource') as 'members' | 'employees' | 'branches';

  if (!tenantId) {
    return c.json({ success: false, error: '無租戶上下文' }, 400);
  }

  if (!['members', 'employees', 'branches'].includes(resource)) {
    return c.json({ success: false, error: '無效的資源類型' }, 400);
  }

  // Get tenant limits
  const [tenant] = await db
    .select({
      maxMembers: tenants.maxMembers,
      maxEmployees: tenants.maxEmployees,
      maxBranches: tenants.maxBranches,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return c.json({ success: false, error: '找不到租戶' }, 404);
  }

  // Get current count for the requested resource
  let currentCount = 0;
  let limit = 0;

  switch (resource) {
    case 'members':
      currentCount = await db
        .select({ count: count() })
        .from(members)
        .where(eq(members.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0));
      limit = tenant.maxMembers || 100;
      break;
    case 'employees':
      currentCount = await db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0));
      limit = tenant.maxEmployees || 10;
      break;
    case 'branches':
      currentCount = await db
        .select({ count: count() })
        .from(branches)
        .where(eq(branches.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0));
      limit = tenant.maxBranches || 1;
      break;
  }

  const canCreate = currentCount < limit;

  return c.json({
    success: true,
    data: {
      resource,
      canCreate,
      current: currentCount,
      limit,
      available: Math.max(0, limit - currentCount),
    },
  });
});

export default app;
