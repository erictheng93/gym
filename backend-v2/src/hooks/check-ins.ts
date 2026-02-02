/**
 * Check-ins Hooks
 * Handles member check-in validation and session deduction
 */

import { db, contracts, members, membershipPlans, memberCheckIns } from '../db/index.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { syncMemberStatusOnContractChange } from './contracts.js';

interface CheckInData {
  memberId: string;
  branchId: string;
  checkInType?: string;
  checkTime?: string;
}

interface CheckInValidationResult {
  valid: boolean;
  error?: string;
  member?: {
    id: string;
    fullName: string;
    memberStatus: string;
    branchId: string;
  };
  contract?: {
    id: string;
    contractStatus: string;
    remainingCounts: number | null;
    planType: string;
    endDate: string | null;
  };
  isCrossBranch: boolean;
}

/**
 * Validate member check-in
 * - Checks if member exists and is active
 * - Checks if member has valid contract
 * - Determines if cross-branch entry
 */
export async function validateCheckIn(data: CheckInData): Promise<CheckInValidationResult> {
  const today = new Date().toISOString().split('T')[0];

  // Get member info
  const [member] = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      memberStatus: members.memberStatus,
      branchId: members.branchId,
    })
    .from(members)
    .where(eq(members.id, data.memberId));

  if (!member) {
    return {
      valid: false,
      error: '會員不存在',
      isCrossBranch: false,
    };
  }

  if (member.memberStatus !== 'ACTIVE') {
    return {
      valid: false,
      error: `會員 ${member.fullName} 狀態為 ${member.memberStatus}，無法入場`,
      isCrossBranch: false,
    };
  }

  // Get active contract with plan info
  const validContracts = await db
    .select({
      id: contracts.id,
      contractStatus: contracts.contractStatus,
      remainingCounts: contracts.remainingCounts,
      endDate: contracts.endDate,
      planType: membershipPlans.planType,
    })
    .from(contracts)
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(
      and(
        eq(contracts.memberId, data.memberId),
        eq(contracts.contractStatus, 'ACTIVE'),
        eq(contracts.status, 'active'),
        lte(contracts.startDate, today),
        gte(contracts.endDate, today)
      )
    )
    .limit(1);

  if (validContracts.length === 0) {
    return {
      valid: false,
      error: `會員 ${member.fullName} 沒有有效合約，無法入場`,
      isCrossBranch: false,
    };
  }

  const contract = validContracts[0];

  // Check if COUNT_BASED contract has remaining sessions
  if (contract.planType === 'COUNT_BASED') {
    const remainingCounts = contract.remainingCounts || 0;
    if (remainingCounts <= 0) {
      return {
        valid: false,
        error: `會員 ${member.fullName} 的課程次數已用完，無法入場`,
        isCrossBranch: false,
      };
    }
  }

  // Check if cross-branch entry
  const isCrossBranch = data.branchId !== member.branchId;

  return {
    valid: true,
    member: {
      id: member.id,
      fullName: member.fullName,
      memberStatus: member.memberStatus,
      branchId: member.branchId,
    },
    contract: {
      id: contract.id,
      contractStatus: contract.contractStatus,
      remainingCounts: contract.remainingCounts,
      planType: contract.planType || 'TIME_BASED',
      endDate: contract.endDate,
    },
    isCrossBranch,
  };
}

/**
 * Deduct session count for COUNT_BASED contracts
 * Called after check-in is created
 */
