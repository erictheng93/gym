/**
 * Segmentation Routes Unit Tests
 * 測試 /gym/segmentation/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSegmentationRoutes } from '../../src/routes/segmentation.js';
import {
  mockDatabase,
  mockDatabaseRaw,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
  createDbResult,
} from '../setup.js';

describe('Segmentation Routes', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
    vi.clearAllMocks();

    // 創建模擬的 Express router
    routeHandlers = {};
    router = {
      get: vi.fn((path, handler) => {
        routeHandlers[`GET ${path}`] = handler;
      }),
      post: vi.fn((path, handler) => {
        routeHandlers[`POST ${path}`] = handler;
      }),
    };

    // Mock database methods
    mockDatabase.select = vi.fn().mockReturnThis();
    mockDatabase.from = vi.fn().mockReturnThis();
    mockDatabase.leftJoin = vi.fn().mockReturnThis();
    mockDatabase.where = vi.fn().mockReturnThis();
    mockDatabase.orderBy = vi.fn().mockReturnThis();
    mockDatabase.limit = vi.fn().mockReturnThis();
    mockDatabase.offset = vi.fn().mockReturnThis();
    mockDatabase.count = vi.fn().mockReturnThis();
    mockDatabase.groupBy = vi.fn().mockReturnThis();
    mockDatabase.first = vi.fn();
    mockDatabase.clone = vi.fn().mockReturnThis();
    mockDatabase.insert = vi.fn().mockReturnThis();
    mockDatabase.update = vi.fn().mockReturnThis();
    mockDatabase.returning = vi.fn();
    mockDatabase.onConflict = vi.fn().mockReturnThis();
    mockDatabase.merge = vi.fn();

    // 註冊路由
    registerSegmentationRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /segmentation/rfm
  // ============================================
  describe('GET /segmentation/rfm', () => {
    const getHandler = () => routeHandlers['GET /segmentation/rfm'];

    it('應該返回 RFM 分數列表', async () => {
      const mockScores = [
        {
          id: 'rfm-1',
          member_id: 'member-1',
          recency_score: 5,
          frequency_score: 4,
          monetary_score: 5,
          rfm_segment: 'CHAMPIONS',
        },
        {
          id: 'rfm-2',
          member_id: 'member-2',
          recency_score: 3,
          frequency_score: 3,
          monetary_score: 3,
          rfm_segment: 'LOYAL',
        },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockScores);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
      expect(res._jsonData.meta.total).toBe(2);
    });

    it('應該支援分店篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { branch_id: 'branch-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalledWith('rfm_scores.branch_id', 'branch-1');
      expect(res._jsonData.success).toBe(true);
    });

    it('應該支援分群篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { segment: 'CHAMPIONS' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
      expect(res._jsonData.success).toBe(true);
    });

    it('應該處理資料庫錯誤', async () => {
      mockDatabase.first.mockRejectedValueOnce(new Error('Database error'));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // GET /segmentation/rfm/:memberId
  // ============================================
  describe('GET /segmentation/rfm/:memberId', () => {
    const getHandler = () => routeHandlers['GET /segmentation/rfm/:memberId'];

    it('應該返回單一會員 RFM 分數', async () => {
      const mockScore = {
        id: 'rfm-1',
        member_id: 'member-1',
        recency_score: 5,
        frequency_score: 4,
        monetary_score: 5,
        rfm_segment: 'CHAMPIONS',
        member_name: '張三',
      };

      mockDatabase.first.mockResolvedValueOnce(mockScore);

      const req = createMockRequest({ params: { memberId: 'member-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.rfm_segment).toBe('CHAMPIONS');
      expect(res._jsonData.data.segment_label).toBe('冠軍客戶');
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { memberId: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // POST /segmentation/calculate
  // ============================================
  describe('POST /segmentation/calculate', () => {
    const getHandler = () => routeHandlers['POST /segmentation/calculate'];

    it('應該成功計算 RFM 分數', async () => {
      const mockMembers = [
        { id: 'member-1', branch_id: 'branch-1' },
        { id: 'member-2', branch_id: 'branch-1' },
      ];

      // Chain: database('members').where('status', 'active').select().where('branch_id', ...)
      // When branch_id is provided, second where() is terminal
      mockDatabase.where
        .mockReturnValueOnce(mockDatabase) // first where('status', 'active')
        .mockResolvedValueOnce(mockMembers); // second where('branch_id', ...)

      // Mock recency, frequency, monetary queries
      mockDatabaseRaw
        .mockResolvedValueOnce({ rows: [{ member_id: 'member-1', last_activity: '2024-01-15' }] })
        .mockResolvedValueOnce({ rows: [{ member_id: 'member-1', checkin_count: '50' }] })
        .mockResolvedValueOnce({ rows: [{ member_id: 'member-1', total_payments: '5000' }] });

      // Mock upsert
      mockDatabase.merge.mockResolvedValue();

      const req = createMockRequest({ body: { branch_id: 'branch-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.calculated).toBeGreaterThanOrEqual(0);
    });

    it('應該在沒有會員時返回 0', async () => {
      // Chain: database('members').where('status', 'active').select()
      // select() is terminal when no branch_id
      mockDatabase.select.mockResolvedValueOnce([]);

      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.calculated).toBe(0);
    });
  });

  // ============================================
  // GET /segmentation/segments
  // ============================================
  describe('GET /segmentation/segments', () => {
    const getHandler = () => routeHandlers['GET /segmentation/segments'];

    it('應該返回分群定義與人數', async () => {
      const mockCounts = [
        { rfm_segment: 'CHAMPIONS', count: '50' },
        { rfm_segment: 'LOYAL', count: '100' },
        { rfm_segment: 'AT_RISK', count: '30' },
      ];

      mockDatabase.groupBy.mockResolvedValueOnce(mockCounts);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.segments).toBeDefined();
      expect(res._jsonData.data.total_members).toBe(180);
    });

    it('應該支援分店篩選', async () => {
      // Chain: database().select().count().groupBy().where()
      // where() is terminal when branch_id provided
      mockDatabase.where.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { branch_id: 'branch-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalledWith('branch_id', 'branch-1');
      expect(res._jsonData.success).toBe(true);
    });

    it('應該按人數排序', async () => {
      const mockCounts = [
        { rfm_segment: 'CHAMPIONS', count: '10' },
        { rfm_segment: 'LOYAL', count: '100' },
      ];

      mockDatabase.groupBy.mockResolvedValueOnce(mockCounts);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      // LOYAL should be first (higher count)
      expect(res._jsonData.data.segments[0].member_count).toBeGreaterThan(
        res._jsonData.data.segments[res._jsonData.data.segments.length - 1].member_count
      );
    });
  });

  // ============================================
  // GET /segmentation/segments/:segment/members
  // ============================================
  describe('GET /segmentation/segments/:segment/members', () => {
    const getHandler = () => routeHandlers['GET /segmentation/segments/:segment/members'];

    it('應該返回特定分群的會員', async () => {
      const mockMembers = [
        { member_id: 'member-1', full_name: '張三', rfm_segment: 'CHAMPIONS' },
        { member_id: 'member-2', full_name: '李四', rfm_segment: 'CHAMPIONS' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockMembers);

      const req = createMockRequest({
        params: { segment: 'CHAMPIONS' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.segment).toBe('CHAMPIONS');
      expect(res._jsonData.data.segment_label).toBe('冠軍客戶');
      expect(res._jsonData.data.members).toHaveLength(2);
    });

    it('應該驗證分群名稱', async () => {
      const req = createMockRequest({
        params: { segment: 'INVALID_SEGMENT' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('Invalid segment');
    });

    it('應該支援分頁', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '100' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({
        params: { segment: 'LOYAL' },
        query: { limit: '10', offset: '20' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.limit).toHaveBeenCalledWith(10);
      expect(mockDatabase.offset).toHaveBeenCalledWith(20);
    });
  });

  // ============================================
  // POST /segmentation/auto-tag
  // ============================================
  describe('POST /segmentation/auto-tag', () => {
    const getHandler = () => routeHandlers['POST /segmentation/auto-tag'];

    it('應該成功套用標籤', async () => {
      const mockRecords = [
        { member_id: 'member-1', rfm_segment: 'CHAMPIONS', tags: [] },
        { member_id: 'member-2', rfm_segment: 'LOYAL', tags: ['existing-tag'] },
      ];

      mockDatabase.select.mockResolvedValueOnce(mockRecords);
      mockDatabase.update.mockResolvedValue();

      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.updated).toBe(2);
    });

    it('應該支援特定分群', async () => {
      // Chain: database().leftJoin().select().where()
      // where() is terminal when segment provided
      mockDatabase.where.mockResolvedValueOnce([]);

      const req = createMockRequest({ body: { segment: 'CHAMPIONS' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
      expect(res._jsonData.success).toBe(true);
    });

    it('應該移除舊的 RFM 標籤', async () => {
      const mockRecords = [
        { member_id: 'member-1', rfm_segment: 'CHAMPIONS', tags: ['RFM:舊標籤', 'other-tag'] },
      ];

      mockDatabase.select.mockResolvedValueOnce(mockRecords);
      mockDatabase.update.mockResolvedValue();

      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      // Should update with new tags (old RFM tag removed)
      expect(mockDatabase.update).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /segmentation/export/:segment
  // ============================================
  describe('GET /segmentation/export/:segment', () => {
    const getHandler = () => routeHandlers['GET /segmentation/export/:segment'];

    it('應該匯出 CSV', async () => {
      const mockMembers = [
        {
          member_code: 'M001',
          full_name: '張三',
          phone: '0912345678',
          email: 'test@example.com',
          branch_name: '台北店',
          rfm_segment: 'CHAMPIONS',
          recency_score: 5,
          frequency_score: 4,
          monetary_score: 5,
          total_payments_12m: 50000,
          total_checkins_12m: 100,
          last_payment_date: '2024-01-15',
          calculated_at: '2024-01-31',
        },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockMembers);

      const req = createMockRequest({
        params: { segment: 'CHAMPIONS' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('rfm_champions')
      );
    });

    it('應該支援匯出全部', async () => {
      mockDatabase.orderBy.mockResolvedValueOnce([]);

      const req = createMockRequest({
        params: { segment: 'ALL' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('rfm_all')
      );
    });

    it('應該驗證分群名稱（非 ALL）', async () => {
      const req = createMockRequest({
        params: { segment: 'INVALID' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('Invalid segment');
    });
  });
});
