/**
 * Runs the #109 tenant backfill against the real test database.
 *
 * After `drizzle-kit push`, tenant_id is NOT NULL on members/contracts/payments,
 * so legacy NULL rows cannot exist. Each scenario therefore runs inside one
 * transaction that temporarily DROPs the NOT NULL constraint (Postgres DDL is
 * transactional), recreates legacy NULL rows, runs backfillTenants() on that
 * transaction (its own transaction becomes a savepoint), and finally rolls
 * everything back — schema and data — so the shared test DB is untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { backfillTenants } from '../src/db/backfill-tenant.js';
import {
  createTestFixtures, cleanupTestFixtures,
  TEST_TENANT_ID, TEST_BRANCH_ID, TEST_MEMBER_ID, TEST_CONTRACT_ID,
  TEST_TENANT_B_ID, TEST_MEMBER_B_ID,
} from './helpers.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ORPHAN_BRANCH_ID = '00000000-0000-4000-8000-0000000109b0';
const PAYMENT_ID = '00000000-0000-4000-8000-0000000109a0';
const ORPHAN_MEMBER_ID = '00000000-0000-4000-8000-0000000109a1';

class Rollback extends Error {}

/** Run `fn` with the NOT NULL constraints dropped, then roll everything back. */
async function withLegacySchema(fn: (tx: Tx) => Promise<void>) {
  await expect(db.transaction(async (tx) => {
    for (const t of ['members', 'contracts', 'payments']) {
      await tx.execute(sql`ALTER TABLE ${sql.identifier(t)} ALTER COLUMN tenant_id DROP NOT NULL`);
    }
    await fn(tx);
    throw new Rollback();
  })).rejects.toBeInstanceOf(Rollback);
}

async function tenantOf(tx: Tx, table: string, id: string): Promise<string | null> {
  const [row] = await tx.execute<{ tenant_id: string | null }>(
    sql`SELECT tenant_id FROM ${sql.identifier(table)} WHERE id = ${id}`,
  );
  return row.tenant_id;
}

/** Legacy rows: tenant A member + contract, tenant B member, and a payment, all NULL */
async function createLegacyNullRows(tx: Tx) {
  await tx.execute(sql`
    INSERT INTO payments (id, contract_id, member_id, branch_id, amount, payment_method, tenant_id)
    VALUES (${PAYMENT_ID}, ${TEST_CONTRACT_ID}, ${TEST_MEMBER_ID}, ${TEST_BRANCH_ID}, 100, 'CASH', NULL)
  `);
  await tx.execute(sql`UPDATE members SET tenant_id = NULL WHERE id IN (${TEST_MEMBER_ID}, ${TEST_MEMBER_B_ID})`);
  await tx.execute(sql`UPDATE contracts SET tenant_id = NULL WHERE id = ${TEST_CONTRACT_ID}`);
}

describe('backfillTenants against the real database', () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  it('is a no-op on a schema where tenant_id is already NOT NULL', async () => {
    const dry = await backfillTenants(db, { dryRun: true });
    expect(dry.status).toBe('nothing-to-do');
    const real = await backfillTenants(db);
    expect(real.status).toBe('nothing-to-do');
    expect(real.nullCounts).toEqual({ members: 0, contracts: 0, payments: 0 });
  });

  it('dry run reports, real run backfills from each row\'s branch, second run is a no-op', async () => {
    await withLegacySchema(async (tx) => {
      await createLegacyNullRows(tx);

      const dry = await backfillTenants(tx, { dryRun: true });
      expect(dry.status).toBe('dry-run');
      expect(dry.nullCounts).toEqual({ members: 2, contracts: 1, payments: 1 });
      expect(await tenantOf(tx, 'members', TEST_MEMBER_ID)).toBeNull();

      const real = await backfillTenants(tx);
      expect(real.status).toBe('backfilled');
      expect(real.updatedCounts).toEqual({ members: 2, contracts: 1, payments: 1 });
      expect(real.remainingCounts).toEqual({ members: 0, contracts: 0, payments: 0 });

      expect(await tenantOf(tx, 'members', TEST_MEMBER_ID)).toBe(TEST_TENANT_ID);
      expect(await tenantOf(tx, 'members', TEST_MEMBER_B_ID)).toBe(TEST_TENANT_B_ID);
      expect(await tenantOf(tx, 'contracts', TEST_CONTRACT_ID)).toBe(TEST_TENANT_ID);
      expect(await tenantOf(tx, 'payments', PAYMENT_ID)).toBe(TEST_TENANT_ID);

      const again = await backfillTenants(tx);
      expect(again.status).toBe('nothing-to-do');
    });
  });

  it('refuses to change anything when a NULL row sits on a branch without a tenant', async () => {
    await withLegacySchema(async (tx) => {
      await createLegacyNullRows(tx);
      await tx.execute(sql`
        INSERT INTO branches (id, name, code, type, tenant_id)
        VALUES (${ORPHAN_BRANCH_ID}, 'Orphan Branch', 'ORPH109', 'BRANCH', NULL)
      `);
      await tx.execute(sql`
        INSERT INTO members (id, member_code, full_name, phone, branch_id, join_date, tenant_id)
        VALUES (${ORPHAN_MEMBER_ID}, 'M109ORPH', 'Orphan Member', '0900000109', ${ORPHAN_BRANCH_ID}, CURRENT_DATE, NULL)
      `);

      const result = await backfillTenants(tx);
      expect(result.status).toBe('blocked');
      expect(result.blockedBranchIds).toEqual([ORPHAN_BRANCH_ID]);
      expect(result.blockedCounts).toEqual({ members: 1, contracts: 0, payments: 0 });
      expect(result.updatedCounts).toEqual({ members: 0, contracts: 0, payments: 0 });

      // Backfillable rows were not touched either: all or nothing
      expect(await tenantOf(tx, 'members', TEST_MEMBER_ID)).toBeNull();
      expect(await tenantOf(tx, 'contracts', TEST_CONTRACT_ID)).toBeNull();
      expect(await tenantOf(tx, 'payments', PAYMENT_ID)).toBeNull();
    });
  });
});
