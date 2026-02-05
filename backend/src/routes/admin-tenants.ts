import { Hono } from 'hono';
import { db, tenants, members, employees, branches } from '../db/index.js';
import { eq, count, sql, desc, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

// All routes require authentication (super admin only in production)
app.use('*', requireAuth);

/**
 * GET /api/admin/tenants
 * List all tenants with stats for admin dashboard
 */
app.get('/', async (c) => {
  try {
    // Get all tenants with their usage stats
    const tenantList = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        email: tenants.email,
        planType: tenants.planType,
        tenantStatus: tenants.tenantStatus,
        maxMembers: tenants.maxMembers,
        maxEmployees: tenants.maxEmployees,
        maxBranches: tenants.maxBranches,
        trialEndsAt: tenants.trialEndsAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(asc(tenants.name));

    // Get counts for each tenant
    const tenantsWithStats = await Promise.all(
      tenantList.map(async (tenant) => {
        const [memberCount, employeeCount, branchCount] = await Promise.all([
          db
            .select({ count: count() })
            .from(members)
            .where(eq(members.tenantId, tenant.id))
            .then(rows => Number(rows[0]?.count || 0)),
          db
            .select({ count: count() })
            .from(employees)
            .where(eq(employees.tenantId, tenant.id))
            .then(rows => Number(rows[0]?.count || 0)),
          db
            .select({ count: count() })
            .from(branches)
            .where(eq(branches.tenantId, tenant.id))
            .then(rows => Number(rows[0]?.count || 0)),
        ]);

        const maxMembers = tenant.maxMembers || 100;
        const maxEmployees = tenant.maxEmployees || 10;
        const maxBranches = tenant.maxBranches || 1;

        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          email: tenant.email || '',
          plan_type: tenant.planType || 'starter',
          tenant_status: tenant.tenantStatus || 'active',
          max_members: maxMembers,
          max_employees: maxEmployees,
          max_branches: maxBranches,
          current_members: memberCount,
          current_employees: employeeCount,
          current_branches: branchCount,
          members_usage_percent: Math.round((memberCount / maxMembers) * 100),
          employees_usage_percent: Math.round((employeeCount / maxEmployees) * 100),
          branches_usage_percent: Math.round((branchCount / maxBranches) * 100),
          active_contracts: 0, // TODO: Calculate active contracts
          trial_ends_at: tenant.trialEndsAt?.toISOString() || null,
          date_created: tenant.createdAt?.toISOString() || new Date().toISOString(),
        };
      })
    );

    // Calculate stats
    const totalTenants = tenantsWithStats.length;
    const activeTenants = tenantsWithStats.filter(t => t.tenant_status === 'active').length;
    const trialTenants = tenantsWithStats.filter(t => t.tenant_status === 'trial').length;
    const suspendedTenants = tenantsWithStats.filter(t => t.tenant_status === 'suspended').length;
    const tenantsAtRisk = tenantsWithStats.filter(t =>
      t.members_usage_percent >= 90 ||
      t.employees_usage_percent >= 90 ||
      t.branches_usage_percent >= 90
    ).length;
    const totalMembers = tenantsWithStats.reduce((sum, t) => sum + t.current_members, 0);
    const totalEmployees = tenantsWithStats.reduce((sum, t) => sum + t.current_employees, 0);
    const totalBranches = tenantsWithStats.reduce((sum, t) => sum + t.current_branches, 0);

    return c.json({
      success: true,
      stats: {
        totalTenants,
        activeTenants,
        trialTenants,
        suspendedTenants,
        tenantsAtRisk,
        totalMembers,
        totalEmployees,
        totalBranches,
      },
      tenants: tenantsWithStats,
    });
  } catch (error) {
    console.error('[Admin Tenants API] Error:', error);
    return c.json({
      success: false,
      error: '獲取租戶列表失敗',
    }, 500);
  }
});

/**
 * GET /api/admin/tenants/:id
 * Get a specific tenant's details
 */
app.get('/:id', async (c) => {
  const tenantId = c.req.param('id');

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return c.json({
        success: false,
        error: '找不到租戶',
      }, 404);
    }

    // Get usage counts
    const [memberCount, employeeCount, branchCount] = await Promise.all([
      db
        .select({ count: count() })
        .from(members)
        .where(eq(members.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0)),
      db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0)),
      db
        .select({ count: count() })
        .from(branches)
        .where(eq(branches.tenantId, tenantId))
        .then(rows => Number(rows[0]?.count || 0)),
    ]);

    return c.json({
      success: true,
      data: {
        ...tenant,
        usage: {
          members: memberCount,
          employees: employeeCount,
          branches: branchCount,
        },
      },
    });
  } catch (error) {
    console.error('[Admin Tenants API] Error:', error);
    return c.json({
      success: false,
      error: '獲取租戶詳情失敗',
    }, 500);
  }
});

export default app;
