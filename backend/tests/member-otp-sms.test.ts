import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import app from '../src/app.js';
import { db, members, otpTokens, otpSendLogs } from '../src/db/index.js';
import { generateMemberTokens, memberJwtService } from '../src/services/member-jwt.js';
import { smsService } from '../src/services/sms.js';
import { memberPhoneOtpIdentifier } from '../src/services/otp.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_MEMBER_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

// =============================================================================
// Phone OTP delivery (Mitake SMS) and tenant-scoped OTP login
//   POST /api/member/otp/send, /verify   login codes
//   POST /api/member/me/phone/otp        phone verification codes
//   POST /api/member/me/phone            change phone with a verified code
// =============================================================================

const MEMBER_PHONE = '0912345678'; // fixture member (tenant A)
const MEMBER_B_PHONE = '0999888777'; // fixture member B (tenant B)
const FREE_PHONE = '0933444555';
const TAKEN_PHONE = '0922555666';
const TAKEN_MEMBER_ID = '00000000-0000-4000-8000-0000000000c7';

const memberToken = () => generateMemberTokens({
  id: TEST_MEMBER_ID, memberCode: 'M000001', branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID,
}).accessToken;

function post(path: string, body: unknown, token: string | null = null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Member-Token'] = token;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const sendLogin = (identifier: string, extra: Record<string, unknown> = {}) =>
  post('/api/member/otp/send', { type: 'phone', identifier, ...extra });
const verifyLogin = (identifier: string, code: string, extra: Record<string, unknown> = {}) =>
  post('/api/member/otp/verify', { type: 'phone', identifier, code, ...extra });

async function latestSendLog(identifier: string) {
  const [row] = await db.select({ success: otpSendLogs.success, errorMessage: otpSendLogs.errorMessage })
    .from(otpSendLogs)
    .where(eq(otpSendLogs.identifier, identifier))
    .orderBy(desc(otpSendLogs.sentAt))
    .limit(1);
  return row;
}

async function memberPhone(id = TEST_MEMBER_ID) {
  const [row] = await db.select({ phone: members.phone }).from(members).where(eq(members.id, id));
  return row?.phone;
}

/** Every console call made while `fn` ran, flattened to text. */
async function captureConsole(fn: () => Promise<void>): Promise<string> {
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
    .map(level => vi.spyOn(console, level).mockImplementation(() => {}));
  try {
    await fn();
    return spies.flatMap(s => s.mock.calls.flat()).map(a => String(a)).join('\n');
  } finally {
    spies.forEach(s => s.mockRestore());
  }
}

function enableSms() {
  vi.spyOn(smsService, 'isAnySmsConfigured').mockResolvedValue(true);
  vi.spyOn(smsService, 'isSmsAvailableForBranch').mockResolvedValue(true);
  return vi.spyOn(smsService, 'sendSms').mockResolvedValue({ success: true, msgid: 'm1', segments: 1, cost: 0.5 });
}

function disableSmsInProduction() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.spyOn(smsService, 'isAnySmsConfigured').mockResolvedValue(false);
  vi.spyOn(smsService, 'isSmsAvailableForBranch').mockResolvedValue(false);
  return vi.spyOn(smsService, 'sendSms');
}

