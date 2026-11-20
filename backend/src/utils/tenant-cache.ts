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

const tenantBranchesCache = new Map<string, CacheEntry>();
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
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  const branchIds = tenantBranches.map(b => b.id);

  tenantBranchesCache.set(tenantId, {
    branches: tenantBranches,
    branchIds,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

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
 * Invalidates the tenant branch cache, either for a specific tenant or globally.
 * Should be called whenever branches are created, updated, or deleted.
 */
export function invalidateTenantBranchesCache(tenantId?: string): void {
  if (tenantId) {
    tenantBranchesCache.delete(tenantId);
  } else {
    tenantBranchesCache.clear();
  }
}

export const clearTenantCache = invalidateTenantBranchesCache;
