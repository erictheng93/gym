import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import app from '../src/app.js';
import { db, members, memberCredentials, otpTokens, otpSendLogs } from '../src/db/index.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { emailService } from '../src/services/email.js';
import { escapeHtml } from '../src/utils/html.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

// =============================================================================
// Email is a login identifier: verified change, per-tenant uniqueness,
// tenant-scoped password login / forgot-password, escaped email templates.
// =============================================================================

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 };

const MEMBER_A_EMAIL = 'member@test.test'; // fixture member (tenant A)
const NEW_EMAIL = 'fresh-address@scope.test';

// Same mailbox, one member in each gym
const SHARED_EMAIL = 'shared-box@scope.test';
const SHARED_A_ID = '00000000-0000-4000-8000-0000000000e1';
const SHARED_B_ID = '00000000-0000-4000-8000-0000000000e2';
// Holds NEW_EMAIL in tenant A / tenant B
const HOLDER_A_ID = '00000000-0000-4000-8000-0000000000e3';
const HOLDER_B_ID = '00000000-0000-4000-8000-0000000000e4';
// Name carrying markup
const EVIL_ID = '00000000-0000-4000-8000-0000000000e5';
const EVIL_EMAIL = 'evil-name@scope.test';
const EVIL_NAME = '<script>alert(1)</script><b>x</b>';

const PASSWORD_A = 'SharedPassA1';
const PASSWORD_B = 'SharedPassB1';

const token = () => generateMemberTokens({
  id: TEST_MEMBER_ID, memberCode: 'M000001', branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID,
}).accessToken;

function post(path: string, body: unknown, withToken: string | null = null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withToken) headers['X-Member-Token'] = withToken;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const today = new Date().toISOString().slice(0, 10);
const newMember = (id: string, code: string, email: string, tenantId: string, branchId: string, fullName = 'Scope Member') => ({
  id, fullName, email, memberCode: code, branchId, tenantId, status: 'ACTIVE' as const, joinDate: today, phone: '09' + code.slice(-3).padStart(8, '0'),
});

const login = (body: Record<string, unknown>) => post('/api/member/auth/login', body);

async function emailOf(id = TEST_MEMBER_ID) {
  const [row] = await db.select({ email: members.email }).from(members).where(eq(members.id, id));
  return row?.email;
}

/** Spy on the mailer; resolves delivered mail so tests can read recipient and body. */
function spyMail() {
  return vi.spyOn(emailService, 'send').mockResolvedValue(true);
}

async function requestEmailCode(email: string, who = token()) {
  const mail = spyMail();
  const res = await post('/api/member/me/email/otp', { email }, who);
  const body = await res.json();
  return { res, body, mail };
}

