import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { db, checkIns, contracts, members } from '../src/db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import {
  signCheckInQrToken,
  resetCheckInQrJtiStoreForTests,
} from '../src/services/checkin-qr.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  memberAuthRequest,
  getAuthToken,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_MEMBER_B_ID,
  TEST_COUNT_PLAN_ID,
} from './helpers.js';

// Signed check-in QR (docs/product-decisions.md row 6)
describe('Signed check-in QR', () => {
  let authToken: string;
  const createdMemberIds: string[] = [];

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCheckInQrJtiStoreForTests();
  });

  afterAll(async () => {
    if (createdMemberIds.length > 0) {
      await db.delete(checkIns).where(inArray(checkIns.memberId, createdMemberIds));
      await db.delete(contracts).where(inArray(contracts.memberId, createdMemberIds));
      await db.delete(members).where(inArray(members.id, createdMemberIds));
    }
    await cleanupTestFixtures();
  });

  /** A fresh member with a COUNT_BASED contract (so deduction is observable) */
  async function newMember(remainingCounts = 10, withContract = true) {
    const suffix = crypto.randomUUID().slice(0, 8);
    const todayStr = new Date().toISOString().split('T')[0];
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().split('T')[0];
    const [member] = await db.insert(members).values({
      fullName: `Qr Test ${suffix}`,
      phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
      memberCode: `MQ${suffix}`,
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: todayStr,
      tenantId: TEST_TENANT_ID,
    }).returning();
    createdMemberIds.push(member.id);
    let contractId: string | undefined;
    if (withContract) {
      const [row] = await db.insert(contracts).values({
        contractNo: `CQ${suffix}`,
        memberId: member.id,
        planId: TEST_COUNT_PLAN_ID,
        startDate: todayStr,
        originalEndDate: endStr,
        endDate: endStr,
        status: 'ACTIVE',
        remainingCounts,
        totalAmount: '2000',
        paymentStatus: 'PAID',
        branchId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      }).returning();
      contractId = row.id;
    }
    return { member, contractId };
  }

  /** The token the member app would get from the backend */
  async function fetchToken(member: { id: string; memberCode: string }) {
    const { accessToken } = generateMemberTokens({
      id: member.id,
      memberCode: member.memberCode,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
    });
    const response = await memberAuthRequest('/api/member/check-in/qr-token', { token: accessToken });
    expect(response.status).toBe(200);
    return (await response.json()).data as { token: string; expiresAt: string; ttlSeconds: number };
  }

  const scan = (qrToken: string, extra: Record<string, unknown> = {}) =>
    authRequest('/api/check-ins', { method: 'POST', token: authToken, body: JSON.stringify({ qrToken, ...extra }) });

  async function remainingCounts(contractId: string) {
    const [row] = await db.select().from(contracts).where(eq(contracts.id, contractId));
    return row.remainingCounts;
  }

  describe('GET /api/member/check-in/qr-token', () => {
    it('requires member auth', async () => {
      const response = await memberAuthRequest('/api/member/check-in/qr-token', { token: 'garbage' });
      expect(response.status).toBe(401);
    });

    it('issues a 30 second token', async () => {
      const { member } = await newMember();
      const data = await fetchToken(member);
      expect(data.ttlSeconds).toBe(30);
      expect(data.token.split('.')).toHaveLength(2);
      const ms = new Date(data.expiresAt).getTime() - Date.now();
      expect(ms).toBeGreaterThan(25_000);
      expect(ms).toBeLessThanOrEqual(30_000);
    });
  });

  describe('POST /api/check-ins with qrToken', () => {
    it('checks the member in through the normal path (QR_CODE, session deducted, own branch)', async () => {
      const { member, contractId } = await newMember(5);
      const { token } = await fetchToken(member);

      const response = await scan(token);
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toMatchObject({
        memberId: member.id,
        branchId: TEST_BRANCH_ID,
        checkInMethod: 'QR_CODE',
        contract: { remainingCounts: 4, countDeducted: true },
      });
      expect(await remainingCounts(contractId!)).toBe(4);
    });

    it('takes the member from the token, not from a body memberId', async () => {
      const { member } = await newMember();
      const { member: other } = await newMember();
      const { token } = await fetchToken(member);

      const body = await (await scan(token, { memberId: other.id, branchId: TEST_BRANCH_ID })).json();
      expect(body.data.memberId).toBe(member.id);
    });

    it('rejects a tampered signature', async () => {
      const { member } = await newMember();
      const { token } = await fetchToken(member);
      const [payload, sig] = token.split('.');
      const flipped = `${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`;

      const response = await scan(`${payload}.${flipped}`);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('INVALID_QR');
    });

    it('rejects a payload swapped to another member under the old signature', async () => {
      const { member } = await newMember();
      const { member: victim } = await newMember();
      const { token } = await fetchToken(member);
      const [payload, sig] = token.split('.');
      const forged = JSON.parse(Buffer.from(payload, 'base64url').toString());
      forged.mid = victim.id;

      const response = await scan(`${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('INVALID_QR');
    });

    it('rejects the old unsigned member-code payload and garbage', async () => {
      const { member } = await newMember();
      const legacy = JSON.stringify({ m: member.memberCode, t: Date.now() });
      expect((await scan(legacy)).status).toBe(400);
      expect((await scan('not-a-token')).status).toBe(400);
    });

    it('rejects an expired token', async () => {
      const { member } = await newMember();
      const { token } = signCheckInQrToken(
        { memberId: member.id, tenantId: TEST_TENANT_ID },
        Date.now() - 31_000,
      );

      const response = await scan(token);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('QR_EXPIRED');
    });

    it('rejects a token of another tenant and records nothing', async () => {
      const { token } = signCheckInQrToken({ memberId: TEST_MEMBER_B_ID, tenantId: TEST_TENANT_B_ID });

      const response = await scan(token);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('QR_WRONG_TENANT');
      const rows = await db.select().from(checkIns).where(eq(checkIns.memberId, TEST_MEMBER_B_ID));
      expect(rows).toHaveLength(0);
    });

    it('does not let a staff scan name a member of another tenant via a re-signed tenant claim', async () => {
      // Token claims our tenant but a member that is not ours: the member lookup is tenant-scoped
      const { token } = signCheckInQrToken({ memberId: TEST_MEMBER_B_ID, tenantId: TEST_TENANT_ID });
      const response = await scan(token);
      expect(response.status).toBe(404);
    });

    it('blocks a replay of the same token', async () => {
      const { member, contractId } = await newMember(5);
      const { token } = await fetchToken(member);

      expect((await scan(token)).status).toBe(201);
      const replay = await scan(token);
      expect(replay.status).toBe(409);
      expect((await replay.json()).code).toBe('QR_REPLAY');
      expect(await remainingCounts(contractId!)).toBe(4);
    });

    it('lets the member retry the same token when the entry was refused', async () => {
      const { member } = await newMember(5, false);
      const { token } = await fetchToken(member);

      const first = await scan(token);
      expect(first.status).toBe(400);
      expect((await first.json()).error).toBe('會員無有效合約');
      // still the contract error, not "already used"
      expect((await scan(token)).status).toBe(400);
    });

    it('a fresh token on the same day still reports already checked in without a second deduction', async () => {
      const { member, contractId } = await newMember(5);
      expect((await scan((await fetchToken(member)).token)).status).toBe(201);

      const again = await scan((await fetchToken(member)).token);
      expect(again.status).toBe(200);
      expect((await again.json()).data.alreadyCheckedIn).toBe(true);
      expect(await remainingCounts(contractId!)).toBe(4);
    });

    it('still requires memberId and branchId for a manual entry', async () => {
      const response = await authRequest('/api/check-ins', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });
  });
});

describe('CHECKIN_QR_SECRET in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const good = 'q'.repeat(40);
  const load = () => import('../src/services/checkin-qr.js');

  it('fails startup without a secret, or with a default or short one', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const bad of ['', 'dev-checkin-qr-secret-change-in-production', 'change-me-in-production', 'short']) {
      vi.stubEnv('CHECKIN_QR_SECRET', bad);
      vi.resetModules();
      await expect(load()).rejects.toThrow('CHECKIN_QR_SECRET');
    }
  });

  it('must differ from the JWT and session secrets', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHECKIN_QR_SECRET', good);
    for (const other of ['MEMBER_JWT_SECRET', 'COACH_JWT_SECRET', 'SESSION_SECRET']) {
      vi.stubEnv(other, good);
      vi.resetModules();
      await expect(load()).rejects.toThrow(`must differ from ${other}`);
      vi.stubEnv(other, 'z'.repeat(40));
    }
    vi.resetModules();
    await expect(load()).resolves.toBeDefined();
  });
});
