import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, classes, membershipPlans, campaigns, leads, workoutLogs } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  memberAuthRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_CLASS_ID,
  TEST_PLAN_ID,
  TEST_MEMBER_ID,
} from './helpers.js';

// zod v4 applies .default()s inside .partial(), so an update schema derived
// from a create schema reset every defaulted field the PATCH did not send.
// Each case sets non-default values, PATCHes one unrelated field, and checks
// the rest survived.

const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000a1';
const LEAD_ID = '00000000-0000-4000-8000-0000000000a2';
const WORKOUT_ID = '00000000-0000-4000-8000-0000000000a3';

describe('PATCH leaves unsent fields unchanged', () => {
  let token: string;
  const patch = (path: string, body: unknown) => authRequest(path, { method: 'PATCH', token, body: JSON.stringify(body) });

  beforeAll(async () => {
    await createTestFixtures();
    token = await getAuthToken();
  });

  afterAll(async () => {
    await db.delete(campaigns).where(eq(campaigns.id, CAMPAIGN_ID));
    await db.delete(leads).where(eq(leads.id, LEAD_ID));
    await db.delete(workoutLogs).where(eq(workoutLogs.id, WORKOUT_ID));
    await cleanupTestFixtures();
  });

  it('PATCH /api/classes/:id', async () => {
    await db.update(classes).set({
      durationMinutes: 90,
      maxCapacity: 8,
      difficultyLevel: 'ADVANCED',
      requiresCount: false,
      countDeduction: 2,
    }).where(eq(classes.id, TEST_CLASS_ID));

    const res = await patch(`/api/classes/${TEST_CLASS_ID}`, { name: 'Renamed Yoga' });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(classes).where(eq(classes.id, TEST_CLASS_ID));
    expect(row.name).toBe('Renamed Yoga');
    expect(row.durationMinutes).toBe(90);
    expect(row.maxCapacity).toBe(8);
    expect(row.difficultyLevel).toBe('ADVANCED');
    expect(row.requiresCount).toBe(false);
    expect(row.countDeduction).toBe(2);
  });

  it('PATCH /api/membership-plans/:id', async () => {
    await db.update(membershipPlans).set({ allowTransfer: true, allowPause: true, isActive: false })
      .where(eq(membershipPlans.id, TEST_PLAN_ID));

    const res = await patch(`/api/membership-plans/${TEST_PLAN_ID}`, { name: 'Renamed Plan' });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, TEST_PLAN_ID));
    expect(row.name).toBe('Renamed Plan');
    expect(row.allowTransfer).toBe(true);
    expect(row.allowPause).toBe(true);
    expect(row.isActive).toBe(false); // a retired plan is not re-activated
  });

  it('PATCH /api/campaigns/:id', async () => {
    await db.insert(campaigns).values({
      id: CAMPAIGN_ID,
      tenantId: TEST_TENANT_ID,
      name: 'Spring',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      isActive: false,
    }).onConflictDoNothing();

    const res = await patch(`/api/campaigns/${CAMPAIGN_ID}`, { name: 'Spring sale' });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, CAMPAIGN_ID));
    expect(row.name).toBe('Spring sale');
    expect(row.isActive).toBe(false);
  });

  it('PATCH /api/leads/:id', async () => {
    await db.insert(leads).values({
      id: LEAD_ID,
      fullName: 'Prospect',
      branchId: TEST_BRANCH_ID,
      status: 'QUALIFIED',
    }).onConflictDoNothing();

    const res = await patch(`/api/leads/${LEAD_ID}`, { notes: 'called back' });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(leads).where(eq(leads.id, LEAD_ID));
    expect(row.notes).toBe('called back');
    expect(row.status).toBe('QUALIFIED'); // pipeline stage not reset to NEW
  });

  it('PUT /api/member/workouts/:id', async () => {
    const exercises = [{ name: 'Squat', sets: 3, reps: 5 }];
    await db.insert(workoutLogs).values({
      id: WORKOUT_ID,
      memberId: TEST_MEMBER_ID,
      date: '2026-01-05',
      exercises,
    }).onConflictDoNothing();

    const res = await memberAuthRequest(`/api/member/workouts/${WORKOUT_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: 'felt strong' }),
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(workoutLogs).where(eq(workoutLogs.id, WORKOUT_ID));
    expect(row.notes).toBe('felt strong');
    expect(row.exercises).toEqual(exercises);
  });

  it('PUT /api/member/workouts/:id with an empty body is a 400, not a 500', async () => {
    const res = await memberAuthRequest(`/api/member/workouts/${WORKOUT_ID}`, {
      method: 'PUT',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