describe('Member email: verified change, scoped login, escaped templates', () => {
  beforeAll(async () => {
    await createTestFixtures();
    await db.insert(members).values([
      newMember(SHARED_A_ID, 'MSCP001', SHARED_EMAIL, TEST_TENANT_ID, TEST_BRANCH_ID),
      newMember(SHARED_B_ID, 'MSCP002', SHARED_EMAIL, TEST_TENANT_B_ID, TEST_BRANCH_B_ID),
      newMember(HOLDER_A_ID, 'MSCP003', 'Taken-Here@scope.test', TEST_TENANT_ID, TEST_BRANCH_ID),
      newMember(HOLDER_B_ID, 'MSCP004', NEW_EMAIL, TEST_TENANT_B_ID, TEST_BRANCH_B_ID),
      newMember(EVIL_ID, 'MSCP005', EVIL_EMAIL, TEST_TENANT_ID, TEST_BRANCH_ID, EVIL_NAME),
    ]).onConflictDoNothing();
    await db.insert(memberCredentials).values([
      { memberId: SHARED_A_ID, passwordHash: await hash(PASSWORD_A, ARGON2_OPTIONS), lastPasswordChangeAt: new Date() },
      { memberId: SHARED_B_ID, passwordHash: await hash(PASSWORD_B, ARGON2_OPTIONS), lastPasswordChangeAt: new Date() },
    ]).onConflictDoNothing();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.update(members).set({ email: MEMBER_A_EMAIL }).where(eq(members.id, TEST_MEMBER_ID));
    await db.delete(otpTokens).where(like(otpTokens.identifier, 'member:%'));
    await db.delete(otpTokens).where(eq(otpTokens.identifier, EVIL_EMAIL));
    await db.update(memberCredentials).set({ failedAttempts: 0, lockedUntil: null, passwordResetTokenHash: null })
      .where(inArray(memberCredentials.memberId, [SHARED_A_ID, SHARED_B_ID]));
  });

  afterAll(async () => {
    await db.delete(memberCredentials).where(inArray(memberCredentials.memberId, [SHARED_A_ID, SHARED_B_ID, EVIL_ID]));
    await db.delete(otpSendLogs).where(inArray(otpSendLogs.identifier, [NEW_EMAIL, EVIL_EMAIL]));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  // 1. Verified email change
  // ---------------------------------------------------------------------------

  describe('PUT /api/member/me never changes the email', () => {
    it('refuses an email with 400 EMAIL_VERIFICATION_REQUIRED and keeps the old one', async () => {
      const res = await app.request('/api/member/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Member-Token': token() },
        body: JSON.stringify({ email: NEW_EMAIL, fullName: 'Renamed Member' }),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(await emailOf()).toBe(MEMBER_A_EMAIL);
    });
  });

  describe('POST /api/member/me/email/otp and /email', () => {
    it('sends the code to the NEW address, then changes the email with it (once)', async () => {
      const { res, body, mail } = await requestEmailCode('Fresh-Address@Scope.test');
      expect(res.status).toBe(200);
      const code = body.data.otp as string; // dev/test exposes the code
      expect(mail).toHaveBeenCalledTimes(1);
      expect(mail.mock.calls[0][0]).toMatchObject({ to: NEW_EMAIL });
      expect(String(mail.mock.calls[0][0].html)).toContain(code);

      const change = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: code }, token());
      expect(change.status).toBe(200);
      expect((await change.json()).data.member.email).toBe(NEW_EMAIL);
      expect(await emailOf()).toBe(NEW_EMAIL);

      // single use
      await db.update(members).set({ email: MEMBER_A_EMAIL }).where(eq(members.id, TEST_MEMBER_ID));
      const replay = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: code }, token());
      expect(replay.status).toBe(400);
      expect((await replay.json()).code).toBe('INVALID_OTP');
      expect(await emailOf()).toBe(MEMBER_A_EMAIL);
    });

    it('refuses a wrong code, and a code issued for another address', async () => {
      const { body } = await requestEmailCode(NEW_EMAIL);
      const code = body.data.otp as string;
      const wrong = code === '000000' ? '111111' : '000000';

      const bad = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: wrong }, token());
      expect(bad.status).toBe(400);
      expect((await bad.json()).code).toBe('WRONG_CODE');

      const otherAddress = await post('/api/member/me/email', { email: 'someone-else@scope.test', otpCode: code }, token());
      expect(otherAddress.status).toBe(400);
      expect(await emailOf()).toBe(MEMBER_A_EMAIL);
    });

    it('binds the code to the member who asked for it', async () => {
      const { body } = await requestEmailCode(NEW_EMAIL);
      const code = body.data.otp as string;

      const otherMember = generateMemberTokens({
        id: SHARED_A_ID, memberCode: 'MSCP001', branchId: TEST_BRANCH_ID, tenantId: TEST_TENANT_ID,
      }).accessToken;
      const res = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: code }, otherMember);

      expect(res.status).toBe(400);
      expect(await emailOf(SHARED_A_ID)).toBe(SHARED_EMAIL);
    });

    it('does not drop the code in production when the mail cannot be sent', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.spyOn(emailService, 'send').mockResolvedValue(false);

      const res = await post('/api/member/me/email/otp', { email: NEW_EMAIL }, token());
      vi.unstubAllEnvs();

      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('EMAIL_UNAVAILABLE');
      const left = await db.select({ id: otpTokens.id }).from(otpTokens).where(like(otpTokens.identifier, 'member:%'));
      expect(left).toHaveLength(0);
    });

    it('refuses an address held by another member of the same gym (generic 409), case-insensitively', async () => {
      const { res, body } = await requestEmailCode('taken-here@scope.test');
      expect(res.status).toBe(409);
      expect(body.code).toBe('EMAIL_TAKEN');
      expect(JSON.stringify(body)).not.toContain('MSCP003');

      // the claim itself is refused too, even with a code that was valid before the address was taken
      const { body: ok } = await requestEmailCode(NEW_EMAIL);
      await db.update(members).set({ email: NEW_EMAIL }).where(eq(members.id, HOLDER_A_ID));
      const change = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: ok.data.otp }, token());
      await db.update(members).set({ email: 'Taken-Here@scope.test' }).where(eq(members.id, HOLDER_A_ID));
      expect(change.status).toBe(409);
      expect(await emailOf()).toBe(MEMBER_A_EMAIL);
    });

    it('allows an address that only another gym uses', async () => {
      // HOLDER_B has NEW_EMAIL in tenant B: not a conflict for a tenant A member
      const { res, body } = await requestEmailCode(NEW_EMAIL);
      expect(res.status).toBe(200);
      const change = await post('/api/member/me/email', { email: NEW_EMAIL, otpCode: body.data.otp }, token());
      expect(change.status).toBe(200);
      expect(await emailOf()).toBe(NEW_EMAIL);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Password login scoped to the gym
  // ---------------------------------------------------------------------------

  describe('POST /api/member/auth/login with a mailbox used in two gyms', () => {
    it('logs into the gym named by tenantSlug and only that gym', async () => {
      const a = await login({ email: SHARED_EMAIL, password: PASSWORD_A, tenantSlug: 'test-gym' });
      expect(a.status).toBe(200);
      expect((await a.json()).data.member.id).toBe(SHARED_A_ID);

      const b = await login({ email: SHARED_EMAIL, password: PASSWORD_B, tenantSlug: 'other-gym' });
      expect(b.status).toBe(200);
      expect((await b.json()).data.member.id).toBe(SHARED_B_ID);

      // the other gym's password does not work inside this gym
      const cross = await login({ email: SHARED_EMAIL, password: PASSWORD_B, tenantSlug: 'test-gym' });
      expect(cross.status).toBe(401);
    });

    it('without tenantSlug, logs in only the one account whose password matches', async () => {
      const a = await login({ email: SHARED_EMAIL, password: PASSWORD_A });
      expect(a.status).toBe(200);
      expect((await a.json()).data.member.id).toBe(SHARED_A_ID);

      const b = await login({ email: SHARED_EMAIL, password: PASSWORD_B });
      expect(b.status).toBe(200);
      expect((await b.json()).data.member.id).toBe(SHARED_B_ID);
    });

    it('without tenantSlug and a wrong password, answers like an unknown account but still counts the failure', async () => {
      const wrong = await login({ email: SHARED_EMAIL, password: 'NotThePassword1' });
      const unknown = await login({ email: 'nobody-here@scope.test', password: 'NotThePassword1' });

      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toEqual(await unknown.json());

      const rows = await db.select({ failed: memberCredentials.failedAttempts })
        .from(memberCredentials)
        .where(inArray(memberCredentials.memberId, [SHARED_A_ID, SHARED_B_ID]));
      expect(rows.map(r => r.failed ?? 0)).toEqual([1, 1]);
    });

    it('without tenantSlug, repeated wrong guesses hit the same lockout (no brute-force bypass)', async () => {
      for (let i = 0; i < 5; i++) await login({ email: SHARED_EMAIL, password: `Wrong${i}Guess` });
      // both candidates are now locked, so even the right password is refused generically
      const right = await login({ email: SHARED_EMAIL, password: PASSWORD_A });
      expect(right.status).toBe(401);
      const rows = await db.select({ lockedUntil: memberCredentials.lockedUntil })
        .from(memberCredentials)
        .where(inArray(memberCredentials.memberId, [SHARED_A_ID, SHARED_B_ID]));
      expect(rows.every(r => r.lockedUntil && r.lockedUntil > new Date())).toBe(true);
    });

    it('without tenantSlug and the same password in both gyms, refuses with 409 MULTIPLE_ACCOUNTS', async () => {
      await db.update(memberCredentials)
        .set({ passwordHash: await hash(PASSWORD_A, ARGON2_OPTIONS) })
        .where(eq(memberCredentials.memberId, SHARED_B_ID));
      try {
        const res = await login({ email: SHARED_EMAIL, password: PASSWORD_A });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.code).toBe('MULTIPLE_ACCOUNTS');
        expect(body.data).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('other-gym');
      } finally {
        await db.update(memberCredentials)
          .set({ passwordHash: await hash(PASSWORD_B, ARGON2_OPTIONS) })
          .where(eq(memberCredentials.memberId, SHARED_B_ID));
      }
    });
  });

  describe('POST /api/member/auth/forgot-password with a mailbox used in two gyms', () => {
    const forgot = (body: Record<string, unknown>) => post('/api/member/auth/forgot-password', body);

    it('mails a link only for the gym named by tenantSlug', async () => {
      const mail = spyMail();
      const res = await forgot({ email: SHARED_EMAIL, tenantSlug: 'other-gym' });
      expect(res.status).toBe(200);

      expect(mail).toHaveBeenCalledTimes(1);
      const [creds] = await db.select({ hash: memberCredentials.passwordResetTokenHash })
        .from(memberCredentials).where(eq(memberCredentials.memberId, SHARED_B_ID));
      expect(creds.hash).toBeTruthy();
      const [other] = await db.select({ hash: memberCredentials.passwordResetTokenHash })
        .from(memberCredentials).where(eq(memberCredentials.memberId, SHARED_A_ID));
      expect(other.hash).toBeNull();
    });

    it('without tenantSlug mails a link for each account to that mailbox, and answers the same either way', async () => {
      const mail = spyMail();
      const shared = await forgot({ email: SHARED_EMAIL });
      const unknown = await forgot({ email: 'nobody-here@scope.test' });

      expect(await shared.json()).toEqual(await unknown.json());
      expect(mail).toHaveBeenCalledTimes(2);
      expect(mail.mock.calls.every(([m]) => m.to === SHARED_EMAIL)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Escaped email templates
  // ---------------------------------------------------------------------------

  describe('email templates escape interpolated values', () => {
    const expectEscaped = (html: string) => {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>x</b>');
      expect(html).toContain(escapeHtml(EVIL_NAME));
    };

    it('login code email', async () => {
      const mail = spyMail();
      const res = await post('/api/member/otp/send', { type: 'email', identifier: EVIL_EMAIL });
      expect(res.status).toBe(200);
      expectEscaped(String(mail.mock.calls[0][0].html));
    });

    it('password reset email', async () => {
      const mail = spyMail();
      await post('/api/member/auth/forgot-password', { email: EVIL_EMAIL });
      expectEscaped(String(mail.mock.calls[0][0].html));
    });

    it('email-change code email', async () => {
      await db.update(members).set({ fullName: EVIL_NAME }).where(eq(members.id, TEST_MEMBER_ID));
      try {
        const { mail } = await requestEmailCode(NEW_EMAIL);
        expectEscaped(String(mail.mock.calls[0][0].html));
      } finally {
        await db.update(members).set({ fullName: 'Test Member' }).where(eq(members.id, TEST_MEMBER_ID));
      }
    });

    it('welcome, expiry and booking emails', async () => {
      const mail = spyMail();
      await emailService.sendWelcome('a@b.test', EVIL_NAME, EVIL_NAME);
      await emailService.sendContractExpiry('a@b.test', EVIL_NAME, EVIL_NAME, EVIL_NAME, 3);
      await emailService.sendBookingConfirmation('a@b.test', EVIL_NAME, EVIL_NAME, EVIL_NAME, EVIL_NAME, EVIL_NAME);
      expect(mail).toHaveBeenCalledTimes(3);
      for (const [m] of mail.mock.calls) expectEscaped(String(m.html));
    });
  });
});
