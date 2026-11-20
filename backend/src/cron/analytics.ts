import { db, tenants, branches, members, contracts, payments, usageRecords } from '../db/index.js';
import { eq, and, sql, sum, count } from 'drizzle-orm';

const ANALYTICS_TENANTS_SELECT = {
  id: tenants.id,
  name: tenants.name,
};

const ANALYTICS_BRANCHES_SELECT = {
  id: branches.id,
};

const ANALYTICS_REVENUE_SELECT = {
  total: sum(payments.amount),
};

const ANALYTICS_COUNT_SELECT = {
  count: count(),
};

export async function runAnalyticsTasks() {
  console.log('[Analytics] Starting analytics tasks...');

  try {
    await generateDailySnapshot();
    console.log('[Analytics] Analytics tasks completed');
  } catch (error) {
    console.error('[Analytics] Error running analytics tasks:', error);
  }
}

async function generateDailySnapshot() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const allTenants = await db
    .select(ANALYTICS_TENANTS_SELECT)
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of allTenants) {
    try {
      const tenantBranches = await db
        .select(ANALYTICS_BRANCHES_SELECT)
        .from(branches)
        .where(eq(branches.tenantId, tenant.id));

      const branchIds = tenantBranches.map(b => b.id);

      if (branchIds.length === 0) continue;

      const [revenueResult] = await db
        .select(ANALYTICS_REVENUE_SELECT)
        .from(payments)
        .where(
          and(
            sql`${payments.branchId} = ANY(${branchIds})`,
            eq(payments.type, 'INCOME'),
            sql`DATE(${payments.paymentDate}) = ${yesterdayStr}`
          )
        );

      const dailyRevenue = Number(revenueResult?.total || 0);

      const [memberCount] = await db
        .select(ANALYTICS_COUNT_SELECT)
        .from(members)
        .where(sql`${members.branchId} = ANY(${branchIds}) AND ${members.status} = 'ACTIVE'`);

      const [contractCount] = await db
        .select(ANALYTICS_COUNT_SELECT)
        .from(contracts)
        .where(sql`${contracts.branchId} = ANY(${branchIds}) AND ${contracts.status} = 'ACTIVE'`);

      await db.insert(usageRecords).values({
        tenantId: tenant.id,
        recordDate: yesterdayStr,
        branchesCount: branchIds.length,
        membersCount: Number(memberCount?.count || 0),
        activeContractsCount: Number(contractCount?.count || 0),
        dailyRevenue: String(dailyRevenue),
      }).onConflictDoUpdate({
        target: [usageRecords.tenantId, usageRecords.recordDate],
        set: {
          branchesCount: branchIds.length,
          membersCount: Number(memberCount?.count || 0),
          activeContractsCount: Number(contractCount?.count || 0),
          dailyRevenue: String(dailyRevenue),
        },
      });

      console.log(`[Analytics] Snapshot generated for tenant ${tenant.name}: ${dailyRevenue} TWD`);
    } catch (error) {
      console.error(`[Analytics] Failed to generate snapshot for tenant ${tenant.id}:`, error);
    }
  }
}
