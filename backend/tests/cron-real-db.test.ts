/**
 * Runs the cron jobs against the real test database. The unit tests in
 * rfm-analytics-cron.test.ts mock the DB and only inspect rendered SQL, which
 * cannot catch driver-level problems (e.g. binding a Date in a raw sql param).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, members, payments, usageRecords } from '../src/db/index.js';
import { runRFMSegmentation } from '../src/cron/rfm.js';
import { runAnalyticsTasks } from '../src/cron/analytics.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  TEST_MEMBER_ID,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_CONTRACT_ID,
} from './helpers.js';

describe('cron jobs against the real database', () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  it('RFM segmentation runs and rewrites changed tags via the batched UPDATE', async () => {
    await db.update(members).set({ tags: ['stale-tag'] }).where(eq(members.id, TEST_MEMBER_ID));

    await expect(runRFMSegmentation()).resolves.not.toThrow();

    const [member] = await db.select({ tags: members.tags }).from(members).where(eq(members.id, TEST_MEMBER_ID));
    const tags = member?.tags as string[];
    expect(tags).toContain('stale-tag'); // non-RFM tags are kept
    expect(tags.some(t => t.startsWith('RFM:'))).toBe(true);
  });

  // runAnalyticsTasks swallows errors, so assert on the snapshot it writes
  it("daily analytics snapshots yesterday's INCOME revenue", async () => {
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dayBeforeStr = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const base = {
      contractId: TEST_CONTRACT_ID,
      memberId: TEST_MEMBER_ID,
      branchId: TEST_BRANCH_ID,
      tenantId: TEST_TENANT_ID,
      paymentMethod: 'CASH' as const,
    };
    await db.insert(payments).values([
      // noon UTC stays inside the day for any DB session time zone within +/-12h
      { ...base, amount: '1500.00', type: 'INCOME', paymentDate: new Date(`${yesterdayStr}T12:00:00Z`) },
      { ...base, amount: '-300.00', type: 'REFUND', paymentDate: new Date(`${yesterdayStr}T12:00:00Z`) },
      { ...base, amount: '999.00', type: 'INCOME', paymentDate: new Date(`${dayBeforeStr}T12:00:00Z`) },
    ]);

    try {
      await runAnalyticsTasks();

      const [record] = await db
        .select()
        .from(usageRecords)
        .where(and(eq(usageRecords.tenantId, TEST_TENANT_ID), eq(usageRecords.recordDate, yesterdayStr)));
      expect(record).toMatchObject({ dailyRevenue: '1500.00', branchesCount: 1 });
    } finally {
      await db.delete(payments).where(eq(payments.contractId, TEST_CONTRACT_ID));
    }
  });
});
