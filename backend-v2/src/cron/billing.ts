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
        dateUpdated: new Date(),
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

  for (const tenant of allTenants) {
    try {
      const [branchCount] = await db
        .select({ count: count() })
        .from(branches)
        .where(and(eq(branches.tenantId, tenant.id), eq(branches.status, 'active')));

      const tenantBranches = await db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.tenantId, tenant.id));

      const branchIds = tenantBranches.map(b => b.id);

      let memberCount = 0;
      let employeeCount = 0;
      let contractCount = 0;

      if (branchIds.length > 0) {
        const [mc] = await db
          .select({ count: count() })
          .from(members)
          .where(sql`${members.branchId} = ANY(${branchIds}) AND ${members.status} = 'active'`);
        memberCount = Number(mc?.count || 0);

        const [ec] = await db
          .select({ count: count() })
          .from(employees)
          .where(sql`${employees.branchId} = ANY(${branchIds}) AND ${employees.status} = 'active'`);
        employeeCount = Number(ec?.count || 0);

        const [cc] = await db
          .select({ count: count() })
          .from(contracts)
          .where(sql`${contracts.branchId} = ANY(${branchIds}) AND ${contracts.contractStatus} = 'ACTIVE'`);
        contractCount = Number(cc?.count || 0);
      }

      await db.insert(usageRecords).values({
        tenantId: tenant.id,
        recordDate: today,
        branchesCount: Number(branchCount?.count || 0),
        membersCount: memberCount,
        employeesCount: employeeCount,
        activeContractsCount: contractCount,
      }).onConflictDoUpdate({
        target: [usageRecords.tenantId, usageRecords.recordDate],
        set: {
          branchesCount: Number(branchCount?.count || 0),
          membersCount: memberCount,
          employeesCount: employeeCount,
          activeContractsCount: contractCount,
        },
      });
    } catch (error) {
      console.error(`[Billing] Failed to update usage for tenant ${tenant.id}:`, error);
    }
  }

  console.log(`[Billing] Updated usage records for ${allTenants.length} tenants`);
}
