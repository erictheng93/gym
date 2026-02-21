import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// =============================================================================
// Mock global fetch for gateway API calls
// =============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// =============================================================================
// Mock the DB module before importing the payment service
// =============================================================================

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock('../src/db/index.js', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
  payments: { id: 'id', contractId: 'contractId', branchId: 'branchId' },
  branches: { id: 'id', tenantId: 'tenantId' },
}));

// =============================================================================
// Import payment service AFTER mock setup
// =============================================================================

import {
  initPaymentService,
  isGatewayEnabled,
  createPayment,
  getPaymentStatus,
  processRefund,
  verifyStripeWebhook,
  verifyECPayWebhook,
  verifyLinePayWebhook,
} from '../src/services/payment.js';

// =============================================================================
// TESTS
// =============================================================================

describe('Payment Service', () => {
  beforeEach(() => {
    // resetAllMocks clears calls, results AND the mockReturnValueOnce queue
    // clearAllMocks only clears calls/results, leaving queued values that leak between tests
    vi.resetAllMocks();

    // Re-apply default implementations after reset
    mockInsertValues.mockImplementation(() => ({ returning: mockInsertReturning }));
    mockInsert.mockImplementation(() => ({ values: mockInsertValues }));
    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockImplementation(() => ({ where: mockUpdateWhere }));
    mockUpdate.mockImplementation(() => ({ set: mockUpdateSet }));
    mockSelectWhere.mockImplementation(() => ({ limit: mockSelectLimit }));
    mockSelectFrom.mockImplementation(() => ({ where: mockSelectWhere }));
    mockSelect.mockImplementation(() => ({ from: mockSelectFrom }));

    // Reset to clean state — re-init with empty config
    initPaymentService({
      stripe: { secretKey: '', publishableKey: '', webhookSecret: '' },
      ecpay: { merchantId: '', hashKey: '', hashIv: '' },
      linepay: { channelId: '', channelSecret: '' },
    });
  });

  // ---------------------------------------------------------------------------
  // initPaymentService
  // ---------------------------------------------------------------------------

  describe('initPaymentService', () => {
    it('應該成功初始化並返回 true', () => {
      const result = initPaymentService({
        stripe: { secretKey: 'sk_test_123' },
      });

      expect(result).toBe(true);
    });

    it('應該支援只初始化部分閘道', () => {
      initPaymentService({
        stripe: { secretKey: 'sk_test_123' },
      });

      expect(isGatewayEnabled('stripe')).toBe(true);
      expect(isGatewayEnabled('ecpay')).toBe(false);
      expect(isGatewayEnabled('linepay')).toBe(false);
    });

    it('應該支援同時初始化多個閘道', () => {
      initPaymentService({
        stripe: { secretKey: 'sk_test_123' },
        ecpay: { merchantId: 'M123', hashKey: 'key', hashIv: 'iv' },
        linepay: { channelId: 'ch123', channelSecret: 'secret' },
      });

      expect(isGatewayEnabled('stripe')).toBe(true);
      expect(isGatewayEnabled('ecpay')).toBe(true);
      expect(isGatewayEnabled('linepay')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // isGatewayEnabled
  // ---------------------------------------------------------------------------

  describe('isGatewayEnabled', () => {
    it('Stripe: 有 secretKey 時應該為 true', () => {
      initPaymentService({ stripe: { secretKey: 'sk_test_123' } });
      expect(isGatewayEnabled('stripe')).toBe(true);
    });

    it('Stripe: 沒有 secretKey 時應該為 false', () => {
      expect(isGatewayEnabled('stripe')).toBe(false);
    });

    it('ECPay: 需要 merchantId、hashKey、hashIv 三者皆有', () => {
      initPaymentService({
        ecpay: { merchantId: 'M123', hashKey: 'key', hashIv: 'iv' },
      });
      expect(isGatewayEnabled('ecpay')).toBe(true);
    });

    it('ECPay: 缺少任何一個欄位應該為 false', () => {
      initPaymentService({
        ecpay: { merchantId: 'M123', hashKey: 'key' },
      });
      expect(isGatewayEnabled('ecpay')).toBe(false);
    });

    it('LINE Pay: 需要 channelId 和 channelSecret', () => {
      initPaymentService({
        linepay: { channelId: 'ch123', channelSecret: 'secret' },
      });
      expect(isGatewayEnabled('linepay')).toBe(true);
    });

    it('LINE Pay: 缺少 channelSecret 應該為 false', () => {
      initPaymentService({
        linepay: { channelId: 'ch123' },
      });
      expect(isGatewayEnabled('linepay')).toBe(false);
    });

    it('Manual: 永遠為 true', () => {
      expect(isGatewayEnabled('manual')).toBe(true);
    });

    it('未知閘道應該為 false', () => {
      expect(isGatewayEnabled('unknown' as any)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // verifyStripeWebhook
  // ---------------------------------------------------------------------------

  describe('verifyStripeWebhook', () => {
    const webhookSecret = 'whsec_test_secret';

    beforeEach(() => {
      initPaymentService({
        stripe: { secretKey: 'sk_test', webhookSecret },
      });
    });

    it('應該驗證有效的 Stripe webhook 簽名', () => {
      const payload = '{"type":"checkout.session.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      const signature = `t=${timestamp},v1=${expectedSig}`;

      expect(verifyStripeWebhook(payload, signature)).toBe(true);
    });

    it('應該拒絕無效的簽名', () => {
      const payload = '{"type":"checkout.session.completed"}';
      const signature = 't=123456,v1=invalidsignature';

      expect(verifyStripeWebhook(payload, signature)).toBe(false);
    });

    it('應該拒絕被竄改的 payload', () => {
      const originalPayload = '{"type":"checkout.session.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const signedPayload = `${timestamp}.${originalPayload}`;
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      const signature = `t=${timestamp},v1=${expectedSig}`;
      const tamperedPayload = '{"type":"payment_intent.succeeded","amount":999999}';

      expect(verifyStripeWebhook(tamperedPayload, signature)).toBe(false);
    });

    it('應該拒絕缺少 timestamp 的簽名', () => {
      const payload = '{}';
      const signature = 'v1=somesignature';

      expect(verifyStripeWebhook(payload, signature)).toBe(false);
    });

    it('應該拒絕缺少 v1 的簽名', () => {
      const payload = '{}';
      const signature = 't=123456';

      expect(verifyStripeWebhook(payload, signature)).toBe(false);
    });

    it('未設定 webhookSecret 時應該返回 false', () => {
      initPaymentService({
        stripe: { secretKey: 'sk_test', webhookSecret: '' },
      });

      expect(verifyStripeWebhook('{}', 't=123,v1=abc')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // verifyECPayWebhook
  // ---------------------------------------------------------------------------

  describe('verifyECPayWebhook', () => {
    beforeEach(() => {
      initPaymentService({
        ecpay: {
          merchantId: '2000132',
          hashKey: '5294y06JbISpM5x9',
          hashIv: 'v77hoKGq4kWxNNIS',
        },
      });
    });

    it('應該驗證有效的 ECPay CheckMacValue', () => {
      // Build params and compute the expected CheckMacValue using the same algorithm
      const params: Record<string, string> = {
        MerchantID: '2000132',
        MerchantTradeNo: 'GN1234567890ABCDEF',
        RtnCode: '1',
        RtnMsg: 'Succeeded',
        TradeNo: '2024010112345',
        TradeAmt: '1000',
        PaymentType: 'Credit_CreditCard',
        CustomField1: 'payment-id-1',
      };

      // Compute the CheckMacValue the same way the service does
      const sortedKeys = Object.keys(params).sort();
      const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
      const rawString = `HashKey=5294y06JbISpM5x9&${queryString}&HashIV=v77hoKGq4kWxNNIS`;
      const encoded = encodeURIComponent(rawString).toLowerCase();
      const hash = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();

      params.CheckMacValue = hash;

      expect(verifyECPayWebhook(params)).toBe(true);
    });

    it('應該拒絕無效的 CheckMacValue', () => {
      const params: Record<string, string> = {
        MerchantID: '2000132',
        RtnCode: '1',
        TradeNo: '123',
        CheckMacValue: 'INVALID_MAC_VALUE',
      };

      expect(verifyECPayWebhook(params)).toBe(false);
    });

    it('應該拒絕缺少 CheckMacValue 的請求', () => {
      const params: Record<string, string> = {
        MerchantID: '2000132',
        RtnCode: '1',
      };

      expect(verifyECPayWebhook(params)).toBe(false);
    });

    it('應該拒絕被竄改金額的請求', () => {
      // First create a valid signature with amount 1000
      const params: Record<string, string> = {
        MerchantID: '2000132',
        TradeAmt: '1000',
        RtnCode: '1',
      };

      const sortedKeys = Object.keys(params).sort();
      const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
      const rawString = `HashKey=5294y06JbISpM5x9&${queryString}&HashIV=v77hoKGq4kWxNNIS`;
      const encoded = encodeURIComponent(rawString).toLowerCase();
      const hash = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();

      // Tamper the amount
      params.TradeAmt = '99999';
      params.CheckMacValue = hash;

      expect(verifyECPayWebhook(params)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // verifyLinePayWebhook
  // ---------------------------------------------------------------------------

  describe('verifyLinePayWebhook', () => {
    const channelSecret = 'linepay_test_secret';

    beforeEach(() => {
      initPaymentService({
        linepay: { channelId: 'ch123', channelSecret },
      });
    });

    it('應該驗證有效的 LINE Pay webhook 簽名', () => {
      const body = '{"type":"payment","result":{"returnCode":"0000"}}';

      const expectedSig = crypto
        .createHmac('sha256', channelSecret)
        .update(body)
        .digest('base64');

      expect(verifyLinePayWebhook(expectedSig, body)).toBe(true);
    });

    it('應該拒絕無效的簽名', () => {
      const body = '{"type":"payment"}';

      expect(verifyLinePayWebhook('invalid_signature', body)).toBe(false);
    });

    it('應該拒絕被竄改的 body', () => {
      const originalBody = '{"type":"payment","amount":1000}';
      const expectedSig = crypto
        .createHmac('sha256', channelSecret)
        .update(originalBody)
        .digest('base64');

      const tamperedBody = '{"type":"payment","amount":99999}';

      expect(verifyLinePayWebhook(expectedSig, tamperedBody)).toBe(false);
    });

    it('未設定 channelSecret 時應該返回 false', () => {
      initPaymentService({
        linepay: { channelId: 'ch123', channelSecret: '' },
      });

      expect(verifyLinePayWebhook('sig', 'body')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // createPayment
  // ---------------------------------------------------------------------------

  describe('createPayment', () => {
    const baseOptions = {
      gateway: 'manual' as const,
      amount: 1000,
      contractId: 'contract-1',
      memberId: 'member-1',
      branchId: 'branch-1',
    };

    it('未啟用的閘道應該返回錯誤', async () => {
      const result = await createPayment({
        ...baseOptions,
        gateway: 'stripe',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('金額 <= 0 應該返回錯誤', async () => {
      const result = await createPayment({
        ...baseOptions,
        amount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payment amount');
    });

    it('金額為負數應該返回錯誤', async () => {
      const result = await createPayment({
        ...baseOptions,
        amount: -500,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payment amount');
    });

    it('Manual 支付應該成功並立即完成', async () => {
      const mockPaymentRecord = { id: 'payment-123' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);

      // Mock for getTenantIdForBranch
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      // Mock for processManualPayment's update
      const mockWhere = vi.fn().mockResolvedValueOnce(undefined);
      mockUpdateSet.mockReturnValueOnce({ where: mockWhere });

      const result = await createPayment(baseOptions);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-123');
      expect(result.status).toBe('completed');
    });

    it('DB 錯誤應該返回錯誤訊息', async () => {
      mockInsertReturning.mockRejectedValueOnce(new Error('DB connection failed'));
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      const result = await createPayment(baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB connection failed');
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentStatus
  // ---------------------------------------------------------------------------

  describe('getPaymentStatus', () => {
    it('應該返回已完成的支付狀態', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
      }]);

      const result = await getPaymentStatus('payment-1');

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-1');
      expect(result.status).toBe('completed');
    });

    it('REFUND 類型應該返回 refunded 狀態', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-2',
        type: 'REFUND',
      }]);

      const result = await getPaymentStatus('payment-2');

      expect(result.success).toBe(true);
      expect(result.status).toBe('refunded');
    });

    it('找不到支付記錄應該返回錯誤', async () => {
      mockSelectLimit.mockResolvedValueOnce([]);

      const result = await getPaymentStatus('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment not found');
    });

    it('DB 錯誤應該返回錯誤', async () => {
      mockSelectLimit.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await getPaymentStatus('payment-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });

  // ---------------------------------------------------------------------------
  // processRefund
  // ---------------------------------------------------------------------------

  describe('processRefund', () => {
    it('找不到原始支付記錄應該返回錯誤', async () => {
      mockSelectLimit.mockResolvedValueOnce([]);

      const result = await processRefund({ paymentId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment not found');
    });

    it('已退款的支付不能重複退款', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'REFUND',
        amount: '1000',
        paymentMethod: 'CASH',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment is already refunded');
    });

    it('Manual 支付全額退款應該成功', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '5000',
        paymentMethod: 'CASH',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
    });

    it('部分退款應該使用指定金額', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '5000',
        paymentMethod: 'CASH',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({
        paymentId: 'payment-1',
        amount: 2000,
        reason: 'Partial refund',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2000);
    });

    it('DB 錯誤應該返回錯誤', async () => {
      mockSelectLimit.mockRejectedValueOnce(new Error('DB error'));

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });

    it('BANK_TRANSFER 方式退款應該走 manual 流程', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '3000',
        paymentMethod: 'BANK_TRANSFER',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1', reason: 'Customer request' });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(3000);
    });

    it('CREDIT_CARD 方式退款應該走 Stripe 流程', async () => {
      initPaymentService({ stripe: { secretKey: 'sk_test_123' } });

      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '8000',
        paymentMethod: 'CREDIT_CARD',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(8000);
    });

    it('LINE_PAY 方式退款應該走 LINE Pay 流程', async () => {
      initPaymentService({ linepay: { channelId: 'ch', channelSecret: 'secret' } });

      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '2000',
        paymentMethod: 'LINE_PAY',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2000);
    });

    it('DEBIT_CARD 方式退款應該走 ECPay 流程', async () => {
      initPaymentService({ ecpay: { merchantId: 'M', hashKey: 'k', hashIv: 'v' } });

      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '1500',
        paymentMethod: 'DEBIT_CARD',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1500);
    });

    it('paymentMethod 為 null 應該走 manual 流程', async () => {
      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '1000',
        paymentMethod: null,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({ paymentId: 'payment-1' });

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createPayment — Gateway-specific paths
  // ---------------------------------------------------------------------------

  describe('createPayment (Stripe)', () => {
    beforeEach(() => {
      initPaymentService({ stripe: { secretKey: 'sk_test_123' } });
    });

    it('Stripe 支付成功應該返回 checkoutUrl', async () => {
      const mockPaymentRecord = { id: 'payment-stripe-1' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cs_test_session123',
          url: 'https://checkout.stripe.com/session123',
        }),
      });

      const result = await createPayment({
        gateway: 'stripe',
        amount: 5000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        description: 'Monthly membership',
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-stripe-1');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/session123');
      expect(result.status).toBe('pending');
      expect(result.transactionId).toBe('cs_test_session123');

      // Verify Stripe API was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/checkout/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk_test_123',
          }),
        })
      );
    });

    it('Stripe API 失敗應該返回錯誤', async () => {
      const mockPaymentRecord = { id: 'payment-stripe-2' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'Invalid API key' },
        }),
      });

      const result = await createPayment({
        gateway: 'stripe',
        amount: 5000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('Stripe fetch 網路錯誤應該返回錯誤', async () => {
      const mockPaymentRecord = { id: 'payment-stripe-3' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await createPayment({
        gateway: 'stripe',
        amount: 5000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('Stripe 未設定 secretKey 應該返回 not configured', async () => {
      initPaymentService({ stripe: { secretKey: '' } });

      const mockPaymentRecord = { id: 'payment-stripe-4' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      const result = await createPayment({
        gateway: 'stripe',
        amount: 5000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('createPayment (ECPay)', () => {
    beforeEach(() => {
      initPaymentService({
        ecpay: { merchantId: '2000132', hashKey: '5294y06JbISpM5x9', hashIv: 'v77hoKGq4kWxNNIS' },
      });
    });

    it('ECPay 支付應該返回含表單 HTML 的結果', async () => {
      const mockPaymentRecord = { id: 'payment-ecpay-1' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      const result = await createPayment({
        gateway: 'ecpay',
        amount: 3000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        description: 'Monthly fee',
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-ecpay-1');
      expect(result.status).toBe('pending');
      // checkoutUrl contains form HTML
      expect(result.checkoutUrl).toContain('<form');
      expect(result.checkoutUrl).toContain('ecpay-form');
      expect(result.checkoutUrl).toContain('MerchantID');
      expect(result.checkoutUrl).toContain('CheckMacValue');
      // transactionId starts with GN
      expect(result.transactionId).toMatch(/^GN/);
    });

    it('ECPay 未設定完整參數應該返回錯誤', async () => {
      initPaymentService({ ecpay: { merchantId: '2000132', hashKey: '', hashIv: '' } });

      const result = await createPayment({
        gateway: 'ecpay',
        amount: 3000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('createPayment (LINE Pay)', () => {
    beforeEach(() => {
      initPaymentService({
        linepay: { channelId: 'ch_test_123', channelSecret: 'secret_test_123' },
      });
    });

    it('LINE Pay 支付成功應該返回 checkoutUrl', async () => {
      const mockPaymentRecord = { id: 'payment-linepay-1' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: {
            transactionId: 'tx_linepay_123',
            paymentUrl: { web: 'https://sandbox-web-pay.line.me/web/payment/wait' },
          },
        }),
      });

      const result = await createPayment({
        gateway: 'linepay',
        amount: 2000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        description: 'Class package',
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('payment-linepay-1');
      expect(result.checkoutUrl).toBe('https://sandbox-web-pay.line.me/web/payment/wait');
      expect(result.transactionId).toBe('tx_linepay_123');
      expect(result.status).toBe('pending');

      // Verify LINE Pay API was called with correct headers
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api-pay.line.me/v3/payments/request',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-LINE-ChannelId': 'ch_test_123',
          }),
        })
      );
    });

    it('LINE Pay API 返回錯誤碼應該返回失敗', async () => {
      const mockPaymentRecord = { id: 'payment-linepay-2' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          returnCode: '1101',
          returnMessage: 'Not available LINE Pay',
        }),
      });

      const result = await createPayment({
        gateway: 'linepay',
        amount: 2000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not available LINE Pay');
    });

    it('LINE Pay fetch 網路錯誤應該返回錯誤', async () => {
      const mockPaymentRecord = { id: 'payment-linepay-3' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      const result = await createPayment({
        gateway: 'linepay',
        amount: 2000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ETIMEDOUT');
    });

    it('LINE Pay 未設定 channelSecret 應該返回錯誤', async () => {
      initPaymentService({ linepay: { channelId: 'ch', channelSecret: '' } });

      const result = await createPayment({
        gateway: 'linepay',
        amount: 2000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  // ---------------------------------------------------------------------------
  // createPayment — edge cases
  // ---------------------------------------------------------------------------

  describe('createPayment (edge cases)', () => {
    it('自訂 currency 應該傳遞給閘道', async () => {
      initPaymentService({ stripe: { secretKey: 'sk_test_123' } });

      const mockPaymentRecord = { id: 'payment-usd-1' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      mockSelectLimit.mockResolvedValueOnce([{ tenantId: 'tenant-1' }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }),
      });

      const result = await createPayment({
        gateway: 'stripe',
        amount: 100,
        currency: 'USD',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(true);

      // Verify USD was passed in the body
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body as URLSearchParams;
      expect(body.get('line_items[0][price_data][currency]')).toBe('usd');
    });

    it('getTenantIdForBranch 失敗時 tenantId 應為 null', async () => {
      const mockPaymentRecord = { id: 'payment-notenant' };
      mockInsertReturning.mockResolvedValueOnce([mockPaymentRecord]);
      // Simulate getTenantIdForBranch failing
      mockSelectLimit.mockRejectedValueOnce(new Error('DB error'));

      const mockWhere = vi.fn().mockResolvedValueOnce(undefined);
      mockUpdateSet.mockReturnValueOnce({ where: mockWhere });

      const result = await createPayment({
        gateway: 'manual',
        amount: 500,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Stripe refund — not configured
  // ---------------------------------------------------------------------------

  describe('processRefund (Stripe)', () => {
    it('Stripe 退款應該模擬成功', async () => {
      initPaymentService({ stripe: { secretKey: 'sk_test' } });

      mockSelectLimit.mockResolvedValueOnce([{
        id: 'payment-1',
        type: 'INCOME',
        amount: '5000',
        paymentMethod: 'CREDIT_CARD',
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      }]);

      const result = await processRefund({
        paymentId: 'payment-1',
        amount: 3000,
        reason: 'Partial refund test',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(3000);
      expect(result.refundId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createPayment — unknown gateway (caught by isGatewayEnabled before switch)
  // ---------------------------------------------------------------------------

  describe('createPayment (unknown gateway)', () => {
    it('不支援的 gateway 應該被 isGatewayEnabled 攔截', async () => {
      const result = await createPayment({
        gateway: 'bitcoin' as any,
        amount: 1000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  // ---------------------------------------------------------------------------
  // ECPay — not configured (caught by isGatewayEnabled)
  // ---------------------------------------------------------------------------

  describe('createPayment (ECPay not configured)', () => {
    it('ECPay 未設定 merchantId 應該返回 not configured', async () => {
      initPaymentService({ ecpay: { merchantId: '', hashKey: '', hashIv: '' } });

      const result = await createPayment({
        gateway: 'ecpay',
        amount: 2000,
        contractId: 'contract-1',
        memberId: 'member-1',
        branchId: 'branch-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });
});
