import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { db, tenants, branches, members, memberSocialAccounts } from '../src/db/index.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';

// OAuth state: link states are bound to the authenticated member, provider,
// a 10 minute lifetime and a single use (account-linking CSRF), and the login
// callback requires a state issued by /init.

const id = () => randomUUID();
const T = id();
const B = id();
const A = id();
const V = id();
const suffix = T.slice(0, 8);

const tokenFor = (memberId: string, code: string) =>
  generateMemberTokens({ id: memberId, memberCode: code, branchId: B, tenantId: T }).accessToken;
let tokenA: string;
let tokenV: string;

const getState = async (provider: string, token: string) =>
  (await (await app.request(`/api/member/oauth/${provider}/link-init`, { headers: { 'X-Member-Token': token } })).json()).data.state as string;
const link = (token: string, body: Record<string, unknown>) =>
  app.request('/api/member/oauth/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Member-Token': token },
    body: JSON.stringify({ provider: 'google', code: 'abc', ...body }),
  });

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.LINE_CHANNEL_ID = 'test-line';
  await db.insert(tenants).values({ id: T, name: 'State Gym', slug: `state-${suffix}`, email: `s-${suffix}@test.test` });
  await db.insert(branches).values({ id: B, name: 'State 店', code: 'ST', tenantId: T });
  await db.insert(members).values([
    { id: A, fullName: '攻擊者', phone: '0933300001', memberCode: `ST1${suffix}`, branchId: B, tenantId: T, status: 'ACTIVE', joinDate: '2026-01-01' },
    { id: V, fullName: '受害者', phone: '0933300002', memberCode: `ST2${suffix}`, branchId: B, tenantId: T, status: 'ACTIVE', joinDate: '2026-01-01' },
  ]);
  tokenA = tokenFor(A, `ST1${suffix}`);
  tokenV = tokenFor(V, `ST2${suffix}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.delete(memberSocialAccounts).where(inArray(memberSocialAccounts.memberId, [A, V]));
  await db.delete(members).where(inArray(members.id, [A, V]));
  await db.delete(branches).where(inArray(branches.id, [B]));
  await db.delete(tenants).where(inArray(tenants.id, [T]));
});

const mockProvider = (userId: string) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).includes('token')
      ? new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ id: userId, email: 'x@x.test', name: 'G' }), { status: 200 }));

describe('POST /api/member/oauth/link state', () => {
  it('link-init requires a member session', async () => {
    expect((await app.request('/api/member/oauth/google/link-init')).status).toBe(401);
  });

  it('links with a state issued to this member for this provider', async () => {
    mockProvider(`g-ok-${suffix}`);
    const res = await link(tokenA, { state: await getState('google', tokenA) });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('refuses a missing or invented state without calling the provider', async () => {
    const spy = mockProvider(`g-nostate-${suffix}`);
    expect((await link(tokenV, {})).status).toBe(400);
    expect((await link(tokenV, { state: 'made-up' })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a state issued to another member (the CSRF case)', async () => {
    const spy = mockProvider(`g-attacker-${suffix}`);
    const attackerState = await getState('google', tokenA);
    const res = await link(tokenV, { state: attackerState });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_STATE');
    expect(spy).not.toHaveBeenCalled();
    const rows = await db.select().from(memberSocialAccounts).where(inArray(memberSocialAccounts.memberId, [V]));
    expect(rows).toHaveLength(0);
  });

  it('refuses a state issued for another provider', async () => {
    mockProvider(`l-${suffix}`);
    const lineState = await getState('line', tokenV);
    const res = await link(tokenV, { provider: 'google', state: lineState });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_STATE');
  });

  it('refuses a reused state', async () => {
    mockProvider(`g-reuse-${suffix}`);
    const state = await getState('google', tokenV);
    expect((await link(tokenV, { state })).status).toBe(200);
    const again = await link(tokenV, { state });
    expect(again.status).toBe(400);
    expect((await again.json()).code).toBe('INVALID_STATE');
  });

  it('refuses an expired state', async () => {
    const state = await getState('google', tokenA);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
    const res = await link(tokenA, { state });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_STATE');
  });
});

describe('POST /api/member/oauth/:provider/callback state', () => {
  const callback = (body: Record<string, unknown>) =>
    app.request('/api/member/oauth/google/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'abc', ...body }),
    });

  it('requires a state', async () => {
    const spy = mockProvider(`g-cb-${suffix}`);
    expect((await callback({})).status).toBe(400);
    expect((await callback({ state: 'nope' })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not accept a link state for login', async () => {
    mockProvider(`g-cb2-${suffix}`);
    const res = await callback({ state: await getState('google', tokenA) });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_STATE');
  });

  it('does not accept a state issued for another provider', async () => {
    mockProvider(`g-cb3-${suffix}`);
    const state = (await (await app.request('/api/member/oauth/line/init')).json()).data.state;
    expect((await callback({ state })).status).toBe(400);
  });

  it('accepts a login state exactly once', async () => {
    mockProvider(`g-cb4-${suffix}`);
    const state = (await (await app.request('/api/member/oauth/google/init')).json()).data.state;
    expect((await callback({ state })).status).toBe(200);
    expect((await callback({ state })).status).toBe(400);
  });
});
