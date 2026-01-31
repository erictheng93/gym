/**
 * Contract Logs Hooks
 * Handles contract log events: PAUSE, RESUME, CLASS_USED, TRANSFER, EXTEND
 * Migrated from Directus hooks
 */

import { db, contracts, contractLogs, members } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { calculateMemberStatus, addDays } from './utils.js';

type LogType = 'PAUSE' | 'RESUME' | 'CLASS_USED' | 'TRANSFER' | 'EXTEND';

interface ContractLogData {
  contractId: string;
  logType: LogType;
  daysAffected?: number;
  targetMemberId?: string;
  reason?: string;
  createdByEmployee?: string;
  tenantId?: string;
}

/**
 * Handle PAUSE log creation
 * - Extends contract end date by pause duration
 * - Sets contract status to PAUSED
 * - Creates an EXTEND log automatically
 */
export async function handlePauseLog(data: ContractLogData): Promise<void> {
  if (!data.contractId || !data.daysAffected) return;

  const [contract] = await db
    .select({
      id: contracts.id,
      endDate: contracts.endDate,
      contractStatus: contracts.contractStatus,
      memberId: contracts.memberId,
    })
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract || !contract.endDate) return;

  // Calculate new end date
  const currentEndDate = new Date(contract.endDate);
  const newEndDate = addDays(currentEndDate, data.daysAffected);

  // Update contract
  await db
    .update(contracts)
    .set({
      endDate: newEndDate.toISOString().split('T')[0],
      contractStatus: 'PAUSED',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  // Create automatic EXTEND log
  await db.insert(contractLogs).values({
    contractId: data.contractId,
    logType: 'EXTEND',
    endDate: newEndDate.toISOString().split('T')[0],
    daysAffected: data.daysAffected,
    reason: `因暫停自動展延 ${data.daysAffected} 天`,
    createdByEmployee: data.createdByEmployee,
    status: 'active',
    tenantId: data.tenantId,
  });

  // Update member status
  if (contract.memberId) {
    await updateMemberStatus(contract.memberId);
  }

  console.log(
    `[ContractLogHook] Contract ${data.contractId} extended by ${data.daysAffected} days due to PAUSE`
  );
}

/**
 * Handle RESUME log creation
 * - Sets contract status back to ACTIVE
 */
export async function handleResumeLog(data: ContractLogData): Promise<void> {
  if (!data.contractId) return;

  const [contract] = await db
    .select({ memberId: contracts.memberId })
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  await db
    .update(contracts)
    .set({
      contractStatus: 'ACTIVE',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  // Update member status
  if (contract?.memberId) {
    await updateMemberStatus(contract.memberId);
  }

  console.log(`[ContractLogHook] Contract ${data.contractId} resumed to ACTIVE`);
}

/**
 * Handle CLASS_USED log creation
 * - Deducts remaining counts from contract
 * - Expires contract if no remaining counts
 */
export async function handleClassUsedLog(data: ContractLogData): Promise<void> {
  if (!data.contractId) return;

  const [contract] = await db
    .select({
      id: contracts.id,
      remainingCounts: contracts.remainingCounts,
      memberId: contracts.memberId,
    })
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract || contract.remainingCounts === null) return;

  const currentCount = contract.remainingCounts || 0;
  if (currentCount <= 0) return;

  const newCount = currentCount - 1;

  // Update remaining counts
  await db
    .update(contracts)
    .set({
      remainingCounts: newCount,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  console.log(`[ContractLogHook] Class used: contract ${data.contractId} remaining ${newCount}`);

  // Check if contract should expire
  if (newCount === 0) {
    await db
      .update(contracts)
      .set({
        contractStatus: 'EXPIRED',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, data.contractId));

    // Update member status
    if (contract.memberId) {
      await updateMemberStatus(contract.memberId);
    }

    console.log(`[ContractLogHook] Contract ${data.contractId} expired (all classes used)`);
  }
}

/**
 * Handle TRANSFER log creation
 * - Transfers contract to new member
 * - Updates both original and target member status
 */
export async function handleTransferLog(data: ContractLogData): Promise<void> {
  if (!data.contractId || !data.targetMemberId) return;

  const [contract] = await db
    .select({
      id: contracts.id,
      memberId: contracts.memberId,
    })
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract) return;

  const originalMemberId = contract.memberId;

  // Transfer contract to new member
  await db
    .update(contracts)
    .set({
      memberId: data.targetMemberId,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  console.log(
    `[ContractLogHook] Contract ${data.contractId} transferred from ${originalMemberId} to ${data.targetMemberId}`
  );

  // Update original member status
  if (originalMemberId) {
    await updateMemberStatus(originalMemberId);
  }

  // Update target member status
  await updateMemberStatus(data.targetMemberId);
}

/**
 * Handle EXTEND log creation
 * - Extends contract end date
 */
export async function handleExtendLog(data: ContractLogData): Promise<void> {
  if (!data.contractId || !data.daysAffected) return;

  const [contract] = await db
    .select({
      id: contracts.id,
      endDate: contracts.endDate,
    })
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract || !contract.endDate) return;

  const currentEndDate = new Date(contract.endDate);
  const newEndDate = addDays(currentEndDate, data.daysAffected);

  await db
    .update(contracts)
    .set({
      endDate: newEndDate.toISOString().split('T')[0],
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  console.log(
    `[ContractLogHook] Contract ${data.contractId} extended by ${data.daysAffected} days`
  );
}

/**
 * Main handler for contract log creation
 * Dispatches to appropriate handler based on log type
 */
export async function onContractLogCreate(data: ContractLogData): Promise<void> {
  switch (data.logType) {
    case 'PAUSE':
      await handlePauseLog(data);
      break;
    case 'RESUME':
      await handleResumeLog(data);
      break;
    case 'CLASS_USED':
      await handleClassUsedLog(data);
      break;
    case 'TRANSFER':
      await handleTransferLog(data);
      break;
    case 'EXTEND':
      await handleExtendLog(data);
      break;
  }
}

/**
 * Helper function to update member status
 */
async function updateMemberStatus(memberId: string): Promise<void> {
  const memberContracts = await db
    .select({
      id: contracts.id,
      contractStatus: contracts.contractStatus,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.memberId, memberId),
        eq(contracts.status, 'active')
      )
    );

  const memberStatus = calculateMemberStatus(memberContracts);

  await db
    .update(members)
    .set({
      memberStatus,
      updatedAt: new Date(),
    })
    .where(eq(members.id, memberId));

  console.log(`[ContractLogHook] Member ${memberId} status updated to ${memberStatus}`);
}
