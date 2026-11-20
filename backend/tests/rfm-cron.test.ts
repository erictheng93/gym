import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
  members: {
    id: 'id',
    fullName: 'fullName',
    branchId: 'branchId',
    tenantId: 'tenantId',
    tags: 'tags',
    status: 'status',
    updatedAt: 'updatedAt',
  },
  contracts: {
    id: 'id',
    memberId: 'memberId',
  },
  payments: {
    id: 'id',
    contractId: 'contractId',
    amount: 'amount',
    type: 'type',
    paymentDate: 'paymentDate',
  },
  checkIns: {
    id: 'id',
    memberId: 'memberId',
    checkInTime: 'checkInTime',
  },
}));

import { runRFMSegmentation } from '../src/cron/rfm.js';

describe('RFM Segmentation Cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('無活躍會員時應安全返回空統計', async () => {
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const result = await runRFMSegmentation();
    expect(result.totalMembers).toBe(0);
    expect(result.segmentCounts).toEqual({});
  });

  it('使用批次預聚合計算 RFM 分群並更新會員標籤', async () => {
    const mockMembers = [
      { id: 'm1', fullName: 'Alice', branchId: 'b1', tenantId: 't1', tags: ['VIP'] },
      { id: 'm2', fullName: 'Bob', branchId: 'b1', tenantId: 't1', tags: [] },
    ];

    // 1. Initial members query
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve(mockMembers),
      }),
    });

    // 2. recencyResults
    mockSelect.mockReturnValueOnce({
      from: () => ({
        groupBy: () => Promise.resolve([
          { memberId: 'm1', lastTime: new Date() },
        ]),
      }),
    });

    // 3. frequencyResults
    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve([
            { memberId: 'm1', count: 15 },
          ]),
        }),
      }),
    });

    // 4. monetaryResults
    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () => Promise.resolve([
              { memberId: 'm1', total: 30000 },
            ]),
          }),
        }),
      }),
    });

    const result = await runRFMSegmentation();
    expect(result.totalMembers).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