describe('Phone OTP delivery and tenant-scoped login', () => {
  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values({
      id: TAKEN_MEMBER_ID,
      fullName: 'Phone Holder',
      phone: TAKEN_PHONE,
      memberCode: 'MSMS001',
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: new Date().toISOString().slice(0, 10),
      tenantId: TEST_TENANT_ID,
    }).onConflictDoNothing();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await db.update(members).set({ phone: MEMBER_PHONE, status: 'ACTIVE' }).where(eq(members.id, TEST_MEMBER_ID));
    await db.update(members).set({ phone: MEMBER_B_PHONE, status: 'ACTIVE' }).where(eq(members.id, TEST_MEMBER_B_ID));
    await db.delete(otpTokens).where(inArray(otpTokens.identifier, [MEMBER_PHONE, MEMBER_B_PHONE, FREE_PHONE]));
    await db.delete(otpTokens).where(like(otpTokens.identifier, 'member:%'));
  });

  afterAll(async () => {
    await db.delete(otpSendLogs).where(inArray(otpSendLogs.identifier, [MEMBER_PHONE, MEMBER_B_PHONE, FREE_PHONE, TAKEN_PHONE]));
    await db.delete(members).where(eq(members.id, TAKEN_MEMBER_ID));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // Login code delivery
  // ---------------------------------------------------------------------------

  describe('POST /api/member/otp/send', () => {
    it('sends the code by SMS and never logs it', async () => {
      const sendSms = enableSms();
      let code = '';

      const output = await captureConsole(async () => {
        const res = await sendLogin(MEMBER_PHONE);
        expect(res.status).toBe(200);
        code = (await res.json())._devCode;
      });

      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendSms.mock.calls[0][0]).toMatchObject({
        phoneNumber: MEMBER_PHONE,
        type: 'otp',
        data: { code },
        branchId: TEST_BRANCH_ID,
        memberId: TEST_MEMBER_ID,
      });
      expect(output).not.toContain(code);
      expect(await latestSendLog(MEMBER_PHONE)).toMatchObject({ success: true, errorMessage: null });
    });

    it('returns 503 and logs a failed send when SMS is not configured in production', async () => {
      const sendSms = disableSmsInProduction();

      const output = await captureConsole(async () => {
        const res = await sendLogin(MEMBER_PHONE);
        expect(res.status).toBe(503);
        const json = await res.json();
        expect(json.code).toBe('SMS_UNAVAILABLE');
        expect(json).not.toHaveProperty('_devCode');
      });

      expect(sendSms).not.toHaveBeenCalled();
      expect(await latestSendLog(MEMBER_PHONE)).toMatchObject({ success: false });
      expect(output).not.toMatch(/\d{6}/);
    });

    it('answers an unknown number the same way when SMS is not configured (no enumeration)', async () => {
      disableSmsInProduction();
      const res = await sendLogin('0900000001');
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('SMS_UNAVAILABLE');
    });

    it('returns 503, logs the failure and drops the code when the gateway rejects the send', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.spyOn(smsService, 'isAnySmsConfigured').mockResolvedValue(true);
      vi.spyOn(smsService, 'isSmsAvailableForBranch').mockResolvedValue(true);
      vi.spyOn(smsService, 'sendSms').mockResolvedValue({ success: false, error: '餘額不足' });

      const res = await sendLogin(MEMBER_PHONE);
      expect(res.status).toBe(503);
      expect(await latestSendLog(MEMBER_PHONE)).toMatchObject({ success: false, errorMessage: 'SMS 發送失敗' });
      const tokens = await db.select({ id: otpTokens.id }).from(otpTokens).where(eq(otpTokens.identifier, MEMBER_PHONE));
      expect(tokens).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Phone verification code delivery (profile)
  // ---------------------------------------------------------------------------

  describe('POST /api/member/me/phone/otp', () => {
    it('sends the code by SMS and never logs it', async () => {
      const sendSms = enableSms();
      let code = '';

      const output = await captureConsole(async () => {
        const res = await post('/api/member/me/phone/otp', { phone: FREE_PHONE }, memberToken());
        expect(res.status).toBe(200);
        code = (await res.json()).data.otp;
      });

      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendSms.mock.calls[0][0]).toMatchObject({
        phoneNumber: FREE_PHONE, type: 'otp', data: { code }, memberId: TEST_MEMBER_ID, branchId: TEST_BRANCH_ID,
      });
      expect(output).not.toContain(code);
      expect(await latestSendLog(FREE_PHONE)).toMatchObject({ success: true });
    });

    it('returns 503, logs a failed send and keeps no code when SMS is not configured in production', async () => {
      disableSmsInProduction();

      const res = await post('/api/member/me/phone/otp', { phone: FREE_PHONE }, memberToken());
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe('SMS_UNAVAILABLE');
      expect(JSON.stringify(json)).not.toMatch(/\d{6}/);
      expect(await latestSendLog(FREE_PHONE)).toMatchObject({ success: false, errorMessage: 'SMS 未設定' });
      const tokens = await db.select({ id: otpTokens.id }).from(otpTokens)
        .where(eq(otpTokens.identifier, memberPhoneOtpIdentifier(TEST_MEMBER_ID, FREE_PHONE)));
      expect(tokens).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Phone change on an existing profile
  // ---------------------------------------------------------------------------

  describe('POST /api/member/me/phone', () => {
    const sendCode = async (phone: string) => {
      const res = await post('/api/member/me/phone/otp', { phone }, memberToken());
      expect(res.status).toBe(200);
      return (await res.json()).data.otp as string;
    };
    const changePhone = (phone: string, otpCode: string) =>
      post('/api/member/me/phone', { phone, otpCode }, memberToken());

    it('requires a member token', async () => {
      expect((await post('/api/member/me/phone', { phone: FREE_PHONE, otpCode: '123456' })).status).toBe(401);
    });

    it('changes only the phone with the right code', async () => {
      const [before] = await db.select({ fullName: members.fullName, email: members.email })
        .from(members).where(eq(members.id, TEST_MEMBER_ID));
      const code = await sendCode(FREE_PHONE);

      const res = await changePhone(FREE_PHONE, code);
      expect(res.status).toBe(200);
      expect((await res.json()).data.member).toMatchObject({ phone: FREE_PHONE, ...before });
      expect(await memberPhone()).toBe(FREE_PHONE);
    });

    it('rejects a wrong code and keeps the old phone', async () => {
      const code = await sendCode(FREE_PHONE);
      const res = await changePhone(FREE_PHONE, code === '999999' ? '999998' : '999999');
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('WRONG_CODE');
      expect(await memberPhone()).toBe(MEMBER_PHONE);
    });

    it('returns a generic 409 when the phone belongs to another member of the gym', async () => {
      const send = await post('/api/member/me/phone/otp', { phone: TAKEN_PHONE }, memberToken());
      expect(send.status).toBe(409);

      // Taken after the code was sent: the change itself is refused too
      const code = await sendCode(FREE_PHONE);
      await db.update(members).set({ phone: FREE_PHONE }).where(eq(members.id, TAKEN_MEMBER_ID));
      try {
        const res = await changePhone(FREE_PHONE, code);
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.code).toBe('PHONE_TAKEN');
        expect(JSON.stringify(json)).not.toContain(TAKEN_MEMBER_ID);
        expect(JSON.stringify(json)).not.toContain('MSMS001');
        expect(await memberPhone()).toBe(MEMBER_PHONE);
      } finally {
        await db.update(members).set({ phone: TAKEN_PHONE }).where(eq(members.id, TAKEN_MEMBER_ID));
      }
    });

    it('allows a phone that only a member of another gym has', async () => {
      const code = await sendCode(MEMBER_B_PHONE);
      const res = await changePhone(MEMBER_B_PHONE, code);
      expect(res.status).toBe(200);
      expect(await memberPhone()).toBe(MEMBER_B_PHONE);
    });
  });

  // ---------------------------------------------------------------------------
  // One phone at two gyms
  // ---------------------------------------------------------------------------

  describe('login with a phone registered at two gyms', () => {
    const shareMemberPhoneWithGymB = () =>
      db.update(members).set({ phone: MEMBER_PHONE }).where(eq(members.id, TEST_MEMBER_B_ID));

    const tokenTenant = async (res: Response) => {
      const json = await res.json();
      return memberJwtService.verifyAccessToken(json.data.accessToken)?.tenantId;
    };

    it('logs into the gym named by tenantSlug', async () => {
      await shareMemberPhoneWithGymB();

      const sendB = await sendLogin(MEMBER_PHONE, { tenantSlug: 'other-gym' });
      const resB = await verifyLogin(MEMBER_PHONE, (await sendB.json())._devCode, { tenantSlug: 'other-gym' });
      expect(resB.status).toBe(200);
      expect(await tokenTenant(resB)).toBe(TEST_TENANT_B_ID);

      const sendA = await sendLogin(MEMBER_PHONE, { tenantSlug: 'test-gym' });
      const resA = await verifyLogin(MEMBER_PHONE, (await sendA.json())._devCode, { tenantSlug: 'test-gym' });
      expect(resA.status).toBe(200);
      expect(await tokenTenant(resA)).toBe(TEST_TENANT_ID);
    });

    it('refuses to pick a gym without tenantSlug, and only after the code is verified', async () => {
      await shareMemberPhoneWithGymB();

      const send = await sendLogin(MEMBER_PHONE);
      expect(send.status).toBe(200);
      const sendJson = await send.json();
      expect(sendJson.message).toBe('如果此帳號存在，驗證碼已發送');
      expect(JSON.stringify(sendJson)).not.toMatch(/gym|Gym|MULTIPLE/);

      const wrong = await verifyLogin(MEMBER_PHONE, sendJson._devCode === '999999' ? '999998' : '999999');
      expect((await wrong.json()).code).toBe('WRONG_CODE');

      const res = await verifyLogin(MEMBER_PHONE, sendJson._devCode);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe('MULTIPLE_ACCOUNTS');
      expect(json).not.toHaveProperty('data');
      expect(JSON.stringify(json)).not.toMatch(/Test Gym|Other Gym|test-gym|other-gym/);
    });

    it('ignores a banned membership when choosing', async () => {
      await shareMemberPhoneWithGymB();
      await db.update(members).set({ status: 'BANNED' }).where(eq(members.id, TEST_MEMBER_B_ID));

      const send = await sendLogin(MEMBER_PHONE);
      const res = await verifyLogin(MEMBER_PHONE, (await send.json())._devCode);
      expect(res.status).toBe(200);
      expect(await tokenTenant(res)).toBe(TEST_TENANT_ID);
    });

    it('sends nothing for a gym the phone is not registered at', async () => {
      const sendSms = enableSms();
      const res = await sendLogin(MEMBER_B_PHONE, { tenantSlug: 'test-gym' });
      expect(res.status).toBe(200);
      expect(await res.json()).not.toHaveProperty('_devCode');
      expect(sendSms).not.toHaveBeenCalled();
      const tokens = await db.select({ id: otpTokens.id }).from(otpTokens)
        .where(and(eq(otpTokens.identifier, MEMBER_B_PHONE), eq(otpTokens.identifierType, 'phone')));
      expect(tokens).toEqual([]);
    });

    it('uses the branch of the single matching member for the SMS account', async () => {
      const sendSms = enableSms();
      await sendLogin(MEMBER_B_PHONE, { tenantSlug: 'other-gym' });
      expect(sendSms.mock.calls[0][0]).toMatchObject({ branchId: TEST_BRANCH_B_ID, memberId: TEST_MEMBER_B_ID });
    });
  });
});
