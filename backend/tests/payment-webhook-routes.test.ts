import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Mock the payment verification service
// =============================================================================

const mockVerifyStripe = vi.fn();
const mockVerifyECPay = vi.fn();
const mockVerifyLinePay = vi.fn();
const mockIsGatewayEnabled = vi.fn();

vi.mock('../src/services/payment.js', () => ({
  isGatewayEnabled: (...args: unknown[]) => mockIsGatewayEnabled(...args),
  verifyStripeWebhook: (...args: unknown[]) => mockVerifyStripe(...args),
  verifyECPayWebhook: (...args: unknown[]) => mockVerifyECPay(...args),
  verifyLinePayWebhook: (...args: unknown[]) => mockVerifyLinePay(...args),
}));

// =============================================================================
// Mock the DB module
// =============================================================================

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdate = vi.fn();

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelect = vi.fn();

function setupMockDefaults() {
  mockSelect.mockImplementation(() => ({ from: mockSelectFrom }));
  mockSelectFrom.mockImplementation(() => ({ where: mockSelectWhere }));
  mockSelectWhere.mockImplementation(() => ({ limit: mockSelectLimit }));
  mockUpdate.mockImplementation(() => ({ set: mockUpdateSet }));
  mockUpdateSet.mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockResolvedValue(undefined);
  mockIsGatewayEnabled.mockReturnValue(true);
}

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  payments: {
    id: 'id',
    amount: 'amount',
    paymentMethod: 'paymentMethod',
    paymentDate: 'paymentDate',
    type: 'type',
    receiptNo: 'receiptNo',
    notes: 'notes',
    contractId: 'contractId',
    tenantId: 'tenantId',
  },
  contracts: {
    id: 'contracts.id',
    status: 'contracts.status',
    totalAmount: 'contracts.totalAmount',
    tenantId: 'contracts.tenantId',
  },
}));

// =============================================================================
// Mock drizzle-orm helpers (inspectable conditions)
// =============================================================================

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ _op: 'and', args })),
}));

// handlePaymentSuccess query results
const PAYMENT_ROW = { amount: '5000', contractId: 'contract-1', tenantId: 'tenant-1' };
const CONTRACT_ROW = { totalAmount: '5000' };

// =============================================================================
// Mock global fetch (for LINE Pay confirm API)
// =============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// =============================================================================
// Import AFTER mock setup
// =============================================================================

import app from '../src/routes/payment-webhooks.js';

// =============================================================================
// TESTS
// =============================================================================