export async function deductSessionCount(contractId: string): Promise<{
  success: boolean;
  remaining: number | null;
  contractExpired: boolean;
}> {
  try {
    // First try to use atomic SQL function if available
    try {
      const result = await db.execute(
        sql`SELECT * FROM deduct_contract_count(${contractId}::uuid, 1)`
      );
      const row = (result as any)[0];
      if (row?.success) {
        console.log(
          `[CheckInHook] Session deducted: contract ${contractId} remaining ${row.remaining} (atomic)`
        );
        return {
          success: true,
          remaining: row.remaining,
          contractExpired: row.contract_status === 'EXPIRED',
        };
      }
    } catch {
      // Atomic function not available, use fallback
    }

    // Fallback: Manual deduction
    const [contract] = await db
      .select({
        id: contracts.id,
        remainingCounts: contracts.remainingCounts,
        memberId: contracts.memberId,
      })
      .from(contracts)
      .where(eq(contracts.id, contractId));

    if (!contract || contract.remainingCounts === null) {
      return { success: false, remaining: null, contractExpired: false };
    }

    const currentCount = contract.remainingCounts || 0;
    if (currentCount <= 0) {
      return { success: false, remaining: 0, contractExpired: true };
    }

    const newCount = currentCount - 1;

    // Update contract
    await db
      .update(contracts)
      .set({
        remainingCounts: newCount,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, contractId));

    console.log(
      `[CheckInHook] Session deducted: contract ${contractId} remaining ${newCount} (fallback)`
    );

    // Check if contract should expire
    if (newCount === 0) {
      await db
        .update(contracts)
        .set({
          contractStatus: 'EXPIRED',
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, contractId));

      console.log(`[CheckInHook] Contract ${contractId} expired (no remaining counts)`);

      // Update member status
      if (contract.memberId) {
        await syncMemberStatusOnContractChange(contract.memberId);
      }

      return { success: true, remaining: 0, contractExpired: true };
    }

    return { success: true, remaining: newCount, contractExpired: false };
  } catch (error) {
    console.error('[CheckInHook] Error deducting session count:', error);
    throw error;
  }
}

/**
 * Check if member already checked in today
 */
export async function hasCheckedInToday(memberId: string, branchId: string): Promise<{
  alreadyCheckedIn: boolean;
  checkIn?: {
    id: string;
    checkTime: Date;
  };
}> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const existingCheckIns = await db
    .select({
      id: memberCheckIns.id,
      checkTime: memberCheckIns.checkInTime,
    })
    .from(memberCheckIns)
    .where(
      and(
        eq(memberCheckIns.memberId, memberId),
        eq(memberCheckIns.branchId, branchId),
        gte(memberCheckIns.checkInTime, startOfDay),
        lte(memberCheckIns.checkInTime, endOfDay)
      )
    )
    .limit(1);

  if (existingCheckIns.length > 0) {
    return {
      alreadyCheckedIn: true,
      checkIn: {
        id: existingCheckIns[0].id,
        checkTime: existingCheckIns[0].checkTime,
      },
    };
  }

  return { alreadyCheckedIn: false };
}

/**
 * Complete check-in flow
 * - Validates member and contract
 * - Checks for duplicate check-in
 * - Deducts session if COUNT_BASED
 */
export async function processCheckIn(data: CheckInData): Promise<{
  success: boolean;
  error?: string;
  checkIn?: any;
  alreadyCheckedIn?: boolean;
  sessionDeducted?: boolean;
  remainingSessions?: number;
}> {
  // Validate check-in
  const validation = await validateCheckIn(data);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Check for duplicate
  const duplicateCheck = await hasCheckedInToday(data.memberId, data.branchId);
  if (duplicateCheck.alreadyCheckedIn) {
    return {
      success: true,
      alreadyCheckedIn: true,
      checkIn: duplicateCheck.checkIn,
    };
  }

  // Create check-in record
  const [checkIn] = await db.insert(memberCheckIns).values({
    memberId: data.memberId,
    branchId: data.branchId,
    checkInTime: new Date(data.checkTime || new Date()),
    checkInType: (data.checkInType as 'ENTRY' | 'CLASS') || 'ENTRY',
    contractId: validation.contract?.id,
    notes: validation.isCrossBranch ? 'Cross-branch entry' : undefined,
  }).returning();

  // Deduct session for COUNT_BASED contracts
  let sessionDeducted = false;
  let remainingSessions: number | undefined;

  if (validation.contract?.planType === 'COUNT_BASED') {
    const deductResult = await deductSessionCount(validation.contract.id);
    sessionDeducted = deductResult.success;
    remainingSessions = deductResult.remaining ?? undefined;
  }

  return {
    success: true,
    checkIn,
    sessionDeducted,
    remainingSessions,
  };
}
