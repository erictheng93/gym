import { db, payments, contracts } from '../db/index.js';
import type { PAYMENT_STATUS } from '../db/index.js';
import { eq, and, sum } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// =============================================================================
// CONTRACT PAYMENT TOTALS
// =============================================================================
// Shared by POST /api/payments and the payment gateway webhooks so both paths
// compute contracts.paidAmount / contracts.paymentStatus the same way.

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ContractPaymentStatus = Exclude<typeof PAYMENT_STATUS[number], 'REFUNDED'>;

export interface ContractPaymentSummary {
  totalAmount: string | null;
  paidAmount: string;
  paymentStatus: ContractPaymentStatus;
}

const CONTRACT_TOTAL_AMOUNT_SELECT = { totalAmount: contracts.totalAmount };
const PAYMENT_TOTAL_AMOUNT_SELECT = { total: sum(payments.amount) };

/** Compare money values in cents to avoid floating point drift */
export function toCents(value: number | string | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

/**
 * Recalculate and store a contract's paid total and payment status.
 *
 * Must run inside the caller's transaction: the contract row is locked
 * (SELECT ... FOR UPDATE) so concurrent payments on the same contract are
 * serialized and the stored total cannot be overwritten by a stale sum.
 *
 * Paid total = sum of the contract's COMPLETED INCOME payment rows
 * (tenant-scoped). Every payment row is counted exactly once: rows are never
 * added on top of the sum by the caller.
 *
 * Returns null when the contract does not exist (in this tenant).
 */
export async function recalculateContractPayment(
  tx: DbTransaction,
  contractId: string,
  tenantId: string,
): Promise<ContractPaymentSummary | null> {
  const contractCondition = and(eq(contracts.id, contractId), eq(contracts.tenantId, tenantId));
  const paymentConditions: SQL[] = [
    eq(payments.contractId, contractId),
    eq(payments.type, 'INCOME'),
    // Open (PENDING) or FAILED gateway checkouts were never paid
    eq(payments.status, 'COMPLETED'),
    eq(payments.tenantId, tenantId),
  ];

  const [contract] = await tx
    .select(CONTRACT_TOTAL_AMOUNT_SELECT)
    .from(contracts)
    .where(contractCondition)
    .limit(1)
    .for('update');

  if (!contract) return null;

  const [paidRow] = await tx
    .select(PAYMENT_TOTAL_AMOUNT_SELECT)
    .from(payments)
    .where(and(...paymentConditions));

  const paidCents = toCents(paidRow?.total);
  const totalCents = toCents(contract.totalAmount);

  let paymentStatus: ContractPaymentStatus = 'UNPAID';
  if (paidCents >= totalCents) {
    paymentStatus = 'PAID';
  } else if (paidCents > 0) {
    paymentStatus = 'PARTIAL';
  }

  const paidAmount = (paidCents / 100).toFixed(2);

  await tx
    .update(contracts)
    .set({ paidAmount, paymentStatus, updatedAt: new Date() })
    .where(contractCondition);

  return { totalAmount: contract.totalAmount, paidAmount, paymentStatus };
}
