/**
 * Reports Routes Unit Tests
 * 測試 /gym/reports/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerReportsRoutes } from '../../src/routes/reports.js';
import {
  mockDatabase,
  mockDatabaseRaw,
  mockDirectusContext,
  mockGetCachedReport,
  mockSetCachedReport,
  mockInvalidateReportCache,
  createMockRequest,
  createMockResponse,
  createDbResult,
  testData,
} from '../setup.js';

describe('Reports Routes', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
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

    // 註冊路由
    registerReportsRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /reports/revenue
  // ============================================
  describe('GET /reports/revenue', () => {
    const getHandler = () => routeHandlers['GET /reports/revenue'];

    it('應該返回營收報表資料', async () => {
      const rows = [
        testData.revenueRow({ payment_day: '2024-01-15', total_income: '50000', net_revenue: '49000' }),
        testData.revenueRow({ payment_day: '2024-01-14', total_income: '30000', net_revenue: '29000' }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({
        query: { start_date: '2024-01-01', end_date: '2024-01-31' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
      expect(res._jsonData.summary.total_income).toBe(80000);
      expect(res._jsonData.summary.net_revenue).toBe(78000);
    });

    it('應該使用預設日期範圍（30天）當沒有提供日期', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabaseRaw).toHaveBeenCalled();
      const query = mockDatabaseRaw.mock.calls[0][0];
      expect(query).toContain('payment_day BETWEEN');
    });

    it('應該支持按分店篩選', async () => {
      const branchId = 'branch-uuid-1';
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        query: { branch_id: branchId },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      const params = mockDatabaseRaw.mock.calls[0][1];
      expect(params).toContain(branchId);
    });

    it('應該使用快取資料（如果存在）', async () => {
      const cachedData = {
        success: true,
        period: { start_date: '2024-01-01', end_date: '2024-01-31' },
        summary: { total_income: 100000 },
        data: [],
      };
      mockGetCachedReport.mockResolvedValueOnce(cachedData);

      const req = createMockRequest({
        query: { start_date: '2024-01-01', end_date: '2024-01-31' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabaseRaw).not.toHaveBeenCalled();
      expect(res._jsonData).toEqual(cachedData);
    });

    it('應該設置快取當查詢成功', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        query: { start_date: '2024-01-01', end_date: '2024-01-31' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockSetCachedReport).toHaveBeenCalledWith(
        'revenue',
        expect.any(String),
        expect.objectContaining({ success: true })
      );
    });

    it('應該計算正確的平均每日營收', async () => {
      const rows = [
        testData.revenueRow({ net_revenue: '10000' }),
        testData.revenueRow({ net_revenue: '20000' }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.summary.average_daily_revenue).toBe('15000.00');
    });

    it('應該處理資料庫錯誤', async () => {
      mockDatabaseRaw.mockRejectedValueOnce(new Error('Database connection failed'));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
      expect(res._jsonData.message).toBe('Database connection failed');
    });

    it('應該處理空結果', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(0);
      expect(res._jsonData.summary.total_income).toBe(0);
      expect(res._jsonData.summary.average_daily_revenue).toBe(0);
    });
  });

  // ============================================
  // GET /reports/member-growth
  // ============================================
  describe('GET /reports/member-growth', () => {
    const getHandler = () => routeHandlers['GET /reports/member-growth'];

    it('應該返回會員成長報表', async () => {
      const rows = [
        testData.memberGrowthRow({ new_members: '5', male_count: '3', female_count: '2' }),
        testData.memberGrowthRow({ new_members: '3', male_count: '2', female_count: '1' }),
      ];
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult(rows))
        .mockResolvedValueOnce(createDbResult([{ count: '150' }]));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.summary.total_new_members).toBe(8);
      expect(res._jsonData.summary.total_members).toBe(150);
      expect(res._jsonData.summary.gender_distribution).toEqual({ male: 5, female: 3 });
    });

    it('應該計算正確的平均每日成長', async () => {
      const rows = [
        testData.memberGrowthRow({ new_members: '10' }),
        testData.memberGrowthRow({ new_members: '20' }),
      ];
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult(rows))
        .mockResolvedValueOnce(createDbResult([{ count: '100' }]));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.summary.average_daily_growth).toBe('15.00');
    });

    it('應該支持按分店篩選', async () => {
      const branchId = 'branch-uuid-1';
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([]))
        .mockResolvedValueOnce(createDbResult([{ count: '50' }]));

      const req = createMockRequest({
        query: { branch_id: branchId },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      const firstCallParams = mockDatabaseRaw.mock.calls[0][1];
      expect(firstCallParams).toContain(branchId);
    });
  });

  // ============================================
  // GET /reports/contract-expiry
  // ============================================
  describe('GET /reports/contract-expiry', () => {
    const getHandler = () => routeHandlers['GET /reports/contract-expiry'];

    it('應該返回合約到期提醒', async () => {
      const rows = [
        testData.contractExpiryRow({ days_until_expiry: 3 }),
        testData.contractExpiryRow({ days_until_expiry: 15 }),
        testData.contractExpiryRow({ days_until_expiry: 45 }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({
        query: { days_ahead: '60' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.summary.total_expiring).toBe(3);
      expect(res._jsonData.summary.urgent_count).toBe(1);
      expect(res._jsonData.summary.soon_count).toBe(1);
      expect(res._jsonData.summary.upcoming_count).toBe(1);
    });

    it('應該正確分組合約', async () => {
      const rows = [
        testData.contractExpiryRow({ days_until_expiry: 5, contract_no: 'C001' }),
        testData.contractExpiryRow({ days_until_expiry: 7, contract_no: 'C002' }),
        testData.contractExpiryRow({ days_until_expiry: 8, contract_no: 'C003' }),
        testData.contractExpiryRow({ days_until_expiry: 30, contract_no: 'C004' }),
        testData.contractExpiryRow({ days_until_expiry: 31, contract_no: 'C005' }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      // urgent: <= 7 days
      expect(res._jsonData.grouped.urgent).toHaveLength(2);
      // soon: > 7 && <= 30 days
      expect(res._jsonData.grouped.soon).toHaveLength(2);
      // upcoming: > 30 days
      expect(res._jsonData.grouped.upcoming).toHaveLength(1);
    });

    it('應該支持自定義 days_ahead 和 limit', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        query: { days_ahead: '90', limit: '50' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      const params = mockDatabaseRaw.mock.calls[0][1];
      expect(params).toContain(90);
      expect(params).toContain(50);
    });

    it('應該使用預設值（30天，100筆）', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      const params = mockDatabaseRaw.mock.calls[0][1];
      expect(params).toContain(30);
      expect(params).toContain(100);
    });
  });

  // ============================================
  // GET /reports/member-activity
  // ============================================
  describe('GET /reports/member-activity', () => {
    const getHandler = () => routeHandlers['GET /reports/member-activity'];

    it('應該返回會員活躍度報表', async () => {
      const rows = [
        testData.memberActivityRow({ total_check_ins: '50', qr_code_count: '30', manual_count: '15', card_count: '5' }),
        testData.memberActivityRow({ total_check_ins: '40', qr_code_count: '25', manual_count: '10', card_count: '5' }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.summary.total_check_ins).toBe(90);
      expect(res._jsonData.summary.method_distribution).toEqual({
        qr_code: 55,
        manual: 25,
        card: 10,
      });
    });

    it('應該計算正確的平均每日簽到數', async () => {
      const rows = [
        testData.memberActivityRow({ total_check_ins: '100' }),
        testData.memberActivityRow({ total_check_ins: '50' }),
      ];
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult(rows));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.summary.average_daily_check_ins).toBe('75.00');
    });
  });

  // ============================================
  // POST /reports/refresh
  // ============================================
  describe('POST /reports/refresh', () => {
    const getHandler = () => routeHandlers['POST /reports/refresh'];

    it('應該要求用戶登入', async () => {
      const req = createMockRequest({
        accountability: null,
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(401);
      expect(res._jsonData.message).toBe('請先登入');
    });

    it('應該允許 Directus 管理員刷新報表', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        accountability: { user: 'admin-uuid', admin: true },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.message).toBe('報表資料已更新');
      expect(mockInvalidateReportCache).toHaveBeenCalled();
    });

    it('應該檢查員工的報表管理權限', async () => {
      // 模擬權限查詢返回有權限的員工
      mockDatabaseRaw
        .mockResolvedValueOnce(createDbResult([{
          permissions: { reports: { manage: true } },
        }]))
        .mockResolvedValueOnce(createDbResult([])); // refresh_report_views

      const req = createMockRequest({
        accountability: { user: 'emp-uuid', admin: false },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('應該拒絕沒有權限的用戶', async () => {
      // 模擬權限查詢返回沒有權限的員工
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([{
        permissions: { reports: { view: true, manage: false } },
      }]));

      const req = createMockRequest({
        accountability: { user: 'emp-uuid', admin: false },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(403);
      expect(res._jsonData.message).toBe('權限不足');
    });

    it('應該拒絕沒有員工記錄的用戶', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        accountability: { user: 'unknown-uuid', admin: false },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(403);
    });

    it('應該調用 refresh_report_views 和清除快取', async () => {
      mockDatabaseRaw.mockResolvedValueOnce(createDbResult([]));

      const req = createMockRequest({
        accountability: { user: 'admin-uuid', admin: true },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabaseRaw).toHaveBeenCalledWith('SELECT refresh_report_views()');
      expect(mockInvalidateReportCache).toHaveBeenCalled();
      expect(res._jsonData.cache_cleared).toBe(true);
    });
  });

  // ============================================
  // 錯誤處理
  // ============================================
  describe('Error Handling', () => {
    it('應該處理帶有 status 的錯誤', async () => {
      const error = new Error('Not Found');
      error.status = 404;
      mockDatabaseRaw.mockRejectedValueOnce(error);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      const handler = routeHandlers['GET /reports/revenue'];
      await handler(req, res);

      expect(res._statusCode).toBe(404);
    });

    it('應該在錯誤時返回通用錯誤訊息', async () => {
      mockDatabaseRaw.mockRejectedValueOnce(new Error());

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      const handler = routeHandlers['GET /reports/revenue'];
      await handler(req, res);

      expect(res._jsonData.message).toBe('Internal server error');
    });
  });

  // ============================================
  // 快取行為
  // ============================================
  describe('Cache Behavior', () => {
    it('應該為不同的參數組合生成不同的快取鍵', async () => {
      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      const handler = routeHandlers['GET /reports/revenue'];

      // 第一次請求
      await handler(
        createMockRequest({ query: { start_date: '2024-01-01', end_date: '2024-01-31' } }),
        createMockResponse()
      );

      // 第二次請求（不同日期）
      await handler(
        createMockRequest({ query: { start_date: '2024-02-01', end_date: '2024-02-28' } }),
        createMockResponse()
      );

      expect(mockSetCachedReport).toHaveBeenCalledTimes(2);
      const [, firstKey] = mockSetCachedReport.mock.calls[0];
      const [, secondKey] = mockSetCachedReport.mock.calls[1];
      expect(firstKey).not.toBe(secondKey);
    });

    it('應該包含 branch_id 在快取鍵中', async () => {
      mockDatabaseRaw.mockResolvedValue(createDbResult([]));

      const handler = routeHandlers['GET /reports/revenue'];

      await handler(
        createMockRequest({
          query: { start_date: '2024-01-01', end_date: '2024-01-31', branch_id: 'branch-1' },
        }),
        createMockResponse()
      );

      const [, cacheKey] = mockSetCachedReport.mock.calls[0];
      expect(cacheKey).toContain('branch-1');
    });
  });
});
