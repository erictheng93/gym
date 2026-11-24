import { Hono } from 'hono';
import { db, payments, contracts } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import {
  isGatewayEnabled,
  verifyStripeWebhook,
  verifyECPayWebhook,
  verifyLinePayWebhook,
} from '../services/payment.js';

// =============================================================================
// PAYMENT WEBHOOK ROUTES
// =============================================================================
// Handles callbacks from payment gateways

const PAYMENT_AMOUNT_SELECT = {
  amount: payments.amount,
};

const PAYMENT_SUCCESS_SELECT = {
  amount: payments.amount,
  contractId: payments.contractId,
  tenantId: payments.tenantId,
};

const CONTRACT_TOTAL_AMOUNT_SELECT = {
  totalAmount: contracts.totalAmount,
};

const app = new Hono();

// -----------------------------------------------------------------------------
// POST /api/payments/webhook/stripe - Stripe Webhook
// -----------------------------------------------------------------------------

app.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const rawBody = await c.req.text();

  if (!verifyStripeWebhook(rawBody, signature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const event = JSON.parse(rawBody) as {
      type: string;
      data: {
        object: {
          id?: string;
          metadata?: { payment_id?: string; contract_id?: string };
          payment_status?: string;
          status?: string;
          amount_total?: number | null;
        };
      };
    };

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const paymentId = session.metadata?.payment_id;

        if (paymentId && session.payment_status === 'paid') {
          // Payment was successful
          // amount_total is in the smallest currency unit; checkout sessions are
          // created with unit_amount = amount * 100 (see services/payment.ts)
          await handlePaymentSuccess(paymentId, {
            gateway: 'stripe',
            transactionId: session.id,
            paidAmount: typeof session.amount_total === 'number' ? session.amount_total / 100 : NaN,
          });
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const paymentId = session.metadata?.payment_id;

        if (paymentId) {
          // Payment session expired - no action needed as payment stays unpaid
          console.log(`[Stripe Webhook] Session expired for payment ${paymentId}`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        // Handle direct payment intent (for future use)
        console.log(`[Stripe Webhook] Payment intent succeeded: ${event.data.object.id}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        // Handle failed payment
        console.log(`[Stripe Webhook] Payment intent failed: ${event.data.object.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });

  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// -----------------------------------------------------------------------------
// POST /api/payments/webhook/ecpay - ECPay Webhook
// -----------------------------------------------------------------------------

app.post('/ecpay', async (c) => {
  const contentType = c.req.header('content-type');
  let params: Record<string, string>;

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const body = await c.req.parseBody();
    params = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v)])
    );
  } else {
    // Try to parse as JSON
    try {
      params = await c.req.json();
    } catch {
      return c.text('0|ErrorMessage=Invalid content type', 200);
    }
  }

  // CheckMacValue is computable by anyone when HashKey/HashIV are unset
  if (!isGatewayEnabled('ecpay') || !verifyECPayWebhook(params)) {
    console.error('[ECPay Webhook] Invalid CheckMacValue');
    return c.text('0|ErrorMessage=Invalid CheckMacValue', 200);
  }

  try {
    const rtnCode = params.RtnCode;
    const rtnMsg = params.RtnMsg;
    const tradeNo = params.TradeNo;
    const merchantTradeNo = params.MerchantTradeNo;
    const paymentId = params.CustomField1;
    // CustomField2 contains contractId for reference

    console.log(`[ECPay Webhook] TradeNo: ${tradeNo}, RtnCode: ${rtnCode}, RtnMsg: ${rtnMsg}`);

    if (params.SimulatePaid === '1') {
      // Simulated payment triggered from the ECPay merchant dashboard - no money received
      console.log(`[ECPay Webhook] Ignoring simulated payment for ${merchantTradeNo}`);
    } else if (rtnCode === '1') {
      // Payment successful
      if (paymentId) {
        await handlePaymentSuccess(paymentId, {
          gateway: 'ecpay',
          transactionId: tradeNo || merchantTradeNo,
          paidAmount: Number(params.TradeAmt),
        });
      }
    } else {
      // Payment failed
      console.log(`[ECPay Webhook] Payment failed: ${rtnMsg}`);
    }

    // ECPay requires "1|OK" response for successful processing
    return c.text('1|OK', 200);

  } catch (error) {
    console.error('[ECPay Webhook] Error:', error);
    return c.text('0|ErrorMessage=Processing failed', 200);
  }
});

// -----------------------------------------------------------------------------
// POST /api/payments/webhook/linepay/confirm - LINE Pay Confirm
// -----------------------------------------------------------------------------

