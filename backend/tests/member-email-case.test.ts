import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { db, tenants, branches, members, memberSocialAccounts, otpTokens } from '../src/db/index.js';

// Emails are stored lowercased; OTP login and OAuth email matching must accept
// any casing the client sends (consistent with password login, #140) without
// matching members of another email.

const id = () => randomUUID();
const T = id();
const B = id();
const M = id();
const MOTHER = id();
const suffix = T.slice(0, 8);
const EMAIL = `case.${suffix}@test.test`; // stored lowercase
const MIXED = `Case.${suffix}@TEST.Test`;
const OTHER_EMAIL = `other.${suffix}@test.test`;

const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  await db.insert(tenants).values({ id: T, name: 'Case Gym', slug: `case-${suffix}`, email: `c-${suffix}@test.test` });
  await db.insert(branches).values({ id: B, name: 'Case 店', code: 'CS', tenantId: T });
  await db.insert(members).values([
    { id: M, fullName: '大小寫', phone: '0922200001', email: EMAIL, memberCode: `CS1${suffix}`, branchId: B, tenantId: T, status: 'ACTIVE', joinDate: '2026-01-01' },
    { id: MOTHER, fullName: '另一位', phone: '0922200002', email: OTHER_EMAIL, memberCode: `CS2${suffix}`, branchId: B, tenantId: T, status: 'ACTIVE', joinDate: '2026-01-01' },
  ]);
});

afterAll(async () => {
  await db.delete(otpTokens).where(inArray(otpTokens.identifier, [EMAIL, MIXED, MIXED.toLowerCase()]));
  await db.delete(memberSocialAccounts).where(inArray(memberSocialAccounts.memberId, [M, MOTHER]));
  await db.delete(members).where(inArray(members.id, [M, MOTHER]));
  await db.delete(branches).where(inArray(branches.id, [B]));
  await db.delete(tenants).where(inArray(tenants.id, [T]));
});

describe('OTP login with a mixed-case email', () => {
  it('sends to and verifies against the lowercase member email', async () => {
    const send = await post('/api/member/otp/send', { type: 'email', identifier: MIXED, tenantSlug: `case-${suffix}` });
    expect(send.status).toBe(200);
    const code = (await send.json())._devCode as string;
    expect(code).toMatch(/^\d{6}$/); // a member was matched, so a code was issued

    // the code is stored under the normalized identifier
    const stored = await db.select().from(otpTokens).where(inArray(otpTokens.identifier, [EMAIL, MIXED]));
    expect(stored.map(t => t.identifier)).toEqual([EMAIL]);

    const verify = await post('/api/member/otp/verify', { type: 'email', identifier: MIXED.toUpperCase(), code, tenantSlug: `case-${suffix}` });
    expect(verify.status).toBe(200);
    const body = await verify.json();
    expect(body.success).toBe(true);
    expect(body.data.member.id).toBe(M);
  });

  it('still does not match a different email', async () => {
    const send = await post('/api/member/otp/send', { type: 'email', identifier: `nobody.${suffix}@test.test`, tenantSlug: `case-${suffix}` });
    expect((await send.json())._devCode).toBeUndefined();
  });
});

describe('OAuth email matching', () => {
  const providerUserId = `g-${suffix}`;

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  });

  const initState = async () =>
    (await (await app.request('/api/member/oauth/google/init')).json()).data.state as string;

  const mockGoogle = (email: string, userId: string) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('token')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ id: userId, email, name: 'G User' }), { status: 200 });
    });

  it('links a social account by email regardless of case', async () => {
    const spy = mockGoogle(MIXED, providerUserId);
    try {
      const res = await post('/api/member/oauth/google/callback', { code: 'abc', state: await initState() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.isNewMember).toBe(false);
      expect(body.data.isNewLink).toBe(true);
      expect(body.data.member.id).toBe(M);
    } finally {
      spy.mockRestore();
    }
  });

  it('reports needsRegistration for an unknown email (no member created)', async () => {
    const spy = mockGoogle(`Nobody.${suffix}@Test.Test`, `g2-${suffix}`);
    try {
      const body = await (await post('/api/member/oauth/google/callback', { code: 'abc', state: await initState() })).json();
      expect(body.data.needsRegistration).toBe(true);
      expect(body.data.member).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
