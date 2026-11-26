import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, coupons, couponUsages, contracts } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
  TEST_PLAN_ID,
  TEST_COUNT_PLAN_ID,
  TEST_CONTRACT_ID,
  TEST_TENANT_B_ID,
  TEST_MEMBER_B_ID,
  TEST_CONTRACT_B_ID,
} from './helpers.js';

const COUPON_ID = '00000000-0000-4000-8000-0000000000e1';
const COUPON_B_ID = '00000000-0000-4000-8000-0000000000e2';
// Extra tenant-A contracts of TEST_MEMBER_ID (total 1000 each)
const EXTRA_CONTRACT_IDS = [1, 2, 3, 4, 5].map(n => `00000000-0000-4000-8000-0000000000f${n}`);

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

type CouponOverrides = Partial<typeof coupons.$inferInsert>;

async function resetCoupon(overrides: CouponOverrides = {}) {
  await db.delete(couponUsages).where(eq(couponUsages.couponId, COUPON_ID));
  await db.delete(coupons).where(eq(coupons.id, COUPON_ID));
  await db.insert(coupons).values({
    id: COUPON_ID,
    tenantId: TEST_TENANT_ID,
    code: 'SAVE20',
    name: 'Save 20%',
    discountType: 'PERCENTAGE',
    discountValue: '20',
    maxDiscount: '150',
    validFrom: day(-1),
    validUntil: day(1),
    usageLimit: null,
    usageLimitPerMember: 10,
    isActive: true,
    applicablePlans: [],
    ...overrides,
  });
}

