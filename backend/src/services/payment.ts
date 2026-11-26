import crypto from 'crypto';
import { db, payments } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getTenantIdForBranch } from '../utils/tenant-cache.js';

const PAYMENT_ID_SELECT = {
  id: payments.id,
};

// =============================================================================
// PAYMENT GATEWAY SERVICE
// =============================================================================
// Unified payment interface supporting:
// - Stripe (International credit cards)
// - ECPay (Taiwan local payments - 綠界)
// - LINE Pay
// - Manual (Cash/bank transfer)

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type PaymentGateway = 'stripe' | 'ecpay' | 'linepay' | 'manual';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';

interface PaymentConfig {
  stripe: {
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
  };
  ecpay: {
    merchantId: string | null;
    hashKey: string | null;
    hashIv: string | null;
    apiUrl: string;
  };
  linepay: {
    channelId: string | null;
    channelSecret: string | null;
    apiUrl: string;
  };
}

export interface CreatePaymentOptions {
  gateway: PaymentGateway;
  amount: number;
  currency?: string; // default: TWD
  contractId: string;
  memberId: string;
  branchId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  returnUrl?: string;
  callbackUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  checkoutUrl?: string;
  status?: PaymentStatus;
  error?: string;
  rawResponse?: unknown;
}

export interface RefundOptions {
  paymentId: string;
  amount?: number; // partial refund if specified
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// Module State
// -----------------------------------------------------------------------------

// Loaded from env at startup; initPaymentService can still override (tests).
// Without this every gateway stayed unconfigured and all webhooks failed closed.
let config: PaymentConfig = {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || null,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  },
  ecpay: {
    merchantId: process.env.ECPAY_MERCHANT_ID || null,
    hashKey: process.env.ECPAY_HASH_KEY || null,
    hashIv: process.env.ECPAY_HASH_IV || null,
    apiUrl: process.env.ECPAY_API_URL || 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
  },
  linepay: {
    channelId: process.env.LINEPAY_CHANNEL_ID || null,
    channelSecret: process.env.LINEPAY_CHANNEL_SECRET || null,
    // Sandbox: https://sandbox-api-pay.line.me
    apiUrl: process.env.LINEPAY_API_URL || 'https://api-pay.line.me',
  },
};

// Initialization state (checked by isGatewayEnabled)

/**
 * Extract error message from unknown catch value
 */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error ? error.message : fallback;
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

/**
 * Initialize payment service with gateway credentials
 */
export function initPaymentService(options: {
  stripe?: { secretKey?: string; publishableKey?: string; webhookSecret?: string };
  ecpay?: { merchantId?: string; hashKey?: string; hashIv?: string; apiUrl?: string };
  linepay?: { channelId?: string; channelSecret?: string; apiUrl?: string };
}): boolean {
  if (options.stripe) {
    config.stripe = {
      secretKey: options.stripe.secretKey || null,
      publishableKey: options.stripe.publishableKey || null,
      webhookSecret: options.stripe.webhookSecret || null,
    };
  }

  if (options.ecpay) {
    config.ecpay = {
      merchantId: options.ecpay.merchantId || null,
      hashKey: options.ecpay.hashKey || null,
      hashIv: options.ecpay.hashIv || null,
      apiUrl: options.ecpay.apiUrl || config.ecpay.apiUrl,
    };
  }

  if (options.linepay) {
    config.linepay = {
      channelId: options.linepay.channelId || null,
      channelSecret: options.linepay.channelSecret || null,
      apiUrl: options.linepay.apiUrl || config.linepay.apiUrl,
    };
  }

  console.log('[PaymentService] Initialized');
  return true;
}

/**
 * Check if a specific gateway is configured
 */
