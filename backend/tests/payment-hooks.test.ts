import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Mock the DB module
// =============================================================================

const mockExecute = vi.fn();

const mockSelectWhere = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelect = vi.fn();

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdate = vi.fn();

function setupMockDefaults() {
  mockSelect.mockImplementation(() => ({ from: mockSelectFrom }));
  mockSelectFrom.mockImplementation(() => ({ where: mockSelectWhere }));
  mockUpdate.mockImplementation(() => ({ set: mockUpdateSet }));
  mockUpdateSet.mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockResolvedValue(undefined);
}

vi.mock('../src/db/index.js', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  contracts: {
    id: 'id',
    totalAmount: 'totalAmount',
    paymentStatus: 'paymentStatus',
  },
  payments: {
    id: 'id',
    amount: 'amount',
    type: 'type',
    contractId: 'contractId',
  },
}));

// =============================================================================
// Import AFTER mock setup
// =============================================================================

import {
  updateContractPaymentStatus,
  onPaymentCreate,
  onPaymentUpdate,
  onPaymentDelete,
  getContractPaymentSummary,
} from '../src/hooks/payments.js';

// =============================================================================
// TESTS
// =============================================================================

describe('Payment Hooks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMockDefaults();
  });

  // ---------------------------------------------------------------------------
  // updateContractPaymentStatus
  // ---------------------------------------------------------------------------

  describe('updateContractPaymentStatus', () => {
    it('空的 contractId 應該直接返回', async () => {
      await updateContractPaymentStatus('');

      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('atomic SQL function 可用時應該使用它', async () => {
      mockExecute.mockResolvedValueOnce(undefined);

      await updateContractPaymentStatus('contract-1');

      expect(mockExecute).toHaveBeenCalledTimes(1);
      // Fallback select should NOT be called
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('atomic SQL function 不可用時應該 fallback 到手動計算', async () => {
      // Atomic function throws
      mockExecute.mockRejectedValueOnce(new Error('function does not exist'));

      // Fallback: fetch contract
      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'UNPAID',
        }])
        // Fetch payments
        .mockResolvedValueOnce([
          { id: 'p1', amount: '5000', type: 'INCOME' },
        ]);

      await updateContractPaymentStatus('contract-1');

      // Should have called select twice (contract + payments)
      expect(mockSelect).toHaveBeenCalledTimes(2);
      // Status changed from UNPAID to PARTIAL → should update
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PARTIAL' })
      );
    });

    it('合約不存在時應該直接返回不更新', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));
      mockSelectWhere.mockResolvedValueOnce([]); // No contract found

      await updateContractPaymentStatus('nonexistent');

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('全額付款應該更新狀態為 PAID', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'PARTIAL',
        }])
        .mockResolvedValueOnce([
          { id: 'p1', amount: '6000', type: 'INCOME' },
          { id: 'p2', amount: '4000', type: 'INCOME' },
        ]);

      await updateContractPaymentStatus('contract-1');

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PAID' })
      );
    });

    it('退款後應該重新計算狀態為 PARTIAL', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'PAID',
        }])
        .mockResolvedValueOnce([
          { id: 'p1', amount: '10000', type: 'INCOME' },
          { id: 'p2', amount: '3000', type: 'REFUND' },
        ]);

      await updateContractPaymentStatus('contract-1');

      // netPaid = 10000 - 3000 = 7000, totalAmount = 10000 → PARTIAL
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PARTIAL' })
      );
    });

    it('全額退款應該更新狀態為 UNPAID', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '5000',
          paymentStatus: 'PAID',
        }])
        .mockResolvedValueOnce([
          { id: 'p1', amount: '5000', type: 'INCOME' },
          { id: 'p2', amount: '5000', type: 'REFUND' },
        ]);

      await updateContractPaymentStatus('contract-1');

      // netPaid = 5000 - 5000 = 0 → UNPAID
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'UNPAID' })
      );
    });

    it('沒有付款記錄應該設為 UNPAID', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'PARTIAL',
        }])
        .mockResolvedValueOnce([]); // No payments

      await updateContractPaymentStatus('contract-1');

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'UNPAID' })
      );
    });

    it('狀態未改變時不應該更新', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'PARTIAL',
        }])
        .mockResolvedValueOnce([
          { id: 'p1', amount: '5000', type: 'INCOME' },
        ]);

      await updateContractPaymentStatus('contract-1');

      // Status is already PARTIAL, paid 5000/10000 → still PARTIAL → no update
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('totalAmount 為 null 時應該視為 PAID', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: null,
          paymentStatus: 'UNPAID',
        }])
        .mockResolvedValueOnce([]);

      await updateContractPaymentStatus('contract-1');

      // totalAmount = 0 → calculatePaymentStatus(0, 0) → PAID
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'PAID' })
      );
    });

    it('payment amount 為 null 時應該視為 0', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));

      mockSelectWhere
        .mockResolvedValueOnce([{
          id: 'contract-1',
          totalAmount: '10000',
          paymentStatus: 'PARTIAL',
        }])
        .mockResolvedValueOnce([
          { id: 'p1', amount: null, type: 'INCOME' },
        ]);

      await updateContractPaymentStatus('contract-1');

      // amount parses to 0 → UNPAID
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'UNPAID' })
      );
    });

    it('DB 錯誤應該向上拋出', async () => {
      mockExecute.mockRejectedValueOnce(new Error('not available'));
      mockSelectWhere.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(
        updateContractPaymentStatus('contract-1')
      ).rejects.toThrow('Connection lost');
    });
  });

  // ---------------------------------------------------------------------------
  // onPaymentCreate / onPaymentUpdate / onPaymentDelete
  // ---------------------------------------------------------------------------

  describe('onPaymentCreate', () => {
    it('應該呼叫 updateContractPaymentStatus', async () => {
      mockExecute.mockResolvedValueOnce(undefined);

      await onPaymentCreate('contract-1');

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('onPaymentUpdate', () => {
    it('應該呼叫 updateContractPaymentStatus', async () => {
      mockExecute.mockResolvedValueOnce(undefined);

      await onPaymentUpdate('contract-2');

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('onPaymentDelete', () => {
    it('應該呼叫 updateContractPaymentStatus', async () => {
      mockExecute.mockResolvedValueOnce(undefined);

      await onPaymentDelete('contract-3');

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getContractPaymentSummary
  // ---------------------------------------------------------------------------

  describe('getContractPaymentSummary', () => {
    it('應該正確計算付款摘要', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '10000' }])
        .mockResolvedValueOnce([
          { amount: '6000', type: 'INCOME' },
          { amount: '4000', type: 'INCOME' },
          { amount: '2000', type: 'REFUND' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 10000,
        paidAmount: 10000,
        refundedAmount: 2000,
        balance: 2000,  // 10000 - (10000 - 2000) = 2000
        status: 'PARTIAL', // netPaid=8000 < totalAmount=10000
      });
    });

    it('全額付清應該返回 PAID 且 balance 為 0', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '5000' }])
        .mockResolvedValueOnce([
          { amount: '5000', type: 'INCOME' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 5000,
        paidAmount: 5000,
        refundedAmount: 0,
        balance: 0,
        status: 'PAID',
      });
    });

    it('無付款記錄應該返回 UNPAID', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '8000' }])
        .mockResolvedValueOnce([]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 8000,
        paidAmount: 0,
        refundedAmount: 0,
        balance: 8000,
        status: 'UNPAID',
      });
    });

    it('超額付款應該返回 PAID 且 balance 為負數', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '5000' }])
        .mockResolvedValueOnce([
          { amount: '6000', type: 'INCOME' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 5000,
        paidAmount: 6000,
        refundedAmount: 0,
        balance: -1000, // 5000 - 6000 = -1000
        status: 'PAID',
      });
    });

    it('合約不存在應該拋出錯誤', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      await expect(
        getContractPaymentSummary('nonexistent')
      ).rejects.toThrow('Contract not found');
    });

    it('totalAmount 為 null 應該視為 0', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: null }])
        .mockResolvedValueOnce([
          { amount: '3000', type: 'INCOME' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 0,
        paidAmount: 3000,
        refundedAmount: 0,
        balance: -3000,
        status: 'PAID', // totalAmount=0 → PAID
      });
    });

    it('payment amount 為 null 應該視為 0', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '10000' }])
        .mockResolvedValueOnce([
          { amount: null, type: 'INCOME' },
          { amount: '3000', type: 'INCOME' },
          { amount: null, type: 'REFUND' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 10000,
        paidAmount: 3000,   // 0 + 3000
        refundedAmount: 0,  // null → 0
        balance: 7000,      // 10000 - 3000
        status: 'PARTIAL',
      });
    });

    it('多筆退款應該正確加總', async () => {
      mockSelectWhere
        .mockResolvedValueOnce([{ totalAmount: '20000' }])
        .mockResolvedValueOnce([
          { amount: '20000', type: 'INCOME' },
          { amount: '3000', type: 'REFUND' },
          { amount: '2000', type: 'REFUND' },
          { amount: '5000', type: 'REFUND' },
        ]);

      const summary = await getContractPaymentSummary('contract-1');

      expect(summary).toEqual({
        totalAmount: 20000,
        paidAmount: 20000,
        refundedAmount: 10000, // 3000 + 2000 + 5000
        balance: 10000,        // 20000 - (20000 - 10000)
        status: 'PARTIAL',     // netPaid=10000 < 20000
      });
    });
  });
});
