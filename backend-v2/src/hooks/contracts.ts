/**
 * Contracts Hooks
 * Handles contract status changes and member status synchronization
 */

import { db, contracts, members } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { calculateMemberStatus } from './utils.js';

/**
 * Sync member status when contract status changes
 * Called after contract create/update operations
 */
export async function syncMemberStatusOnContractChange(memberId: string): Promise<void> {
  if (!memberId) return;

  try {
    // Get all active contracts for this member
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

    // Calculate new member status
    const memberStatus = calculateMemberStatus(memberContracts);

    // Update member status
    await db
      .update(members)
      .set({
        memberStatus,
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberId));

    console.log(`[ContractHook] Member ${memberId} status updated to ${memberStatus}`);
  } catch (error) {
    console.error('[ContractHook] Error syncing member status:', error);
    throw error;
  }
}

/**
 * Handle contract creation hook
 * - Updates member status
 */
export async function onContractCreate(contractId: string, memberId: string): Promise<void> {
  await syncMemberStatusOnContractChange(memberId);
}

/**
 * Handle contract update hook
 * - Updates member status if contract_status changed
 */
export async function onContractUpdate(
  contractId: string,
  memberId: string,
  contractStatusChanged: boolean
): Promise<void> {
  if (contractStatusChanged) {
    await syncMemberStatusOnContractChange(memberId);
  }
}

/**
 * Activate a contract
 * Sets status to ACTIVE and syncs member status
 */
export async function activateContract(contractId: string): Promise<void> {
  const [contract] = await db
    .select({ memberId: contracts.memberId })
    .from(contracts)
    .where(eq(contracts.id, contractId));

  if (!contract) {
    throw new Error('Contract not found');
  }

  await db
    .update(contracts)
    .set({
      contractStatus: 'ACTIVE',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  await syncMemberStatusOnContractChange(contract.memberId);
}

/**
 * Expire a contract
 * Sets status to EXPIRED and syncs member status
 */
export async function expireContract(contractId: string): Promise<void> {
  const [contract] = await db
    .select({ memberId: contracts.memberId })
    .from(contracts)
    .where(eq(contracts.id, contractId));

  if (!contract) {
    throw new Error('Contract not found');
  }

  await db
    .update(contracts)
    .set({
      contractStatus: 'EXPIRED',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  await syncMemberStatusOnContractChange(contract.memberId);
}

/**
 * Cancel a contract
 * Sets status to CANCELLED and syncs member status
 */
export async function cancelContract(contractId: string): Promise<void> {
  const [contract] = await db
    .select({ memberId: contracts.memberId })
    .from(contracts)
    .where(eq(contracts.id, contractId));

  if (!contract) {
    throw new Error('Contract not found');
  }

  await db
    .update(contracts)
    .set({
      contractStatus: 'CANCELLED',
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  await syncMemberStatusOnContractChange(contract.memberId);
}
