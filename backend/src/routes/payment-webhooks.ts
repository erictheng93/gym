import { Hono } from 'hono';
import { db, payments, contracts } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import {
  isGatewayEnabled,
  verifyStripeWebhook,
  verifyECPayWebhook,
  verifyLinePayWebhook,
  confirmLinePayPayment,
} from '../services/payment.js';
import { recalculateContractPayment, toCents } from '../services/contract-payment.js';

// =============================================================================
// PAYMENT WEBHOOK ROUTES
// =============================================================================
// Handles callbacks from payment gateways

const PAYMENT_CONFIRM_SELECT = {
  amount: payments.amount,
  receiptNo: payments.receiptNo,
};

const PAYMENT_SUCCESS_SELECT = {
  amount: payments.amount,
  contractId: payments.contractId,
  tenantId: payments.tenantId,
  receiptNo: payments.receiptNo,
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
            transactionId: session.id ?? '',
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
// GET|POST /api/payments/webhook/linepay/confirm - LINE Pay Confirm
// -----------------------------------------------------------------------------
// LINE Pay redirects the user's browser here (GET) with ?transactionId&orderId
// after they approve the payment. orderId is our payment id.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.on(['GET', 'POST'], '/linepay/confirm', async (c) => {
  const frontendUrl = process.env.FRONTEND_URL;
  const transactionId = c.req.query('transactionId');
  const orderId = c.req.query('orderId');

  if (!transactionId || !orderId || !/^\d+$/.test(transactionId) || !UUID_RE.test(orderId)) {
    return c.redirect(`${frontendUrl}/payment/error?message=Missing parameters`);
  }

  const successUrl = `${frontendUrl}/payment/success?payment_id=${orderId}`;

  try {
    const [payment] = await db
      .select(PAYMENT_CONFIRM_SELECT)
      .from(payments)
      .where(eq(payments.id, orderId))
      .limit(1);

    if (!payment) {
      throw new Error(`Payment ${orderId} not found`);
    }

    // Already confirmed (page refresh / back button): LINE Pay would reject a
    // second confirm, so show success instead of an error
    if (payment.receiptNo === transactionId) {
      return c.redirect(successUrl);
    }

    const result = await confirmLinePayPayment(transactionId, Number(payment.amount));

    if (!result.success) {
      console.error(`[LINE Pay Webhook] Confirm failed: ${result.error}`);
      return c.redirect(`${frontendUrl}/payment/error?message=${encodeURIComponent(result.error || 'Confirm failed')}`);
    }

    if (result.orderId && result.orderId !== orderId) {
      throw new Error(`Order mismatch: expected ${orderId}, got ${result.orderId}`);
    }

    console.log(`[LINE Pay Webhook] Payment confirmed for order ${orderId}`);
    await handlePaymentSuccess(orderId, {
      gateway: 'linepay',
      transactionId,
      paidAmount: result.paidAmount ?? NaN,
    });

    return c.redirect(successUrl);
  } catch (error) {
    console.error('[LINE Pay Webhook] Error:', error);
    return c.redirect(`${frontendUrl}/payment/error?message=Processing failed`);
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
  /** Gateway transaction id; stored in payments.receiptNo as the processed marker */
  transactionId: string;
  /** Amount reported by the gateway, in the same unit as payments.amount */
  paidAmount: number;
}

/**
 * Record a successful gateway payment and update its contract.
 *
 * Runs in one transaction with the payment row locked (SELECT ... FOR UPDATE),
 * so retried and concurrent duplicate webhooks are serialized. A payment is
 * "processed" once payments.receiptNo holds a gateway transaction id (gateway
 * payment rows are created at checkout with receiptNo = NULL); a processed
 * payment is never processed again.
 */
async function handlePaymentSuccess(paymentId: string, details: PaymentSuccessDetails): Promise<void> {
  if (!details.transactionId) {
    console.warn(`[Payment Success] Payment ${paymentId} via ${details.gateway} has no transaction id; ignored`);
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [payment] = await tx
        .select(PAYMENT_SUCCESS_SELECT)
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1)
        .for('update');

      if (!payment) {
        console.warn(`[Payment Success] Payment ${paymentId} not found`);
        return;
      }

      if (payment.receiptNo) {
        if (payment.receiptNo === details.transactionId) {
          console.log(
            `[Payment Success] Payment ${paymentId} already processed ` +
            `(transaction ${details.transactionId}); duplicate webhook ignored`,
          );
        } else {
          // Possibly a second charge for the same payment - needs manual reconciliation
          console.error(
            `[Payment Success] Payment ${paymentId} already processed with transaction ` +
            `${payment.receiptNo}; ignoring different transaction ${details.transactionId} ` +
            `via ${details.gateway} (not counted, reconcile manually)`,
          );
        }
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

      // Mark the payment processed with the gateway transaction details
      await tx
        .update(payments)
        .set({
          receiptNo: details.transactionId,
          notes: `Paid via ${details.gateway} - Transaction: ${details.transactionId}`,
        })
        .where(eq(payments.id, paymentId));

      if (payment.contractId) {
        const summary = await recalculateContractPayment(tx, payment.contractId, payment.tenantId);

        // Partial payments (deposits/instalments) never auto-activate; staff do that manually
        if (summary && paidCents >= toCents(summary.totalAmount)) {
          // Only DRAFT -> ACTIVE; never re-activate paused/expired/cancelled contracts
          await tx
            .update(contracts)
            .set({ status: 'ACTIVE' })
            .where(and(
              eq(contracts.id, payment.contractId),
              eq(contracts.tenantId, payment.tenantId),
              eq(contracts.status, 'DRAFT'),
            ));

          console.log(`[Payment Success] Contract ${payment.contractId} activated`);
        } else {
          console.warn(
            `[Payment Success] Contract ${payment.contractId} not activated: ` +
            `paid ${details.paidAmount} does not cover contract total`,
          );
        }
      }

      console.log(`[Payment Success] Payment ${paymentId} completed via ${details.gateway}`);
    });
  } catch (error) {
    console.error('[Payment Success] Error:', error);
    throw error;
  }
}

export default app;
