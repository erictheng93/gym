import { db, tenants, subscriptions, invoices, usageRecords, branches, members, employees, contracts } from '../db/index.js';
import { eq, and, lte, sql, count } from 'drizzle-orm';

export async function runBillingTasks() {
  console.log('[Billing] Starting billing tasks...');

  try {
    await generateMonthlyInvoices();
    await updateUsageRecords();
    console.log('[Billing] Billing tasks completed');
  } catch (error) {
    console.error('[Billing] Error running billing tasks:', error);
  }
}

async function generateMonthlyInvoices() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const dueSubs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, 'active'),
        lte(subscriptions.currentPeriodEnd, todayStr)
      )
    );

  for (const sub of dueSubs) {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, sub.tenantId))
        .limit(1);

      if (!tenant) continue;

      const amount = sub.billingCycle === 'yearly'
        ? Number(sub.yearlyPrice || 0)
        : Number(sub.monthlyPrice || 0);

      const periodStart = new Date(sub.currentPeriodEnd);
      const periodEnd = new Date(periodStart);

      if (sub.billingCycle === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const invoiceNumber = `INV-${year}${month}-${sub.tenantId.substring(0, 8)}-${Date.now()}`;

      await db.insert(invoices).values({
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        invoiceNumber,
        amountSubtotal: String(amount),
        amountTax: '0',
        amountTotal: String(amount),
        currency: 'TWD',
        status: 'open',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        lineItems: [
          {
            description: `${tenant.name} - ${sub.planType} Plan (${sub.billingCycle})`,
            amount,
            quantity: 1,
          },
        ],
      });

      await db.update(subscriptions).set({
        currentPeriodStart: periodStart.toISOString().split('T')[0],
        currentPeriodEnd: periodEnd.toISOString().split('T')[0],
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      console.log(`[Billing] Generated invoice for tenant ${tenant.name}`);
    } catch (error) {
      console.error(`[Billing] Failed to generate invoice for subscription ${sub.id}:`, error);
    }
  }
}

async function updateUsageRecords() {
  const today = new Date().toISOString().split('T')[0];

  const allTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  if (allTenants.length === 0) {
    console.log('[Billing] No active tenants to update usage records');
    return;
  }

  try {
    // Run all 4 count aggregations concurrently in batch (O(1) queries instead of 5N)
    const [branchCounts, memberCounts, employeeCounts, contractCounts] = await Promise.all([
      db
        .select({
          tenantId: branches.tenantId,
          count: count(),
        })
        .from(branches)
        .where(eq(branches.status, 'active'))
        .groupBy(branches.tenantId),
      db
        .select({
          tenantId: branches.tenantId,
          count: count(),
        })
        .from(members)
        .innerJoin(branches, eq(members.branchId, branches.id))
        .where(eq(members.status, 'ACTIVE'))
        .groupBy(branches.tenantId),
      db
        .select({
          tenantId: branches.tenantId,
          count: count(),
        })
        .from(employees)
        .innerJoin(branches, eq(employees.branchId, branches.id))
        .where(eq(employees.status, 'ACTIVE'))
        .groupBy(branches.tenantId),
      db
        .select({
          tenantId: branches.tenantId,
          count: count(),
        })
        .from(contracts)
        .innerJoin(branches, eq(contracts.branchId, branches.id))
        .where(eq(contracts.status, 'ACTIVE'))
        .groupBy(branches.tenantId),
    ]);

    const branchMap = new Map<string, number>();
    for (const r of branchCounts) {
      if (r.tenantId) branchMap.set(r.tenantId, Number(r.count || 0));
    }

    const memberMap = new Map<string, number>();
    for (const r of memberCounts) {
      if (r.tenantId) memberMap.set(r.tenantId, Number(r.count || 0));
    }

    const employeeMap = new Map<string, number>();
    for (const r of employeeCounts) {
      if (r.tenantId) employeeMap.set(r.tenantId, Number(r.count || 0));
    }

    const contractMap = new Map<string, number>();
    for (const r of contractCounts) {
      if (r.tenantId) contractMap.set(r.tenantId, Number(r.count || 0));
    }

    const usageValues = allTenants.map((tenant) => ({
      tenantId: tenant.id,
      recordDate: today,
      branchesCount: branchMap.get(tenant.id) || 0,
      membersCount: memberMap.get(tenant.id) || 0,
      employeesCount: employeeMap.get(tenant.id) || 0,
      activeContractsCount: contractMap.get(tenant.id) || 0,
    }));

    // Batch upsert in chunks of 100
    for (let i = 0; i < usageValues.length; i += 100) {
      const chunk = usageValues.slice(i, i + 100);
      await db.insert(usageRecords).values(chunk).onConflictDoUpdate({
        target: [usageRecords.tenantId, usageRecords.recordDate],
        set: {
          branchesCount: sql`excluded.branches_count`,
          membersCount: sql`excluded.members_count`,
          employeesCount: sql`excluded.employees_count`,
          activeContractsCount: sql`excluded.active_contracts_count`,
        },
      });
    }

    console.log(`[Billing] Updated usage records for ${allTenants.length} tenants`);
  } catch (error) {
    console.error('[Billing] Failed to batch update usage records:', error);
  }
}