export function isGatewayEnabled(gateway: PaymentGateway): boolean {
  switch (gateway) {
    case 'stripe':
      return !!config.stripe.secretKey;
    case 'ecpay':
      return !!config.ecpay.merchantId && !!config.ecpay.hashKey && !!config.ecpay.hashIv;
    case 'linepay':
      return !!config.linepay.channelId && !!config.linepay.channelSecret;
    case 'manual':
      return true;
    default:
      return false;
  }
}

/**
 * One-line summary of which gateways are live vs test, for ops to verify after
 * a deploy (no secrets are logged).
 */
export function describeGatewayModes(): string {
  const mode = (enabled: boolean, test: boolean) => (!enabled ? 'off' : test ? 'TEST' : 'LIVE');
  return [
    `stripe=${mode(isGatewayEnabled('stripe'), !config.stripe.secretKey?.includes('_live_'))}`, // sk_live_ / rk_live_
    `ecpay=${mode(isGatewayEnabled('ecpay'), config.ecpay.apiUrl.includes('-stage.'))}`,
    `linepay=${mode(isGatewayEnabled('linepay'), config.linepay.apiUrl.includes('sandbox'))}`,
  ].join(' ');
}

if (process.env.NODE_ENV !== 'test') {
  console.log(`[PaymentService] Gateways: ${describeGatewayModes()}`);
}

// -----------------------------------------------------------------------------
// Main Payment Functions
// -----------------------------------------------------------------------------

/**
 * Create a payment
 */
