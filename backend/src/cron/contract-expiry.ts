import { db, contracts, members, branches, notifications } from '../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { emailService } from '../services/email.js';

const CRON_EXPIRING_CONTRACT_JOIN_SELECT = {
  contract: {
    id: contracts.id,
    contractNo: contracts.contractNo,
    endDate: contracts.endDate,
  },
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
};

const CRON_NOTIFICATION_REF_SELECT = {
  referenceId: notifications.referenceId,
};

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
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  const expiringContracts = await db
    .select(CRON_EXPIRING_CONTRACT_JOIN_SELECT)
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

  if (expiringContracts.length === 0) return;

  const contractIds = expiringContracts.map(c => c.contract.id);

  // Batch query all existing notifications for these contracts in 1 query
  const existingNotifications = await db
    .select(CRON_NOTIFICATION_REF_SELECT)
    .from(notifications)
    .where(
      and(
        inArray(notifications.referenceId, contractIds),
        eq(notifications.notificationType, `expiring_${daysAhead}d`)
      )
    );

  const notifiedContractIds = new Set(existingNotifications.map(n => n.referenceId).filter(Boolean));

  for (const { contract, member, branch } of expiringContracts) {
    try {
      if (notifiedContractIds.has(contract.id)) {
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
