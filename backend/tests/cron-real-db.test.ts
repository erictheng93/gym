/**
 * Runs the cron jobs against the real test database. The unit tests in
 * rfm-analytics-cron.test.ts mock the DB and only inspect rendered SQL, which
 * cannot catch driver-level problems (e.g. binding a Date in a raw sql param).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, members } from '../src/db/index.js';
import { runRFMSegmentation } from '../src/cron/rfm.js';
import { runAnalyticsTasks } from '../src/cron/analytics.js';
import { createTestFixtures, cleanupTestFixtures, TEST_MEMBER_ID } from './helpers.js';

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

  it('daily analytics runs with the sargable date range', async () => {
    await expect(runAnalyticsTasks()).resolves.not.toThrow();
  });
});
