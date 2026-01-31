/**
 * Shared Utilities for Business Logic Hooks
 * Migrated from Directus hooks to standalone TypeScript
 */

import { db, contracts, members } from '../db/index.js';
import { eq, and, gte, sql } from 'drizzle-orm';

// Contract status type
type ContractStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'PENDING';

// Member status type
type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'PAUSED';

// Payment status type
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface ContractWithStatus {
  id: string;
  contractStatus: ContractStatus;
}

/**
 * Calculate member status based on all contracts
 * Priority: ACTIVE > PAUSED > INACTIVE
 */
export function calculateMemberStatus(memberContracts: ContractWithStatus[]): MemberStatus {
  if (!memberContracts || memberContracts.length === 0) {
    return 'INACTIVE';
  }

  const hasActive = memberContracts.some(c => c.contractStatus === 'ACTIVE');
  const hasPaused = memberContracts.some(c => c.contractStatus === 'PAUSED');

  if (hasActive) return 'ACTIVE';
  if (hasPaused) return 'PAUSED';
  return 'INACTIVE';
}

/**
 * Calculate contract payment status
 * @param totalAmount - Total contract amount
 * @param paidAmount - Amount already paid
 * @returns Payment status: UNPAID | PARTIAL | PAID
 */
export function calculatePaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  if (!totalAmount || totalAmount <= 0) return 'PAID';
  if (!paidAmount || paidAmount <= 0) return 'UNPAID';
  if (paidAmount >= totalAmount) return 'PAID';
  return 'PARTIAL';
}

/**
 * Generate unique member code
 * Format: MYYMMDD#### (e.g., M2506150001)
 */
export async function generateMemberCode(): Promise<string> {
  const prefix = 'M';
  const today = new Date();
  const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD

  try {
    // Get count of members created today
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(
        and(
          gte(members.createdAt, startOfDay),
          sql`${members.createdAt} <= ${endOfDay}`
        )
      );

    const count = result[0]?.count || 0;
    const sequence = (Number(count) + 1).toString().padStart(4, '0');
    return `${prefix}${dateStr}${sequence}`;
  } catch (error) {
    // Fallback to timestamp if query fails
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${dateStr}${timestamp}`;
  }
}

/**
 * Generate unique contract number
 * Format: CYYMMDD#### (e.g., C2506150001)
 */
export async function generateContractNo(): Promise<string> {
  const prefix = 'C';
  const today = new Date();
  const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD

  try {
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(contracts)
      .where(
        and(
          gte(contracts.createdAt, startOfDay),
          sql`${contracts.createdAt} <= ${endOfDay}`
        )
      );

    const count = result[0]?.count || 0;
    const sequence = (Number(count) + 1).toString().padStart(4, '0');
    return `${prefix}${dateStr}${sequence}`;
  } catch (error) {
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${dateStr}${timestamp}`;
  }
}

/**
 * Helper: Get action name in Chinese
 */
export function getActionName(action: string): string {
  const actionNames: Record<string, string> = {
    create: '新增',
    read: '檢視',
    update: '編輯',
    delete: '刪除',
  };
  return actionNames[action] || action;
}

/**
 * Helper: Get module name in Chinese
 */
export function getModuleName(module: string): string {
  const moduleNames: Record<string, string> = {
    members: '會員',
    contracts: '合約',
    payments: '付款紀錄',
    plans: '會籍方案',
    employees: '員工',
    branches: '分店',
    checkin: '入場紀錄',
    hr: '人資資料',
    reports: '報表',
    settings: '系統設定',
  };
  return moduleNames[module] || module;
}

/**
 * Calculate the number of days between two dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / oneDay);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
