import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// Real schema + real drizzle SQL builders; only the db handle is faked so the
// generated SQL (and bound params) can be inspected.
const state = vi.hoisted(() => ({
  selectResults: [] as any[],
  executed: [] as any[],
  inserts: [] as any[],
  wheres: [] as any[],
}));

vi.mock('../src/db/index.js', async () => {
  const schema = await import('../src/db/schema.js');
  const makeChain = (result: () => any) => {
    const chain: any = {};
    for (const m of ['from', 'innerJoin', 'groupBy']) chain[m] = () => chain;
    chain.where = (w: any) => { state.wheres.push(w); return chain; };
    chain.then = (f: any, r: any) => Promise.resolve(result()).then(f, r);
    return chain;
  };
  return {
    ...schema,
    db: {
      select: () => makeChain(() => state.selectResults.shift()),
      execute: async (q: any) => { state.executed.push(q); return []; },
      insert: () => ({
        values: (v: any) => ({
          onConflictDoUpdate: async () => { state.inserts.push(v); },
        }),
      }),
    },
  };
});

import { runRFMSegmentation } from '../src/cron/rfm.js';
import { runAnalyticsTasks } from '../src/cron/analytics.js';

const dialect = new PgDialect();
const render = (q: any) => dialect.sqlToQuery(q);

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('RFM cron batching', () => {
  beforeEach(() => {
    state.selectResults = [];
    state.executed = [];
    state.inserts = [];
    state.wheres = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('assigns expected segments and writes tag changes in one batched UPDATE', async () => {
    const [champ, lost, unchanged, fresh] = [uuid(1), uuid(2), uuid(3), uuid(4)];
    state.selectResults = [
      // active members
      [
        { id: champ, tags: ['vip'] },
        { id: lost, tags: ['RFM:CHAMPION', 'x'] },
        { id: unchanged, tags: ['RFM:CHAMPION'] },
        { id: fresh, tags: null },
      ],
      // check-in aggregate (recency + frequency)
      [
        { memberId: champ, lastTime: daysAgo(1), frequency: '15' },
        { memberId: unchanged, lastTime: daysAgo(2), frequency: '20' },
      ],
      // monetary aggregate
      [{ memberId: champ, total: '60000' }],
    ];

    const result = await runRFMSegmentation();

    expect(result.totalMembers).toBe(4);
    expect(result.segmentCounts).toEqual({ CHAMPION: 2, LOST: 2 });

    // 'unchanged' already has the right tag -> excluded; one statement for the rest
    expect(state.executed).toHaveLength(1);
    const { sql: text, params } = render(state.executed[0]);
    expect(text).toMatch(/UPDATE members AS m/);
    expect(text).toMatch(/FROM \(VALUES/);
    expect(params).not.toContain(unchanged);
    expect(params).toEqual([
      champ, JSON.stringify(['vip', 'RFM:CHAMPION']),
      lost, JSON.stringify(['x', 'RFM:LOST']),
      fresh, JSON.stringify(['RFM:LOST']),
    ]);
  });

  it('chunks updates by 500', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: uuid(i + 1), tags: [] }));
    state.selectResults = [rows, [], []];
    await runRFMSegmentation();
    expect(state.executed).toHaveLength(3);
    expect(render(state.executed[0]).params).toHaveLength(1000);
    expect(render(state.executed[2]).params).toHaveLength(402);
  });

  it('issues no UPDATE when nothing changed', async () => {
    state.selectResults = [[{ id: uuid(1), tags: ['RFM:LOST'] }], [], []];
    await runRFMSegmentation();
    expect(state.executed).toHaveLength(0);
  });
});

describe('Analytics cron day range', () => {
  beforeEach(() => {
    state.selectResults = [];
    state.inserts = [];
    state.wheres = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('uses a sargable half-open [day, day+1) range instead of DATE()', async () => {
    const t = uuid(9);
    state.selectResults = [
      [{ id: t, name: 'T' }],
      [{ tenantId: t, count: 2 }],
      [{ tenantId: t, total: '1500' }],
      [{ tenantId: t, count: 7 }],
      [{ tenantId: t, count: 3 }],
    ];
    await runAnalyticsTasks();

    const revenueWhere = state.wheres.find((w) => /payment_date/.test(render(w).sql));
    const { sql: text, params } = render(revenueWhere);
    expect(text).not.toMatch(/DATE\(/i);
    // lower bound inclusive (00:00 included), upper bound exclusive (next-day 00:00 excluded)
    expect(text).toMatch(/"payment_date" >= \$\d+::date/);
    expect(text).toMatch(/"payment_date" < \(\$\d+::date \+ 1\)/);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = yesterday.toISOString().slice(0, 10);
    expect(params.filter((p) => p === day)).toHaveLength(2);

    expect(state.inserts[0]).toMatchObject({
      tenantId: t, recordDate: day, branchesCount: 2, membersCount: 7,
      activeContractsCount: 3, dailyRevenue: '1500',
    });
  });
});
