import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, leads, members } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_BRANCH_ID,
} from './helpers.js';

// The pipeline stage is the API field `status` (leads.status). The convert handler used
// to check and set the legacy `lead_status` column instead, so a converted lead still
// showed its old stage and could be converted again into a second member.

const LEAD_ID = '00000000-0000-4000-8000-0000000000c1';
const STAGED_LEAD_ID = '00000000-0000-4000-8000-0000000000c2';

describe('POST /api/leads/:id/convert', () => {
  let token: string;
  const createdMemberIds: string[] = [];
  const convert = (id: string) => authRequest(`/api/leads/${id}/convert`, { method: 'POST', token });

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
    await db.insert(leads).values([
      { id: LEAD_ID, fullName: 'Prospect A', phone: '0911000001', branchId: TEST_BRANCH_ID, status: 'TRIAL' },
      { id: STAGED_LEAD_ID, fullName: 'Prospect B', phone: '0911000002', branchId: TEST_BRANCH_ID, status: 'CONVERTED' },
    ]).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(leads).where(inArray(leads.id, [LEAD_ID, STAGED_LEAD_ID]));
    if (createdMemberIds.length) await db.delete(members).where(inArray(members.id, createdMemberIds));
    await cleanupTestFixtures();
  });

  it('moves the pipeline stage (`status`) to CONVERTED and links the new member', async () => {
    const res = await convert(LEAD_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    createdMemberIds.push(body.data.member.id);

    expect(body.data.lead.status).toBe('CONVERTED');
    expect(body.data.member.fullName).toBe('Prospect A');

    const [row] = await db.select().from(leads).where(eq(leads.id, LEAD_ID));
    expect(row.status).toBe('CONVERTED');
    expect(row.convertedMemberId).toBe(body.data.member.id);
    expect(row.convertedAt).not.toBeNull();
  });

  it('refuses to convert the same lead twice (no second member)', async () => {
    const before = await db.select({ id: members.id }).from(members).where(eq(members.phone, '0911000001'));

    const res = await convert(LEAD_ID);
    expect(res.status).toBe(400);

    const after = await db.select({ id: members.id }).from(members).where(eq(members.phone, '0911000001'));
    expect(after.length).toBe(before.length);
  });

  it('refuses a lead whose stage is already CONVERTED', async () => {
    const res = await convert(STAGED_LEAD_ID);
    expect(res.status).toBe(400);

    const created = await db.select({ id: members.id }).from(members).where(eq(members.phone, '0911000002'));
    expect(created).toHaveLength(0);
  });

  it('the converted stage shows up in the list filter', async () => {
    const res = await authRequest('/api/leads?status=CONVERTED', { token });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.data as Array<{ id?: string; lead?: { id: string } }>).map(r => r.lead?.id ?? r.id);
    expect(ids).toContain(LEAD_ID);
  });
});
