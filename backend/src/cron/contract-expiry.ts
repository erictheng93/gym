import { db, contracts, members, branches, notifications } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { emailService } from '../services/email.js';

export async function runContractExpiryCheck() {
  console.log('[ContractExpiry] Starting contract expiry check...');

  try {
    await checkExpiringContracts(7);
    await checkExpiringContracts(3);
    await checkExpiringContracts(1);
    console.log('[ContractExpiry] Contract expiry check completed');
  } catch (error) {
    console.error('[ContractExpiry] Error running contract expiry check:', error);
  }
}

async function checkExpiringContracts(daysAhead: number) {
  const today = new Date();
  const targetDate = new Date();
  targetDate.setDate(today.getDate() + daysAhead);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  const expiringContracts = await db
    .select({
      contract: contracts,
      member: {
        id: members.id,
        fullName: members.fullName,
        email: members.email,
        phone: members.phone,
      },
      branch: {
        id: branches.id,
        name: branches.name,
        tenantId: branches.tenantId,
      },
    })
    .from(contracts)
    .innerJoin(members, eq(contracts.memberId, members.id))
    .innerJoin(branches, eq(contracts.branchId, branches.id))
    .where(
      and(
        eq(contracts.status, 'ACTIVE'),
        eq(contracts.endDate, targetDateStr)
      )
    );

  console.log(`[ContractExpiry] Found ${expiringContracts.length} contracts expiring in ${daysAhead} day(s)`);

  for (const { contract, member, branch } of expiringContracts) {
    try {
      const existingNotification = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.referenceId, contract.id),
            eq(notifications.notificationType, `expiring_${daysAhead}d`)
          )
        )
        .limit(1);

      if (existingNotification.length > 0) {
        continue;
      }

      await db.insert(notifications).values({
        notificationType: `expiring_${daysAhead}d`,
        title: `會籍即將到期 - ${daysAhead} 天`,
        message: `會員 ${member.fullName} 的合約 ${contract.contractNo} 將於 ${contract.endDate} 到期`,
        referenceType: 'contract_expiration',
        referenceId: contract.id,
        branchId: branch.id,
      });

      if (member.email) {
        await emailService.sendContractExpiry(
          member.email,
          member.fullName,
          contract.contractNo || '',
          contract.endDate || '',
          daysAhead
        );
      }

      console.log(`[ContractExpiry] Notified ${member.fullName} about contract expiring in ${daysAhead} day(s)`);
    } catch (error) {
      console.error(`[ContractExpiry] Failed to notify for contract ${contract.id}:`, error);
    }
  }
}