export async function createPayment(options: CreatePaymentOptions): Promise<PaymentResult> {
  const { gateway, amount, currency = 'TWD', contractId, memberId, branchId, description } = options;

  // Use memberId for logging but not required for payment creation
  console.log(`[PaymentService] Creating payment for member ${memberId}, amount: ${amount} ${currency}`);

  if (!isGatewayEnabled(gateway)) {
    return { success: false, error: `Payment gateway ${gateway} not configured` };
  }

  if (amount <= 0) {
    return { success: false, error: 'Invalid payment amount' };
  }

  try {
    // payments.tenant_id is NOT NULL; a row without it would be invisible to
    // every tenant-scoped query, so refuse rather than insert an orphan
    const tenantId = await getTenantIdForBranch(branchId);
    if (!tenantId) {
      return { success: false, error: 'Branch tenant could not be resolved' };
    }

    // Create payment record first
    const [paymentRecord] = await db.insert(payments).values({
      contractId,
      memberId,
      branchId,
      amount: amount.toString(),
      paymentMethod: gatewayToPaymentMethod(gateway),
      paymentDate: new Date(),
      type: 'INCOME',
      notes: description || `Payment via ${gateway}`,
      tenantId,
    }).returning(PAYMENT_ID_SELECT);

    // Process payment based on gateway
    let result: PaymentResult;
    switch (gateway) {
      case 'stripe':
        result = await processStripePayment(paymentRecord.id, amount, currency, options);
        break;
      case 'ecpay':
        result = await processECPayPayment(paymentRecord.id, amount, options);
        break;
      case 'linepay':
        result = await processLinePayPayment(paymentRecord.id, amount, options);
        break;
      case 'manual':
        result = await processManualPayment(paymentRecord.id, options);
        break;
      /* v8 ignore next 4 -- compile-time exhaustive check, unreachable at runtime */
      default: {
        const _exhaustive: never = gateway;
        result = { success: false, error: `Unknown gateway: ${_exhaustive}` };
      }
    }

    result.paymentId = paymentRecord.id;
    return result;

  } catch (error) {
    console.error('[PaymentService] Create payment error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

const PAYMENT_STATUS_SELECT = {
  id: payments.id,
  type: payments.type,
};

const PAYMENT_REFUND_SELECT = {
  id: payments.id,
  type: payments.type,
  amount: payments.amount,
  paymentMethod: payments.paymentMethod,
  contractId: payments.contractId,
  memberId: payments.memberId,
  branchId: payments.branchId,
  tenantId: payments.tenantId,
  receiptNo: payments.receiptNo,
};

type PaymentRefundInfo = {
  id: string;
  type: string;
  amount: string;
  paymentMethod: string;
  contractId: string | null;
  memberId: string;
  branchId: string;
  tenantId: string | null;
  receiptNo: string | null;
};

/**
 * Get payment status
 */
export async function getPaymentStatus(paymentId: string): Promise<PaymentResult> {
  try {
    const [payment] = await db
      .select(PAYMENT_STATUS_SELECT)
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    // Determine status based on type field
    const status: PaymentStatus = payment.type === 'REFUND' ? 'refunded' : 'completed';

    return {
      success: true,
      paymentId: payment.id,
      status,
    };

  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Process refund
 */
export async function processRefund(options: RefundOptions): Promise<RefundResult> {
  const { paymentId, amount, reason } = options;

  try {
    const [payment] = await db
      .select(PAYMENT_REFUND_SELECT)
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.type === 'REFUND') {
      return { success: false, error: 'Payment is already refunded' };
    }

    const refundAmount = amount || parseFloat(payment.amount);
    const gateway = paymentMethodToGateway(payment.paymentMethod);

    // Process refund based on gateway
    let result: RefundResult;
    switch (gateway) {
      case 'stripe':
        result = await processStripeRefund(payment, refundAmount, reason);
        break;
      case 'ecpay':
        result = await processECPayRefund(payment, refundAmount, reason);
        break;
      case 'linepay':
        result = await processLinePayRefund(payment, refundAmount, reason);
        break;
      default:
        // Manual refund
        result = { success: true, refundId: crypto.randomUUID(), amount: refundAmount };
    }

    // Create refund record if successful
    if (result.success) {
      await db.insert(payments).values({
        contractId: payment.contractId,
        memberId: payment.memberId,
        branchId: payment.branchId,
        amount: (-refundAmount).toString(),
        paymentMethod: payment.paymentMethod,
        paymentDate: new Date(),
        type: 'REFUND',
        notes: `Refund for ${paymentId}: ${reason || 'No reason provided'}`,
        tenantId: payment.tenantId,
      });
    }

    return result;

  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

// -----------------------------------------------------------------------------
// Stripe Implementation
// -----------------------------------------------------------------------------

async function processStripePayment(
  paymentId: string,
  amount: number,
  currency: string,
  options: CreatePaymentOptions
): Promise<PaymentResult> {
  try {
    // Create Stripe Checkout Session
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.stripe.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': options.description || 'Gym Membership Payment',
        'line_items[0][price_data][unit_amount]': Math.round(amount * 100).toString(), // Stripe uses cents
        'line_items[0][quantity]': '1',
        'success_url': options.returnUrl || `${process.env.FRONTEND_URL}/payment/success?payment_id=${paymentId}`,
        'cancel_url': options.returnUrl || `${process.env.FRONTEND_URL}/payment/cancel?payment_id=${paymentId}`,
        'metadata[payment_id]': paymentId,
        'metadata[contract_id]': options.contractId,
        'metadata[member_id]': options.memberId,
      }),
    });

    const data = await response.json() as { id?: string; url?: string; error?: { message: string } };

    if (!response.ok) {
      return { success: false, error: data.error?.message || 'Stripe error' };
    }

    return {
      success: true,
      transactionId: data.id,
      checkoutUrl: data.url,
      status: 'pending',
    };

  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Stripe error') };
  }
}

async function processStripeRefund(
  payment: PaymentRefundInfo,
  amount: number,
  reason?: string
): Promise<RefundResult> {
  // ponytail: not integrated (needs the session's payment_intent). Fail closed so a
  // refund is never recorded without money going back; refund in the Stripe dashboard.
  console.warn(`[PaymentService] Stripe refund not integrated: payment ${payment.id}, amount: ${amount}, reason: ${reason}`);
  return { success: false, error: 'Stripe 線上退款尚未串接，請至 Stripe 後台退款' };
}

// -----------------------------------------------------------------------------
// ECPay Implementation (綠界)
// -----------------------------------------------------------------------------

function formatECPayDate(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function processECPayPayment(
  paymentId: string,
  amount: number,
  options: CreatePaymentOptions
): Promise<PaymentResult> {
  try {
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const merchantTradeNo = `GN${Date.now()}${randomSuffix}`;
    const merchantTradeDate = formatECPayDate(new Date());

    const params: Record<string, string> = {
      MerchantID: config.ecpay.merchantId!,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: merchantTradeDate,
      PaymentType: 'aio',
      TotalAmount: Math.round(amount).toString(),
      TradeDesc: encodeURIComponent(options.description || 'Gym Nexus Payment'),
      ItemName: encodeURIComponent(options.description || '健身房費用'),
      ReturnURL: options.callbackUrl || `${process.env.API_URL}/api/payments/webhook/ecpay`,
      OrderResultURL: options.returnUrl || `${process.env.FRONTEND_URL}/payment/result`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      CustomField1: paymentId,
      CustomField2: options.contractId,
    };

    // Generate CheckMacValue
    params.CheckMacValue = generateECPayCheckMac(params);

    // Build form HTML for redirect
    const formHtml = buildECPayForm(params);

    return {
      success: true,
      transactionId: merchantTradeNo,
      checkoutUrl: formHtml, // Return form HTML to be rendered
      status: 'pending',
    };

  /* v8 ignore start -- defensive: ECPay API integration pending */
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'ECPay error') };
  }
  /* v8 ignore stop */
}

function generateECPayCheckMac(params: Record<string, string>): string {
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

  // Add HashKey and HashIV
  const rawString = `HashKey=${config.ecpay.hashKey}&${queryString}&HashIV=${config.ecpay.hashIv}`;

  // URL encode
  const encoded = encodeURIComponent(rawString).toLowerCase();

  // SHA256 hash
  const hash = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();

  return hash;
}

function buildECPayForm(params: Record<string, string>): string {
  const inputs = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
    .join('');

  return `
    <form id="ecpay-form" action="${config.ecpay.apiUrl}" method="POST">
      ${inputs}
    </form>
    <script>document.getElementById('ecpay-form').submit();</script>
  `;
}

async function processECPayRefund(
  payment: PaymentRefundInfo,
  amount: number,
  reason?: string
): Promise<RefundResult> {
  // ponytail: not integrated (credit card refunds use ECPay's DoAction API). Fail
  // closed so a refund is never recorded without money going back.
  console.warn(`[PaymentService] ECPay refund not integrated: payment ${payment.id}, amount: ${amount}, reason: ${reason}`);
  return { success: false, error: '綠界線上退款尚未串接，請至綠界廠商後台退款' };
}

// -----------------------------------------------------------------------------
// LINE Pay Implementation
// -----------------------------------------------------------------------------

async function processLinePayPayment(
  paymentId: string,
  amount: number,
  options: CreatePaymentOptions
): Promise<PaymentResult> {
  try {
    // orderId is the payment id, so the confirm callback can find the payment
    const orderId = paymentId;
    const requestBody = {
      amount,
      currency: 'TWD',
      orderId,
      packages: [{
        id: paymentId,
        amount,
        name: options.description || 'Gym Nexus Payment',
        products: [{
          name: options.description || '健身房費用',
          quantity: 1,
          price: amount,
        }],
      }],
      redirectUrls: {
        // Always the backend confirm endpoint: confirming is what captures the
        // payment. The user is redirected to the frontend after that.
        confirmUrl: `${process.env.API_URL}/api/payments/webhook/linepay/confirm`,
        cancelUrl: `${process.env.FRONTEND_URL}/payment/cancel`,
      },
    };

    const data = await linePayRequest<{ paymentUrl?: { web?: string }; transactionId?: string }>(
      '/v3/payments/request',
      requestBody,
    );

    if (data.returnCode !== '0000') {
      return { success: false, error: data.returnMessage || 'LINE Pay error' };
    }

    return {
      success: true,
      transactionId: data.info?.transactionId,
      checkoutUrl: data.info?.paymentUrl?.web,
      status: 'pending',
    };

  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'LINE Pay error') };
  }
}

