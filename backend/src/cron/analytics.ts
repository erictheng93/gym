import { db, tenants, branches, members, contracts, payments, usageRecords } from '../db/index.js';
import { eq, and, gte, lt, sql, sum, count } from 'drizzle-orm';

const ANALYTICS_TENANTS_SELECT = {
  id: tenants.id,
  name: tenants.name,
};

const ANALYTICS_BRANCH_AGG_SELECT = {
  tenantId: branches.tenantId,
  count: count(),
};

const ANALYTICS_REVENUE_AGG_SELECT = {
  tenantId: branches.tenantId,
  total: sum(payments.amount),
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

  if (allTenants.length === 0) return;

  // Batch aggregate branch, revenue, member, and contract counts across all tenants in 4 parallel queries
  const [branchAgg, revenueAgg, memberAgg, contractAgg] = await Promise.all([
    db
      .select(ANALYTICS_BRANCH_AGG_SELECT)
      .from(branches)
      .groupBy(branches.tenantId),
    db
      .select(ANALYTICS_REVENUE_AGG_SELECT)
      .from(payments)
      .innerJoin(branches, eq(payments.branchId, branches.id))
      .where(
        and(
          eq(payments.type, 'INCOME'),
          eq(payments.status, 'COMPLETED'),
          // Half-open [day, day+1) range, sargable. date -> timestamptz casts at
          // midnight in the DB session time zone, the same zone DATE() used.
          gte(payments.paymentDate, sql`${yesterdayStr}::date`),
          lt(payments.paymentDate, sql`(${yesterdayStr}::date + 1)`)
        )
      )
      .groupBy(branches.tenantId),
    db
      .select(ANALYTICS_BRANCH_AGG_SELECT)
      .from(members)
      .innerJoin(branches, eq(members.branchId, branches.id))
      .where(eq(members.status, 'ACTIVE'))
      .groupBy(branches.tenantId),
    db
      .select(ANALYTICS_BRANCH_AGG_SELECT)
      .from(contracts)
      .innerJoin(branches, eq(contracts.branchId, branches.id))
      .where(eq(contracts.status, 'ACTIVE'))
      .groupBy(branches.tenantId),
  ]);

  const branchCountMap = new Map<string, number>();
  for (const row of branchAgg) {
    if (row.tenantId) branchCountMap.set(row.tenantId, Number(row.count));
  }

  const dailyRevenueMap = new Map<string, number>();
  for (const row of revenueAgg) {
    if (row.tenantId) dailyRevenueMap.set(row.tenantId, Number(row.total || 0));
  }

  const memberCountMap = new Map<string, number>();
  for (const row of memberAgg) {
    if (row.tenantId) memberCountMap.set(row.tenantId, Number(row.count));
  }

  const contractCountMap = new Map<string, number>();
  for (const row of contractAgg) {
    if (row.tenantId) contractCountMap.set(row.tenantId, Number(row.count));
  }

  for (const tenant of allTenants) {
    const branchesCount = branchCountMap.get(tenant.id) || 0;
    if (branchesCount === 0) continue;

    const dailyRevenue = dailyRevenueMap.get(tenant.id) || 0;
    const membersCount = memberCountMap.get(tenant.id) || 0;
    const activeContractsCount = contractCountMap.get(tenant.id) || 0;

    try {
      await db.insert(usageRecords).values({
        tenantId: tenant.id,
        recordDate: yesterdayStr,
        branchesCount,
        membersCount,
        activeContractsCount,
        dailyRevenue: String(dailyRevenue),
      }).onConflictDoUpdate({
        target: [usageRecords.tenantId, usageRecords.recordDate],
        set: {
          branchesCount,
          membersCount,
          activeContractsCount,
          dailyRevenue: String(dailyRevenue),
        },
      });

      console.log(`[Analytics] Snapshot generated for tenant ${tenant.name}: ${dailyRevenue} TWD`);
    } catch (error) {
      console.error(`[Analytics] Failed to generate snapshot for tenant ${tenant.id}:`, error);
    }
  }
}
