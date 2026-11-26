import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import webhookRoutes from '../src/routes/payment-webhooks.js';
import { db, payments, contracts } from '../src/db/index.js';
import { initPaymentService } from '../src/services/payment.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
  TEST_PLAN_ID,
} from './helpers.js';

// =============================================================================
// PAYMENTS AGAINST A REAL DATABASE
// =============================================================================
// payment-webhook-routes.test.ts and payment-routes.test.ts cover routing and
// branching with a mocked db. These tests exercise the real transactions,
// FOR UPDATE locks, DRAFT-only activation and contract totals in Postgres.

const WEBHOOK_SECRET = 'whsec_real_db_test';
const createdContractIds: string[] = [];

function signStripe(body: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function stripeCompletedRequest(paymentId: string, sessionId: string, amount: number) {
  const body = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        metadata: { payment_id: paymentId },
        payment_status: 'paid',
        amount_total: Math.round(amount * 100),
      },
    },
  });
  return new Request('http://localhost/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': signStripe(body), 'Content-Type': 'application/json' },
    body,
  });
}

// Sent to the webhook router itself; the full-app path is covered at the bottom.
function stripeCompleted(paymentId: string, sessionId: string, amount: number) {
  return webhookRoutes.fetch(stripeCompletedRequest(paymentId, sessionId, amount));
}

async function createContract(totalAmount: string, status: 'DRAFT' | 'PAUSED' = 'DRAFT') {
  const id = crypto.randomUUID();
  await db.insert(contracts).values({
    id,
    contractNo: `WH${id.slice(0, 8)}`,
    memberId: TEST_MEMBER_ID,
    planId: TEST_PLAN_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    startDate: '2026-01-01',
    originalEndDate: '2026-02-01',
    endDate: '2026-02-01',
    status,
    totalAmount,
    paidAmount: '0',
    paymentStatus: 'UNPAID',
  });
  createdContractIds.push(id);
  return id;
}

/** A gateway checkout row, as createPayment() inserts it (receiptNo = NULL until paid) */
async function createCheckoutPayment(contractId: string, amount: string) {
  const [row] = await db.insert(payments).values({
    contractId,
    memberId: TEST_MEMBER_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    amount,
    paymentMethod: 'CREDIT_CARD',
    type: 'INCOME',
    notes: 'Payment via stripe',
  }).returning({ id: payments.id });
  return row.id;
}

async function getContract(id: string) {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  return row;
}

async function getPayment(id: string) {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row;
}

