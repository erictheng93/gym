import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import app from '../src/app.js';
import { db, members, otpTokens } from '../src/db/index.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { memberPhoneOtpIdentifier } from '../src/services/otp.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_TENANT_ID,
} from './helpers.js';

// =============================================================================
// Member complete-profile phone verification
//   POST /api/member/me/phone/otp        send a code bound to member + phone
//   POST /api/member/me/complete-profile save the profile, consuming that code
// =============================================================================

const OTHER_MEMBER_ID = '00000000-0000-4000-8000-0000000000c1';
const OTHER_MEMBER_PHONE = '0922333444';
const ORIGINAL_PHONE = '0912345678';
const FREE_PHONE = '0933111222';
const FREE_PHONE_2 = '0933111333';

function tokenFor(id: string, memberCode: string) {
  return generateMemberTokens({ id, memberCode, branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID }).accessToken;
}

const memberToken = () => tokenFor(TEST_MEMBER_ID, 'M000001');
const otherToken = () => tokenFor(OTHER_MEMBER_ID, 'MCP0001');

function post(path: string, body: unknown, token: string | null = memberToken()) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Member-Token'] = token;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function sendCode(phone: string, token = memberToken()): Promise<string> {
  const res = await post('/api/member/me/phone/otp', { phone }, token);
  expect(res.status).toBe(200);
  const json = await res.json();
  return json.data.otp as string;
}

const completeProfile = (body: Record<string, unknown>, token: string | null = memberToken()) =>
  post('/api/member/me/complete-profile', body, token);

async function memberPhone(id = TEST_MEMBER_ID) {
  const [row] = await db.select({ phone: members.phone }).from(members).where(eq(members.id, id));
  return row?.phone;
}

const wrongCode = (code: string) => (code === '999999' ? '999998' : '999999');

describe('Member complete-profile phone verification', () => {
  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values({
      id: OTHER_MEMBER_ID,
      fullName: 'Other Member',
      // Stored with separators: the taken-check must normalize
      phone: '0922-333-444',
      memberCode: 'MCP0001',
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: new Date().toISOString().slice(0, 10),
      tenantId: TEST_TENANT_ID,
    }).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.update(members).set({ phone: ORIGINAL_PHONE }).where(eq(members.id, TEST_MEMBER_ID));
    await db.delete(otpTokens).where(like(otpTokens.identifier, 'member:%'));
  });

  afterAll(async () => {
    await db.delete(members).where(inArray(members.id, [OTHER_MEMBER_ID]));
    await cleanupTestFixtures();
  });

  it('requires a member token on both endpoints', async () => {
    expect((await post('/api/member/me/phone/otp', { phone: FREE_PHONE }, null)).status).toBe(401);
    expect((await completeProfile({ phone: FREE_PHONE, otpCode: '123456' }, null)).status).toBe(401);
  });

  it('rejects a body without otpCode', async () => {
    const res = await completeProfile({ phone: FREE_PHONE });
    expect(res.status).toBe(400);
  });

  it('saves the verified phone and profile fields (happy path)', async () => {
    const code = await sendCode('0933-111-222');

    const res = await completeProfile({
      phone: FREE_PHONE,
      otpCode: code,
      fullName: 'Verified Member',
      gender: 'FEMALE',
      birthday: '1990-01-02',
      emergencyContact: 'Mom',
      emergencyPhone: '0911222333',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.member).toMatchObject({ phone: FREE_PHONE, fullName: 'Verified Member', gender: 'FEMALE' });
    expect(await memberPhone()).toBe(FREE_PHONE);
  });

  it('rejects a wrong code and leaves the phone unchanged', async () => {
    const code = await sendCode(FREE_PHONE);
    const res = await completeProfile({ phone: FREE_PHONE, otpCode: wrongCode(code) });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'WRONG_CODE', attemptsRemaining: 2 });
    expect(await memberPhone()).toBe(ORIGINAL_PHONE);
  });

  it('rejects an expired code', async () => {
    const code = await sendCode(FREE_PHONE);
    await db.update(otpTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(otpTokens.identifier, memberPhoneOtpIdentifier(TEST_MEMBER_ID, FREE_PHONE)));

    const res = await completeProfile({ phone: FREE_PHONE, otpCode: code });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_OTP');
    expect(await memberPhone()).toBe(ORIGINAL_PHONE);
  });

  it('accepts a code only once', async () => {
    const code = await sendCode(FREE_PHONE);
    expect((await completeProfile({ phone: FREE_PHONE, otpCode: code })).status).toBe(200);

    const reuse = await completeProfile({ phone: FREE_PHONE, otpCode: code });
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).code).toBe('INVALID_OTP');
  });

  it('rejects a code sent to a different phone', async () => {
    const code = await sendCode(FREE_PHONE);
    const res = await completeProfile({ phone: FREE_PHONE_2, otpCode: code });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_OTP');
    expect(await memberPhone()).toBe(ORIGINAL_PHONE);
  });

  it('rejects a code issued to another member for the same phone', async () => {
    const code = await sendCode(FREE_PHONE, otherToken());
    const res = await completeProfile({ phone: FREE_PHONE, otpCode: code });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_OTP');
    expect(await memberPhone()).toBe(ORIGINAL_PHONE);
  });

  it('cannot be used as a login code for that phone', async () => {
    const code = await sendCode(FREE_PHONE);
    const res = await post('/api/member/otp/verify', { identifier: FREE_PHONE, type: 'phone', code }, null);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_OTP');
  });

  it('locks the code after the attempt limit, even for the right code', async () => {
    const code = await sendCode(FREE_PHONE);
    for (const remaining of [2, 1, 0]) {
      const res = await completeProfile({ phone: FREE_PHONE, otpCode: wrongCode(code) });
      expect(await res.json()).toMatchObject({ code: 'WRONG_CODE', attemptsRemaining: remaining });
    }

    const res = await completeProfile({ phone: FREE_PHONE, otpCode: code });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MAX_ATTEMPTS');
    expect(await memberPhone()).toBe(ORIGINAL_PHONE);
  });

  it('returns 409 without naming the owner when another member has the phone', async () => {
    const res = await post('/api/member/me/phone/otp', { phone: OTHER_MEMBER_PHONE });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('PHONE_TAKEN');
    expect(JSON.stringify(json)).not.toContain(OTHER_MEMBER_ID);
    expect(JSON.stringify(json)).not.toContain('MCP0001');
  });

  it('returns 409 when the phone is taken between sending and completing', async () => {
    const code = await sendCode(FREE_PHONE);
    await db.update(members).set({ phone: FREE_PHONE }).where(eq(members.id, OTHER_MEMBER_ID));

    try {
      const res = await completeProfile({ phone: FREE_PHONE, otpCode: code });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('PHONE_TAKEN');
      expect(await memberPhone()).toBe(ORIGINAL_PHONE);
    } finally {
      await db.update(members).set({ phone: '0922-333-444' }).where(eq(members.id, OTHER_MEMBER_ID));
    }
  });
});
