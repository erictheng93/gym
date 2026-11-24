import { Hono } from 'hono';
import { db, tenants, members, employees, branches } from '../db/index.js';
import { eq, count, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const TENANT_LIST_SELECT = {
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
};

const TENANT_DETAIL_SELECT = {
  id: tenants.id,
  status: tenants.status,
  createdAt: tenants.createdAt,
  updatedAt: tenants.updatedAt,
  name: tenants.name,
  slug: tenants.slug,
  email: tenants.email,
  phone: tenants.phone,
  planType: tenants.planType,
  maxBranches: tenants.maxBranches,
  maxMembers: tenants.maxMembers,
  maxEmployees: tenants.maxEmployees,
  maxStorageMb: tenants.maxStorageMb,
  tenantStatus: tenants.tenantStatus,
  trialEndsAt: tenants.trialEndsAt,
  billingCycle: tenants.billingCycle,
  nextBillingDate: tenants.nextBillingDate,
  monthlyPrice: tenants.monthlyPrice,
  settings: tenants.settings,
  createdBy: tenants.createdBy,
};

const MEMBER_TENANT_COUNT_SELECT = {
  tenantId: members.tenantId,
  count: count(),
};

const EMPLOYEE_TENANT_COUNT_SELECT = {
  tenantId: employees.tenantId,
  count: count(),
};

const BRANCH_TENANT_COUNT_SELECT = {
  tenantId: branches.tenantId,
  count: count(),
};

const COUNT_SELECT = {
  count: count(),
};

// All routes require authentication (super admin only in production)
app.use('*', requireAuth);

/**
 * GET /api/admin/tenants
 * List all tenants with stats for admin dashboard
 */
app.get('/', async (c) => {
  try {
    // Fetch all tenants and aggregated usage counts in parallel to eliminate N+1 queries
    const [tenantList, memberCounts, employeeCounts, branchCounts] = await Promise.all([
      db
        .select(TENANT_LIST_SELECT)
        .from(tenants)
        .orderBy(asc(tenants.name)),
      db
        .select(MEMBER_TENANT_COUNT_SELECT)
        .from(members)
        .groupBy(members.tenantId),
      db
        .select(EMPLOYEE_TENANT_COUNT_SELECT)
        .from(employees)
        .groupBy(employees.tenantId),
      db
        .select(BRANCH_TENANT_COUNT_SELECT)
        .from(branches)
        .groupBy(branches.tenantId),
    ]);

    const memberMap = new Map<string, number>();
    for (const row of memberCounts) {
      if (row.tenantId) memberMap.set(row.tenantId, Number(row.count || 0));
    }

    const employeeMap = new Map<string, number>();
    for (const row of employeeCounts) {
      if (row.tenantId) employeeMap.set(row.tenantId, Number(row.count || 0));
    }

    const branchMap = new Map<string, number>();
    for (const row of branchCounts) {
      if (row.tenantId) branchMap.set(row.tenantId, Number(row.count || 0));
    }

    // Map stats and compute aggregations in a single pass
    let activeTenants = 0;
    let trialTenants = 0;
    let suspendedTenants = 0;
    let tenantsAtRisk = 0;
    let totalMembers = 0;
    let totalEmployees = 0;
    let totalBranches = 0;

    const tenantsWithStats = new Array(tenantList.length);
    for (let i = 0; i < tenantList.length; i++) {
      const tenant = tenantList[i]!;
      const memberCount = memberMap.get(tenant.id) || 0;
      const employeeCount = employeeMap.get(tenant.id) || 0;
      const branchCount = branchMap.get(tenant.id) || 0;

      const maxMembers = tenant.maxMembers || 100;
      const maxEmployees = tenant.maxEmployees || 10;
      const maxBranches = tenant.maxBranches || 1;

      const membersUsagePercent = Math.round((memberCount / maxMembers) * 100);
      const employeesUsagePercent = Math.round((employeeCount / maxEmployees) * 100);
      const branchesUsagePercent = Math.round((branchCount / maxBranches) * 100);

      const status = tenant.tenantStatus || 'active';
      if (status === 'active') activeTenants++;
      else if (status === 'trial') trialTenants++;
      else if (status === 'suspended') suspendedTenants++;

      if (membersUsagePercent >= 90 || employeesUsagePercent >= 90 || branchesUsagePercent >= 90) {
        tenantsAtRisk++;
      }

      totalMembers += memberCount;
      totalEmployees += employeeCount;
      totalBranches += branchCount;

      tenantsWithStats[i] = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        email: tenant.email || '',
        plan_type: tenant.planType || 'starter',
        tenant_status: status,
        max_members: maxMembers,
        max_employees: maxEmployees,
        max_branches: maxBranches,
        current_members: memberCount,
        current_employees: employeeCount,
        current_branches: branchCount,
        members_usage_percent: membersUsagePercent,
        employees_usage_percent: employeesUsagePercent,
        branches_usage_percent: branchesUsagePercent,
        active_contracts: 0, // TODO: Calculate active contracts
        trial_ends_at: tenant.trialEndsAt?.toISOString() || null,
        date_created: tenant.createdAt?.toISOString() || new Date().toISOString(),
      };
    }

    const totalTenants = tenantsWithStats.length;

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
    // Fetch tenant and usage counts in parallel
    const [[tenant], memberRows, employeeRows, branchRows] = await Promise.all([
      db
        .select(TENANT_DETAIL_SELECT)
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
      return c.json({
        success: false,
        error: '找不到租戶',
      }, 404);
    }

    const memberCount = Number(memberRows[0]?.count || 0);
    const employeeCount = Number(employeeRows[0]?.count || 0);
    const branchCount = Number(branchRows[0]?.count || 0);

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
