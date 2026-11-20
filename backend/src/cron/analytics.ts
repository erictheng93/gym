import { db, tenants, branches, members, contracts, payments, usageRecords } from '../db/index.js';
import { eq, and, sql, sum, count, gte, lte } from 'drizzle-orm';

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

  const yesterdayStart = new Date(yesterdayStr + 'T00:00:00.000Z');
  const yesterdayEnd = new Date(yesterdayStr + 'T23:59:59.999Z');

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

      // Execute metrics in parallel with sargable date range filter
      const [revenueResult, memberCountResult, contractCountResult] = await Promise.all([
        db
          .select({ total: sum(payments.amount) })
          .from(payments)
          .where(
            and(
              sql`${payments.branchId} = ANY(${branchIds})`,
              eq(payments.type, 'INCOME'),
              gte(payments.paymentDate, yesterdayStart),
              lte(payments.paymentDate, yesterdayEnd)
            )
          ),
        db
          .select({ count: count() })
          .from(members)
          .where(sql`${members.branchId} = ANY(${branchIds}) AND ${members.status} = 'ACTIVE'`),
        db
          .select({ count: count() })
          .from(contracts)
          .where(sql`${contracts.branchId} = ANY(${branchIds}) AND ${contracts.status} = 'ACTIVE'`),
      ]);

      const [revenueRow] = revenueResult;
      const dailyRevenue = Number(revenueRow?.total || 0);
      const [memberCount] = memberCountResult;
      const [contractCount] = contractCountResult;

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