describe('Coupons API', () => {
  let token: string;
  const send = (path: string, method: string, body?: unknown) => authRequest(path, {
    method,
    token,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const use = (body: Record<string, unknown>, couponId = COUPON_ID) => send(`/api/coupons/${couponId}/use`, 'POST', body);

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
    const today = day(0);
    await db.insert(contracts).values(EXTRA_CONTRACT_IDS.map((id, i) => ({
      id,
      contractNo: `CPN-${i}`,
      memberId: TEST_MEMBER_ID,
      planId: TEST_PLAN_ID,
      startDate: today,
      originalEndDate: day(30),
      endDate: day(30),
      status: 'ACTIVE' as const,
      totalAmount: '1000',
      paidAmount: '0',
      paymentStatus: 'UNPAID' as const,
      termsAccepted: true,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
    }))).onConflictDoNothing();
    await db.insert(coupons).values({
      id: COUPON_B_ID,
      tenantId: TEST_TENANT_B_ID,
      code: 'BONLY',
      name: 'B only',
      discountType: 'FIXED',
      discountValue: '100',
      validFrom: day(-1),
      validUntil: day(1),
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(couponUsages).where(inArray(couponUsages.couponId, [COUPON_ID, COUPON_B_ID]));
    await db.delete(coupons).where(inArray(coupons.id, [COUPON_ID, COUPON_B_ID]));
    await cleanupTestFixtures();
  });

  beforeEach(async () => {
    await resetCoupon();
  });

  describe('POST /api/coupons/:id/use', () => {
    it('computes the discount server-side and ignores a client discountAmount', async () => {
      const res = await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID, discountAmount: 999999 });
      expect(res.status).toBe(200);
      const body = await res.json();
      // 20% of 1000 = 200, capped by maxDiscount 150
      expect(Number(body.data.discountAmount)).toBe(150);
      expect(body.data.finalAmount).toBe(850);

      const rows = await db.select().from(couponUsages).where(eq(couponUsages.couponId, COUPON_ID));
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].discountAmount)).toBe(150);
    });

    it('caps a fixed discount at the contract amount', async () => {
      await resetCoupon({ discountType: 'FIXED', discountValue: '5000', maxDiscount: null });
      const res = await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID });
      expect(res.status).toBe(200);
      expect(Number((await res.json()).data.discountAmount)).toBe(1000);
    });

    it.each([
      ['inactive', { isActive: false }],
      ['expired', { validFrom: day(-10), validUntil: day(-1) }],
      ['not yet valid', { validFrom: day(1), validUntil: day(10) }],
      ['below the minimum purchase', { minPurchase: '5000' }],
      ['not applicable to the contract plan', { applicablePlans: [TEST_COUNT_PLAN_ID] }],
    ])('rejects a coupon that is %s', async (_label, overrides) => {
      await resetCoupon(overrides as CouponOverrides);
      const res = await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID });
      expect(res.status).toBe(400);
      const rows = await db.select().from(couponUsages).where(eq(couponUsages.couponId, COUPON_ID));
      expect(rows).toHaveLength(0);
    });

    it('enforces the total usage limit', async () => {
      await resetCoupon({ usageLimit: 1 });
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: EXTRA_CONTRACT_IDS[0] })).status).toBe(200);
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: EXTRA_CONTRACT_IDS[1] })).status).toBe(400);
    });

    it('enforces the per-member usage limit', async () => {
      await resetCoupon({ usageLimitPerMember: 1 });
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: EXTRA_CONTRACT_IDS[0] })).status).toBe(200);
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: EXTRA_CONTRACT_IDS[1] })).status).toBe(400);
    });

    it('refuses to apply the same coupon to a contract twice', async () => {
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID })).status).toBe(200);
      expect((await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID })).status).toBe(409);
    });

    it('does not allow the usage limit to be raced past', async () => {
      await resetCoupon({ usageLimit: 1 });
      const results = await Promise.all(EXTRA_CONTRACT_IDS.map(contractId => use({ memberId: TEST_MEMBER_ID, contractId })));
      expect(results.filter(r => r.status === 200)).toHaveLength(1);
      const rows = await db.select().from(couponUsages).where(eq(couponUsages.couponId, COUPON_ID));
      expect(rows).toHaveLength(1);
    });

    it('treats another tenant contract as missing', async () => {
      const res = await use({ memberId: TEST_MEMBER_B_ID, contractId: TEST_CONTRACT_B_ID });
      expect(res.status).toBe(404);
    });

    it('treats a contract of a different member as missing', async () => {
      const res = await use({ memberId: TEST_MEMBER_B_ID, contractId: TEST_CONTRACT_ID });
      expect(res.status).toBe(404);
    });

    it('treats another tenant coupon as missing', async () => {
      const res = await use({ memberId: TEST_MEMBER_ID, contractId: TEST_CONTRACT_ID }, COUPON_B_ID);
      expect(res.status).toBe(404);
      const rows = await db.select().from(couponUsages).where(eq(couponUsages.couponId, COUPON_B_ID));
      expect(rows).toHaveLength(0);
    });

    it('requires memberId and contractId', async () => {
      const res = await use({ discountAmount: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/coupons/validate', () => {
    it('accepts `amount` as an alias of purchaseAmount', async () => {
      const res = await send('/api/coupons/validate', 'POST', { code: 'save20', amount: 500 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.discountAmount).toBe(100);
      expect(body.data.finalAmount).toBe(400);
    });

    it('enforces the minimum purchase instead of computing NaN', async () => {
      await resetCoupon({ minPurchase: '1000' });
      const res = await send('/api/coupons/validate', 'POST', { code: 'SAVE20', amount: 500 });
      expect(res.status).toBe(400);
    });

    it('rejects a request without an amount', async () => {
      const res = await send('/api/coupons/validate', 'POST', { code: 'SAVE20' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/coupons/:id', () => {
    it('leaves unsent defaulted fields unchanged', async () => {
      await resetCoupon({ isActive: false, usageLimitPerMember: 3 });
      const res = await send(`/api/coupons/${COUPON_ID}`, 'PATCH', { name: 'Renamed' });
      expect(res.status).toBe(200);

      const [row] = await db.select().from(coupons).where(eq(coupons.id, COUPON_ID));
      expect(row.name).toBe('Renamed');
      expect(row.isActive).toBe(false);
      expect(row.usageLimitPerMember).toBe(3);
    });
  });
});
