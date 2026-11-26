/**
 * Backfill members/contracts/payments.tenant_id from their branch (#109).
 *
 * Must run BEFORE `db:push` makes tenant_id NOT NULL on these tables, otherwise
 * the push fails on the legacy NULL rows.
 *
 *   bun run db:backfill-tenant -- --dry-run   # report only
 *   bun run db:backfill-tenant                # backfill in one transaction
 *
 * Exit codes: 0 = done (or nothing to do), 1 = blocked / failed, nothing changed.
 *
 * Source of truth is branches.tenant_id: every row has branch_id NOT NULL and
 * all tenant scoping (getTenantBranchIds) goes through the branch.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from './index.js';
import type { Database } from './index.js';

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Conn = Database | DbTransaction;

export const BACKFILL_TABLES = ['members', 'contracts', 'payments'] as const;
export type BackfillTable = typeof BACKFILL_TABLES[number];
export type TableCounts = Record<BackfillTable, number>;

export interface BackfillResult {
  /** rows with tenant_id IS NULL before the run */
  nullCounts: TableCounts;
  /** of those, rows whose branch also has tenant_id IS NULL (cannot be backfilled) */
  blockedCounts: TableCounts;
  /** distinct branch ids with NULL tenant_id that still have NULL-tenant rows */
  blockedBranchIds: string[];
  /** rows updated (0 on dry run / blocked / rolled back) */
  updatedCounts: TableCounts;
  /** NULL counts re-checked inside the transaction after the UPDATEs */
  remainingCounts: TableCounts | null;
  status: 'nothing-to-do' | 'dry-run' | 'blocked' | 'backfilled' | 'rolled-back';
}

const zeroCounts = (): TableCounts => ({ members: 0, contracts: 0, payments: 0 });
const total = (c: TableCounts) => BACKFILL_TABLES.reduce((n, t) => n + c[t], 0);

async function countNulls(conn: Conn): Promise<TableCounts> {
  const [row] = await conn.execute<{ members: number; contracts: number; payments: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM members   WHERE tenant_id IS NULL) AS members,
      (SELECT count(*)::int FROM contracts WHERE tenant_id IS NULL) AS contracts,
      (SELECT count(*)::int FROM payments  WHERE tenant_id IS NULL) AS payments
  `);
  return { members: row.members, contracts: row.contracts, payments: row.payments };
}

async function findBlocked(conn: Conn): Promise<{ counts: TableCounts; branchIds: string[] }> {
  const rows = await conn.execute<{ table_name: BackfillTable; branch_id: string; n: number }>(sql`
    SELECT 'members' AS table_name, t.branch_id, count(*)::int AS n
      FROM members t JOIN branches b ON b.id = t.branch_id
     WHERE t.tenant_id IS NULL AND b.tenant_id IS NULL GROUP BY t.branch_id
    UNION ALL
    SELECT 'contracts', t.branch_id, count(*)::int
      FROM contracts t JOIN branches b ON b.id = t.branch_id
     WHERE t.tenant_id IS NULL AND b.tenant_id IS NULL GROUP BY t.branch_id
    UNION ALL
    SELECT 'payments', t.branch_id, count(*)::int
      FROM payments t JOIN branches b ON b.id = t.branch_id
     WHERE t.tenant_id IS NULL AND b.tenant_id IS NULL GROUP BY t.branch_id
  `);
  const counts = zeroCounts();
  const branchIds = new Set<string>();
  for (const r of rows) {
    counts[r.table_name] += r.n;
    branchIds.add(r.branch_id);
  }
  return { counts, branchIds: [...branchIds].sort() };
}

class BackfillIncompleteError extends Error {
  constructor(readonly updated: TableCounts, readonly remaining: TableCounts) {
    super('tenant_id still NULL after backfill');
  }
}

/**
 * Core of the script. Changes nothing when dryRun is set, when nothing is NULL,
 * or when any NULL row sits on a branch without a tenant. Otherwise runs all
 * three UPDATEs in one transaction (a savepoint when `conn` is a transaction)
 * and commits only if no NULL remains.
 */
export async function backfillTenants(conn: Conn, { dryRun = false } = {}): Promise<BackfillResult> {
  const nullCounts = await countNulls(conn);
  const blocked = await findBlocked(conn);
  const base = {
    nullCounts,
    blockedCounts: blocked.counts,
    blockedBranchIds: blocked.branchIds,
    updatedCounts: zeroCounts(),
    remainingCounts: null,
  };

  if (total(nullCounts) === 0) return { ...base, status: 'nothing-to-do' };
  if (blocked.branchIds.length > 0) return { ...base, status: 'blocked' };
  if (dryRun) return { ...base, status: 'dry-run' };

  try {
    return await conn.transaction(async (tx) => {
      const updated = zeroCounts();
      // Table names are a fixed allow-list, never user input
      for (const t of BACKFILL_TABLES) {
        const res = await tx.execute(sql`
          UPDATE ${sql.identifier(t)} AS t SET tenant_id = b.tenant_id
            FROM branches b
           WHERE t.branch_id = b.id AND t.tenant_id IS NULL AND b.tenant_id IS NOT NULL
        `);
        updated[t] = res.count;
      }
      const remaining = await countNulls(tx);
      if (total(remaining) !== 0) throw new BackfillIncompleteError(updated, remaining);
      return { ...base, updatedCounts: updated, remainingCounts: remaining, status: 'backfilled' as const };
    });
  } catch (err) {
    if (err instanceof BackfillIncompleteError) {
      return { ...base, remainingCounts: err.remaining, status: 'rolled-back' };
    }
    throw err;
  }
}

function printCounts(label: string, c: TableCounts) {
  console.log(`${label}: ${BACKFILL_TABLES.map(t => `${t}=${c[t]}`).join(', ')}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const result = await backfillTenants(db, { dryRun });

  printCounts('tenant_id IS NULL', result.nullCounts);
  printCounts('  ...on a branch with NULL tenant_id', result.blockedCounts);

  switch (result.status) {
    case 'nothing-to-do':
      console.log('Nothing to backfill.');
      return 0;
    case 'blocked':
      console.error(
        'BLOCKED: these branches have NULL tenant_id, so their rows cannot be backfilled.\n' +
        'Set branches.tenant_id for them manually, then re-run. Nothing was changed.',
      );
      for (const id of result.blockedBranchIds) console.error(`  branch ${id}`);
      return 1;
    case 'dry-run':
      printCounts('[dry-run] would set tenant_id from branch', result.nullCounts);
      console.log('[dry-run] Nothing was changed.');
      return 0;
    case 'backfilled':
      printCounts('Updated', result.updatedCounts);
      console.log('Backfill committed. All tenant_id values are set.');
      return 0;
    case 'rolled-back':
      printCounts('Still NULL after UPDATE', result.remainingCounts!);
      console.error('ROLLED BACK: some rows still have NULL tenant_id. Nothing was changed.');
      return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(async (code) => {
      await db.$client.end();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error('Backfill failed:', err);
      await db.$client.end().catch(() => {});
      process.exit(1);
    });
}