function generateLinePaySignature(uri: string, body: string, nonce: string): string {
  const message = config.linepay.channelSecret + uri + body + nonce;
  return crypto.createHmac('sha256', config.linepay.channelSecret!).update(message).digest('base64');
}

interface LinePayResponse<T> {
  returnCode: string;
  returnMessage: string;
  info?: T;
}

/**
 * Parse a LINE Pay response keeping transaction ids as strings: they are
 * 19-digit numbers, beyond Number.MAX_SAFE_INTEGER, so JSON.parse would
 * silently change them.
 */
export function parseLinePayJson<T>(text: string): LinePayResponse<T> {
  return JSON.parse(
    text.replace(/"(transactionId|refundTransactionId)"\s*:\s*(\d+)/g, '"$1":"$2"'),
  ) as LinePayResponse<T>;
}

/** Signed POST to the LINE Pay v3 API (production or sandbox per LINEPAY_API_URL) */
async function linePayRequest<T>(uri: string, body: unknown): Promise<LinePayResponse<T>> {
  const json = JSON.stringify(body);
  const nonce = crypto.randomUUID();
  const response = await fetch(`${config.linepay.apiUrl}${uri}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': config.linepay.channelId!,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': generateLinePaySignature(uri, json, nonce),
    },
    body: json,
  });
  return parseLinePayJson<T>(await response.text());
}

export interface LinePayConfirmResult {
  success: boolean;
  error?: string;
  orderId?: string;
  paidAmount?: number;
}

/**
 * Confirm (capture) a LINE Pay payment after the user approved it.
 * LINE Pay rejects the confirm if `amount` differs from the reserved amount.
 */
export async function confirmLinePayPayment(
  transactionId: string,
  amount: number,
): Promise<LinePayConfirmResult> {
  if (!isGatewayEnabled('linepay')) {
    return { success: false, error: 'LINE Pay not configured' };
  }
  if (!/^\d+$/.test(transactionId)) {
    return { success: false, error: 'Invalid transaction id' };
  }

  const data = await linePayRequest<{ orderId?: string; payInfo?: { amount?: number }[] }>(
    `/v3/payments/${transactionId}/confirm`,
    { amount, currency: 'TWD' },
  );

  if (data.returnCode !== '0000') {
    return { success: false, error: data.returnMessage || `LINE Pay error ${data.returnCode}` };
  }

  const payInfo = data.info?.payInfo;
  return {
    success: true,
    orderId: data.info?.orderId,
    paidAmount: payInfo?.length
      ? payInfo.reduce((total, p) => total + Number(p.amount), 0)
      : amount,
  };
}

async function processLinePayRefund(
  payment: PaymentRefundInfo,
  amount: number,
  reason?: string
): Promise<RefundResult> {
  // The original LINE Pay transaction id is stored in receiptNo by the confirm step
  const transactionId = payment.receiptNo;
  if (!transactionId || !/^\d+$/.test(transactionId)) {
    return { success: false, error: 'LINE Pay transaction id not found for this payment' };
  }

  try {
    const data = await linePayRequest<{ refundTransactionId?: string }>(
      `/v3/payments/${transactionId}/refund`,
      { refundAmount: amount },
    );

    if (data.returnCode !== '0000') {
      return { success: false, error: data.returnMessage || `LINE Pay refund error ${data.returnCode}` };
    }

    console.log(`[PaymentService] LINE Pay refund for payment ${payment.id}, amount: ${amount}, reason: ${reason}`);
    return {
      success: true,
      refundId: data.info?.refundTransactionId,
      amount,
    };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'LINE Pay refund error') };
  }
}

// -----------------------------------------------------------------------------
// Manual Payment
// -----------------------------------------------------------------------------

async function processManualPayment(
  paymentId: string,
  options: CreatePaymentOptions
): Promise<PaymentResult> {
  // Manual payments are recorded but not processed through a gateway
  // They are typically marked as paid by staff after receiving cash/transfer

  await db
    .update(payments)
    .set({ notes: `Manual payment - ${options.description || 'Cash/Bank Transfer'}` })
    .where(eq(payments.id, paymentId));

  return {
    success: true,
    transactionId: paymentId,
    status: 'completed', // Manual payments are immediately considered completed
  };
}

// -----------------------------------------------------------------------------
// Webhook Verification
// -----------------------------------------------------------------------------

/**
 * Verify Stripe webhook signature
 */
/** Stripe's default tolerance for the signed timestamp (seconds) */
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export function verifyStripeWebhook(payload: string, signature: string): boolean {
  if (!config.stripe.webhookSecret) return false;

  try {
    const parts = signature.split(',');
    const timestamp = parts.find(s => s.startsWith('t='))?.slice(2);
    // Stripe may send several v1 signatures (e.g. during secret rotation)
    const receivedSigs = parts.filter(s => s.startsWith('v1=')).map(s => s.slice(3));

    if (!timestamp || receivedSigs.length === 0) return false;

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS
    ) {
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = Buffer.from(
      crypto
        .createHmac('sha256', config.stripe.webhookSecret)
        .update(signedPayload)
        .digest('hex'),
    );

    return receivedSigs.some((sig) => {
      const received = Buffer.from(sig);
      return received.length === expectedSignature.length &&
        crypto.timingSafeEqual(received, expectedSignature);
    });
  /* v8 ignore start -- defensive: standard crypto ops unlikely to throw */
  } catch {
    return false;
  }
  /* v8 ignore stop */
}

/**
 * Verify ECPay webhook CheckMacValue
 */
export function verifyECPayWebhook(params: Record<string, string>): boolean {
  const receivedMac = params.CheckMacValue;
  if (!receivedMac) return false;

  const paramsWithoutMac = { ...params };
  delete paramsWithoutMac.CheckMacValue;

  const expectedMac = generateECPayCheckMac(paramsWithoutMac);
  return receivedMac === expectedMac;
}

/**
 * Verify LINE Pay webhook
 */
export function verifyLinePayWebhook(signature: string, body: string): boolean {
  if (!config.linepay.channelSecret) return false;

  const expectedSig = crypto
    .createHmac('sha256', config.linepay.channelSecret)
    .update(body)
    .digest('base64');

  return signature === expectedSig;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

type PaymentMethod = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BANK_TRANSFER' | 'LINE_PAY' | 'OTHER';

function gatewayToPaymentMethod(gateway: PaymentGateway): PaymentMethod {
  const map: Record<PaymentGateway, PaymentMethod> = {
    stripe: 'CREDIT_CARD',
    ecpay: 'CREDIT_CARD',
    linepay: 'LINE_PAY',
    manual: 'CASH',
  };
  return map[gateway];
}

function paymentMethodToGateway(method: string | null): PaymentGateway {
  if (!method) return 'manual';
  const map: Record<string, PaymentGateway> = {
    CREDIT_CARD: 'stripe',
    LINE_PAY: 'linepay',
    CASH: 'manual',
    BANK_TRANSFER: 'manual',
    DEBIT_CARD: 'ecpay',
  };
  return map[method] || 'manual';
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const paymentService = {
  initPaymentService,
  isGatewayEnabled,
  createPayment,
  getPaymentStatus,
  processRefund,
  verifyStripeWebhook,
  verifyECPayWebhook,
  verifyLinePayWebhook,
};

export default paymentService;
