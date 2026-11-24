/**
 * Contract Logs Hooks
 * Handles contract log events: PAUSE, RESUME, CLASS_USED, TRANSFER, EXTEND
 */

import { db, contracts, contractLogs, members } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { calculateMemberStatus, addDays } from './utils.js';

type LogType = 'PAUSE' | 'RESUME' | 'CLASS_USED' | 'TRANSFER' | 'EXTEND';

const CONTRACT_LOG_PAUSE_SELECT = {
  id: contracts.id,
  endDate: contracts.endDate,
  startDate: contracts.startDate,
  status: contracts.status,
  memberId: contracts.memberId,
} as const;

const CONTRACT_LOG_MEMBER_ID_SELECT = {
  memberId: contracts.memberId,
} as const;

const CONTRACT_LOG_CLASS_USED_SELECT = {
  id: contracts.id,
  remainingCounts: contracts.remainingCounts,
  memberId: contracts.memberId,
} as const;

const CONTRACT_LOG_TRANSFER_SELECT = {
  id: contracts.id,
  memberId: contracts.memberId,
} as const;

const CONTRACT_LOG_EXTEND_SELECT = {
  id: contracts.id,
  endDate: contracts.endDate,
} as const;

const CONTRACT_LOG_STATUS_SELECT = {
  id: contracts.id,
  status: contracts.status,
} as const;

interface ContractLogData {
  contractId: string;
  logType: LogType;
  days?: number;
  targetMemberId?: string;
  reason?: string;
  createdBy?: string;
  tenantId?: string;
}

/**
 * Handle PAUSE log creation
 * - Extends contract end date by pause duration
 * - Sets contract status to PAUSED
 * - Creates an EXTEND log automatically
 */
export async function handlePauseLog(data: ContractLogData): Promise<void> {
  if (!data.contractId || !data.days) return;

  const [contract] = await db
    .select(CONTRACT_LOG_PAUSE_SELECT)
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract || !contract.endDate) return;

  // Calculate new end date
  const currentEndDate = new Date(contract.endDate);
  const newEndDate = addDays(currentEndDate, data.days);
  const today = new Date().toISOString().slice(0, 10);

  // Update contract
  await db
    .update(contracts)
    .set({
      endDate: newEndDate.toISOString().slice(0, 10),
      status: 'PAUSED',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  // Create automatic EXTEND log
  await db.insert(contractLogs).values({
    contractId: data.contractId,
    logType: 'EXTEND',
    startDate: today,
    endDate: newEndDate.toISOString().slice(0, 10),
    daysAffected: data.days,
    reason: `因暫停自動展延 ${data.days} 天`,
    createdByEmployee: data.createdBy,
    tenantId: data.tenantId,
  });

  // Update member status
  if (contract.memberId) {
    await updateMemberStatus(contract.memberId);
  }

  console.log(
    `[ContractLogHook] Contract ${data.contractId} extended by ${data.days} days due to PAUSE`
  );
}

/**
 * Handle RESUME log creation
 * - Sets contract status back to ACTIVE
 */
export async function handleResumeLog(data: ContractLogData): Promise<void> {
  if (!data.contractId) return;

  const [contract] = await db
    .select(CONTRACT_LOG_MEMBER_ID_SELECT)
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  await db
    .update(contracts)
    .set({
      status: 'ACTIVE',
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
    .select(CONTRACT_LOG_CLASS_USED_SELECT)
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
        status: 'EXPIRED',
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
    .select(CONTRACT_LOG_TRANSFER_SELECT)
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

  // Update member statuses concurrently
  if (originalMemberId) {
    await Promise.all([
      updateMemberStatus(originalMemberId),
      updateMemberStatus(data.targetMemberId),
    ]);
  } else {
    await updateMemberStatus(data.targetMemberId);
  }
}

/**
 * Handle EXTEND log creation
 * - Extends contract end date
 */
export async function handleExtendLog(data: ContractLogData): Promise<void> {
  if (!data.contractId || !data.days) return;

  const [contract] = await db
    .select(CONTRACT_LOG_EXTEND_SELECT)
    .from(contracts)
    .where(eq(contracts.id, data.contractId));

  if (!contract || !contract.endDate) return;

  const currentEndDate = new Date(contract.endDate);
  const newEndDate = addDays(currentEndDate, data.days);

  await db
    .update(contracts)
    .set({
      endDate: newEndDate.toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, data.contractId));

  console.log(
    `[ContractLogHook] Contract ${data.contractId} extended by ${data.days} days`
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
    .select(CONTRACT_LOG_STATUS_SELECT)
    .from(contracts)
    .where(eq(contracts.memberId, memberId));

  const newStatus = calculateMemberStatus(memberContracts);

  await db
    .update(members)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(members.id, memberId));

  console.log(`[ContractLogHook] Member ${memberId} status updated to ${newStatus}`);
}
