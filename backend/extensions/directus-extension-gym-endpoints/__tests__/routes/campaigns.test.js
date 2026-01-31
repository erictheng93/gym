/**
 * Campaigns Routes Unit Tests
 * 測試 /gym/campaigns/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCampaignsRoutes } from '../../src/routes/campaigns.js';
import {
  mockDatabase,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
} from '../setup.js';

describe('Campaigns Routes', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
    vi.clearAllMocks();

    routeHandlers = {};
    router = {
      get: vi.fn((path, handler) => {
        routeHandlers[`GET ${path}`] = handler;
      }),
      post: vi.fn((path, handler) => {
        routeHandlers[`POST ${path}`] = handler;
      }),
      patch: vi.fn((path, handler) => {
        routeHandlers[`PATCH ${path}`] = handler;
      }),
      delete: vi.fn((path, handler) => {
        routeHandlers[`DELETE ${path}`] = handler;
      }),
    };

    mockDatabase.select = vi.fn().mockReturnThis();
    mockDatabase.from = vi.fn().mockReturnThis();
    mockDatabase.leftJoin = vi.fn().mockReturnThis();
    mockDatabase.where = vi.fn().mockReturnThis();
    mockDatabase.whereBetween = vi.fn().mockReturnThis();
    mockDatabase.whereNotNull = vi.fn().mockReturnThis();
    mockDatabase.andWhere = vi.fn().mockReturnThis();
    mockDatabase.orderBy = vi.fn().mockReturnThis();
    mockDatabase.limit = vi.fn().mockReturnThis();
    mockDatabase.offset = vi.fn().mockReturnThis();
    mockDatabase.count = vi.fn().mockReturnThis();
    mockDatabase.sum = vi.fn().mockReturnThis();
    mockDatabase.first = vi.fn();
    mockDatabase.clone = vi.fn().mockReturnThis();
    mockDatabase.insert = vi.fn().mockReturnThis();
    mockDatabase.update = vi.fn().mockReturnThis();
    mockDatabase.returning = vi.fn();

    registerCampaignsRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /campaigns
  // ============================================
  describe('GET /campaigns', () => {
    const getHandler = () => routeHandlers['GET /campaigns'];

    it('應該返回活動列表', async () => {
      const mockCampaigns = [
        { id: 'campaign-1', name: '夏季促銷', type: 'PROMOTION', status: 'ACTIVE' },
        { id: 'campaign-2', name: '轉介紹獎勵', type: 'REFERRAL', status: 'ACTIVE' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockCampaigns);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該支援類型篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { type: 'PROMOTION' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });

    it('應該支援狀態篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { status: 'ACTIVE' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /campaigns/:id
  // ============================================
  describe('GET /campaigns/:id', () => {
    const getHandler = () => routeHandlers['GET /campaigns/:id'];

    it('應該返回單一活動', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        name: '夏季促銷',
        type: 'PROMOTION',
        status: 'ACTIVE',
        metrics: { impressions: 10000, clicks: 500 },
      };

      mockDatabase.first.mockResolvedValueOnce(mockCampaign);
      // First select() in chain returns this, subsequent calls are terminal
      mockDatabase.select
        .mockReturnValueOnce(mockDatabase) // first call: chainable (for campaign query)
        .mockResolvedValueOnce([]) // second call: coupons
        .mockResolvedValueOnce([]); // third call: assets

      const req = createMockRequest({ params: { id: 'campaign-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.name).toBe('夏季促銷');
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { id: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });

  // ============================================
  // POST /campaigns
  // ============================================
  describe('POST /campaigns', () => {
    const getHandler = () => routeHandlers['POST /campaigns'];

    it('應該成功建立活動', async () => {
      const newCampaign = {
        id: 'campaign-new',
        name: '新年活動',
        type: 'PROMOTION',
        status: 'DRAFT',
      };

      mockDatabase.returning.mockResolvedValueOnce([newCampaign]);

      const req = createMockRequest({
        body: {
          name: '新年活動',
          type: 'PROMOTION',
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證必填欄位', async () => {
      const req = createMockRequest({
        body: {
          // Missing name, type, dates
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });

    it('應該驗證活動類型', async () => {
      const req = createMockRequest({
        body: {
          name: '測試',
          type: 'INVALID_TYPE',
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('type');
    });

    it('應該驗證日期順序', async () => {
      const req = createMockRequest({
        body: {
          name: '測試',
          type: 'PROMOTION',
          start_date: '2025-12-31',
          end_date: '2025-01-01', // End before start
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // PATCH /campaigns/:id
  // ============================================
  describe('PATCH /campaigns/:id', () => {
    const getHandler = () => routeHandlers['PATCH /campaigns/:id'];

    it('應該成功更新活動', async () => {
      const existingCampaign = { id: 'campaign-1', status: 'DRAFT' };
      const updatedCampaign = { id: 'campaign-1', name: '更新名稱', status: 'DRAFT' };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);
      mockDatabase.returning.mockResolvedValueOnce([updatedCampaign]);

      const req = createMockRequest({
        params: { id: 'campaign-1' },
        body: { name: '更新名稱' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證活動類型', async () => {
      const existingCampaign = { id: 'campaign-1', status: 'DRAFT' };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);

      const req = createMockRequest({
        params: { id: 'campaign-1' },
        body: { type: 'INVALID_TYPE' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // DELETE /campaigns/:id
  // ============================================
  describe('DELETE /campaigns/:id', () => {
    const getHandler = () => routeHandlers['DELETE /campaigns/:id'];

    it('應該成功取消活動', async () => {
      const existingCampaign = { id: 'campaign-1', status: 'DRAFT' };
      const cancelledCampaign = { id: 'campaign-1', status: 'CANCELLED' };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);
      mockDatabase.returning.mockResolvedValueOnce([cancelledCampaign]);

      const req = createMockRequest({ params: { id: 'campaign-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('CANCELLED');
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { id: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });

  // ============================================
  // GET /campaigns/:id/metrics
  // ============================================
  describe('GET /campaigns/:id/metrics', () => {
    const getHandler = () => routeHandlers['GET /campaigns/:id/metrics'];

    it('應該返回活動指標', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        name: '夏季促銷',
        budget: 50000,
        actual_cost: 40000,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        metrics: {
          impressions: 10000,
          clicks: 500,
          conversions: 50,
          revenue: 100000,
        },
      };

      mockDatabase.first
        .mockResolvedValueOnce(mockCampaign) // campaign query
        .mockResolvedValueOnce({ count: '20' }) // leads count
        .mockResolvedValueOnce({ count: '10' }) // contracts count
        .mockResolvedValueOnce({ total: '200000' }); // revenue sum

      const req = createMockRequest({ params: { id: 'campaign-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.metrics).toBeDefined();
    });

    it('應該計算 ROI', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        name: '測試活動',
        budget: 10000,
        actual_cost: 10000,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        metrics: {
          impressions: 1000,
          clicks: 100,
          conversions: 10,
          revenue: 30000,
        },
      };

      mockDatabase.first
        .mockResolvedValueOnce(mockCampaign) // campaign query
        .mockResolvedValueOnce({ count: '5' }) // leads count
        .mockResolvedValueOnce({ count: '3' }) // contracts count
        .mockResolvedValueOnce({ total: '30000' }); // revenue sum

      const req = createMockRequest({ params: { id: 'campaign-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      // ROI = (30000 - 10000) / 10000 * 100 = 200%
      expect(res._jsonData.data.metrics.roi).toBeDefined();
    });
  });

  // ============================================
  // POST /campaigns/:id/update-metrics
  // ============================================
  describe('POST /campaigns/:id/update-metrics', () => {
    const getHandler = () => routeHandlers['POST /campaigns/:id/update-metrics'];

    it('應該成功更新指標', async () => {
      const existingCampaign = {
        id: 'campaign-1',
        metrics: { impressions: 1000 },
      };
      const updatedCampaign = {
        id: 'campaign-1',
        metrics: { impressions: 2000, clicks: 100 },
      };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);
      mockDatabase.returning.mockResolvedValueOnce([updatedCampaign]);

      const req = createMockRequest({
        params: { id: 'campaign-1' },
        body: { impressions: 2000, clicks: 100 },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });
  });

  // ============================================
  // POST /campaigns/:id/assets
  // ============================================
  describe('POST /campaigns/:id/assets', () => {
    const getHandler = () => routeHandlers['POST /campaigns/:id/assets'];

    it('應該成功新增素材', async () => {
      const existingCampaign = { id: 'campaign-1', status: 'DRAFT' };
      const newAsset = {
        id: 'asset-1',
        campaign_id: 'campaign-1',
        name: '宣傳圖片',
        type: 'IMAGE',
      };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);
      mockDatabase.returning.mockResolvedValueOnce([newAsset]);

      const req = createMockRequest({
        params: { id: 'campaign-1' },
        body: {
          name: '宣傳圖片',
          type: 'IMAGE',
          file_id: 'file-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證必填欄位', async () => {
      const existingCampaign = { id: 'campaign-1' };

      mockDatabase.first.mockResolvedValueOnce(existingCampaign);

      const req = createMockRequest({
        params: { id: 'campaign-1' },
        body: {
          // Missing name, type
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // GET /campaigns/roi-report
  // ============================================
  describe('GET /campaigns/roi-report', () => {
    const getHandler = () => routeHandlers['GET /campaigns/roi-report'];

    it('應該返回 ROI 報表', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          name: '夏季促銷',
          type: 'PROMOTION',
          status: 'ENDED',
          start_date: '2025-01-01',
          end_date: '2025-01-31',
          budget: 50000,
          actual_cost: 40000,
          metrics: JSON.stringify({ revenue: 150000, conversions: 50 }),
        },
        {
          id: 'campaign-2',
          name: '轉介紹',
          type: 'REFERRAL',
          status: 'ACTIVE',
          start_date: '2025-01-01',
          end_date: '2025-12-31',
          budget: 30000,
          actual_cost: 10000,
          metrics: JSON.stringify({ revenue: 50000, conversions: 20 }),
        },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockCampaigns);
      // Mock revenue queries for each campaign
      mockDatabase.first
        .mockResolvedValueOnce({ total: '150000' })
        .mockResolvedValueOnce({ total: '50000' });

      const req = createMockRequest({
        query: { start_date: '2025-01-01', end_date: '2025-12-31' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.summary).toBeDefined();
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該計算總結數據', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          start_date: '2025-01-01',
          end_date: '2025-01-31',
          budget: 10000,
          actual_cost: 8000,
          metrics: JSON.stringify({ revenue: 20000, conversions: 10 }),
        },
        {
          id: 'campaign-2',
          start_date: '2025-02-01',
          end_date: '2025-02-28',
          budget: 20000,
          actual_cost: 15000,
          metrics: JSON.stringify({ revenue: 40000, conversions: 20 }),
        },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockCampaigns);
      // Mock revenue queries for each campaign
      mockDatabase.first
        .mockResolvedValueOnce({ total: '20000' })
        .mockResolvedValueOnce({ total: '40000' });

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.summary.total_budget).toBe(30000);
      expect(res._jsonData.summary.total_cost).toBe(23000);
      expect(res._jsonData.summary.total_revenue).toBe(60000);
      expect(res._jsonData.summary.total_conversions).toBe(30);
    });

    it('應該支援類型篩選', async () => {
      mockDatabase.orderBy.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { type: 'PROMOTION' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });
});
