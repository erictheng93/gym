import { Hono } from 'hono';
import { db, tenants, members, employees, branches } from '../db/index.js';
import { eq, count } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { validateBranding, mergeBranding } from '../types/branding.js';
import type { TenantBranding } from '../types/branding.js';
import { invalidateBrandingCache } from './branding.js';

const TENANT_DETAIL_SELECT = {
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
};

const TENANT_LIMITS_SELECT = {
  maxMembers: tenants.maxMembers,
  maxEmployees: tenants.maxEmployees,
  maxBranches: tenants.maxBranches,
  maxStorageMb: tenants.maxStorageMb,
};

const TENANT_CHECK_LIMITS_SELECT = {
  maxMembers: tenants.maxMembers,
  maxEmployees: tenants.maxEmployees,
  maxBranches: tenants.maxBranches,
};

const TENANT_SETTINGS_SELECT = {
  slug: tenants.slug,
  settings: tenants.settings,
};

const TENANT_BRANDING_SELECT = {
  settings: tenants.settings,
};

const COUNT_SELECT = {
  count: count(),
};

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
    .select(TENANT_DETAIL_SELECT)
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

  // Fetch tenant limits and current usage in parallel
  const [[tenant], memberRows, employeeRows, branchRows] = await Promise.all([
    db
      .select(TENANT_LIMITS_SELECT)
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select(COUNT_SELECT)
      .from(members)
      .where(eq(members.tenantId, tenantId)),
    db
      .select(COUNT_SELECT)
      .from(employees)
      .where(eq(employees.tenantId, tenantId)),
    db
      .select(COUNT_SELECT)
      .from(branches)
      .where(eq(branches.tenantId, tenantId)),
  ]);

  if (!tenant) {
    return c.json({ success: false, error: '找不到租戶' }, 404);
  }

  const memberCount = memberRows[0]?.count || 0;
  const employeeCount = employeeRows[0]?.count || 0;
  const branchCount = branchRows[0]?.count || 0;

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

  const countQuery = resource === 'members'
    ? db.select(COUNT_SELECT).from(members).where(eq(members.tenantId, tenantId))
    : resource === 'employees'
    ? db.select(COUNT_SELECT).from(employees).where(eq(employees.tenantId, tenantId))
    : db.select(COUNT_SELECT).from(branches).where(eq(branches.tenantId, tenantId));

  // Get tenant limits and resource count in parallel
  const [[tenant], countRows] = await Promise.all([
    db
      .select(TENANT_CHECK_LIMITS_SELECT)
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    countQuery,
  ]);

  if (!tenant) {
    return c.json({ success: false, error: '找不到租戶' }, 404);
  }

  const currentCount = Number(countRows[0]?.count || 0);
  const limit = resource === 'members'
    ? (tenant.maxMembers || 100)
    : resource === 'employees'
    ? (tenant.maxEmployees || 10)
    : (tenant.maxBranches || 1);

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

/**
 * PATCH /api/tenant/settings
 * Update tenant settings (including branding)
 *
 * Request body can include:
 * - branding: TenantBranding configuration
 * - other settings as needed
 */
app.patch('/settings', async (c) => {
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ success: false, error: '無租戶上下文' }, 400);
  }

  try {
    const body = await c.req.json();
    const { branding, ...otherSettings } = body;

    // Fetch current tenant settings
    const [tenant] = await db
      .select(TENANT_SETTINGS_SELECT)
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return c.json({ success: false, error: '找不到租戶' }, 404);
    }

    const currentSettings = (tenant.settings || {}) as Record<string, unknown>;

    // Validate and merge branding if provided
    let newBranding: TenantBranding | undefined;
    if (branding) {
      const validationErrors = validateBranding(branding);
      if (validationErrors.length > 0) {
        return c.json({
          success: false,
          error: '品牌設定格式錯誤',
          details: validationErrors
        }, 400);
      }
      // Merge with existing branding or defaults
      const existingBranding = currentSettings.branding as Partial<TenantBranding> | undefined;
      newBranding = mergeBranding({ ...existingBranding, ...branding });
    }

    // Build new settings object
    const newSettings = {
      ...currentSettings,
      ...otherSettings,
      ...(newBranding && { branding: newBranding })
    };

    // Update tenant settings
    await db
      .update(tenants)
      .set({
        settings: newSettings,
        updatedAt: new Date()
      })
      .where(eq(tenants.id, tenantId));

    if (tenant.slug) {
      invalidateBrandingCache(tenant.slug);
    }

    return c.json({
      success: true,
      message: '設定已更新',
      data: { settings: newSettings }
    });
  } catch (error) {
    console.error('[Tenant API] Error updating settings:', error);
    return c.json({
      success: false,
      error: '更新設定失敗'
    }, 500);
  }
});

/**
 * GET /api/tenant/settings/branding
 * Get current tenant branding configuration
 */
app.get('/settings/branding', async (c) => {
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ success: false, error: '無租戶上下文' }, 400);
  }

  try {
    const [tenant] = await db
      .select(TENANT_BRANDING_SELECT)
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return c.json({ success: false, error: '找不到租戶' }, 404);
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const brandingData = settings.branding as Partial<TenantBranding> | undefined;
    const branding = mergeBranding(brandingData || {});

    return c.json({
      success: true,
      data: branding
    });
  } catch (error) {
    console.error('[Tenant API] Error fetching branding:', error);
    return c.json({
      success: false,
      error: '獲取品牌設定失敗'
    }, 500);
  }
});

export default app;
