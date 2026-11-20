/**
 * Payments Hooks
 * Handles payment status calculation for contracts
 */

import { db, contracts, payments } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { calculatePaymentStatus } from './utils.js';

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

const CONTRACT_PAYMENT_STATUS_SELECT = {
  id: contracts.id,
  totalAmount: contracts.totalAmount,
  paymentStatus: contracts.paymentStatus,
} as const;

const PAYMENT_AMOUNT_TYPE_SELECT = {
  id: payments.id,
  amount: payments.amount,
  type: payments.type,
} as const;

const CONTRACT_TOTAL_AMOUNT_SELECT = {
  totalAmount: contracts.totalAmount,
} as const;

const PAYMENT_AMOUNT_ONLY_SELECT = {
  amount: payments.amount,
  type: payments.type,
} as const;

/**
 * Update contract payment status based on all payments
 * Called after payment create/update/delete operations
 */
export async function updateContractPaymentStatus(contractId: string): Promise<void> {
  if (!contractId) return;

  try {
    // First try to use the atomic SQL function if available
    try {
      await db.execute(
        sql`SELECT * FROM recalculate_payment_status(${contractId}::uuid)`
      );
      console.log(`[PaymentHook] Contract ${contractId} payment status updated (atomic)`);
      return;
    } catch {
      // Atomic function not available, use fallback
    }

    // Fallback: Calculate manually
    const [contract] = await db
      .select(CONTRACT_PAYMENT_STATUS_SELECT)
      .from(contracts)
      .where(eq(contracts.id, contractId));

    if (!contract) return;

    // Get all payments for this contract
    const contractPayments = await db
      .select(PAYMENT_AMOUNT_TYPE_SELECT)
      .from(payments)
      .where(eq(payments.contractId, contractId));

    // Calculate total paid amount (subtract refunds)
    let paidAmount = 0;
    for (const payment of contractPayments) {
      const amount = parseFloat(payment.amount || '0');
      if (payment.type === 'REFUND') {
        paidAmount -= amount;
      } else {
        paidAmount += amount;
      }
    }

    // Calculate new payment status
    const totalAmount = parseFloat(contract.totalAmount || '0');
    const newPaymentStatus = calculatePaymentStatus(totalAmount, paidAmount);

    // Update if changed
    if (newPaymentStatus !== contract.paymentStatus) {
      await db
        .update(contracts)
        .set({
          paymentStatus: newPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, contractId));

      console.log(
        `[PaymentHook] Contract ${contractId} payment_status updated to ${newPaymentStatus} (paid: ${paidAmount}/${totalAmount})`
      );
    }
  } catch (error) {
    console.error('[PaymentHook] Error updating payment status:', error);
    throw error;
  }
}

/**
 * Handle payment creation hook
 */
export async function onPaymentCreate(contractId: string): Promise<void> {
  await updateContractPaymentStatus(contractId);
}

/**
 * Handle payment update hook
 */
export async function onPaymentUpdate(contractId: string): Promise<void> {
  await updateContractPaymentStatus(contractId);
}

/**
 * Handle payment delete hook
 */
export async function onPaymentDelete(contractId: string): Promise<void> {
  await updateContractPaymentStatus(contractId);
}

/**
 * Calculate payment summary for a contract
 * Returns total paid, refunded, and balance
 */
export async function getContractPaymentSummary(contractId: string): Promise<{
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  balance: number;
  status: PaymentStatus;
}> {
  const [contract] = await db
    .select(CONTRACT_TOTAL_AMOUNT_SELECT)
    .from(contracts)
    .where(eq(contracts.id, contractId));

  if (!contract) {
    throw new Error('Contract not found');
  }

  const contractPayments = await db
    .select(PAYMENT_AMOUNT_ONLY_SELECT)
    .from(payments)
    .where(eq(payments.contractId, contractId));

  let paidAmount = 0;
  let refundedAmount = 0;

  for (const payment of contractPayments) {
    const amount = parseFloat(payment.amount || '0');
    if (payment.type === 'REFUND') {
      refundedAmount += amount;
    } else {
      paidAmount += amount;
    }
  }

  const totalAmount = parseFloat(contract.totalAmount || '0');
  const netPaid = paidAmount - refundedAmount;
  const balance = totalAmount - netPaid;
  const status = calculatePaymentStatus(totalAmount, netPaid);

  return {
    totalAmount,
    paidAmount,
    refundedAmount,
    balance,
    status,
  };
}