app.post('/linepay/confirm', async (c) => {
  const transactionId = c.req.query('transactionId');
  const orderId = c.req.query('orderId');

  if (!transactionId || !orderId) {
    return c.redirect(`${process.env.FRONTEND_URL}/payment/error?message=Missing parameters`);
  }

  try {
    // Get LINE Pay config
    const channelId = process.env.LINEPAY_CHANNEL_ID;
    const channelSecret = process.env.LINEPAY_CHANNEL_SECRET;

    if (!channelId || !channelSecret) {
      throw new Error('LINE Pay not configured');
    }

    // Find payment by orderId (which should be the payment ID)
    // In a real implementation, orderId should contain or map to payment ID
    const paymentId = orderId.replace('GN', '');
    const [payment] = await db
      .select(PAYMENT_AMOUNT_SELECT)
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Confirm with the expected amount; LINE Pay rejects the confirm when it
    // does not match the reserved transaction amount
    const expectedAmount = Number(payment.amount);
    const requestUri = `/v3/payments/${transactionId}/confirm`;
    const requestBody = JSON.stringify({
      amount: expectedAmount,
      currency: 'TWD',
    });

    const crypto = await import('crypto');
    const nonce = crypto.randomUUID();
    const message = channelSecret + requestUri + requestBody + nonce;
    const signature = crypto.createHmac('sha256', channelSecret).update(message).digest('base64');

    const response = await fetch(`https://api-pay.line.me${requestUri}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': channelId,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature,
      },
      body: requestBody,
    });

    const data = await response.json() as {
      returnCode: string;
      returnMessage: string;
      info?: { orderId?: string; transactionId?: string; payInfo?: { amount?: number }[] };
    };

    if (data.returnCode === '0000') {
      if (data.info?.orderId && data.info.orderId !== orderId) {
        throw new Error(`Order mismatch: expected ${orderId}, got ${data.info.orderId}`);
      }

      // Payment confirmed successfully
      console.log(`[LINE Pay Webhook] Payment confirmed for order ${orderId}`);

      const payInfo = data.info?.payInfo;
      await handlePaymentSuccess(paymentId, {
        gateway: 'linepay',
        transactionId: transactionId,
        paidAmount: payInfo?.length
          ? payInfo.reduce((total, p) => total + Number(p.amount), 0)
          : expectedAmount,
      });

      return c.redirect(`${process.env.FRONTEND_URL}/payment/success?transaction_id=${transactionId}`);
    } else {
      console.error(`[LINE Pay Webhook] Confirm failed: ${data.returnMessage}`);
      return c.redirect(`${process.env.FRONTEND_URL}/payment/error?message=${encodeURIComponent(data.returnMessage)}`);
    }

  } catch (error) {
    console.error('[LINE Pay Webhook] Error:', error);
    return c.redirect(`${process.env.FRONTEND_URL}/payment/error?message=Processing failed`);
  }
});

// -----------------------------------------------------------------------------
// POST /api/payments/webhook/linepay - LINE Pay Webhook (for async notifications)
// -----------------------------------------------------------------------------

app.post('/linepay', async (c) => {
  const signature = c.req.header('X-Line-Signature');
  const rawBody = await c.req.text();

  if (!signature || !verifyLinePayWebhook(signature, rawBody)) {
    return c.json({ error: 'Invalid or missing signature' }, 401);
  }

  try {
    const event = JSON.parse(rawBody) as {
      type: string;
      result: {
        transactionId?: string;
        orderId?: string;
        returnCode?: string;
      };
    };

    console.log(`[LINE Pay Webhook] Received event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'payment':
        if (event.result.returnCode === '0000') {
          console.log(`[LINE Pay Webhook] Payment confirmed: ${event.result.transactionId}`);
        }
        break;

      case 'refund':
        console.log(`[LINE Pay Webhook] Refund completed: ${event.result.transactionId}`);
        break;

      default:
        console.log(`[LINE Pay Webhook] Unhandled event: ${event.type}`);
    }

    return c.json({ received: true });

  } catch (error) {
    console.error('[LINE Pay Webhook] Error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

interface PaymentSuccessDetails {
  gateway: string;
  transactionId?: string;
  /** Amount reported by the gateway, in the same unit as payments.amount */
  paidAmount: number;
}

/** Compare money values in cents to avoid floating point drift */
function toCents(value: number | string | null): number {
  return Math.round(Number(value) * 100);
}

async function handlePaymentSuccess(paymentId: string, details: PaymentSuccessDetails): Promise<void> {
  try {
    const [payment] = await db
      .select(PAYMENT_SUCCESS_SELECT)
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      console.warn(`[Payment Success] Payment ${paymentId} not found`);
      return;
    }

    const paidCents = toCents(details.paidAmount);
    // ECPay charges whole TWD (TotalAmount is rounded, see services/payment.ts)
    const expectedCents = details.gateway === 'ecpay'
      ? toCents(Math.round(Number(payment.amount)))
      : toCents(payment.amount);

    // A missing amount (NaN) also fails this check
    if (!(paidCents >= expectedCents)) {
      console.warn(
        `[Payment Success] Payment ${paymentId} underpaid via ${details.gateway}: ` +
        `paid ${details.paidAmount}, expected ${payment.amount}`,
      );
      return;
    }

    // Update payment record with transaction details
    await db
      .update(payments)
      .set({
        receiptNo: details.transactionId,
        notes: `Paid via ${details.gateway} - Transaction: ${details.transactionId}`,
      })
      .where(eq(payments.id, paymentId));

    if (payment.contractId) {
      const contractConditions = [eq(contracts.id, payment.contractId)];
      if (payment.tenantId) {
        contractConditions.push(eq(contracts.tenantId, payment.tenantId));
      }

      const [contract] = await db
        .select(CONTRACT_TOTAL_AMOUNT_SELECT)
        .from(contracts)
        .where(and(...contractConditions))
        .limit(1);

      if (contract && paidCents >= toCents(contract.totalAmount)) {
        // Only DRAFT -> ACTIVE; never re-activate paused/expired/cancelled contracts
        await db
          .update(contracts)
          .set({ status: 'ACTIVE' })
          .where(and(...contractConditions, eq(contracts.status, 'DRAFT')));

        console.log(`[Payment Success] Contract ${payment.contractId} activated`);
      } else {
        console.warn(
          `[Payment Success] Contract ${payment.contractId} not activated: ` +
          `paid ${details.paidAmount} does not cover contract total`,
        );
      }
    }

    console.log(`[Payment Success] Payment ${paymentId} completed via ${details.gateway}`);

  } catch (error) {
    console.error('[Payment Success] Error:', error);
    throw error;
  }
}

export default app;
