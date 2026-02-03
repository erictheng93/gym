import { db, tenants, branches, members, contracts, payments, usageRecords } from '../db/index.js';
import { eq, and, sql, sum, count } from 'drizzle-orm';

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
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const allTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of allTenants) {
    try {
      const tenantBranches = await db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.tenantId, tenant.id));

      const branchIds = tenantBranches.map(b => b.id);

      if (branchIds.length === 0) continue;

      const [revenueResult] = await db
        .select({ total: sum(payments.amount) })
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
        .select({ count: count() })
        .from(members)
        .where(sql`${members.branchId} = ANY(${branchIds}) AND ${members.status} = 'ACTIVE'`);

      const [contractCount] = await db
        .select({ count: count() })
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