describe('Payments (real DB)', () => {
  let token: string;

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
    initPaymentService({ stripe: { secretKey: 'sk_test_real_db', webhookSecret: WEBHOOK_SECRET } });
  });

  afterEach(async () => {
    if (createdContractIds.length === 0) return;
    await db.delete(payments).where(inArray(payments.contractId, createdContractIds));
    await db.delete(contracts).where(inArray(contracts.id, createdContractIds));
    createdContractIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  function staffPayment(contractId: string, amount: number) {
    return authRequest('/api/payments', {
      method: 'POST',
      token,
      body: JSON.stringify({
        contractId, memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID, amount, paymentMethod: 'CASH',
      }),
    });
  }

  it('POST /api/payments: each staff payment is added to the contract total', async () => {
    const contractId = await createContract('5000.00');

    expect((await staffPayment(contractId, 3000)).status).toBe(201);
    expect(await getContract(contractId)).toMatchObject({ paidAmount: '3000.00', paymentStatus: 'PARTIAL' });

    expect((await staffPayment(contractId, 2000)).status).toBe(201);
    // staff payments update the totals but never change the contract status
    expect(await getContract(contractId)).toMatchObject({
      paidAmount: '5000.00',
      paymentStatus: 'PAID',
      status: 'DRAFT',
    });
  });

  it('POST /api/payments: concurrent staff payments on one contract all succeed', async () => {
    const contractId = await createContract('5000.00');

    const responses = await Promise.all([
      staffPayment(contractId, 3000),
      staffPayment(contractId, 1500),
      staffPayment(contractId, 500),
    ]);

    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await getContract(contractId)).toMatchObject({ paidAmount: '5000.00', paymentStatus: 'PAID' });
  });

  it('webhook: full payment marks the payment processed and activates the DRAFT contract', async () => {
    const contractId = await createContract('5000.00');
    const paymentId = await createCheckoutPayment(contractId, '5000.00');

    const res = await stripeCompleted(paymentId, 'cs_full', 5000);

    expect(res.status).toBe(200);
    expect((await getPayment(paymentId)).receiptNo).toBe('cs_full');
    expect(await getContract(contractId)).toMatchObject({
      status: 'ACTIVE',
      paymentStatus: 'PAID',
      paidAmount: '5000.00',
    });
  });

  it('webhook: replayed and concurrent duplicate webhooks are applied once', async () => {
    const contractId = await createContract('5000.00');
    const paymentId = await createCheckoutPayment(contractId, '5000.00');

    const responses = await Promise.all([
      stripeCompleted(paymentId, 'cs_dup', 5000),
      stripeCompleted(paymentId, 'cs_dup', 5000),
      stripeCompleted(paymentId, 'cs_dup', 5000),
    ]);
    const replay = await stripeCompleted(paymentId, 'cs_dup', 5000);
    // a different transaction for an already processed payment is not counted again
    const otherCharge = await stripeCompleted(paymentId, 'cs_other', 5000);

    expect([...responses, replay, otherCharge].map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await getPayment(paymentId)).receiptNo).toBe('cs_dup');
    const paymentRows = await db.select().from(payments).where(eq(payments.contractId, contractId));
    expect(paymentRows).toHaveLength(1);
    expect(await getContract(contractId)).toMatchObject({ status: 'ACTIVE', paidAmount: '5000.00' });
  });

  it('webhook: never re-activates a contract that is not DRAFT', async () => {
    const contractId = await createContract('5000.00', 'PAUSED');
    const paymentId = await createCheckoutPayment(contractId, '5000.00');

    const res = await stripeCompleted(paymentId, 'cs_paused', 5000);

    expect(res.status).toBe(200);
    expect(await getContract(contractId)).toMatchObject({ status: 'PAUSED', paymentStatus: 'PAID' });
  });

  it('webhook: underpaid amount leaves the payment unprocessed and the contract untouched', async () => {
    const contractId = await createContract('5000.00');
    const paymentId = await createCheckoutPayment(contractId, '5000.00');

    const res = await stripeCompleted(paymentId, 'cs_under', 4999.99);

    expect(res.status).toBe(200);
    expect((await getPayment(paymentId)).receiptNo).toBeNull();
    expect(await getContract(contractId)).toMatchObject({
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      paidAmount: '0.00',
    });
  });

  it('webhook: a partial (deposit) payment records PARTIAL but does not activate', async () => {
    const contractId = await createContract('10000.00');
    const paymentId = await createCheckoutPayment(contractId, '3000.00');

    const res = await stripeCompleted(paymentId, 'cs_deposit', 3000);

    expect(res.status).toBe(200);
    expect(await getContract(contractId)).toMatchObject({
      status: 'DRAFT',
      paymentStatus: 'PARTIAL',
      paidAmount: '3000.00',
    });
  });

  // BUG: recalculateContractPayment (src/services/contract-payment.ts) sums every
  // INCOME row of the contract, including gateway checkout rows that were never
  // paid (createPayment inserts them with receiptNo = NULL, and abandoned/expired
  // checkouts are never removed). An abandoned 5000 checkout plus a paid 3000
  // deposit is stored as paidAmount 8000 / PAID instead of 3000 / PARTIAL.
  // Needs a schema decision: payments has no completion status. receiptNo NULL
  // also describes every staff (cash/POS) payment, and createdBy is NULL for
  // staff users without an employee record, so neither column can tell a
  // pending checkout from a completed payment. Fix by adding a status /
  // completed_at column (set by the webhook) or by not inserting the row until
  // the gateway confirms.
  it.skip('webhook: an abandoned (unpaid) checkout row is not counted as paid', async () => {
    const contractId = await createContract('10000.00');
    await createCheckoutPayment(contractId, '5000.00'); // abandoned, never paid
    const paymentId = await createCheckoutPayment(contractId, '3000.00');

    await stripeCompleted(paymentId, 'cs_after_abandoned', 3000);

    expect(await getContract(contractId)).toMatchObject({
      paymentStatus: 'PARTIAL',
      paidAmount: '3000.00',
    });
  });

  // Webhooks are mounted ahead of the staff-auth payments router (src/app.ts)
  it('gateway webhooks are reachable through the full app without a staff session', async () => {
    const contractId = await createContract('5000.00');
    const paymentId = await createCheckoutPayment(contractId, '5000.00');
    const req = stripeCompletedRequest(paymentId, 'cs_full_app', 5000);

    const res = await app.request('/api/payments/webhook/stripe', {
      method: 'POST',
      headers: req.headers,
      body: await req.text(),
    });

    expect(res.status).toBe(200);
    expect((await getPayment(paymentId)).receiptNo).toBe('cs_full_app');
  });

  it('non-webhook /api/payments routes still require a staff session', async () => {
    for (const [method, path] of [
      ['GET', '/api/payments'],
      ['POST', '/api/payments'],
      ['GET', '/api/payments/webhook'],
      ['GET', '/api/payments/webhook/unknown'],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});
