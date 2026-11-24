import { db, tenants, subscriptions, invoices, usageRecords, branches, members, employees, contracts } from '../db/index.js';
import { eq, and, lte, sql, count } from 'drizzle-orm';

const CRON_DUE_SUBSCRIPTIONS_SELECT = {
  id: subscriptions.id,
  tenantId: subscriptions.tenantId,
  planType: subscriptions.planType,
  status: subscriptions.status,
  billingCycle: subscriptions.billingCycle,
  monthlyPrice: subscriptions.monthlyPrice,
  yearlyPrice: subscriptions.yearlyPrice,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
};

const CRON_TENANT_NAME_SELECT = {
  id: tenants.id,
  name: tenants.name,
};

const CRON_TENANT_ID_SELECT = {
  id: tenants.id,
};

const CRON_BRANCH_ID_SELECT = {
  id: branches.id,
};

const CRON_COUNT_SELECT = {
  count: count(),
};

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
  const todayStr = today.toISOString().slice(0, 10);

  const dueSubs = await db
    .select(CRON_DUE_SUBSCRIPTIONS_SELECT)
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
        .select(CRON_TENANT_NAME_SELECT)
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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        lineItems: [
          {
            description: `${tenant.name} - ${sub.planType} Plan (${sub.billingCycle})`,
            amount,
            quantity: 1,
          },
        ],
      });

      await db.update(subscriptions).set({
        currentPeriodStart: periodStart.toISOString().slice(0, 10),
        currentPeriodEnd: periodEnd.toISOString().slice(0, 10),
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      console.log(`[Billing] Generated invoice for tenant ${tenant.name}`);
    } catch (error) {
      console.error(`[Billing] Failed to generate invoice for subscription ${sub.id}:`, error);
    }
  }
}

async function updateUsageRecords() {
  const today = new Date().toISOString().slice(0, 10);

  const allTenants = await db
    .select(CRON_TENANT_ID_SELECT)
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of allTenants) {
    try {
      const [branchCount] = await db
        .select(CRON_COUNT_SELECT)
        .from(branches)
        .where(and(eq(branches.tenantId, tenant.id), eq(branches.status, 'active')));

      const tenantBranches = await db
        .select(CRON_BRANCH_ID_SELECT)
        .from(branches)
        .where(eq(branches.tenantId, tenant.id));

      const branchIds = tenantBranches.map(b => b.id);

      let memberCount = 0;
      let employeeCount = 0;
      let contractCount = 0;

      if (branchIds.length > 0) {
        const [mc] = await db
          .select(CRON_COUNT_SELECT)
          .from(members)
          .where(sql`${members.branchId} = ANY(${branchIds}) AND ${members.status} = 'ACTIVE'`);
        memberCount = Number(mc?.count || 0);

        const [ec] = await db
          .select(CRON_COUNT_SELECT)
          .from(employees)
          .where(sql`${employees.branchId} = ANY(${branchIds}) AND ${employees.status} = 'ACTIVE'`);
        employeeCount = Number(ec?.count || 0);

        const [cc] = await db
          .select(CRON_COUNT_SELECT)
          .from(contracts)
          .where(sql`${contracts.branchId} = ANY(${branchIds}) AND ${contracts.status} = 'ACTIVE'`);
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