describe('Payment Webhook Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMockDefaults();

    process.env.FRONTEND_URL = 'http://localhost:3002';
    process.env.LINEPAY_CHANNEL_ID = 'test_channel_id';
    process.env.LINEPAY_CHANNEL_SECRET = 'test_channel_secret';
  });

  // ---------------------------------------------------------------------------
  // POST /stripe
  // ---------------------------------------------------------------------------

  describe('POST /stripe', () => {
    it('缺少 signature 應該返回 400', async () => {
      const res = await app.request('/stripe', {
        method: 'POST',
        body: '{}',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Missing signature');
    });

    it('無效的 signature 應該返回 401', async () => {
      mockVerifyStripe.mockReturnValue(false);

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=123,v1=invalid' },
        body: '{"type":"test"}',
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid signature');
    });

    it('checkout.session.completed + paid 應該觸發 handlePaymentSuccess', async () => {
      mockVerifyStripe.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            metadata: { payment_id: 'payment-1' },
            payment_status: 'paid',
            amount_total: 500000, // smallest currency unit (5000.00)
          },
        },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      // 2 updates: payment record + contract activation
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ receiptNo: 'cs_123' }),
      );
    });

    it('checkout.session.completed 沒有 payment_id 應該跳過', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_123', metadata: {}, payment_status: 'paid' },
        },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('checkout.session.completed + unpaid 應該跳過', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            metadata: { payment_id: 'payment-1' },
            payment_status: 'unpaid',
          },
        },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('checkout.session.expired 應該只記錄不處理', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = {
        type: 'checkout.session.expired',
        data: {
          object: { id: 'cs_expired', metadata: { payment_id: 'payment-1' } },
        },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('payment_intent.succeeded 應該返回 200', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
    });

    it('payment_intent.payment_failed 應該返回 200', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = {
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_failed' } },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
    });

    it('未知事件類型應該返回 200', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const event = { type: 'some.unknown.event', data: { object: {} } };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
    });

    it('無效 JSON 應該返回 500', async () => {
      mockVerifyStripe.mockReturnValue(true);

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: 'not json',
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Webhook processing failed');
    });

    it('handlePaymentSuccess 拋出錯誤應該返回 500', async () => {
      mockVerifyStripe.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockUpdateWhere.mockRejectedValueOnce(new Error('DB error'));

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            metadata: { payment_id: 'payment-1' },
            payment_status: 'paid',
            amount_total: 500000,
          },
        },
      };

      const res = await app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /ecpay
  // ---------------------------------------------------------------------------

  describe('POST /ecpay', () => {
    it('CheckMacValue 驗證失敗應該返回錯誤', async () => {
      mockVerifyECPay.mockReturnValue(false);

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ RtnCode: '1', CheckMacValue: 'invalid' }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('0|ErrorMessage=Invalid CheckMacValue');
    });

    it('RtnCode=1 應該觸發 handlePaymentSuccess (JSON)', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      const params = {
        RtnCode: '1',
        RtnMsg: 'Succeeded',
        TradeNo: '2024010112345',
        MerchantTradeNo: 'GN1234567890',
        TradeAmt: '5000',
        CustomField1: 'payment-1',
      };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('form-urlencoded 格式應該正確解析', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      const params = new URLSearchParams({
        RtnCode: '1',
        RtnMsg: 'Succeeded',
        TradeNo: '2024010112345',
        TradeAmt: '5000',
        CustomField1: 'payment-1',
      });

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('RtnCode != 1 應該記錄失敗但仍返回 1|OK', async () => {
      mockVerifyECPay.mockReturnValue(true);

      const params = {
        RtnCode: '10100058',
        RtnMsg: 'Payment failed',
        TradeNo: '2024010112345',
        CustomField1: 'payment-1',
      };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('沒有 CustomField1 (paymentId) 應該跳過處理', async () => {
      mockVerifyECPay.mockReturnValue(true);

      const params = { RtnCode: '1', RtnMsg: 'Succeeded', TradeNo: '123' };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('無效的 content type 且非 JSON 應該返回錯誤', async () => {
      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json content',
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('0|ErrorMessage=Invalid content type');
    });

    it('處理錯誤應該返回 0|ErrorMessage', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockUpdateWhere.mockRejectedValueOnce(new Error('DB error'));

      const params = { RtnCode: '1', TradeNo: '123', TradeAmt: '5000', CustomField1: 'payment-1' };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const text = await res.text();
      expect(text).toBe('0|ErrorMessage=Processing failed');
    });

    it('有 TradeNo 時應優先使用 TradeNo 作為 transactionId', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([{ ...PAYMENT_ROW, contractId: null }]); // no contract

      const params = {
        RtnCode: '1',
        TradeNo: 'trade-123',
        MerchantTradeNo: 'merchant-456',
        TradeAmt: '5000',
        CustomField1: 'payment-1',
      };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ receiptNo: 'trade-123' }),
      );
    });

    it('沒有 TradeNo 時應該 fallback 到 MerchantTradeNo', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([{ ...PAYMENT_ROW, contractId: null }]);

      const params = {
        RtnCode: '1',
        MerchantTradeNo: 'merchant-456',
        TradeAmt: '5000',
        CustomField1: 'payment-1',
      };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const text = await res.text();
      expect(text).toBe('1|OK');
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ receiptNo: 'merchant-456' }),
      );
    });

    it('ECPay 未設定 HashKey/HashIV 時應該拒絕 (fail closed)', async () => {
      mockIsGatewayEnabled.mockReturnValue(false);
      mockVerifyECPay.mockReturnValue(true);

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ RtnCode: '1', TradeAmt: '5000', CustomField1: 'payment-1' }),
      });

      expect(await res.text()).toBe('0|ErrorMessage=Invalid CheckMacValue');
      expect(mockIsGatewayEnabled).toHaveBeenCalledWith('ecpay');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('SimulatePaid=1 (模擬付款) 不應該啟用合約', async () => {
      mockVerifyECPay.mockReturnValue(true);

      const params = {
        RtnCode: '1',
        TradeNo: 'trade-123',
        TradeAmt: '5000',
        SimulatePaid: '1',
        CustomField1: 'payment-1',
      };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      expect(await res.text()).toBe('1|OK');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('TradeAmt 少於應付金額時不應該更新付款或合約', async () => {
      mockVerifyECPay.mockReturnValue(true);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);

      const params = { RtnCode: '1', TradeNo: 'trade-123', TradeAmt: '1', CustomField1: 'payment-1' };

      const res = await app.request('/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      expect(await res.text()).toBe('1|OK');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /linepay/confirm
  // ---------------------------------------------------------------------------

  describe('POST /linepay/confirm', () => {
    it('缺少 transactionId 應該重定向到錯誤頁', async () => {
      const res = await app.request('/linepay/confirm?orderId=GNpayment-1', {
        method: 'POST',
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/payment/error');
      expect(res.headers.get('location')).toContain('Missing parameters');
    });

    it('缺少 orderId 應該重定向到錯誤頁', async () => {
      const res = await app.request('/linepay/confirm?transactionId=tx_123', {
        method: 'POST',
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/payment/error');
    });

    it('LINE Pay 未設定應該重定向到錯誤頁', async () => {
      process.env.LINEPAY_CHANNEL_ID = '';
      process.env.LINEPAY_CHANNEL_SECRET = '';

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/payment/error');
    });

    it('returnCode=0000 應該觸發 handlePaymentSuccess 並重定向到成功頁', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: { orderId: 'GNpayment-1', transactionId: 'tx_123', payInfo: [{ amount: 5000 }] },
        }),
      });
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]); // confirm: expected amount
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.status).toBe(302);
      const location = res.headers.get('location')!;
      expect(location).toContain('/payment/success');
      expect(location).toContain('transaction_id=tx_123');
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      // Confirm must send the expected amount, not 0
      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({ amount: 5000, currency: 'TWD' });
    });

    it('找不到付款記錄應該重定向到錯誤頁且不呼叫 LINE Pay', async () => {
      mockSelectLimit.mockResolvedValueOnce([]);

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/payment/error');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('LINE Pay 回傳的 orderId 不符時不應該更新付款', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: { orderId: 'GNother-payment', transactionId: 'tx_123' },
        }),
      });

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.headers.get('location')).toContain('/payment/error');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('payInfo 金額不足時不應該更新付款或合約', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: { orderId: 'GNpayment-1', payInfo: [{ amount: 1 }] },
        }),
      });

      await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('非 0000 returnCode 應該重定向到錯誤頁', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '1172',
          returnMessage: 'Transaction expired',
        }),
      });

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.status).toBe(302);
      const location = res.headers.get('location')!;
      expect(location).toContain('/payment/error');
      expect(location).toContain('Transaction');
    });

    it('fetch 失敗應該重定向到錯誤頁', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const res = await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/payment/error');
    });

    it('應該使用正確的 LINE Pay API 端點和 headers', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: {},
        }),
      });
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockSelectLimit.mockResolvedValueOnce([]);

      await app.request(
        '/linepay/confirm?transactionId=tx_999&orderId=GNpayment-1',
        { method: 'POST' },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api-pay.line.me/v3/payments/tx_999/confirm',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-LINE-ChannelId': 'test_channel_id',
          }),
        }),
      );
    });

    it('應該從 orderId 移除 GN 前綴作為 paymentId', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          returnCode: '0000',
          returnMessage: 'Success',
          info: {},
        }),
      });
      mockSelectLimit.mockResolvedValueOnce([{ amount: '5000' }]);
      mockSelectLimit.mockResolvedValueOnce([{ ...PAYMENT_ROW, contractId: null }]);

      await app.request(
        '/linepay/confirm?transactionId=tx_123&orderId=GNpay-abc-123',
        { method: 'POST' },
      );

      // handlePaymentSuccess is called → db.update(payments).set({...}).where(eq(payments.id, 'pay-abc-123'))
      // The receiptNo should be the transactionId
      expect(mockUpdateWhere).toHaveBeenCalledWith({ _op: 'eq', a: 'id', b: 'pay-abc-123' });
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          receiptNo: 'tx_123',
          notes: expect.stringContaining('linepay'),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /linepay (async webhook)
  // ---------------------------------------------------------------------------

  describe('POST /linepay', () => {
    it('有 signature 但驗證失敗應該返回 401', async () => {
      mockVerifyLinePay.mockReturnValue(false);

      const res = await app.request('/linepay', {
        method: 'POST',
        headers: { 'X-Line-Signature': 'invalid_sig' },
        body: '{"type":"payment","result":{"returnCode":"0000"}}',
      });

      expect(res.status).toBe(401);
    });

    it('沒有 signature 應該返回 401 (#4)', async () => {
      mockVerifyLinePay.mockReturnValue(true);

      const event = {
        type: 'payment',
        result: { transactionId: 'tx_123', returnCode: '0000' },
      };

      const res = await app.request('/linepay', {
        method: 'POST',
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid or missing signature');
      expect(mockVerifyLinePay).not.toHaveBeenCalled();
    });

    it('有效 signature 的 payment 事件應該返回 200', async () => {
      mockVerifyLinePay.mockReturnValue(true);

      const event = {
        type: 'payment',
        result: { transactionId: 'tx_123', returnCode: '0000' },
      };

      const res = await app.request('/linepay', {
        method: 'POST',
        headers: { 'X-Line-Signature': 'valid_sig' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
    });

    it('refund 事件應該返回 200', async () => {
      mockVerifyLinePay.mockReturnValue(true);
      const event = {
        type: 'refund',
        result: { transactionId: 'tx_refund' },
      };

      const res = await app.request('/linepay', {
        method: 'POST',
        headers: { 'X-Line-Signature': 'valid_sig' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
    });

    it('未知事件類型應該返回 200', async () => {
      mockVerifyLinePay.mockReturnValue(true);
      const event = { type: 'unknown_event', result: {} };

      const res = await app.request('/linepay', {
        method: 'POST',
        headers: { 'X-Line-Signature': 'valid_sig' },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
    });

    it('無效 JSON 應該返回 500', async () => {
      mockVerifyLinePay.mockReturnValue(true);
      const res = await app.request('/linepay', {
        method: 'POST',
        headers: { 'X-Line-Signature': 'valid_sig' },
        body: 'not json',
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Webhook processing failed');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id/status (removed: public payment info leak, #5)
  // ---------------------------------------------------------------------------

  describe('GET /:id/status', () => {
    it('公開的付款狀態端點已移除，應該返回 404 且不查詢 DB', async () => {
      const res = await app.request('/payment-1/status', { method: 'GET' });

      expect(res.status).toBe(404);
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // handlePaymentSuccess (tested indirectly via Stripe webhook)
  // ---------------------------------------------------------------------------

  describe('handlePaymentSuccess', () => {
    function makeStripeRequest(paymentId: string, amountTotal: number | null = 500000) {
      mockVerifyStripe.mockReturnValue(true);
      return app.request('/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: JSON.stringify({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_tx_123',
              metadata: { payment_id: paymentId },
              payment_status: 'paid',
              amount_total: amountTotal,
            },
          },
        }),
      });
    }

    it('有 contractId 時應該同時更新 payment 和 contract', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      const res = await makeStripeRequest('payment-1');
      expect(res.status).toBe(200);

      // 2 updates: payment receiptNo/notes + contract status
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdateSet).toHaveBeenLastCalledWith({ status: 'ACTIVE' });
    });

    it('只會將 DRAFT 合約啟用 (冪等，限定同 tenant)', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([CONTRACT_ROW]);

      await makeStripeRequest('payment-1');

      const contractWhere = mockUpdateWhere.mock.calls[1]![0] as { _op: string; args: unknown[] };
      expect(contractWhere._op).toBe('and');
      expect(contractWhere.args).toEqual(expect.arrayContaining([
        { _op: 'eq', a: 'contracts.id', b: 'contract-1' },
        { _op: 'eq', a: 'contracts.tenantId', b: 'tenant-1' },
        { _op: 'eq', a: 'contracts.status', b: 'DRAFT' },
      ]));
    });

    it('Stripe amount_total 少於應付金額時不應該更新付款或啟用合約 (#5)', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);

      const res = await makeStripeRequest('payment-1', 100); // 1.00 instead of 5000.00
      expect(res.status).toBe(200);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('Stripe 缺少 amount_total 時應該 fail closed', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);

      const res = await makeStripeRequest('payment-1', null);
      expect(res.status).toBe(200);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('付款金額足夠但不足合約總額時只更新 payment，不啟用合約', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockSelectLimit.mockResolvedValueOnce([{ totalAmount: '10000' }]);

      const res = await makeStripeRequest('payment-1');
      expect(res.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdateSet).not.toHaveBeenCalledWith({ status: 'ACTIVE' });
    });

    it('contractId 為 null 時應該只更新 payment', async () => {
      mockSelectLimit.mockResolvedValueOnce([{ ...PAYMENT_ROW, contractId: null }]);

      const res = await makeStripeRequest('payment-1');
      expect(res.status).toBe(200);

      // Only 1 update: payment only
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('查無 payment 記錄時不應該更新任何資料', async () => {
      mockSelectLimit.mockResolvedValueOnce([]);

      const res = await makeStripeRequest('payment-1');
      expect(res.status).toBe(200);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('DB 錯誤應該向上拋出導致 500', async () => {
      mockSelectLimit.mockResolvedValueOnce([PAYMENT_ROW]);
      mockUpdateWhere.mockRejectedValueOnce(new Error('Write failed'));

      const res = await makeStripeRequest('payment-1');
      expect(res.status).toBe(500);
    });
  });
});
