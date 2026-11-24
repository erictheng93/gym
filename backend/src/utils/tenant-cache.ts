import { db, branches } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface TenantBranchInfo {
  id: string;
  name: string;
}

interface CacheEntry {
  branches: TenantBranchInfo[];
  branchIds: string[];
  expiresAt: number;
}

const TENANT_BRANCHES_SELECT = {
  id: branches.id,
  name: branches.name,
};

const BRANCH_TENANT_SELECT = {
  tenantId: branches.tenantId,
};

const tenantBranchesCache = new Map<string, CacheEntry>();
const branchTenantCache = new Map<string, { tenantId: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Retrieves the branches (id and name) for a tenant with in-memory caching.
 */
export async function getTenantBranches(tenantId: string): Promise<TenantBranchInfo[]> {
  const cached = tenantBranchesCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.branches;
  }

  const tenantBranches = await db
    .select(TENANT_BRANCHES_SELECT)
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);
  const now = Date.now();

  tenantBranchesCache.set(tenantId, {
    branches: tenantBranches,
    branchIds,
    expiresAt: now + CACHE_TTL_MS,
  });

  // Populate reverse lookup cache
  for (const b of tenantBranches) {
    branchTenantCache.set(b.id, {
      tenantId,
      expiresAt: now + CACHE_TTL_MS,
    });
  }

  return tenantBranches;
}

/**
 * Retrieves the branch IDs for a tenant.
 * Uses a short-lived in-memory cache to prevent repetitive database round-trips
 * across high-frequency endpoints (dashboard, reports, members, contracts, etc.).
 */
export async function getTenantBranchIds(tenantId: string): Promise<string[]> {
  const cached = tenantBranchesCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.branchIds;
  }

  const tenantBranches = await getTenantBranches(tenantId);
  return tenantBranches.map(b => b.id);
}

/**
 * Retrieves the tenant ID for a specific branch with in-memory caching.
 */
export async function getTenantIdForBranch(branchId: string): Promise<string | null> {
  const cached = branchTenantCache.get(branchId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenantId;
  }

  try {
    const [branch] = await db
      .select(BRANCH_TENANT_SELECT)
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);

    const tenantId = branch?.tenantId || null;
    branchTenantCache.set(branchId, {
      tenantId,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return tenantId;
  } catch {
    return null;
  }
}

/**
 * Invalidates the tenant branch cache, either for a specific tenant or globally.
 * Should be called whenever branches are created, updated, or deleted.
 */
export function invalidateTenantBranchesCache(tenantId?: string): void {
  if (tenantId) {
    tenantBranchesCache.delete(tenantId);
  } else {
    tenantBranchesCache.clear();
  }
  branchTenantCache.clear();
}

export const clearTenantCache = invalidateTenantBranchesCache;
